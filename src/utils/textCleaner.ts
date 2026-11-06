/**
 * Utilitários para limpeza de títulos de livros e busca avançada por autor/título.
 */

// Regex para remover variações de "Cópia de", "Copia (1) de", "Copy of", etc.
const COPY_PREFIX_REGEX = /^(?:c[oó]pia(?:\s*\(\d+\))?\s+de\s+|copy(?:\s*\(\d+\))?\s+of\s+)+/i;

/**
 * Normaliza um texto para busca:
 * Remove acentos, pontuações e converte para minúsculas.
 * Exemplo: "Fiódor Dostoiévski" -> "fiodor dostoievski"
 */
export function normalizeSearchText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Limpa títulos removendo prefixos automáticos como "Cópia de", "Copia (1) de", extensões de arquivo,
 * e tenta extrair o Autor e Título caso o arquivo esteja nomeado como "Autor - Livro" ou "Livro - Autor".
 */
export function cleanBookTitleAndAuthor(
  rawTitle: string,
  currentAuthor?: string
): { title: string; author: string } {
  // 1. Remove extensão .pdf ou .epub caso presente
  let clean = rawTitle.replace(/\.(pdf|epub)$/i, '').trim();

  // 2. Remove prefixos de cópia repetidos (ex: "Cópia de Copia de Livro")
  clean = clean.replace(COPY_PREFIX_REGEX, '').trim();

  // 3. Substitui underscores por espaços comuns
  clean = clean.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  let author = currentAuthor && !/desconhecido/i.test(currentAuthor) ? currentAuthor.trim() : '';
  let title = clean;

  // 4. Se o autor ainda for desconhecido e o nome contiver separador (" - " ou " — " ou " – ")
  if (!author && (clean.includes(' - ') || clean.includes(' — ') || clean.includes(' – '))) {
    const parts = clean.split(/\s*[-—–]\s*/);
    if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
      // Padrão comum no Brasil: "Autor - Título"
      author = parts[0].trim();
      title = parts[1].trim();
    }
  }

  return {
    title: title || 'Livro sem título',
    author: author || 'Autor desconhecido'
  };
}

/**
 * Verifica se um livro bate com o termo de busca pesquisado pelo usuário.
 * Permite buscar por autor, por título ou por ambos (ex: "machado dom").
 * Ignora completamente acentuação e maiúsculas/minúsculas.
 */
export function matchesBookSearch(
  book: { title: string; author: string },
  searchTerm: string
): boolean {
  if (!searchTerm || !searchTerm.trim()) return true;

  const queryWords = normalizeSearchText(searchTerm).split(/\s+/).filter(Boolean);
  const normalizedTitle = normalizeSearchText(book.title);
  const normalizedAuthor = normalizeSearchText(book.author);

  // Cada palavra digitada precisa existir no título ou no autor
  return queryWords.every(
    (word) => normalizedTitle.includes(word) || normalizedAuthor.includes(word)
  );
}
