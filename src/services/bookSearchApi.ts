export interface OnlineBookResult {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  downloadUrl: string;
  format: 'epub' | 'pdf';
  isBrazilian: boolean;
  languageNote: string;
}

// Known Portuguese (Portugal) authors to exclude to ensure strict PT-BR purity
const KNOWN_PORTUGAL_AUTHORS = [
  'queirós',
  'queiroz',
  'castelo branco',
  'camões',
  'camoens',
  'garrett',
  'herculano',
  'pessoa',
  'quental',
  'gil vicente',
  'bocage',
  'fialho de almeida',
  'raul brandão',
  'cesário verde',
  'júlio dinis'
];

// Known Brazilian authors (PT-BR)
const KNOWN_BRAZIL_AUTHORS = [
  'machado de assis',
  'josé de alencar',
  'alencar',
  'aluísio azevedo',
  'aluisio azevedo',
  'lima barreto',
  'castro alves',
  'olavo bilac',
  'gonçalves dias',
  'joaquim manuel de macedo',
  'bernardo guimarães',
  'casimiro de abreu',
  'monteiro lobato',
  'euclides da cunha',
  'graça aranha',
  'cruz e sousa',
  'alphonsus de guimaraens',
  'raul pompeia',
  'joão do rio'
];

// Fallback curated local books in case external network fails
const LOCAL_BRAZILIAN_CATALOG: OnlineBookResult[] = [
  {
    id: 'local-dom-casmurro',
    title: 'Dom Casmurro',
    author: 'Machado de Assis',
    coverUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80',
    downloadUrl: '/books/dom_casmurro.epub',
    format: 'epub',
    isBrazilian: true,
    languageNote: '🇧🇷 Português Brasileiro (Verificado)'
  },
  {
    id: 'local-memorias-postumas',
    title: 'Memórias Póstumas de Brás Cubas',
    author: 'Machado de Assis',
    coverUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400&q=80',
    downloadUrl: '/books/memorias_postumas.epub',
    format: 'epub',
    isBrazilian: true,
    languageNote: '🇧🇷 Português Brasileiro (Verificado)'
  },
  {
    id: 'local-o-cortico',
    title: 'O Cortiço',
    author: 'Aluísio Azevedo',
    coverUrl: 'https://images.unsplash.com/photo-1476275466078-4007374efbbe?w=400&q=80',
    downloadUrl: '/books/o_cortico.epub',
    format: 'epub',
    isBrazilian: true,
    languageNote: '🇧🇷 Português Brasileiro (Verificado)'
  },
  {
    id: 'local-iracema',
    title: 'Iracema',
    author: 'José de Alencar',
    coverUrl: 'https://images.unsplash.com/photo-1516979187457-637abb4f9353?w=400&q=80',
    downloadUrl: '/books/iracema.epub',
    format: 'epub',
    isBrazilian: true,
    languageNote: '🇧🇷 Português Brasileiro (Verificado)'
  },
  {
    id: 'local-quincas-borba',
    title: 'Quincas Borba',
    author: 'Machado de Assis',
    coverUrl: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=400&q=80',
    downloadUrl: '/books/quincas_borba.epub',
    format: 'epub',
    isBrazilian: true,
    languageNote: '🇧🇷 Português Brasileiro (Verificado)'
  },
  {
    id: 'local-senhora',
    title: 'Senhora',
    author: 'José de Alencar',
    coverUrl: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=400&q=80',
    downloadUrl: '/books/senhora.epub',
    format: 'epub',
    isBrazilian: true,
    languageNote: '🇧🇷 Português Brasileiro (Verificado)'
  }
];

export async function searchOnlinePtBrBooks(query: string): Promise<OnlineBookResult[]> {
  const cleanQuery = query.trim().toLowerCase();

  // Multi-tier API URLs
  const candidateUrls = [
    // 1. Vite proxy endpoint (runs locally, no CORS)
    `/api/gutendex/books/?languages=pt&search=${encodeURIComponent(query)}`,
    // 2. Direct Gutendex
    `https://gutendex.com/books/?languages=pt&search=${encodeURIComponent(query)}`,
    // 3. AllOrigins raw proxy
    `https://api.allorigins.win/raw?url=${encodeURIComponent('https://gutendex.com/books/?languages=pt&search=' + query)}`,
    // 4. Corsproxy.io
    `https://corsproxy.io/?${encodeURIComponent('https://gutendex.com/books/?languages=pt&search=' + query)}`
  ];

  let data: any = null;

  for (const url of candidateUrls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        data = await response.json();
        if (data && Array.isArray(data.results)) {
          break; // Successfully got data
        }
      }
    } catch (_) {
      // Continue to next candidate URL
    }
  }

  // If external network is completely blocked, search within local Brazilian catalog
  if (!data || !Array.isArray(data.results)) {
    return LOCAL_BRAZILIAN_CATALOG.filter(
      (b) => b.title.toLowerCase().includes(cleanQuery) || b.author.toLowerCase().includes(cleanQuery)
    );
  }

  const results: OnlineBookResult[] = [];

  for (const item of data.results) {
    const authorName = item.authors?.[0]?.name || 'Autor Desconhecido';
    const authorLower = authorName.toLowerCase();
    const titleLower = item.title.toLowerCase();

    // Exclude Portugal authors to strictly protect PT-BR purity
    const isPortugal = KNOWN_PORTUGAL_AUTHORS.some(
      (pt) => authorLower.includes(pt) || titleLower.includes(pt)
    );
    if (isPortugal) continue;

    const isKnownBrazilian = KNOWN_BRAZIL_AUTHORS.some(
      (br) => authorLower.includes(br) || titleLower.includes(br)
    );

    // Find EPUB download URL
    let downloadUrl = item.formats?.['application/epub+zip'];
    let format: 'epub' | 'pdf' = 'epub';

    if (!downloadUrl) {
      downloadUrl = item.formats?.['application/pdf'];
      format = 'pdf';
    }

    if (!downloadUrl) continue;

    const coverUrl = item.formats?.['image/jpeg'] || undefined;

    // Clean author name from "Assis, Machado de" to "Machado de Assis"
    let cleanAuthor = authorName;
    if (cleanAuthor.includes(',')) {
      const parts = cleanAuthor.split(',').map((s: string) => s.trim());
      cleanAuthor = `${parts[1]} ${parts[0]}`;
    }

    results.push({
      id: `gutenberg-${item.id}`,
      title: item.title,
      author: cleanAuthor,
      coverUrl,
      downloadUrl,
      format,
      isBrazilian: isKnownBrazilian,
      languageNote: isKnownBrazilian ? '🇧🇷 Português Brasileiro (Verificado)' : '🇧🇷 Domínio Público'
    });
  }

  // If external search returned 0 items matching query, supplement with local Brazilian catalog matches
  if (results.length === 0) {
    const localMatches = LOCAL_BRAZILIAN_CATALOG.filter(
      (b) => b.title.toLowerCase().includes(cleanQuery) || b.author.toLowerCase().includes(cleanQuery)
    );
    return localMatches;
  }

  return results;
}
