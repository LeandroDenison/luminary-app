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

const KNOWN_SERIES_KEYWORDS = [
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
  'a selecao',
  'shatter me',
  'estilhaca-me',
  'estilhaca me',
  'para todos os garotos que ja amei',
  'pretty little liars',
  'cidade da lua crescente',
  'trono de vidro',
  'corte de espinhos e rosas',
  'acotar',
  'anne de green gables',
  'herois do olimpo',
  'as provacoes de apolo',
  'magnus chase',
  'as cronicas dos kane',
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

const BOGUS_AUTHOR_NAMES = [
  'author not identified',
  'not identified',
  'unknown',
  'unknown author',
  'sem autor',
  'heinz kohut',
  'tiago salazar'
];

export function isKnownSeriesName(text?: string): boolean {
  if (!text || !text.trim()) return false;
  const norm = normalizeSearchText(text);
  return KNOWN_SERIES_KEYWORDS.some(
    (k) => norm === k || norm.startsWith(k + ' ') || normAuthorEndsWithKeyword(norm, k)
  );
}

function normAuthorEndsWithKeyword(norm: string, k: string): boolean {
  return norm.endsWith(' ' + k);
}

/**
 * Detecta se o autor atual é suspeito de ser o nome de uma saga/série, pasta ou título do livro,
 * em vez de ser um autor real. Exemplos: "Cinquenta Tons", "Shadowhunters", "Cujo", "Harry Potter".
 */
export function isSuspiciousAuthor(author?: string, title?: string): boolean {
  if (!author || !author.trim()) return true;
  const normAuthor = normalizeSearchText(author).replace(/^\[|\]$/g, '').trim();
  if (/desconhecido/i.test(normAuthor)) return true;

  if (BOGUS_AUTHOR_NAMES.some((b) => normAuthor === b || normAuthor.includes(b))) {
    return true;
  }

  // 1. Termos comuns de pastas, sagas e séries que não são nomes de autores
  if (isKnownSeriesName(normAuthor)) {
    return true;
  }

  // 2. Se o autor for idêntico ao título (ex: autor "Cujo" e título "Cujo")
  if (title) {
    const normTitle = normalizeSearchText(title);
    if (normAuthor === normTitle) {
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
 * Extrai série e volume (ex: "[01] Crepúsculo", "#1 Grey", "#2 Mais Escuro", "Vol. 2 - As Duas Torres")
 * e remove o prefixo feio do título, deixando o título limpo e elegante como no Kindle e Apple Books.
 */
export function extractSeriesAndVolume(
  rawTitle: string,
  existingSeries?: string
): { title: string; series?: string; volume?: string } {
  let title = rawTitle
    .replace(/^[A-Za-z]:\\(?:[^\\]+\\)+/i, '')
    .replace(/\s*\[e-livros\.xyz\]\s*/gi, ' ')
    .replace(/\s*\(oficial\)\s*/gi, ' ')
    .replace(/^\)\s*/, '')
    .replace(/\.{2,}$/, '')
    .trim();
  let series = existingSeries?.trim() || undefined;
  let volume: string | undefined = undefined;

  // 0. Padrão no início com colchetes: [01] Título, [02.5] Título, [01] 5 Título, [02] 5. Título
  const leadingBracketVolMatch = title.match(
    /^\[0*(\d+(?:\.\d+)?)\]\s*(?:(5)\.?\s+)?[-–—.:]?\s*(.+)$/
  );
  if (leadingBracketVolMatch) {
    const mainVol = leadingBracketVolMatch[1];
    const subVol = leadingBracketVolMatch[2];
    volume =
      subVol && !mainVol.includes('.')
        ? `${parseInt(mainVol, 10)}.${subVol}`
        : mainVol.includes('.')
          ? mainVol.replace(/^0+/, '')
          : String(parseInt(mainVol, 10));
    title = leadingBracketVolMatch[3].trim();
  }

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
  const hashPrefixMatch = title.match(/^#(\d+(?:\.\d+)?)\s*[-–—.:]?\s*(.+)$/i);
  if (hashPrefixMatch) {
    if (!volume) {
      volume = hashPrefixMatch[1].includes('.')
        ? hashPrefixMatch[1].replace(/^0+/, '')
        : String(parseInt(hashPrefixMatch[1], 10));
    }
    title = hashPrefixMatch[2].trim();
  }

  // 6. Padrão: Vol. 2 - Título OU Volume 2 - Título OU Livro 2 - Título OU Vol 2 Título
  const volPrefixMatch = title.match(
    /^(?:vol(?:ume)?\.?|livro|book)\s*#?\s*(\d+(?:\.\d+)?)\s*[-–—.:]?\s*(.+)$/i
  );
  if (volPrefixMatch) {
    if (!volume) {
      volume = volPrefixMatch[1].includes('.')
        ? volPrefixMatch[1].replace(/^0+/, '')
        : String(parseInt(volPrefixMatch[1], 10));
    }
    title = volPrefixMatch[2].trim();
  }

  // 7. Padrão: 02 - Título OU 02 Mais Escuro (número com zero inicial ou com hífen/ponto)
  // Ignora anos como 1984, 2001, etc. e títulos como "16 Luas"
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

function isAuthorMatch(candidate: string, knownAuthor: string): boolean {
  const normCand = normalizeSearchText(candidate).replace(/\./g, '').trim();
  const normAuth = normalizeSearchText(knownAuthor).replace(/\./g, '').trim();
  if (!normCand || !normAuth) return false;
  if (normCand === normAuth || normAuth.includes(normCand) || normCand.includes(normAuth)) {
    return true;
  }
  const candWords = normCand.split(/\s+/).filter((w) => w.length > 2);
  const authWords = normAuth.split(/\s+/).filter((w) => w.length > 2);
  if (candWords.length > 0 && authWords.length > 0) {
    const shared = candWords.filter((w) => authWords.includes(w));
    if (shared.length > 0 && candWords[candWords.length - 1] === authWords[authWords.length - 1]) {
      return true;
    }
  }
  return false;
}

/**
 * Limpa títulos removendo prefixos automáticos como "Cópia de", "Copia (1) de", extensões de arquivo,
 * extrai número de volume/série para não poluir o nome e tenta extrair Autor e Título caso o arquivo
 * esteja nomeado como "Autor - Livro" ou "Livro - Autor".
 */
export function cleanBookTitleAndAuthor(
  rawTitle: string,
  currentAuthor?: string,
  currentSeries?: string
): CleanedBookInfo {
  // 1. Remove caminhos de conversores Windows, extensão .pdf/.epub e sufixos de sites
  let clean = rawTitle
    .replace(/^[A-Za-z]:\\(?:[^\\]+\\)+/i, '')
    .replace(/\.(pdf|epub)$/i, '')
    .replace(/\s*\[e-livros\.xyz\]\s*/gi, ' ')
    .replace(/\s*\(oficial\)\s*/gi, ' ')
    .replace(/^\)\s*/, '')
    .replace(/\.{2,}$/, '')
    .trim();

  // 2. Remove prefixos de cópia repetidos (ex: "Cópia de Copia de Livro")
  clean = clean.replace(COPY_PREFIX_REGEX, '').trim();

  // 3. Substitui underscores por espaços comuns (ou remove underscore final solto)
  clean = clean.replace(/_+$/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  let author = currentAuthor && !/desconhecido/i.test(currentAuthor) ? currentAuthor.trim() : '';
  let series = currentSeries?.trim() || undefined;

  // 4. Extrai Série e Volume iniciais (ex: "[01] Título") antes de analisar separadores " - "
  const preSeriesInfo = extractSeriesAndVolume(clean, series);
  let title = preSeriesInfo.title;
  series = preSeriesInfo.series;
  let volume = preSeriesInfo.volume;

  // 5. Se o autor atual for na verdade uma série/saga ou autor inválido (ex: "Cinquenta Tons", "A Seleção", "Heinz Kohut")
  if (author && isSuspiciousAuthor(author, title)) {
    if (!series && isKnownSeriesName(author)) series = author;
    author = '';
  }

  // 6. Se contiver separador (" - " ou " — " ou " – ")
  if (title.includes(' - ') || title.includes(' — ') || title.includes(' – ')) {
    const parts = title.split(/\s*[-—–]\s*/);
    if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
      const part0 = parts[0].trim().replace(/\s*\([^)]*$/, '').trim();
      const part1 = parts[1].trim();

      if (author) {
        // Autor já é conhecido (ex: veio da pasta do autor no Drive)
        if (isAuthorMatch(part1, author)) {
          // Formato "<Título> - <Autor>" -> mantém apenas o Título!
          title = part0;
        } else if (isAuthorMatch(part0, author)) {
          // Formato "<Autor> - <Título>" -> mantém apenas o Título!
          title = part1;
        } else if (series && normalizeSearchText(part0) === normalizeSearchText(series)) {
          // Formato "<Série> - <Título>" -> mantém apenas o Título!
          title = part1;
        } else if (isKnownSeriesName(part0)) {
          if (!series) series = part0;
          title = part1;
        }
        // Caso contrário (ex: "Cujo - Cão Raivoso", "Misery - Louca Obsessão", "It - A Coisa"),
        // é Título + Subtítulo: preserva o título completo!
      } else {
        // Autor ainda desconhecido
        if (isKnownSeriesName(part0)) {
          if (!series) series = part0;
          title = part1;
        } else if (!isSuspiciousAuthor(part0, part1)) {
          author = part0;
          title = part1;
        } else if (!isSuspiciousAuthor(part1, part0)) {
          author = part1;
          title = part0;
        }
      }
    }
  }

  // 7. Segunda passada de extração de Série e Volume caso estivessem após o separador
  const postSeriesInfo = extractSeriesAndVolume(title, series);
  title = postSeriesInfo.title;
  series = postSeriesInfo.series || series;
  volume = postSeriesInfo.volume || volume;

  return {
    title: title || 'Livro sem título',
    author: author || 'Autor desconhecido',
    series,
    volume
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
