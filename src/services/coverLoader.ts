import { StorageService } from './storage';
import { DriveApi } from './driveApi';
import { GoogleAuth } from './googleAuth';
import type { Book } from '../types';

type CoverListener = (bookId: string, coverUrl: string) => void;
const listeners = new Set<CoverListener>();

// Fila de livros a processar
let queue: Book[] = [];
let isProcessing = false;
const processedIds = new Set<string>();

async function urlToBase64(url: string, timeoutMs = 4000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Busca capa online através de APIs abertas (Google Books / OpenLibrary)
 */
async function fetchOnlineCover(title: string, author?: string): Promise<string | null> {
  const cleanTitle = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanAuthor = author && !/desconhecido/i.test(author) ? author.trim() : '';

  // 1. Google Books API
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
      const thumb = data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail;
      if (thumb) {
        const secureUrl = thumb.replace(/^http:\/\//i, 'https://').replace('&edge=curl', '');
        const b64 = await urlToBase64(secureUrl);
        if (b64 && b64.length > 500) return b64;
      }
    }
  } catch {}

  // 2. Open Library API
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
        const b64 = await urlToBase64(`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`);
        if (b64 && b64.length > 500) return b64;
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
    for (const b of books) {
      // Se já tem capa ou já foi processado nesta sessão, pula
      if (b.coverUrl || processedIds.has(b.id)) continue;
      processedIds.add(b.id);
      queue.push(b);
    }
    this.processQueue();
  },

  async processQueue() {
    if (isProcessing) return;
    isProcessing = true;

    while (queue.length > 0) {
      const book = queue.shift();
      if (!book) break;

      try {
        let coverUrl: string | null = null;

        // Estratégia 1: miniatura gerada pelo Google Drive se o arquivo estiver lá
        if (book.driveFileId && GoogleAuth.isConnected()) {
          try {
            coverUrl = await DriveApi.getThumbnailDataUrl(book.driveFileId);
          } catch {}
        }

        // Estratégia 2: busca por APIs abertas (Google Books / OpenLibrary)
        if (!coverUrl) {
          coverUrl = await fetchOnlineCover(book.title, book.author);
        }

        // Se conseguiu a capa, salva permanentemente e notifica a UI
        if (coverUrl) {
          await StorageService.saveBook(
            { ...book, coverUrl },
            undefined,
            { preserveTimestamp: true }
          );
          listeners.forEach((l) => l(book.id, coverUrl!));
        }
      } catch (err) {
        console.warn(`[CoverLoader] Erro ao buscar capa de "${book.title}":`, err);
      }

      // Pequena pausa de 250ms para manter a interface do usuário 100% fluida
      await new Promise((r) => setTimeout(r, 250));
    }

    isProcessing = false;
  }
};
