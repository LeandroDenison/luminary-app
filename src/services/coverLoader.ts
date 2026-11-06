import { StorageService } from './storage';
import { cleanBookTitleAndAuthor } from '../utils/textCleaner';
import type { Book } from '../types';

export interface WebBookMetadata {
  title?: string;
  author?: string;
  coverUrl?: string;
  description?: string;
  genres?: string[];
}

export type CoverListener = (bookId: string, coverUrl?: string, updatedBook?: Book) => void;
const listeners = new Set<CoverListener>();

// Fila de livros a processar em segundo plano
let queue: Book[] = [];
let isProcessing = false;
const processedIds = new Set<string>();

export function needsCover(book: Book): boolean {
  if (!book.coverUrl) return true;
  // URLs do Google Drive (lh3.googleusercontent ou drive.google.com) falham no <img> direto do navegador
  if (book.coverUrl.includes('googleusercontent.com') || book.coverUrl.includes('drive.google.com')) {
    return true;
  }
  // Data URLs vazias ou quebradas
  if (book.coverUrl.startsWith('data:') && book.coverUrl.length < 500) {
    return true;
  }
  return false;
}

/**
 * Avalia se o livro precisa de enriquecimento online (sem autor, sem capa, sem sinopse ou título não higienizado).
 */
export function needsEnrichment(book: Book): boolean {
  if (needsCover(book)) return true;
  if (!book.author || /desconhecido/i.test(book.author)) return true;
  if (!book.description) return true;
  if (/^#?\d{1,3}\s*[-–—.:]/.test(book.title)) return true;
  return false;
}

/**
 * Busca metadados e capa oficial de livros na web:
 * 1. Apple Books / iTunes Search API (rápida, oficial brasileira, sem restrição de cota, capas HD 600x600)
 * 2. Open Library API (aberta)
 * 3. Google Books API
 */
export async function fetchOnlineMetadata(rawTitle: string, currentAuthor?: string): Promise<WebBookMetadata> {
  const cleaned = cleanBookTitleAndAuthor(rawTitle, currentAuthor);
  const cleanTitle = cleaned.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanAuthor = cleaned.author && !/desconhecido/i.test(cleaned.author) ? cleaned.author.trim() : '';

  const result: WebBookMetadata = {};

  // 1. Apple Books / iTunes Search API (prioridade máxima)
  try {
    const q = cleanAuthor ? `${cleanTitle} ${cleanAuthor}` : cleanTitle;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=ebook&country=br&limit=1`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      const item = data.results?.[0];
      if (item) {
        if (item.artistName && !/desconhecido/i.test(item.artistName)) {
          result.author = item.artistName.trim();
        }
        if (item.trackName) {
          result.title = item.trackName.trim();
        }
        if (item.artworkUrl100) {
          result.coverUrl = item.artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg');
        }
        if (item.description) {
          result.description = item.description.replace(/<[^>]*>/g, '').trim();
        }
        if (item.genres && Array.isArray(item.genres)) {
          result.genres = item.genres;
        }
        return result;
      }
    }
  } catch {}

  // 2. Open Library API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const url = cleanAuthor
      ? `https://openlibrary.org/search.json?title=${encodeURIComponent(cleanTitle)}&author=${encodeURIComponent(cleanAuthor)}&limit=1`
      : `https://openlibrary.org/search.json?q=${encodeURIComponent(cleanTitle)}&limit=1`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      const doc = data.docs?.[0];
      if (doc) {
        if (doc.author_name?.[0] && !/desconhecido/i.test(doc.author_name[0])) {
          result.author = doc.author_name[0].trim();
        }
        if (doc.title) {
          result.title = doc.title.trim();
        }
        if (doc.cover_i) {
          result.coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
        }
        return result;
      }
    }
  } catch {}

  // 3. Google Books API
  try {
    const q = cleanAuthor ? `${cleanTitle} ${cleanAuthor}` : cleanTitle;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      const vol = data.items?.[0]?.volumeInfo;
      if (vol) {
        if (vol.authors?.[0]) result.author = vol.authors[0].trim();
        if (vol.title) result.title = vol.title.trim();
        const thumb = vol.imageLinks?.thumbnail || vol.imageLinks?.smallThumbnail;
        if (thumb) {
          result.coverUrl = thumb.replace(/^http:\/\//i, 'https://').replace('&edge=curl', '');
        }
        if (vol.description) {
          result.description = vol.description.replace(/<[^>]*>/g, '').trim();
        }
        return result;
      }
    }
  } catch {}

  return result;
}

