import type { PDFPageProxy } from 'pdfjs-dist';

export interface ReflowBlock {
  type: 'heading' | 'paragraph';
  level?: 1 | 2 | 3;
  text: string;
}

export interface PageReflowData {
  pageNumber: number;
  blocks: ReflowBlock[];
  hasText: boolean;
  rawText: string;
}

interface RawLine {
  y: number;
  x: number;
  height: number;
  maxFontSize: number;
  text: string;
}

// Memory cache for parsed reflow pages: Map<`${docFingerprint}_${pageNum}`, PageReflowData>
const reflowCache = new Map<string, PageReflowData>();

/**
 * Extracts and formats structured, readable reflow text from a PDF page proxy.
 */
export async function extractPageReflow(
  page: PDFPageProxy,
  docKey: string = 'default'
): Promise<PageReflowData> {
  const cacheKey = `${docKey}_${page.pageNumber}`;
  if (reflowCache.has(cacheKey)) {
    return reflowCache.get(cacheKey)!;
  }

  try {
    const textContent = await page.getTextContent();
    const items = (textContent.items || []) as any[];

    if (!items || items.length === 0) {
      const emptyResult: PageReflowData = {
        pageNumber: page.pageNumber,
        blocks: [],
        hasText: false,
        rawText: ''
      };
      reflowCache.set(cacheKey, emptyResult);
      return emptyResult;
    }

    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;

    // 1. Group text items into lines based on baseline Y
    const lineBuckets: RawLine[] = [];
    const Y_EPSILON = 3.5;

    for (const item of items) {
      if (!item.str || typeof item.str !== 'string') continue;
      const str = item.str;
      if (!str.trim() && str.length === 0) continue;

      const tx = item.transform[4];
      const ty = item.transform[5];
      // Font size approximation from scale matrix
      const fontSize = Math.abs(item.transform[0]) || Math.abs(item.transform[3]) || 12;

      // Find an existing bucket with close Y
      let bucket = lineBuckets.find((b) => Math.abs(b.y - ty) <= Y_EPSILON);
      if (!bucket) {
        bucket = {
          y: ty,
          x: tx,
          height: item.height || fontSize,
          maxFontSize: fontSize,
          text: ''
        };
        lineBuckets.push(bucket);
      } else {
        bucket.maxFontSize = Math.max(bucket.maxFontSize, fontSize);
        bucket.x = Math.min(bucket.x, tx);
      }

      // Append text
      if (bucket.text.length > 0 && !bucket.text.endsWith(' ') && !str.startsWith(' ') && !/^[,.:;!?)]/.test(str)) {
        bucket.text += ' ' + str;
      } else {
        bucket.text += str;
      }
    }

    // 2. Sort lines top-to-bottom (descending Y in PDF coordinates)
    lineBuckets.sort((a, b) => b.y - a.y);

    // 3. Clean up lines and strip running header / footer lines
    const cleanedLines: RawLine[] = [];
    for (const line of lineBuckets) {
      const trimmed = line.text.trim();
      if (!trimmed) continue;

      // Check if it's likely a running header (top 5% of page) or footer (bottom 5% of page)
      const distanceFromTop = pageHeight - line.y;
      const isTopMargin = distanceFromTop < pageHeight * 0.055;
      const isBottomMargin = line.y < pageHeight * 0.055;

      // Header/footer heuristics: isolated numbers or short titles like "Página X"
      if (isTopMargin || isBottomMargin) {
        if (/^(?:p[aá]g(?:ina)?\.?\s*)?\d+(?:\s*(?:de|\/)\s*\d+)?$/i.test(trimmed)) {
          // Page number, skip from flow
          continue;
        }
        if (/^[—–-]\s*\d+\s*[—–-]$/.test(trimmed)) {
          continue;
        }
        if (trimmed.length < 30 && (isTopMargin || isBottomMargin)) {
          // Running book title or header, ignore in reflow
          continue;
        }
      }

      cleanedLines.push({
        ...line,
        text: trimmed
      });
    }

    if (cleanedLines.length === 0) {
      const emptyResult: PageReflowData = {
        pageNumber: page.pageNumber,
        blocks: [],
        hasText: false,
        rawText: ''
      };
      reflowCache.set(cacheKey, emptyResult);
      return emptyResult;
    }

    // 4. Calculate typical body font size (median)
    const fontSizes = cleanedLines.map((l) => l.maxFontSize).sort((a, b) => a - b);
    const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 12;

    // 5. Calculate typical line gap (median)
    const lineGaps: number[] = [];
    for (let i = 0; i < cleanedLines.length - 1; i++) {
      const gap = cleanedLines[i].y - cleanedLines[i + 1].y;
      if (gap > 0 && gap < medianFontSize * 3.5) {
        lineGaps.push(gap);
      }
    }
    lineGaps.sort((a, b) => a - b);
    const medianGap = lineGaps.length > 0 ? lineGaps[Math.floor(lineGaps.length / 2)] : medianFontSize * 1.3;

    // 6. Build reflow blocks
    const blocks: ReflowBlock[] = [];
    let currentParagraph = '';

    const flushParagraph = () => {
      if (currentParagraph.trim().length > 0) {
        blocks.push({
          type: 'paragraph',
          text: currentParagraph.trim()
        });
        currentParagraph = '';
      }
    };

    for (let i = 0; i < cleanedLines.length; i++) {
      const line = cleanedLines[i];
      const prevLine = i > 0 ? cleanedLines[i - 1] : null;

      // Heading detection:
      // - Noticeably larger font (>= 1.25x median) OR
      // - Regex matches common chapter/section patterns
      const isLargeFont = line.maxFontSize >= medianFontSize * 1.22;
      const isChapterHeading = /^(?:cap[ií]tulo|parte|livro|se[cç][aã]o|noite|encontro|pr[oó]logo|ep[ií]logo)\b/i.test(line.text);
      const isHeading = (isLargeFont || isChapterHeading) && line.text.length < 80;

      if (isHeading) {
        flushParagraph();
        blocks.push({
          type: 'heading',
          level: line.maxFontSize >= medianFontSize * 1.4 ? 1 : 2,
          text: line.text
        });
        continue;
      }

      // Check if we should break paragraph:
      // Gap significantly larger than normal gap
      let shouldBreakParagraph = false;
      if (prevLine) {
        const gap = prevLine.y - line.y;
        if (gap > medianGap * 1.6) {
          shouldBreakParagraph = true;
        }
      }

      if (shouldBreakParagraph) {
        flushParagraph();
      }

      // Handle hyphenation at line end: "exem-" + "plo" -> "exemplo"
      if (currentParagraph.endsWith('-') || currentParagraph.endsWith('—')) {
        currentParagraph = currentParagraph.slice(0, -1) + line.text;
      } else if (currentParagraph.length === 0) {
        currentParagraph = line.text;
      } else {
        currentParagraph += ' ' + line.text;
      }
    }

    flushParagraph();

    const rawText = blocks.map((b) => b.text).join('\n\n');
    const result: PageReflowData = {
      pageNumber: page.pageNumber,
      blocks,
      hasText: rawText.trim().length > 0,
      rawText
    };

    reflowCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`Erro ao extrair reflow da página ${page.pageNumber}:`, error);
    return {
      pageNumber: page.pageNumber,
      blocks: [],
      hasText: false,
      rawText: ''
    };
  }
}

/**
 * Clears the memory cache for parsed reflow pages.
 */
export function clearReflowCache(): void {
  reflowCache.clear();
}
