import { DriveApi, DriveAuthError, ROOT_FOLDER_NAME, BOOKS_FOLDER_NAME, LIBRARY_FILE_NAME, type DriveFile } from './driveApi';
import { GoogleAuth } from './googleAuth';
import { StorageService } from './storage';
import { parsePdfFile } from './pdfHelper';
import { parseEpubFile } from './epubHelper';
import { cleanBookTitleAndAuthor, areBooksDuplicates } from '../utils/textCleaner';
import type { Book, BookFormat, DeletedEntry } from '../types';

/**
 * Formato do arquivo `biblioteca.json` salvo no Drive.
 * Funciona como o banco de dados mestre na nuvem: guarda os metadados de
 * todos os livros (título, autor, capa, progresso, marcadores, tema...)
 * e a lista de livros excluídos, permitindo entrega instantânea da estante sem baixar os arquivos pesados.
 */
interface RemoteLibrary {
  version: 1;
  updatedAt: number;
  books: Record<string, Book>;
  deleted: Record<string, DeletedEntry>;
}

export interface SyncFolderInfo {
  rootId: string;
  booksId: string;
  ownedByMe: boolean;
  ownerEmail?: string;
}

export interface SyncResult {
  uploaded: number;
  imported: number;
  updatedLocal: number;
  removedLocal: number;
  finishedAt: number;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'auth-required' | 'not-configured' | 'disconnected';

const FOLDER_CACHE_KEY = 'luminary_drive_folder';
const LAST_SYNC_KEY = 'luminary_last_sync';

const MIME_BY_FORMAT: Record<BookFormat, string> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip'
};

