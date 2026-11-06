import { DriveApi, DriveAuthError, ROOT_FOLDER_NAME, BOOKS_FOLDER_NAME, LIBRARY_FILE_NAME, type DriveFile } from './driveApi';
import { GoogleAuth } from './googleAuth';
import { StorageService } from './storage';
import { parsePdfFile } from './pdfHelper';
import { parseEpubFile } from './epubHelper';
import { cleanBookTitleAndAuthor } from '../utils/textCleaner';
import type { Book, BookFormat, DeletedEntry } from '../types';

/**
 * Formato do arquivo `biblioteca.json` salvo no Drive.
 * Guarda os metadados de todos os livros (inclui capa em base64,
 * progresso, marcadores, tema...) e a lista de livros excluídos.
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

      // ---- 1. Load remote library ----
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

      // ---- 3. Merge books (newest updatedAt wins) ----
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

        // Apply remote changes locally
        if (!local || JSON.stringify(local) !== JSON.stringify(winner)) {
          await StorageService.saveBook(winner, undefined, { preserveTimestamp: true });
          result.updatedLocal++;
        }
        merged[id] = winner;
      }

      // ---- 4. Upload book files that are not on the Drive yet ----
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

      // ---- 6. Import PDFs/EPUBs added manually to the Drive folder and all subfolders ----
      const knownFileIds = new Set(Object.values(merged).map((b) => b.driveFileId).filter(Boolean));
      const deletedFileIds = new Set(Object.values(deleted).map((d) => d.driveFileId).filter(Boolean));
      
      setStatus('syncing', 'Varrendo pastas e subpastas no Drive...');
      const candidates = await DriveApi.listDescendants([
        { id: folder.booksId, name: BOOKS_FOLDER_NAME, path: [BOOKS_FOLDER_NAME] },
        { id: folder.rootId, name: ROOT_FOLDER_NAME, path: [] }
      ]);

      for (const { file, folderPath } of candidates) {
        const format = formatFromFile(file);
        if (!format || knownFileIds.has(file.id) || deletedFileIds.has(file.id)) continue;

        setStatus('syncing', `Importando "${file.name}" do Drive...`);
        try {
          const data = await DriveApi.downloadFile(file.id);
          const book = await buildBookFromFile(file, format, data, folderPath);
          await StorageService.saveBook(book, data, { preserveTimestamp: true });
          merged[book.id] = book;
          knownFileIds.add(file.id);
          result.imported++;
        } catch (err) {
          console.warn(`Não foi possível importar ${file.name}:`, err);
        }
      }

      // ---- 7. Save merged state locally and on the Drive ----
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

  /** Downloads a book file from the Drive when it's not available on this device */
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

async function buildBookFromFile(
  file: DriveFile,
  format: BookFormat,
  data: ArrayBuffer,
  folderPath: string[] = []
): Promise<Book> {
  let title = file.name.replace(/\.(pdf|epub)$/i, '');
  let author = 'Autor desconhecido';
  let coverUrl: string | undefined;
  let totalPages: number | undefined;
  let description: string | undefined;

  if (format === 'pdf') {
    const meta = await parsePdfFile(data.slice(0));
    if (meta.title && meta.title !== 'Documento PDF') title = meta.title;
    if (meta.author && meta.author !== 'Desconhecido') author = meta.author;
    coverUrl = meta.coverDataUrl;
    totalPages = meta.totalPages;
  } else {
    const meta = await parseEpubFile(data.slice(0));
    if (meta.title && meta.title !== 'Livro EPUB') title = meta.title;
    if (meta.author && meta.author !== 'Autor Desconhecido') author = meta.author;
    coverUrl = meta.coverDataUrl;
    description = meta.description;
  }

  // Extrai autor e série inferidos da estrutura de pastas
  const folderMeta = extractMetadataFromFolderPath(folderPath);

  // Se o autor não foi detectado no arquivo, tenta o autor da pasta
  const isAuthorUnknown = !author || /desconhecido/i.test(author);
  if (isAuthorUnknown && folderMeta.author) {
    author = folderMeta.author;
  }

  // Remove prefixos automáticos como "Cópia de " e formata título/autor
  const cleaned = cleanBookTitleAndAuthor(title, author);
  title = cleaned.title;
  author = cleaned.author;

  // Se mesmo após a limpeza ainda estiver como desconhecido, garante o autor da pasta
  if ((!author || /desconhecido/i.test(author)) && folderMeta.author) {
    author = folderMeta.author;
  }

  // Se detectou série a partir da subpasta, enriquece a descrição
  if (folderMeta.series) {
    if (!description) {
      description = `Série: ${folderMeta.series}`;
    } else if (!description.toLowerCase().includes(folderMeta.series.toLowerCase())) {
      description = `${description}\n\nSérie: ${folderMeta.series}`;
    }
  }

  const now = Date.now();
  return {
    id: `drive-${file.id}`,
    title,
    author,
    format,
    coverUrl,
    addedAt: now,
    updatedAt: now,
    fileSize: Number(file.size) || data.byteLength,
    totalPages,
    progress: 0,
    readingMode: 'paginated',
    theme: 'sepia',
    fontSize: 16,
    bookmarks: [],
    description,
    driveFileId: file.id
  };
}
