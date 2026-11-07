import {
  DriveApi,
  DriveAuthError,
  ROOT_FOLDER_NAME,
  ROOT_FOLDER_NAME_ORGANIZED,
  BOOKS_FOLDER_NAME,
  LIBRARY_FILE_NAME,
  MASTER_OWNER_EMAIL,
  MASTER_ORGANIZED_FOLDER_ID,
  CLOUD_MIRROR_BASE_URL,
  PAGES_MIRROR_BASE_URL,
  extractDriveFolderId,
  type DriveFile
} from './driveApi';
import { GoogleAuth } from './googleAuth';
import { StorageService } from './storage';
import { parsePdfFile } from './pdfHelper';
import { parseEpubFile } from './epubHelper';
import { cleanBookTitleAndAuthor, areBooksDuplicates, isSuspiciousAuthor } from '../utils/textCleaner';
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
  rootName?: string;
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
  readLibraryJson?: boolean;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'auth-required' | 'not-configured' | 'disconnected';

const FOLDER_CACHE_KEY = 'luminary_drive_folder';
const PREFERRED_FOLDER_KEY = 'luminary_preferred_folder_id';
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
  'luminary leitor - organizado',
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
    // 1 pasta: avalia se é nome de série conhecida (ex: "Cinquenta Tons", "Shadowhunters") ou autor
    if (isSuspiciousAuthor(meaningful[0])) {
      return { series: meaningful[0] };
    }
    return { author: meaningful[0] };
  }

  // 2 ou mais pastas: ex: ["Stephen King", "A Torre Negra"] ou ["Cinquenta Tons", "E L James"]
  if (isSuspiciousAuthor(meaningful[0])) {
    return { series: meaningful[0], author: meaningful[1] };
  }

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

    // Se houver uma entrada mais recente com driveFileId (ex: da pasta Organizado), usa o driveFileId mais recente
    const newestDriveEntry = [...group]
      .filter((b) => b.driveFileId)
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))[0];
    if (newestDriveEntry?.driveFileId) {
      winner.driveFileId = newestDriveEntry.driveFileId;
    }

    for (const loser of losers) {
      if ((!winner.author || isSuspiciousAuthor(winner.author, winner.title)) && loser.author && !isSuspiciousAuthor(loser.author, loser.title)) {
        winner.author = loser.author;
      }
      if (!winner.driveFileId && loser.driveFileId) {
        winner.driveFileId = loser.driveFileId;
      }
      if (!winner.series && loser.series) {
        winner.series = loser.series;
      }
      if (!winner.volume && loser.volume) {
        winner.volume = loser.volume;
      }
      if (!winner.coverUrl && loser.coverUrl) {
        winner.coverUrl = loser.coverUrl;
      }
      if (!winner.isReadLater && loser.isReadLater) {
        winner.isReadLater = true;
      }
      if ((!winner.fileSize || winner.fileSize === 0) && loser.fileSize && loser.fileSize > 0) {
        winner.fileSize = loser.fileSize;
      }
      if ((loser.progress || 0) > (winner.progress || 0)) {
        winner.progress = loser.progress;
        winner.currentPage = loser.currentPage || winner.currentPage;
        winner.currentCfi = loser.currentCfi || winner.currentCfi;
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

    // Higieniza título/autor/volume do vencedor
    const cleaned = cleanBookTitleAndAuthor(winner.title, winner.author, winner.series);
    winner.title = cleaned.title;
    if (cleaned.author && !/desconhecido/i.test(cleaned.author)) winner.author = cleaned.author;
    if (cleaned.series) winner.series = cleaned.series;
    if (cleaned.volume && !winner.volume) winner.volume = cleaned.volume;

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

function isMasterOwnerAccount(): boolean {
  const email = GoogleAuth.getAccountEmail()?.toLowerCase().trim();
  return email === MASTER_OWNER_EMAIL;
}

async function fetchCloudMirrorLibrary(): Promise<RemoteLibrary | null> {
  const urls = [
    `${CLOUD_MIRROR_BASE_URL}/biblioteca.json?t=${Date.now()}`,
    `${PAGES_MIRROR_BASE_URL}/biblioteca.json?t=${Date.now()}`
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const parsed = await res.json();
        if (parsed && parsed.books && Object.keys(parsed.books).length > 0) {
          return {
            version: 1,
            updatedAt: parsed.updatedAt || Date.now(),
            books: parsed.books,
            deleted: parsed.deleted || {}
          };
        }
      }
    } catch (err) {
      console.warn('[DriveSync] Falha ao tentar espelho:', url, err);
    }
  }
  return null;
}

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
      if (!raw) return null;
      const parsed: SyncFolderInfo = JSON.parse(raw);
      // Corrige cache legado onde conta convidada (ex: Ellen) aparecia como dona da pasta Luminary
      if (!isMasterOwnerAccount() && parsed.ownedByMe && (!parsed.rootName || parsed.rootName.toLowerCase().includes('luminary'))) {
        parsed.ownedByMe = false;
        parsed.ownerEmail = MASTER_OWNER_EMAIL;
        parsed.rootName = ROOT_FOLDER_NAME_ORGANIZED;
        localStorage.setItem(FOLDER_CACHE_KEY, JSON.stringify(parsed));
      }
      return parsed;
    } catch {
      return null;
    }
  },

  clearCache() {
    localStorage.removeItem(FOLDER_CACHE_KEY);
    localStorage.removeItem(PREFERRED_FOLDER_KEY);
    localStorage.removeItem(LAST_SYNC_KEY);
    setStatus('idle');
  },

  /**
   * Permite selecionar ou importar qualquer pasta diretamente do Google Drive (por ID ou link).
   * Lê imediatamente o arquivo `biblioteca.json` se existir dentro da pasta (ou via espelho compartilhado), e varre os livros.
   */
  async selectFolder(folderIdOrUrl: string): Promise<SyncResult> {
    const folderId = extractDriveFolderId(folderIdOrUrl);
    if (!folderId) throw new Error('Informe um link ou ID de pasta válido do Google Drive.');

    const isOwner = isMasterOwnerAccount();
    let info: SyncFolderInfo;

    try {
      const folderFile = await DriveApi.getFile(folderId);
      const booksFolder = await DriveApi.ensureChildFolder(folderFile.id, BOOKS_FOLDER_NAME);
      const reallyOwned = isOwner ? folderFile.ownedByMe !== false : false;
      info = {
        rootId: folderFile.id,
        rootName: folderFile.name || ROOT_FOLDER_NAME_ORGANIZED,
        booksId: booksFolder.id,
        ownedByMe: reallyOwned,
        ownerEmail: reallyOwned ? folderFile.owners?.[0]?.emailAddress : (folderFile.owners?.[0]?.emailAddress || MASTER_OWNER_EMAIL)
      };
    } catch (err) {
      if (err instanceof DriveAuthError) throw err;
      // Quando a pasta é compartilhada por outra conta e o escopo drive.file bloqueia metadados diretos (404),
      // conecta diretamente à pasta compartilhada sem erro e carrega a biblioteca.json!
      info = {
        rootId: folderId,
        rootName: ROOT_FOLDER_NAME_ORGANIZED,
        booksId: folderId,
        ownedByMe: false,
        ownerEmail: MASTER_OWNER_EMAIL
      };
    }

    localStorage.setItem(PREFERRED_FOLDER_KEY, info.rootId);
    localStorage.setItem(FOLDER_CACHE_KEY, JSON.stringify(info));

    return this.sync();
  },

  /**
   * Finds the "Luminary Leitor - Organizado" or "Luminary Leitor" folder (or user-selected folder).
   */
  async resolveFolder(): Promise<SyncFolderInfo> {
    const isOwner = isMasterOwnerAccount();
    const cached = this.getCachedFolder();
    const preferredId = localStorage.getItem(PREFERRED_FOLDER_KEY);

    // 1. Se o usuário escolheu manualmente uma pasta específica para importar/sincronizar
    if (preferredId) {
      if (cached && cached.rootId === preferredId) {
        return cached;
      }
      try {
        const customRoot = await DriveApi.getFile(preferredId);
        const booksFolder = await DriveApi.ensureChildFolder(customRoot.id, BOOKS_FOLDER_NAME);
        const reallyOwned = isOwner ? customRoot.ownedByMe !== false : false;
        const info: SyncFolderInfo = {
          rootId: customRoot.id,
          rootName: customRoot.name || ROOT_FOLDER_NAME_ORGANIZED,
          booksId: booksFolder.id,
          ownedByMe: reallyOwned,
          ownerEmail: reallyOwned ? customRoot.owners?.[0]?.emailAddress : (customRoot.owners?.[0]?.emailAddress || MASTER_OWNER_EMAIL)
        };
        localStorage.setItem(FOLDER_CACHE_KEY, JSON.stringify(info));
        return info;
      } catch (err) {
        if (err instanceof DriveAuthError) throw err;
        // Mantém a pasta compartilhada selecionada mesmo se o escopo drive.file retornar 404 no getFile direto
        const info: SyncFolderInfo = {
          rootId: preferredId,
          rootName: ROOT_FOLDER_NAME_ORGANIZED,
          booksId: preferredId,
          ownedByMe: false,
          ownerEmail: MASTER_OWNER_EMAIL
        };
        localStorage.setItem(FOLDER_CACHE_KEY, JSON.stringify(info));
        return info;
      }
    }

    const allFound = await DriveApi.findRootFolders().catch(() => [] as DriveFile[]);
    // Se não for o dono mestre (ex: conta da Ellen), descarta pastas vazias criadas localmente no próprio Drive dela
    const folders = isOwner ? allFound : allFound.filter((f) => f.ownedByMe === false);
    const organizedFolder = folders.find((f) => f.name.toLowerCase().includes('organizado'));

    // Auto-migra permissões da pasta antiga "Luminary Leitor" para a nova "Luminary Leitor - Organizado"
    if (isOwner && organizedFolder && organizedFolder.ownedByMe !== false) {
      const migrationKey = `luminary_migrated_perms_${organizedFolder.id}`;
      if (!localStorage.getItem(migrationKey)) {
        const legacyFolders = folders.filter((f) => f.id !== organizedFolder.id && f.ownedByMe !== false);
        if (legacyFolders.length > 0) {
          try {
            const currentPerms = await DriveApi.listPermissions(organizedFolder.id);
            const currentEmails = new Set(
              currentPerms.map((p) => p.emailAddress?.toLowerCase()).filter(Boolean)
            );
            for (const leg of legacyFolders) {
              const legPerms = await DriveApi.listPermissions(leg.id).catch(() => []);
              for (const p of legPerms) {
                if (p.type === 'user' && p.role !== 'owner' && p.emailAddress) {
                  const emailLower = p.emailAddress.toLowerCase();
                  if (!currentEmails.has(emailLower)) {
                    await DriveApi.shareWithEmail(organizedFolder.id, p.emailAddress).catch(() => {});
                    currentEmails.add(emailLower);
                  }
                }
              }
            }
            localStorage.setItem(migrationKey, '1');
          } catch {}
        }
      }
    }

    if (organizedFolder && cached?.rootId !== organizedFolder.id) {
      localStorage.removeItem(FOLDER_CACHE_KEY);
    } else if (cached && (isOwner || !cached.ownedByMe)) {
      return cached;
    }

    const sharedOrganized = folders.find((f) => f.ownedByMe === false && f.name.toLowerCase().includes('organizado'));
    const sharedAny = folders.find((f) => f.ownedByMe === false);
    const own = isOwner ? folders.find((f) => f.ownedByMe !== false) : undefined;
    let root = sharedOrganized || organizedFolder || sharedAny || own;

    if (!root) {
      if (!isOwner) {
        // Para contas convidadas (ex: celular da Ellen), conecta direto à pasta compartilhada mestre!
        // NUNCA cria uma pasta vazia no Drive da convidada dizendo que ela é a dona.
        const sharedInfo: SyncFolderInfo = {
          rootId: MASTER_ORGANIZED_FOLDER_ID,
          rootName: ROOT_FOLDER_NAME_ORGANIZED,
          booksId: MASTER_ORGANIZED_FOLDER_ID,
          ownedByMe: false,
          ownerEmail: MASTER_OWNER_EMAIL
        };
        localStorage.setItem(FOLDER_CACHE_KEY, JSON.stringify(sharedInfo));
        return sharedInfo;
      }
      root = await DriveApi.createFolder(ROOT_FOLDER_NAME_ORGANIZED);
      root.ownedByMe = true;
    }

    const booksFolder = await DriveApi.ensureChildFolder(root.id, BOOKS_FOLDER_NAME);
    const reallyOwned = isOwner ? root.ownedByMe !== false : false;
    const info: SyncFolderInfo = {
      rootId: root.id,
      rootName: root.name || ROOT_FOLDER_NAME_ORGANIZED,
      booksId: booksFolder.id,
      ownedByMe: reallyOwned,
      ownerEmail: reallyOwned ? root.owners?.[0]?.emailAddress : (root.owners?.[0]?.emailAddress || MASTER_OWNER_EMAIL)
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
    const result: SyncResult = {
      uploaded: 0,
      imported: 0,
      updatedLocal: 0,
      removedLocal: 0,
      finishedAt: 0,
      readLibraryJson: false
    };

    try {
      const folder = await this.resolveFolder();

      // ---- 1. Load remote library (procura biblioteca.json na pasta raiz, subpasta ou espelho mestre) ----
      setStatus('syncing', `Lendo "${folder.rootName || ROOT_FOLDER_NAME_ORGANIZED}"...`);
      let libraryFile = await DriveApi.findChild(folder.rootId, LIBRARY_FILE_NAME).catch(() => null);
      if (!libraryFile && folder.booksId && folder.booksId !== folder.rootId) {
        libraryFile = await DriveApi.findChild(folder.booksId, LIBRARY_FILE_NAME).catch(() => null);
      }

      let remote: RemoteLibrary = { version: 1, updatedAt: 0, books: {}, deleted: {} };
      if (libraryFile) {
        try {
          setStatus('syncing', 'Carregando biblioteca.json do Drive...');
          const parsed = JSON.parse(await DriveApi.downloadText(libraryFile.id));
          remote = { ...remote, ...parsed, books: parsed.books || {}, deleted: parsed.deleted || {} };
          if (Object.keys(remote.books).length > 0) {
            result.readLibraryJson = true;
          }
        } catch (err) {
          console.warn('biblioteca.json inválido, tentando espelho:', err);
        }
      }

      // Fallback automático para o espelho mestre na nuvem quando o escopo drive.file
      // da conta convidada (ex: celular da Ellen) oculta a biblioteca.json compartilhada (404) ou retorna vazia
      if (Object.keys(remote.books).length === 0) {
        setStatus('syncing', 'Carregando biblioteca.json compartilhada...');
        const mirrorRemote = await fetchCloudMirrorLibrary();
        if (mirrorRemote && Object.keys(mirrorRemote.books).length > 0) {
          remote = mirrorRemote;
          result.readLibraryJson = true;
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
          winner = (rem.updatedAt || 0) >= (local.updatedAt || 0) ? { ...rem } : { ...local };
          winner.driveFileId = winner.driveFileId || local.driveFileId || rem.driveFileId;
          if ((local.progress || 0) > (winner.progress || 0)) {
            winner.progress = local.progress;
            winner.currentPage = local.currentPage || winner.currentPage;
            winner.currentCfi = local.currentCfi || winner.currentCfi;
          }
          if (!winner.coverUrl && (local.coverUrl || rem.coverUrl)) {
            winner.coverUrl = local.coverUrl || rem.coverUrl;
          }
          if (winner.isReadLater === undefined && (local.isReadLater !== undefined || rem.isReadLater !== undefined)) {
            winner.isReadLater = local.isReadLater ?? rem.isReadLater;
          }
        } else {
          winner = { ...(local || rem)! };
        }

        // Apply remote changes locally (apenas metadados, zero downloads pesados)
        if (!local || JSON.stringify(local) !== JSON.stringify(winner)) {
          await StorageService.saveBook(winner, undefined, { preserveTimestamp: true });
          if (!local) {
            result.imported++;
          } else {
            result.updatedLocal++;
          }
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
        try {
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
        } catch (upErr) {
          console.warn(`Sem permissão ou erro ao enviar "${book.title}":`, upErr);
        }
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
      const deletedFileIds = new Set(Object.values(deleted).map((d) => d.driveFileId).filter(Boolean));
      const activeDriveFileIds = new Set<string>();

      setStatus('syncing', 'Varrendo pastas e subpastas no Drive...');
      const candidates = await DriveApi.listDescendants([
        { id: folder.booksId, name: BOOKS_FOLDER_NAME, path: [BOOKS_FOLDER_NAME] },
        { id: folder.rootId, name: folder.rootName || ROOT_FOLDER_NAME, path: [] }
      ]).catch(() => []);

      let newCatalogCount = 0;
      for (const { file, folderPath } of candidates) {
        const format = formatFromFile(file);
        if (!format || deletedFileIds.has(file.id)) continue;
        activeDriveFileIds.add(file.id);

        try {
          const book = buildBookMetadataFromFile(file, format, folderPath);

          // Verifica se já existe este arquivo ou obra equivalente no merged
          const existing = Object.values(merged).find(
            (b) => (b.driveFileId && b.driveFileId === file.id) || areBooksDuplicates(b, book)
          );

          if (existing) {
            let updated = false;
            if (existing.driveFileId !== file.id) {
              existing.driveFileId = file.id;
              updated = true;
            }
            if (book.fileSize && existing.fileSize !== book.fileSize) {
              existing.fileSize = book.fileSize;
              updated = true;
            }
            if (book.title && existing.title !== book.title) {
              existing.title = book.title;
              updated = true;
            }
            if (book.author && !/desconhecido/i.test(book.author) && existing.author !== book.author) {
              existing.author = book.author;
              updated = true;
            }
            if (book.series && existing.series !== book.series) {
              existing.series = book.series;
              updated = true;
            }
            if (book.volume && existing.volume !== book.volume) {
              existing.volume = book.volume;
              updated = true;
            }
            if (updated) {
              await StorageService.saveBook(existing, undefined, { preserveTimestamp: true });
            }
            continue; // NÃO CRIA CÓPIA DUPLICADA!
          }

          // Catalogação leve e instantânea: entrega a estante imediatamente
          await StorageService.saveBook(book, undefined, { preserveTimestamp: true });
          merged[book.id] = book;
          result.imported++;
          newCatalogCount++;
        } catch (err) {
          console.warn(`Não foi possível catalogar ${file.name}:`, err);
        }
      }

      // Remove livros órfãos do Drive antigo apenas se o dono da pasta conseguiu listar a biblioteca completa
      if (folder.ownedByMe && activeDriveFileIds.size >= 50) {
        for (const [id, b] of Object.entries(merged)) {
          if (b.id.startsWith('drive-') && (!b.driveFileId || !activeDriveFileIds.has(b.driveFileId))) {
            delete merged[id];
            await StorageService.removeLocalOnly(id);
            result.removedLocal++;
          }
        }
      }

      if (newCatalogCount > 0) {
        setStatus('syncing', `Catalogados ${newCatalogCount} novos livros na estante...`);
      }

      // ---- 7. Save merged state locally and on the Drive (apenas se dono ou com permissão) ----
      await StorageService.setDeletedBooks(deleted);
      if (folder.ownedByMe && libraryFile) {
        const newRemote: RemoteLibrary = { version: 1, updatedAt: Date.now(), books: merged, deleted };
        const json = JSON.stringify(newRemote);
        try {
          await DriveApi.updateFileContent(libraryFile.id, 'application/json', json);
        } catch (writeErr) {
          console.warn('[DriveSync] Aviso ao gravar biblioteca.json:', writeErr);
        }
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

  /** Downloads a book file from the Drive on-demand (com fallback automático para o espelho na nuvem em contas convidadas) */
  async downloadBookFile(book: Book): Promise<ArrayBuffer> {
    if (book.driveFileId) {
      try {
        const data = await DriveApi.downloadFile(book.driveFileId);
        await StorageService.saveBookFile(book.id, data);
        return data;
      } catch (driveErr) {
        console.warn('[DriveSync] Download direto do Drive falhou (tentando espelho da biblioteca):', driveErr);
      }
    }

    // Fallback para espelho na nuvem (permite que o celular da Ellen baixe qualquer livro mesmo com restrição drive.file)
    const fmt = (book.format || 'epub').toLowerCase();
    if (book.fileSize && book.fileSize > 0) {
      const mirrorUrl = `${CLOUD_MIRROR_BASE_URL}/files/${book.fileSize}.${fmt}`;
      const res = await fetch(mirrorUrl);
      if (res.ok) {
        const data = await res.arrayBuffer();
        await StorageService.saveBookFile(book.id, data);
        return data;
      }
    }

    // Caso o livro local não tenha fileSize gravado, consulta na biblioteca mestre pelo título/ID
    const mirrorLib = await fetchCloudMirrorLibrary();
    if (mirrorLib) {
      const match =
        mirrorLib.books[book.id] ||
        Object.values(mirrorLib.books).find((b) => areBooksDuplicates(b, book));
      if (match?.fileSize) {
        const matchFmt = (match.format || fmt).toLowerCase();
        const mirrorUrl = `${CLOUD_MIRROR_BASE_URL}/files/${match.fileSize}.${matchFmt}`;
        const res = await fetch(mirrorUrl);
        if (res.ok) {
          const data = await res.arrayBuffer();
          await StorageService.saveBookFile(book.id, data);
          return data;
        }
      }
    }

    throw new Error('Não foi possível baixar este livro da nuvem no momento.');
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

  // Limpa o nome do arquivo, extrai série/volume e usa o autor da pasta se disponível
  const cleaned = cleanBookTitleAndAuthor(rawName, folderMeta.author, folderMeta.series);
  let title = cleaned.title;
  let author = cleaned.author;
  const series = cleaned.series || folderMeta.series;
  const volume = cleaned.volume;

  if ((!author || /desconhecido/i.test(author)) && folderMeta.author) {
    author = folderMeta.author;
  }

  let description: string | undefined;
  if (series) {
    description = `Série: ${series}${volume ? ` (Livro ${volume})` : ''}`;
  }

  const now = Date.now();
  return {
    id: `drive-${file.id}`,
    title,
    author: author || 'Autor desconhecido',
    series,
    volume,
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
