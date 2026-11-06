import localforage from 'localforage';
import type { Book, DeletedEntry } from '../types';

// Store for book metadata and reading status
const metaStore = localforage.createInstance({
  name: 'LuminaryReader',
  storeName: 'books_metadata'
});

// Store for binary book files (PDF / EPUB ArrayBuffers)
const fileStore = localforage.createInstance({
  name: 'LuminaryReader',
  storeName: 'books_files'
});

// Store for sync bookkeeping (deleted books, etc.)
const syncStore = localforage.createInstance({
  name: 'LuminaryReader',
  storeName: 'sync_state'
});

const DELETED_KEY = 'deleted_books';

type ProgressFields = 'currentPage' | 'currentCfi' | 'progress' | 'totalPages' | 'lastReadAt' | 'readingMode' | 'pdfDisplayMode' | 'theme' | 'fontSize' | 'bookmarks' | 'fontFamily' | 'lineHeight' | 'marginSize';

export const StorageService = {
  async getAllBooks(): Promise<Book[]> {
    const books: Book[] = [];
    await metaStore.iterate<Book, void>((value) => {
      books.push(value);
    });
    // Sort by lastReadAt descending, then addedAt descending
    return books.sort((a, b) => (b.lastReadAt || b.addedAt) - (a.lastReadAt || a.addedAt));
  },

  async getBook(id: string): Promise<Book | null> {
    return await metaStore.getItem<Book>(id);
  },

  async getBookFile(id: string): Promise<ArrayBuffer | Blob | null> {
    return await fileStore.getItem<ArrayBuffer | Blob>(id);
  },

  async hasBookFile(id: string): Promise<boolean> {
    const keys = await fileStore.keys();
    return keys.includes(id);
  },

  async saveBookFile(id: string, fileData: ArrayBuffer | Blob): Promise<void> {
    await fileStore.setItem(id, fileData);
  },

  /**
   * Saves book metadata (and optionally the file).
   * `preserveTimestamp` keeps the given updatedAt (used when applying data from the Drive).
   */
  async saveBook(book: Book, fileData?: ArrayBuffer | Blob, opts?: { preserveTimestamp?: boolean }): Promise<void> {
    if (fileData) {
      await fileStore.setItem(book.id, fileData);
    }
    // Don't duplicate heavy binary fileData in metadata store
    const { fileData: _, ...metaOnly } = book;
    const toSave: Book = {
      ...(metaOnly as Book),
      updatedAt: opts?.preserveTimestamp ? book.updatedAt ?? Date.now() : Date.now()
    };
    await metaStore.setItem(book.id, toSave);
  },

  async updateProgress(id: string, updates: Partial<Pick<Book, ProgressFields>>): Promise<void> {
    const book = await metaStore.getItem<Book>(id);
    if (!book) return;

    // Only bump timestamps if something actually changed (avoids overwriting newer
    // progress from another device just by opening the book)
    const changed = (Object.keys(updates) as ProgressFields[]).some(
      (key) => JSON.stringify(book[key]) !== JSON.stringify(updates[key])
    );
    if (!changed) return;

    const now = Date.now();
    const updated: Book = {
      ...book,
      ...updates,
      lastReadAt: updates.lastReadAt ?? now,
      updatedAt: now
    };
    await metaStore.setItem(id, updated);
  },

  async deleteBook(id: string): Promise<void> {
    const book = await metaStore.getItem<Book>(id);
    await metaStore.removeItem(id);
    await fileStore.removeItem(id);

    // Remember the deletion so the sync doesn't bring the book back
    const deleted = await this.getDeletedBooks();
    deleted[id] = { at: Date.now(), driveFileId: book?.driveFileId };
    await syncStore.setItem(DELETED_KEY, deleted);
  },

  /** Removes a book locally without registering a deletion (used by sync) */
  async removeLocalOnly(id: string): Promise<void> {
    await metaStore.removeItem(id);
    await fileStore.removeItem(id);
  },

  async getDeletedBooks(): Promise<Record<string, DeletedEntry>> {
    return (await syncStore.getItem<Record<string, DeletedEntry>>(DELETED_KEY)) || {};
  },

  async setDeletedBooks(deleted: Record<string, DeletedEntry>): Promise<void> {
    await syncStore.setItem(DELETED_KEY, deleted);
  }
};
