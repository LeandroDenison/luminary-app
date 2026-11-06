export interface DetectedChapter {
  id: string;
  title: string;
  pageNumber: number;
}

// Regex patterns to match various chapter naming styles in Portuguese
const CHAPTER_REGEXES = [
  // Capítulo VI, Capítulo 6, Capítulo I: O Encontro, Cap. X
  /^(?:CAP[IÍ]TULO|CAP\.)\s+([IVXLCDM\d]+|[A-ZÀ-Úa-zà-ú]+)(?:[:\s.–—]+(.*))?$/i,
  // Parte I, Livro Segundo, Seção 3
  /^(?:PARTE|LIVRO|SE[CÇ][AÃ]O)\s+([IVXLCDM\d]+|[A-ZÀ-Úa-zà-ú]+)(?:[:\s.–—]+(.*))?$/i,
  // Numerais Romanos com ponto ou traço (ex: "VI - O Delírio", "VI.", "VI")
  /^([IVXLCDM]{1,6})(?:[:\s.–—]+(.*))?$/,
  // Seções especiais clássicas da literatura brasileira
  /^(?:AO\s+LEITOR|[OÓ]BITO\s+DO\s+AUTOR|PROL[OÓ]GO|EP[IÍ]LOGO|INTRODU[CÇ][AÃ]O|PREF[AÁ]CIO|POSF[AÁ]CIO|CONCLUS[AÃ]O|ADVERT[EÊ]NCIA)(?:[:\s.–—]+(.*))?$/i
];

export async function detectPdfChapters(pdfDoc: any): Promise<DetectedChapter[]> {
  const chapters: DetectedChapter[] = [];

  // Method 1: Check native PDF outline / Table of Contents
  try {
    const outline = await pdfDoc.getOutline();
    if (outline && outline.length > 0) {
      for (let i = 0; i < outline.length; i++) {
        const item = outline[i];
        if (!item.title) continue;

        let pageNumber = 1;
        try {
          let dest = item.dest;
          if (typeof dest === 'string') {
            dest = await pdfDoc.getDestination(dest);
          }
          if (Array.isArray(dest) && dest[0]) {
            const pageIndex = await pdfDoc.getPageIndex(dest[0]);
            pageNumber = pageIndex + 1;
          }
        } catch (_) {}

        chapters.push({
          id: `outline-${i}`,
          title: item.title.trim(),
          pageNumber
        });
      }

      if (chapters.length >= 2) {
        return chapters;
      }
    }
  } catch (err) {
    console.warn('Erro ao ler sumário nativo do PDF:', err);
  }

  // Method 2: Intelligent Heuristic Text Scanner across pages
  try {
    const maxPagesToScan = Math.min(pdfDoc.numPages, 500);

    for (let pageNum = 1; pageNum <= maxPagesToScan; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items as any[];

      if (!items || items.length === 0) continue;

      // Group text items into lines based on Y coordinate
      const linesMap = new Map<number, { text: string; fontSize: number }>();

      for (const item of items) {
        if (!item.str || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        const fontSize = Math.round(item.transform[0]);

        const existing = linesMap.get(y);
        if (existing) {
          existing.text += ' ' + item.str;
          existing.fontSize = Math.max(existing.fontSize, fontSize);
        } else {
          linesMap.set(y, { text: item.str, fontSize });
        }
      }

      // Sort lines from top of the page to bottom (descending Y)
      const sortedLines = Array.from(linesMap.entries())
        .sort((a, b) => b[0] - a[0])
        .map((entry) => entry[1]);

      // Examine the top 8 lines of the page for chapter titles
      const candidateLines = sortedLines.slice(0, 8);

      for (let lineIdx = 0; lineIdx < candidateLines.length; lineIdx++) {
        const line = candidateLines[lineIdx];
        const trimmed = line.text.trim();

        // Skip lines that are too long to be a chapter title
        if (trimmed.length < 2 || trimmed.length > 90) continue;

        let matched = false;
        let detectedTitle = '';

        for (const regex of CHAPTER_REGEXES) {
          const match = trimmed.match(regex);
          if (match) {
            matched = true;
            detectedTitle = trimmed;

            // If the next line is also a short title line, combine them
            // e.g. "CAPÍTULO VI" + "O DELÍRIO" -> "Capítulo VI — O Delírio"
            const nextLine = candidateLines[lineIdx + 1];
            if (nextLine && nextLine.text.trim().length > 2 && nextLine.text.trim().length < 50) {
              const nextTrimmed = nextLine.text.trim();
              if (!nextTrimmed.match(/^[0-9]+$/)) {
                detectedTitle += ` — ${nextTrimmed}`;
              }
            }
            break;
          }
        }

        if (matched && detectedTitle) {
          const alreadyOnPage = chapters.some((c) => c.pageNumber === pageNum);
          if (!alreadyOnPage) {
            chapters.push({
              id: `detected-${pageNum}-${chapters.length}`,
              title: detectedTitle,
              pageNumber: pageNum
            });
            break;
          }
        }
      }
    }
  } catch (scanErr) {
    console.warn('Erro na varredura de capítulos:', scanErr);
  }

  return chapters;
}