function formatFromFile(file: DriveFile): BookFormat | null {
  const name = file.name.toLowerCase();
  if (file.mimeType === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (file.mimeType === 'application/epub+zip' || name.endsWith('.epub')) return 'epub';
  return null;
}

function safeFileName(title: string, format: BookFormat) {
  const base = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'livro';
  return `${base}.${format}`;
}

// Nomes de pastas genéricas que não representam autores ou séries
const GENERIC_FOLDER_NAMES = new Set([
  'luminary leitor',
  'luminary',
  'livros',
  'books',
  'meus livros',
  'my books',
  'biblioteca',
  'library',
  'ebooks',
  'e-books'
]);

export function extractMetadataFromFolderPath(folderPath: string[]): {
  author?: string;
  series?: string;
} {
  const meaningful = folderPath
    .map((p) => p.trim())
    .filter((p) => p && !GENERIC_FOLDER_NAMES.has(p.toLowerCase()));

  if (meaningful.length === 0) return {};

  if (meaningful.length === 1) {
    // 1 pasta: pode ser autor ou série (ex: "Stephen King" ou "Harry Potter")
    return { author: meaningful[0] };
  }

  // 2 ou mais pastas: ex: ["Stephen King", "A Torre Negra"] ou ["J.K. Rowling", "Harry Potter"]
  // A primeira pasta é o Autor, e as seguintes são Série / Coleção
  const author = meaningful[0];
  const series = meaningful.slice(1).join(' - ');
  return { author, series };
}

/**
 * Pontuação de completude para eleger o arquivo mais completo:
 * Autor preenchido (+100), Progresso (+50+prog), Capa (+30), Páginas (+20), Descrição (+10), Drive (+15).
 */
export function getBookCompletenessScore(book: Book): number {
  let score = 0;

  // 1. Autor conhecido (+100 pts)
  if (book.author && !/desconhecido/i.test(book.author)) {
    score += 100;
  }

  // 2. Progresso de leitura (+50 pts + progresso)
  if (book.progress && book.progress > 0) {
    score += 50 + book.progress;
  }

  // 3. Capa real válida (+30 pts)
  if (book.coverUrl && !book.coverUrl.includes('googleusercontent.com')) {
    score += 30;
  }

  // 4. Páginas detectadas (+20 pts)
  if (book.totalPages && book.totalPages > 1) {
    score += 20;
  }

  // 5. Descrição / Sinopse (+10 pts)
  if (book.description && book.description.trim().length > 10) {
    score += 10;
  }

  // 6. Conexão com Google Drive (+15 pts)
  if (book.driveFileId) {
    score += 15;
  }

  // 7. Marcadores de leitura (+5 pts por marcador)
  if (book.bookmarks && book.bookmarks.length > 0) {
    score += book.bookmarks.length * 5;
  }

  return score;
}

/**
 * Função de desduplicação e fusão de livros da estante.
 * Elimina duplicatas de sincronização ou arquivos repetidos, preservando
 * o arquivo mais completo e descartando cópias incompletas.
 */
export async function deduplicateAndMergeBooks(books: Book[]): Promise<boolean> {
  const groups: Book[][] = [];

  for (const b of books) {
    const matched = groups.find((grp) => areBooksDuplicates(grp[0], b));
    if (matched) {
      matched.push(b);
    } else {
      groups.push([b]);
    }
  }

  let hasChanges = false;

  for (const group of groups) {
    if (group.length <= 1) continue;

    hasChanges = true;
    console.log(`[Deduplicator] Fundindo ${group.length} versões de "${group[0].title}"`);

    // Ordena pelo livro mais completo
    group.sort((a, b) => {
      const diff = getBookCompletenessScore(b) - getBookCompletenessScore(a);
      if (diff !== 0) return diff;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    const winner = { ...group[0] };
    const losers = group.slice(1);

    for (const loser of losers) {
      if ((!winner.author || /desconhecido/i.test(winner.author)) && loser.author && !/desconhecido/i.test(loser.author)) {
        winner.author = loser.author;
      }
      if (!winner.driveFileId && loser.driveFileId) {
        winner.driveFileId = loser.driveFileId;
      }
      if (!winner.coverUrl && loser.coverUrl) {
        winner.coverUrl = loser.coverUrl;
      }
      if ((!winner.description || winner.description.length < 10) && loser.description) {
        winner.description = loser.description;
      }
      if ((!winner.totalPages || winner.totalPages <= 1) && loser.totalPages && loser.totalPages > 1) {
        winner.totalPages = loser.totalPages;
      }
      if (loser.bookmarks && loser.bookmarks.length > 0) {
        const existingLabels = new Set((winner.bookmarks || []).map((bm) => String(bm.pageOrCfi)));
        const newBookmarks = loser.bookmarks.filter((bm) => !existingLabels.has(String(bm.pageOrCfi)));
        winner.bookmarks = [...(winner.bookmarks || []), ...newBookmarks];
      }

      // Se o perdedor tinha o arquivo baixado no celular e o vencedor não, transfere o arquivo
      const loserFile = await StorageService.getBookFile(loser.id);
      const winnerFile = await StorageService.getBookFile(winner.id);
      if (loserFile && !winnerFile) {
        await StorageService.saveBookFile(winner.id, loserFile);
      }

      // Exclui a versão incompleta do armazenamento
      await StorageService.removeLocalOnly(loser.id);
    }

    await StorageService.saveBook(winner, undefined, { preserveTimestamp: true });
  }

  return hasChanges;
}

// ---- Status listeners (so the UI can show a cloud indicator) ----
type Listener = (status: SyncStatus, message?: string) => void;
const listeners = new Set<Listener>();
let currentStatus: SyncStatus = 'idle';
let currentMessage: string | undefined;

function setStatus(status: SyncStatus, message?: string) {
  currentStatus = status;
  currentMessage = message;
  listeners.forEach((l) => l(status, message));
}

let runningSync: Promise<SyncResult> | null = null;

export const DriveSync = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener(currentStatus, currentMessage);
    return () => listeners.delete(listener);
  },

  getStatus(): SyncStatus {
    if (!GoogleAuth.isConfigured()) return 'not-configured';
    if (!GoogleAuth.isConnected()) return 'disconnected';
    return currentStatus;
  },

  getLastSync(): number | null {
    const v = localStorage.getItem(LAST_SYNC_KEY);
    return v ? Number(v) : null;
  },

  getCachedFolder(): SyncFolderInfo | null {
    try {
      const raw = localStorage.getItem(FOLDER_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  clearCache() {
    localStorage.removeItem(FOLDER_CACHE_KEY);
    localStorage.removeItem(LAST_SYNC_KEY);
    setStatus('idle');
  },

  /**
   * Finds the "Luminary Leitor" folder. Preference order:
   *  1. Folder shared with me by someone else (girlfriend's account sees the owner's folder)
   *  2. My own folder
   *  3. Creates a new folder in my Drive
   */
  async resolveFolder(): Promise<SyncFolderInfo> {
    const cached = this.getCachedFolder();
    if (cached) {
      try {
        // Validate that the cached folder still exists
        await DriveApi.findChild(cached.rootId, BOOKS_FOLDER_NAME);
        return cached;
      } catch (err) {
        if (err instanceof DriveAuthError) throw err;
        localStorage.removeItem(FOLDER_CACHE_KEY);
      }
    }

    const folders = await DriveApi.findRootFolders();
    const shared = folders.find((f) => f.ownedByMe === false);
    const own = folders.find((f) => f.ownedByMe !== false);
    let root = shared || own;
    if (!root) {
      root = await DriveApi.createFolder(ROOT_FOLDER_NAME);
      root.ownedByMe = true;
    }

    const booksFolder = await DriveApi.ensureChildFolder(root.id, BOOKS_FOLDER_NAME);
    const info: SyncFolderInfo = {
      rootId: root.id,
      booksId: booksFolder.id,
      ownedByMe: root.ownedByMe !== false,
      ownerEmail: root.owners?.[0]?.emailAddress
    };
    localStorage.setItem(FOLDER_CACHE_KEY, JSON.stringify(info));
    return info;
  },

  /** Runs a full two-way sync. Concurrent calls share the same run. */
  async sync(): Promise<SyncResult> {
    if (runningSync) return runningSync;
    runningSync = this._doSync().finally(() => {
      runningSync = null;
    });
    return runningSync;
  },

  /** Sync that never throws (for automatic background calls) */
  async syncQuietly(): Promise<SyncResult | null> {
    if (!GoogleAuth.isConfigured() || !GoogleAuth.isConnected()) return null;
    try {
      return await this.sync();
    } catch (err) {
      console.warn('Sincronização automática falhou:', err);
      return null;
    }
  },

  async _doSync(): Promise<SyncResult> {
    setStatus('syncing', 'Sincronizando com o Google Drive...');
    const result: SyncResult = { uploaded: 0, imported: 0, updatedLocal: 0, removedLocal: 0, finishedAt: 0 };

    try {
      const folder = await this.resolveFolder();

      // ---- 1. Load remote library (banco de dados leve na nuvem) ----
      const libraryFile = await DriveApi.findChild(folder.rootId, LIBRARY_FILE_NAME);
      let remote: RemoteLibrary = { version: 1, updatedAt: 0, books: {}, deleted: {} };
      if (libraryFile) {
        try {
          const parsed = JSON.parse(await DriveApi.downloadText(libraryFile.id));
          remote = { ...remote, ...parsed, books: parsed.books || {}, deleted: parsed.deleted || {} };
        } catch (err) {
          console.warn('biblioteca.json inválido, recriando:', err);
        }
      }

      // ---- 2. Merge deletions ----
      const localDeleted = await StorageService.getDeletedBooks();
      const deleted: Record<string, DeletedEntry> = { ...remote.deleted };
      for (const [id, entry] of Object.entries(localDeleted)) {
        if (!deleted[id] || deleted[id].at < entry.at) deleted[id] = entry;
      }

      // ---- 3. Merge books (newest updatedAt wins) - Instantâneo, apenas metadados! ----
      const localBooks = await StorageService.getAllBooks();
      const localMap = new Map(localBooks.map((b) => [b.id, b]));
      const merged: Record<string, Book> = {};
      const allIds = new Set([...localMap.keys(), ...Object.keys(remote.books)]);

      for (const id of allIds) {
        const local = localMap.get(id);
        const rem = remote.books[id];
        const del = deleted[id];
        const newest = Math.max(local?.updatedAt || local?.addedAt || 0, rem?.updatedAt || rem?.addedAt || 0);

        if (del && del.at >= newest) {
          // Deleted on some device after the last change -> remove everywhere
          if (local) {
            await StorageService.removeLocalOnly(id);
            result.removedLocal++;
          }
          if (!del.driveFileId) del.driveFileId = local?.driveFileId || rem?.driveFileId;
          continue;
        }
        if (del) delete deleted[id]; // re-added after deletion

        let winner: Book;
        if (local && rem) {
          winner = (rem.updatedAt || 0) > (local.updatedAt || 0) ? { ...rem } : { ...local };
          winner.driveFileId = winner.driveFileId || local.driveFileId || rem.driveFileId;
        } else {
          winner = { ...(local || rem)! };
        }

        // Apply remote changes locally (apenas metadados, zero downloads pesados)
        if (!local || JSON.stringify(local) !== JSON.stringify(winner)) {
          await StorageService.saveBook(winner, undefined, { preserveTimestamp: true });
          result.updatedLocal++;
        }
        merged[id] = winner;
      }

      // ---- 3.5. Desduplica livros idênticos no merged ----
      await deduplicateAndMergeBooks(Object.values(merged));
      const currentBooks = await StorageService.getAllBooks();
      const currentBookIds = new Set(currentBooks.map((b) => b.id));
      for (const b of currentBooks) {
        merged[b.id] = b;
      }
      for (const id of Object.keys(merged)) {
        if (!currentBookIds.has(id)) {
          delete merged[id];
        }
      }

      // ---- 4. Upload book files that are not on the Drive yet (apenas se adicionados localmente via importador) ----
      for (const book of Object.values(merged)) {
        if (book.driveFileId) continue;
        const file = await StorageService.getBookFile(book.id);
        if (!file) continue;
        setStatus('syncing', `Enviando "${book.title}" para o Drive...`);
        const uploaded = await DriveApi.uploadFile(
          safeFileName(book.title, book.format),
          MIME_BY_FORMAT[book.format],
          file,
          folder.booksId
        );
        book.driveFileId = uploaded.id;
        await StorageService.saveBook(book, undefined, { preserveTimestamp: true });
        result.uploaded++;
      }

      // ---- 5. Trash Drive files of deleted books (best effort) ----
      for (const entry of Object.values(deleted)) {
        if (!entry.driveFileId || (entry as any).trashed) continue;
        try {
          await DriveApi.trashFile(entry.driveFileId);
          (entry as any).trashed = true;
        } catch {
          // No permission (file owned by the other account) - the tombstone still hides it
        }
      }

      // ---- 6. Catalog PDFs/EPUBs found in Drive and subfolders (SEM DUPLICIDADE) ----
      const knownFileIds = new Set(Object.values(merged).map((b) => b.driveFileId).filter(Boolean));
      const deletedFileIds = new Set(Object.values(deleted).map((d) => d.driveFileId).filter(Boolean));
      
      setStatus('syncing', 'Varrendo pastas e subpastas no Drive...');
      const candidates = await DriveApi.listDescendants([
        { id: folder.booksId, name: BOOKS_FOLDER_NAME, path: [BOOKS_FOLDER_NAME] },
        { id: folder.rootId, name: ROOT_FOLDER_NAME, path: [] }
      ]);

      let newCatalogCount = 0;
      for (const { file, folderPath } of candidates) {
        const format = formatFromFile(file);
        if (!format || knownFileIds.has(file.id) || deletedFileIds.has(file.id)) continue;

        try {
          const book = buildBookMetadataFromFile(file, format, folderPath);

          // Verifica se já existe um livro duplicado no merged
          const existing = Object.values(merged).find(
            (b) => (b.driveFileId && b.driveFileId === file.id) || areBooksDuplicates(b, book)
          );

          if (existing) {
            // Se já existe na estante, conecta o driveFileId e atualiza autor se antes era desconhecido
            let updated = false;
            if (!existing.driveFileId) {
              existing.driveFileId = file.id;
              updated = true;
            }
            if ((!existing.author || /desconhecido/i.test(existing.author)) && book.author && !/desconhecido/i.test(book.author)) {
              existing.author = book.author;
              updated = true;
            }
            if (updated) {
              await StorageService.saveBook(existing, undefined, { preserveTimestamp: true });
            }
            knownFileIds.add(file.id);
            continue; // NÃO CRIA CÓPIA DUPLICADA!
          }

          // Catalogação leve e instantânea: entrega a estante imediatamente
          await StorageService.saveBook(book, undefined, { preserveTimestamp: true });
          merged[book.id] = book;
          knownFileIds.add(file.id);
          result.imported++;
          newCatalogCount++;
        } catch (err) {
          console.warn(`Não foi possível catalogar ${file.name}:`, err);
        }
      }

      if (newCatalogCount > 0) {
        setStatus('syncing', `Catalogados ${newCatalogCount} novos livros na estante...`);
      }

      // ---- 7. Save merged state locally and on the Drive (atualiza o banco biblioteca.json) ----
      await StorageService.setDeletedBooks(deleted);
      const newRemote: RemoteLibrary = { version: 1, updatedAt: Date.now(), books: merged, deleted };
      const json = JSON.stringify(newRemote);
      if (libraryFile) {
        await DriveApi.updateFileContent(libraryFile.id, 'application/json', json);
      } else {
        await DriveApi.uploadFile(LIBRARY_FILE_NAME, 'application/json', json, folder.rootId);
      }

      result.finishedAt = Date.now();
      localStorage.setItem(LAST_SYNC_KEY, String(result.finishedAt));
      setStatus('idle', 'Sincronizado');
      return result;
    } catch (err: any) {
      if (err instanceof DriveAuthError) {
        setStatus('auth-required', err.message);
      } else {
        setStatus('error', err?.message || 'Erro ao sincronizar');
      }
      throw err;
    }
  },

  /** Downloads a book file from the Drive on-demand (apenas quando o leitor for aberto) */
  async downloadBookFile(book: Book): Promise<ArrayBuffer> {
    if (!book.driveFileId) throw new Error('Este livro não está no Google Drive.');
    const data = await DriveApi.downloadFile(book.driveFileId);
    await StorageService.saveBookFile(book.id, data);
    return data;
  },

  // ---- Sharing (only for the folder owner) ----
  async listSharedWith(): Promise<string[]> {
    const folder = await this.resolveFolder();
    const perms = await DriveApi.listPermissions(folder.rootId);
    return perms.filter((p) => p.type === 'user' && p.role !== 'owner' && p.emailAddress).map((p) => p.emailAddress!);
  },

  async shareFolder(email: string): Promise<void> {
    const folder = await this.resolveFolder();
    await DriveApi.shareWithEmail(folder.rootId, email.trim());
  }
};

/**
 * Cria o livro de forma instantânea a partir de metadados leves (sem baixar o arquivo binário pesado).
 * Identifica título limpo, autor e série a partir da estrutura de pastas.
 */
function buildBookMetadataFromFile(
  file: DriveFile,
  format: BookFormat,
  folderPath: string[] = []
): Book {
  const rawName = file.name.replace(/\.(pdf|epub)$/i, '');
  const folderMeta = extractMetadataFromFolderPath(folderPath);

  // Limpa o nome do arquivo, usando o autor da pasta se disponível
  const cleaned = cleanBookTitleAndAuthor(rawName, folderMeta.author);
  let title = cleaned.title;
  let author = cleaned.author;

  if ((!author || /desconhecido/i.test(author)) && folderMeta.author) {
    author = folderMeta.author;
  }

  let description: string | undefined;
  if (folderMeta.series) {
    description = `Série: ${folderMeta.series}`;
  }

  const now = Date.now();
  return {
    id: `drive-${file.id}`,
    title,
    author: author || 'Autor desconhecido',
    format,
    coverUrl: undefined,
    addedAt: now,
    updatedAt: now,
    fileSize: Number(file.size) || 0,
    progress: 0,
    readingMode: 'paginated',
    theme: 'sepia',
    fontSize: 16,
    bookmarks: [],
    description,
    driveFileId: file.id
  };
}

/**
 * Usado sob demanda quando o arquivo for baixado para enriquecer capa e total de páginas
 */
export async function enrichBookFromFile(book: Book, data: ArrayBuffer): Promise<Partial<Book>> {
  try {
    let coverUrl = book.coverUrl;
    let totalPages = book.totalPages;
    let description = book.description;

    if (book.format === 'pdf') {
      const meta = await parsePdfFile(data.slice(0));
      if (meta.coverDataUrl) coverUrl = meta.coverDataUrl;
      if (meta.totalPages) totalPages = meta.totalPages;
    } else {
      const meta = await parseEpubFile(data.slice(0));
      if (meta.coverDataUrl) coverUrl = meta.coverDataUrl;
      if (meta.description && !description) description = meta.description;
    }

    return { coverUrl, totalPages, description };
  } catch (err) {
    console.warn('Erro ao enriquecer metadados do livro:', err);
    return {};
  }
}