export const CoverLoader = {
  subscribe(listener: CoverListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /**
   * Adiciona livros que precisam de enriquecimento de dados ou capa à fila assíncrona
   */
  queueBooks(books: Book[]) {
    let hasNew = false;
    for (const b of books) {
      if (!needsEnrichment(b) || processedIds.has(b.id)) continue;
      processedIds.add(b.id);
      queue.push(b);
      hasNew = true;
    }
    if (hasNew) {
      this.processQueue();
    }
  },

  /**
   * Enriquece um livro individual imediatamente (ex: chamado pelo botão do usuário nos detalhes)
   */
  async enrichSingleBook(book: Book): Promise<Book> {
    const updated = { ...book };
    let changed = false;

    // Higieniza título e série
    const cleaned = cleanBookTitleAndAuthor(updated.title, updated.author, updated.series);
    if (cleaned.title !== updated.title) {
      updated.title = cleaned.title;
      changed = true;
    }
    if (cleaned.volume && !updated.volume) {
      updated.volume = cleaned.volume;
      changed = true;
    }
    if (cleaned.series && !updated.series) {
      updated.series = cleaned.series;
      changed = true;
    }

    // Busca na web
    const meta = await fetchOnlineMetadata(updated.title, updated.author);

    if ((!updated.author || /desconhecido/i.test(updated.author)) && meta.author) {
      updated.author = meta.author;
      changed = true;
    }
    if (needsCover(updated) && meta.coverUrl) {
      updated.coverUrl = meta.coverUrl;
      changed = true;
    }
    if (!updated.description && meta.description) {
      updated.description = meta.description;
      changed = true;
    }

    if (changed) {
      await StorageService.saveBook(updated, undefined, { preserveTimestamp: true });
      listeners.forEach((l) => l(updated.id, updated.coverUrl, updated));
    }

    return updated;
  },

  async processQueue() {
    if (isProcessing) return;
    isProcessing = true;

    while (queue.length > 0) {
      const book = queue.shift();
      if (!book) break;

      try {
        let changed = false;
        const updated: Book = { ...book };

        // 1. Limpa prefixos de continuação ("#2 - ", "Vol. 2 - ")
        const cleaned = cleanBookTitleAndAuthor(updated.title, updated.author, updated.series);
        if (cleaned.title !== updated.title) {
          updated.title = cleaned.title;
          changed = true;
        }
        if (cleaned.volume && !updated.volume) {
          updated.volume = cleaned.volume;
          changed = true;
        }
        if (cleaned.series && !updated.series) {
          updated.series = cleaned.series;
          changed = true;
        }

        // 2. Busca informações completas na web
        const meta = await fetchOnlineMetadata(updated.title, updated.author);

        if ((!updated.author || /desconhecido/i.test(updated.author)) && meta.author) {
          updated.author = meta.author;
          changed = true;
        }
        if (needsCover(updated) && meta.coverUrl) {
          updated.coverUrl = meta.coverUrl;
          changed = true;
        }
        if (!updated.description && meta.description) {
          updated.description = meta.description;
          changed = true;
        }

        if (changed) {
          await StorageService.saveBook(updated, undefined, { preserveTimestamp: true });
          listeners.forEach((l) => l(updated.id, updated.coverUrl, updated));
        }
      } catch (err) {
        console.warn(`[MetadataEnricher] Erro ao enriquecer "${book.title}":`, err);
      }

      // Pausa leve de 150ms para não sobrecarregar a rede nem travar a UI
      await new Promise((r) => setTimeout(r, 150));
    }

    isProcessing = false;
  }
};
