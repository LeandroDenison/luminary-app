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
 * Detecta se o autor atual é suspeito de ser o nome de uma saga/série, pasta ou título do livro,
 * em vez de ser um autor real. Exemplos: "Cinquenta Tons", "Shadowhunters", "Cujo", "Harry Potter".
 */
export function isSuspiciousAuthor(author?: string, title?: string): boolean {
  if (!author || !author.trim()) return true;
  const normAuthor = normalizeSearchText(author);
  if (/desconhecido/i.test(normAuthor)) return true;

  // 1. Termos comuns de pastas, sagas e séries que não são nomes de autores
  const seriesKeywords = [
    'cinquenta tons',
    'shadowhunters',
    'harry potter',
    'a torre negra',
    'torre negra',
    'percy jackson',
    'cronicas de gelo e fogo',
    'game of thrones',
    'crepusculo',
    'jogos vorazes',
    'divergente',
    'maze runner',
    'senhor dos aneis',
    'o senhor dos aneis',
    'star wars',
    'os instrumentos mortais',
    'instrumentos mortais',
    'serie',
    'sagas',
    'saga',
    'trilogia',
    'colecao',
    'volume',
    'edicao',
    'livros',
    'livro',
    'ebooks',
    'ebook',
    'box',
    'editora'
  ];
  if (
    seriesKeywords.some(
      (k) => normAuthor === k || normAuthor.startsWith(k + ' ') || normAuthor.endsWith(' ' + k)
    )
  ) {
    return true;
  }

  // 2. Se o autor for idêntico ao título ou contiver o título (ex: autor "Cujo" e título "Cão Raivoso" ou "Cujo")
  if (title) {
    const normTitle = normalizeSearchText(title);
    if (normAuthor === normTitle || normTitle.includes(normAuthor)) {
      return true;
    }
  }

  // 3. Palavra única que não é autor clássico com 1 só nome
  const words = author.trim().split(/\s+/);
  if (
    words.length === 1 &&
    !['homero', 'platao', 'aristoteles', 'dante', 'voltaire', 'moliere', 'esopo', 'seneca'].includes(
      normAuthor
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Extrai série e volume (ex: "#1 Grey", "#2 Mais Escuro", "#2 Cidade das Cinzas", "Vol. 2 - As Duas Torres")
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
  const bracketMatch = title.match(
    /[\(\[]([^\)\]]+?)(?:\s*[-–—,]?\s*|\s+)(?:#|vol(?:ume)?\.?|livro|bk\.?)\s*(\d+)[\)\]]$/i
  );
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

  // 4. Padrão: Série #2 - Título OU Série - Vol. 2 - Título OU Série #2 Título
  const seriesStartMatch = title.match(
    /^(.+?)\s*[-–—]?\s*(?:#|vol(?:ume)?\.?|livro)\s*(\d+)\s*[-–—:]?\s*(.+)$/i
  );
  if (seriesStartMatch) {
    if (!series) series = seriesStartMatch[1].trim();
    if (!volume) volume = String(parseInt(seriesStartMatch[2], 10));
    title = seriesStartMatch[3].trim();
  }

  // 5. Padrão: #1 Grey, #2 Mais Escuro, #2 Cidade das Cinzas, #02 - Título (separador opcional!)
  const hashPrefixMatch = title.match(/^#(\d+)\s*[-–—.:]?\s*(.+)$/i);
  if (hashPrefixMatch) {
    if (!volume) volume = String(parseInt(hashPrefixMatch[1], 10));
    title = hashPrefixMatch[2].trim();
  }

  // 6. Padrão: Vol. 2 - Título OU Volume 2 - Título OU Livro 2 - Título OU Vol 2 Título
  const volPrefixMatch = title.match(
    /^(?:vol(?:ume)?\.?|livro|book)\s*#?\s*(\d+)\s*[-–—.:]?\s*(.+)$/i
  );
  if (volPrefixMatch) {
    if (!volume) volume = String(parseInt(volPrefixMatch[1], 10));
    title = volPrefixMatch[2].trim();
  }

  // 7. Padrão: 02 - Título OU 02 Mais Escuro (número com zero inicial ou com hífen/ponto)
  // Ignora anos como 1984, 2001, etc.
  const numPrefixMatch = title.match(/^(?:0(\d{1,2})|\b(\d{1,3})\s*[-–—.:])\s*(.+)$/);
  if (numPrefixMatch) {
    const rawNum = numPrefixMatch[1] || numPrefixMatch[2];
    if (parseInt(rawNum, 10) < 500) {
      if (!volume) volume = String(parseInt(rawNum, 10));
      title = numPrefixMatch[3].trim();
    }
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
  let series = currentSeries?.trim() || undefined;

  // 4. Se contiver separador (" - " ou " — " ou " – ")
  if (clean.includes(' - ') || clean.includes(' — ') || clean.includes(' – ')) {
    const parts = clean.split(/\s*[-—–]\s*/);
    if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
      const part0 = parts[0].trim();
      const part1 = parts[1].trim();

      // Se a primeira parte for um nome de série conhecido (ex: "Cinquenta Tons - Grey")
      if (isSuspiciousAuthor(part0)) {
        if (!series) series = part0;
        title = part1;
      } else if (!author) {
        author = part0;
        title = part1;
      }
    }
  }

  // 5. Se o autor atual for na verdade uma série/saga (ex: "Cinquenta Tons", "Shadowhunters")
  if (author && isSuspiciousAuthor(author, title)) {
    if (!series) series = author;
    author = ''; // Limpa para permitir que a web encontre o autor verdadeiro (ex: E L James, Cassandra Clare)!
  }

  // 6. Extrai Série e Volume (#1 Grey -> Vol: 1, Titulo: Grey) e higieniza o título
  const seriesInfo = extractSeriesAndVolume(title, series);
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
 * Permite buscar por autor, por título, por série ou por ambos (ex: "machado dom").
 * Ignora completamente acentuação e maiúsculas/minúsculas.
 */
export function matchesBookSearch(
  book: { title: string; author: string; series?: string },
  searchTerm: string
): boolean {
  if (!searchTerm || !searchTerm.trim()) return true;

  const queryWords = normalizeSearchText(searchTerm).split(/\s+/).filter(Boolean);
  const normalizedTitle = normalizeSearchText(book.title);
  const normalizedAuthor = normalizeSearchText(book.author);
  const normalizedSeries = book.series ? normalizeSearchText(book.series) : '';

  // Cada palavra digitada precisa existir no título, no autor ou na série
  return queryWords.every(
    (word) =>
      normalizedTitle.includes(word) ||
      normalizedAuthor.includes(word) ||
      normalizedSeries.includes(word)
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
 * - Pelo menos um tem autor desconhecido/suspeito
 * - OU ambos têm autores compatíveis.
 */
export function areBooksDuplicates(
  bookA: { title: string; format: string; author?: string },
  bookB: { title: string; format: string; author?: string }
): boolean {
  if (bookA.format.toLowerCase() !== bookB.format.toLowerCase()) return false;

  const keyA = getBookDeduplicationKey(bookA.title, bookA.format);
  const keyB = getBookDeduplicationKey(bookB.title, bookB.format);
  if (keyA !== keyB) return false;

  const authA =
    bookA.author && !isSuspiciousAuthor(bookA.author) ? normalizeSearchText(bookA.author) : '';
  const authB =
    bookB.author && !isSuspiciousAuthor(bookB.author) ? normalizeSearchText(bookB.author) : '';

  // Se um tem autor desconhecido/suspeito e o outro tem autor preenchido, é a mesma obra duplicada!
  if (!authA || !authB) return true;

  // Se ambos têm autores e os autores são compatíveis
  return authA.includes(authB) || authB.includes(authA);
}
