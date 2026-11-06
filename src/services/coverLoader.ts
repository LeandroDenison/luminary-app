import { StorageService } from './storage';
import type { Book } from '../types';

type CoverListener = (bookId: string, coverUrl: string) => void;
const listeners = new Set<CoverListener>();

// Fila de livros a processar
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
 * Busca capa online em alta definição
 * Prioridade 1: Apple Books / iTunes Search API (rápida, pública, capas em alta definição das edições brasileiras)
 * Prioridade 2: Google Books API
 * Prioridade 3: Open Library API
 */
async function fetchOnlineCover(title: string, author?: string): Promise<string | null> {
  const cleanTitle = title
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanAuthor =
    author && !/desconhecido/i.test(author) ? author.trim() : '';

  // 1. Apple Books / iTunes Search API (altíssima velocidade, sem restrição de cota, capa HD brasileira)
  try {
    const q = cleanAuthor ? `${cleanTitle} ${cleanAuthor}` : cleanTitle;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=ebook&country=br&limit=1`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      const rawUrl = data.results?.[0]?.artworkUrl100;
      if (rawUrl) {
        return rawUrl.replace('100x100bb.jpg', '600x600bb.jpg');
      }
    }
  } catch {}

  // 2. Google Books API
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
      const thumb =
        data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail ||
        data.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail;
      if (thumb) {
        return thumb.replace(/^http:\/\//i, 'https://').replace('&edge=curl', '');
      }
    }
  } catch {}

  // 3. Open Library API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(cleanTitle)}${cleanAuthor ? `&author=${encodeURIComponent(cleanAuthor)}` : ''}&limit=1`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      const coverId = data.docs?.[0]?.cover_i;
      if (coverId) {
        return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
      }
    }
  } catch {}

  return null;
}

export const CoverLoader = {
  subscribe(listener: CoverListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /**
   * Adiciona livros sem capa à fila de segundo plano
   */
  queueBooks(books: Book[]) {
    let hasNew = false;
    for (const b of books) {
      if (!needsCover(b) || processedIds.has(b.id)) continue;
      processedIds.add(b.id);
      queue.push(b);
      hasNew = true;
    }
    if (hasNew) {
      this.processQueue();
    }
  },

  async processQueue() {
    if (isProcessing) return;
    isProcessing = true;

    while (queue.length > 0) {
      const book = queue.shift();
      if (!book) break;

      try {
        const coverUrl = await fetchOnlineCover(book.title, book.author);

        if (coverUrl) {
          await StorageService.saveBook(
            { ...book, coverUrl },
            undefined,
            { preserveTimestamp: true }
          );
          listeners.forEach((l) => l(book.id, coverUrl));
        }
      } catch (err) {
        console.warn(`[CoverLoader] Erro ao buscar capa de "${book.title}":`, err);
      }

      // Pausa leve de 150ms para manter a interface do usuário totalmente suave
      await new Promise((r) => setTimeout(r, 150));
    }

    isProcessing = false;
  }
};
