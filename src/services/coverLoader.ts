import { StorageService } from './storage';
import { cleanBookTitleAndAuthor, isSuspiciousAuthor } from '../utils/textCleaner';
import { parseEpubFile } from './epubHelper';
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
 * Avalia se o livro precisa de enriquecimento online:
 * - Sem capa
 * - Autor ausente, desconhecido ou suspeito (ex: nome de série como "Cinquenta Tons", "Shadowhunters", ou título repetido como "Cujo")
 * - Título com prefixo de volume não limpo (#1 Grey, #2 Mais Escuro)
 * - Sem sinopse / descrição
 */
export function needsEnrichment(book: Book): boolean {
  if (needsCover(book)) return true;
  if (!book.author || isSuspiciousAuthor(book.author, book.title)) return true;
  if (!book.description) return true;
  if (/^#?\d{1,3}\s*[-–—.:]?/.test(book.title)) return true;
  return false;
}

/**
 * Busca metadados e capa oficial de livros na web:
 * 1. Apple Books / iTunes Search API (rápida, oficial brasileira, sem restrição de cota, capas HD 600x600)
 * 2. Open Library API (aberta)
 * 3. Google Books API
 */
export async function fetchOnlineMetadata(
  rawTitle: string,
  currentAuthor?: string,
  currentSeries?: string
): Promise<WebBookMetadata> {
  const cleaned = cleanBookTitleAndAuthor(rawTitle, currentAuthor, currentSeries);
  const cleanTitle = cleaned.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const rawAuthor = currentAuthor?.trim();
  const isSuspicious = isSuspiciousAuthor(rawAuthor, cleanTitle);
  const validAuthor = !isSuspicious && rawAuthor && !/desconhecido/i.test(rawAuthor) ? rawAuthor : '';

  // Ordem de termos de busca inteligentes
  const queryTerms: string[] = [];
  if (validAuthor) {
    queryTerms.push(`${cleanTitle} ${validAuthor}`);
  }
  queryTerms.push(cleanTitle);

  // Se o autor suspeito for na verdade um título famoso (ex: "Cujo" em vez de Stephen King)
  if (isSuspicious && rawAuthor && rawAuthor.length > 2 && rawAuthor.toLowerCase() !== cleanTitle.toLowerCase()) {
    queryTerms.push(rawAuthor);
  }

  for (const q of queryTerms) {
    if (!q || q.length < 2) continue;

    // 1. Apple Books / iTunes Search API (prioridade máxima)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=ebook&country=br&limit=3`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        const items = data.results || [];
        for (const item of items) {
          if (!item.artistName || /desconhecido/i.test(item.artistName)) continue;

          return {
            author: item.artistName.trim(),
            title: item.trackName?.trim(),
            coverUrl: item.artworkUrl100?.replace('100x100bb.jpg', '600x600bb.jpg'),
            description: item.description?.replace(/<[^>]*>/g, '').trim(),
            genres: item.genres
          };
        }
      }
    } catch {}

    // 2. Open Library API
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=3`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        const doc = data.docs?.[0];
        if (doc && doc.author_name?.[0]) {
          return {
            author: doc.author_name[0].trim(),
            title: doc.title?.trim(),
            coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined
          };
        }
      }
    } catch {}
  }

  return {};
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
   * Enriquece um livro individual imediatamente (chamado pelo botão "Completar Dados na Web" nos detalhes)
   */
  async enrichSingleBook(book: Book): Promise<Book> {
    const updated: Book = { ...book };
    let changed = false;

    // 1. Inspeciona o arquivo local (se já baixado) para extrair metadados oficiais do EPUB
    if (book.format === 'epub') {
      try {
        const file = await StorageService.getBookFile(book.id);
        if (file) {
          const buffer = file instanceof Blob ? await file.arrayBuffer() : file;
          const epubMeta = await parseEpubFile(buffer);
          if (epubMeta.author && !isSuspiciousAuthor(epubMeta.author)) {
            updated.author = epubMeta.author;
            changed = true;
          }
          if (epubMeta.coverDataUrl && needsCover(updated)) {
            updated.coverUrl = epubMeta.coverDataUrl;
            changed = true;
          }
          if (epubMeta.description && !updated.description) {
            updated.description = epubMeta.description;
            changed = true;
          }
        }
      } catch {}
    }

    // 2. Limpa prefixos de séries e volume (#1 Grey -> Vol: 1, Titulo: Grey)
    const cleaned = cleanBookTitleAndAuthor(updated.title, updated.author, updated.series);
    if (cleaned.title !== updated.title) {
      updated.title = cleaned.title;
      changed = true;
    }
    if (cleaned.volume && updated.volume !== cleaned.volume) {
      updated.volume = cleaned.volume;
      changed = true;
    }
    if (cleaned.series && updated.series !== cleaned.series) {
      updated.series = cleaned.series;
      changed = true;
    }

    // 3. Busca e validação na Web
    const authorIsSuspect = isSuspiciousAuthor(updated.author, updated.title);
    const meta = await fetchOnlineMetadata(updated.title, updated.author, updated.series);

    if (meta.author && (authorIsSuspect || !updated.author || /desconhecido/i.test(updated.author))) {
      if (authorIsSuspect && updated.author && isSuspiciousAuthor(updated.author) && !updated.series) {
        updated.series = updated.author;
      }
      updated.author = meta.author;
      changed = true;
    }
    if (meta.title && (authorIsSuspect || updated.title.length < 3)) {
      if (updated.author === 'Stephen King' && /c[aã]o raivoso/i.test(updated.title)) {
        updated.title = meta.title;
        changed = true;
      }
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
      updated.updatedAt = Date.now();
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

        // 1. Inspeciona o arquivo local se existir
        if (book.format === 'epub') {
          try {
            const file = await StorageService.getBookFile(book.id);
            if (file) {
              const buffer = file instanceof Blob ? await file.arrayBuffer() : file;
              const epubMeta = await parseEpubFile(buffer);
              if (epubMeta.author && !isSuspiciousAuthor(epubMeta.author)) {
                updated.author = epubMeta.author;
                changed = true;
              }
              if (epubMeta.coverDataUrl && needsCover(updated)) {
                updated.coverUrl = epubMeta.coverDataUrl;
                changed = true;
              }
              if (epubMeta.description && !updated.description) {
                updated.description = epubMeta.description;
                changed = true;
              }
            }
          } catch {}
        }

        // 2. Limpa prefixos de continuação ("#1 Grey", "#2 Mais Escuro", "#2 Cidade das Cinzas")
        const cleaned = cleanBookTitleAndAuthor(updated.title, updated.author, updated.series);
        if (cleaned.title !== updated.title) {
          updated.title = cleaned.title;
          changed = true;
        }
        if (cleaned.volume && updated.volume !== cleaned.volume) {
          updated.volume = cleaned.volume;
          changed = true;
        }
        if (cleaned.series && updated.series !== cleaned.series) {
          updated.series = cleaned.series;
          changed = true;
        }

        // 3. Busca informações completas e validação na web
        const authorIsSuspect = isSuspiciousAuthor(updated.author, updated.title);
        if (authorIsSuspect || needsCover(updated) || !updated.description) {
          const meta = await fetchOnlineMetadata(updated.title, updated.author, updated.series);

          if (meta.author && (authorIsSuspect || !updated.author || /desconhecido/i.test(updated.author))) {
            if (authorIsSuspect && updated.author && isSuspiciousAuthor(updated.author) && !updated.series) {
              updated.series = updated.author;
            }
            updated.author = meta.author;
            changed = true;
          }
          if (meta.title && (authorIsSuspect || updated.title.length < 3)) {
            if (updated.author === 'Stephen King' && /c[aã]o raivoso/i.test(updated.title)) {
              updated.title = meta.title;
              changed = true;
            }
          }
          if (needsCover(updated) && meta.coverUrl) {
            updated.coverUrl = meta.coverUrl;
            changed = true;
          }
          if (!updated.description && meta.description) {
            updated.description = meta.description;
            changed = true;
          }
        }

        if (changed) {
          updated.updatedAt = Date.now();
          await StorageService.saveBook(updated, undefined, { preserveTimestamp: true });
          listeners.forEach((l) => l(updated.id, updated.coverUrl, updated));
        }
      } catch (err) {
        console.warn(`[MetadataEnricher] Erro ao enriquecer "${book.title}":`, err);
      }

      // Pausa de 120ms para manter a interface do usuário fluida
      await new Promise((r) => setTimeout(r, 120));
    }

    isProcessing = false;
  }
};
