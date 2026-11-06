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

export interface CleanedBookInfo {
  title: string;
  author: string;
  series?: string;
  volume?: string;
}

/**
 * Extrai série e volume (ex: "#2 - O Cemitério", "Vol. 2 - As Duas Torres", "Harry Potter #2 - A Câmara Secreta")
 * e remove o prefixo feio do título, deixando o título limpo e elegante como no Kindle e Apple Books.
 */
export function extractSeriesAndVolume(
  rawTitle: string,
  existingSeries?: string
): { title: string; series?: string; volume?: string } {
  let title = rawTitle.trim();
  let series = existingSeries?.trim() || undefined;
  let volume: string | undefined = undefined;

  // 1. Padrão no final com parênteses/colchetes: (Série #2) ou [Série - Vol 2]
  const bracketMatch = title.match(/[\(\[]([^\)\]]+?)(?:\s*[-–—,]?\s*|\s+)(?:#|vol(?:ume)?\.?|livro|bk\.?)\s*(\d+)[\)\]]$/i);
  if (bracketMatch) {
    if (!series) series = bracketMatch[1].trim();
    volume = String(parseInt(bracketMatch[2], 10));
    title = title.replace(bracketMatch[0], '').trim();
  }

  // 2. Padrão no final: (#2) ou (Vol. 2) ou [Vol 2]
  const volEndMatch = title.match(/[\(\[](?:#|vol(?:ume)?\.?|livro)\s*(\d+)[\)\]]$/i);
  if (volEndMatch) {
    if (!volume) volume = String(parseInt(volEndMatch[1], 10));
    title = title.replace(volEndMatch[0], '').trim();
  }

  // 3. Padrão no final com traço: - Vol. 2 ou - #2
  const dashEndMatch = title.match(/\s*[-–—]\s*(?:#|vol(?:ume)?\.?|livro)\s*(\d+)$/i);
  if (dashEndMatch) {
    if (!volume) volume = String(parseInt(dashEndMatch[1], 10));
    title = title.replace(dashEndMatch[0], '').trim();
  }

  // 4. Padrão: Série #2 - Título OU Série - Vol. 2 - Título
  const seriesStartMatch = title.match(/^(.+?)\s*[-–—]?\s*(?:#|vol(?:ume)?\.?|livro)\s*(\d+)\s*[-–—:]\s*(.+)$/i);
  if (seriesStartMatch) {
    if (!series) series = seriesStartMatch[1].trim();
    if (!volume) volume = String(parseInt(seriesStartMatch[2], 10));
    title = seriesStartMatch[3].trim();
  }

  // 5. Padrão: #2 - Título OU #02 - Título
  const hashPrefixMatch = title.match(/^#(\d+)\s*[-–—.:]\s*(.+)$/i);
  if (hashPrefixMatch) {
    if (!volume) volume = String(parseInt(hashPrefixMatch[1], 10));
    title = hashPrefixMatch[2].trim();
  }

  // 6. Padrão: Vol. 2 - Título OU Volume 2 - Título OU Livro 2 - Título
  const volPrefixMatch = title.match(/^(?:vol(?:ume)?\.?|livro|book)\s*#?\s*(\d+)\s*[-–—.:]\s*(.+)$/i);
  if (volPrefixMatch) {
    if (!volume) volume = String(parseInt(volPrefixMatch[1], 10));
    title = volPrefixMatch[2].trim();
  }

  // 7. Padrão: 02 - Título OU 2 - Título (número no início com separador)
  // Ignora anos como 1984, 2001, etc.
  const numPrefixMatch = title.match(/^(\d{1,3})\s*[-–—.:]\s*(.+)$/);
  if (numPrefixMatch && parseInt(numPrefixMatch[1], 10) < 500) {
    if (!volume) volume = String(parseInt(numPrefixMatch[1], 10));
    title = numPrefixMatch[2].trim();
  }

  return { title, series, volume };
}

/**
 * Limpa títulos removendo prefixos automáticos como "Cópia de", "Copia (1) de", extensões de arquivo,
 * extrai número de volume/série para não poluir o nome e tenta extrair Autor e Título caso o arquivo
 * esteja nomeado como "Autor - Livro".
 */
export function cleanBookTitleAndAuthor(
  rawTitle: string,
  currentAuthor?: string,
  currentSeries?: string
): CleanedBookInfo {
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

  // 5. Extrai Série e Volume (#2, Vol. 2, etc.) e higieniza o título
  const seriesInfo = extractSeriesAndVolume(title, currentSeries);
  title = seriesInfo.title;

  return {
    title: title || 'Livro sem título',
    author: author || 'Autor desconhecido',
    series: seriesInfo.series,
    volume: seriesInfo.volume
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

/**
 * Chave única normalizada para detecção de duplicatas pelo título essencial e formato.
 * Remove "(1)", prefixos de cópia, pontuações e acentos.
 */
export function getBookDeduplicationKey(title: string, format: string): string {
  const cleaned = cleanBookTitleAndAuthor(title);
  let cleanTitle = cleaned.title;
  cleanTitle = cleanTitle.replace(/\s*\(\d+\)$/, '').trim();
  cleanTitle = cleanTitle.replace(/\s*[-—–]\s*c[oó]pia$/i, '').trim();

  const normTitle = normalizeSearchText(cleanTitle);
  return `${normTitle}|${format.toLowerCase()}`;
}

/**
 * Avalia se dois livros são a mesma obra.
 * Considera igual se o título e formato coincidirem E:
 * - Pelo menos um tem autor desconhecido (ex: "O Cemitério" autor desconhecido vs "O Cemitério" Stephen King)
 * - OU ambos têm o mesmo autor.
 */
export function areBooksDuplicates(
  bookA: { title: string; format: string; author?: string },
  bookB: { title: string; format: string; author?: string }
): boolean {
  if (bookA.format.toLowerCase() !== bookB.format.toLowerCase()) return false;

  const keyA = getBookDeduplicationKey(bookA.title, bookA.format);
  const keyB = getBookDeduplicationKey(bookB.title, bookB.format);
  if (keyA !== keyB) return false;

  const authA = bookA.author && !/desconhecido/i.test(bookA.author) ? normalizeSearchText(bookA.author) : '';
  const authB = bookB.author && !/desconhecido/i.test(bookB.author) ? normalizeSearchText(bookB.author) : '';

  // Se um tem autor desconhecido e o outro tem autor preenchido, é a mesma obra duplicada!
  if (!authA || !authB) return true;

  // Se ambos têm autores e os autores são compatíveis
  return authA.includes(authB) || authB.includes(authA);
}
