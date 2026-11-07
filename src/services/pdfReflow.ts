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

interface SpanItem {
  x: number;
  endX: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  str: string;
}

interface RawLine {
  y: number;
  x: number;
  endX: number;
  height: number;
  maxFontSize: number;
  text: string;
  spans: SpanItem[];
}

// Memory cache for parsed reflow pages: Map<`${docFingerprint}_${pageNum}`, PageReflowData>
const reflowCache = new Map<string, PageReflowData>();

/**
 * Junta fragmentos horizontais de uma mesma linha respeitando o espaçamento real (kerning vs espaço entre palavras).
 * Evita que palavras fatiadas pelo PDF (ex: "C" + "ap" + "ítulo") fiquem separadas ("C ap ítulo").
 */
function joinLineSpans(spans: SpanItem[]): string {
  if (spans.length === 0) return '';
  const sorted = [...spans].sort((a, b) => a.x - b.x);

  let result = '';
  let prev: SpanItem | null = null;

  for (const span of sorted) {
    const str = span.str;
    if (!str) continue;

    if (!prev) {
      result = str;
      prev = span;
      continue;
    }

    const gap = span.x - prev.endX;
    const avgFont = (prev.fontSize + span.fontSize) / 2 || 12;

    const alreadyHasSpace = result.endsWith(' ') || str.startsWith(' ');
    const isPunctuation = /^[,.:;!?)\]}»”’]/.test(str);
    const afterOpenBracket = /[(\[{«“‘]$/.test(result);

    // Só insere espaço se houver distância horizontal real de espaço entre palavras (> 15% do tamanho da fonte)
    if (!alreadyHasSpace && !isPunctuation && !afterOpenBracket && gap > avgFont * 0.15) {
      result += ' ' + str;
    } else {
      result += str;
    }

    prev = {
      ...span,
      endX: Math.max(prev.endX, span.endX)
    };
  }

  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Extracts and formats structured, readable reflow text from a PDF page proxy.
 */
export async function extractPageReflow(
  page: PDFPageProxy,
  docKey: string = 'default'
): Promise<PageReflowData> {
  const cacheKey = `${docKey}_v2_${page.pageNumber}`;
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
    const Y_EPSILON = 3.2;

    for (const item of items) {
      if (!item.str || typeof item.str !== 'string') continue;
      const str = item.str;
      if (!str.trim() && str.length === 0) continue;

      const tx = Number(item.transform?.[4]) || 0;
      const ty = Number(item.transform?.[5]) || 0;
      const fontSize = Math.abs(item.transform?.[0]) || Math.abs(item.transform?.[3]) || 12;
      const width = Number(item.width) > 0 ? Number(item.width) : str.length * fontSize * 0.48;

      const span: SpanItem = {
        x: tx,
        endX: tx + width,
        y: ty,
        width,
        height: item.height || fontSize,
        fontSize,
        str
      };

      let bucket = lineBuckets.find((b) => Math.abs(b.y - ty) <= Y_EPSILON);
      if (!bucket) {
        bucket = {
          y: ty,
          x: tx,
          endX: tx + width,
          height: span.height,
          maxFontSize: fontSize,
          text: '',
          spans: [span]
        };
        lineBuckets.push(bucket);
      } else {
        bucket.maxFontSize = Math.max(bucket.maxFontSize, fontSize);
        bucket.x = Math.min(bucket.x, tx);
        bucket.endX = Math.max(bucket.endX, tx + width);
        bucket.spans.push(span);
      }
    }

    // 2. Sort lines top-to-bottom (descending Y in PDF coordinates)
    lineBuckets.sort((a, b) => b.y - a.y);

    // 3. Join spans per line and strip running header / footer lines
    const cleanedLines: RawLine[] = [];
    for (const line of lineBuckets) {
      const joined = joinLineSpans(line.spans);
      if (!joined) continue;

      const distanceFromTop = pageHeight - line.y;
      const isTopMargin = distanceFromTop < pageHeight * 0.06;
      const isBottomMargin = line.y < pageHeight * 0.06;

      if (isTopMargin || isBottomMargin) {
        if (/^(?:p[aá]g(?:ina)?\.?\s*)?\d+(?:\s*(?:de|\/)\s*\d+)?$/i.test(joined)) {
          continue;
        }
        if (/^[—–-]\s*\d+\s*[—–-]$/.test(joined)) {
          continue;
        }
        if (joined.length < 35 && (isTopMargin || isBottomMargin)) {
          continue;
        }
      }

      cleanedLines.push({
        ...line,
        text: joined
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

    // 4. Calculate typical body font size, left margin, right margin, and line gap
    const fontSizes = cleanedLines.map((l) => l.maxFontSize).sort((a, b) => a - b);
    const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 12;

    const xStarts = cleanedLines.map((l) => l.x).sort((a, b) => a - b);
    // Margem esquerda padrão do corpo do texto (percentil 20 para ignorar recuos de parágrafo)
    const bodyLeftMargin = xStarts[Math.floor(xStarts.length * 0.2)] || xStarts[0] || 0;

    const xEnds = cleanedLines.map((l) => l.endX).sort((a, b) => a - b);
    // Margem direita padrão do corpo do texto (percentil 80)
    const bodyRightMargin = xEnds[Math.floor(xEnds.length * 0.8)] || xEnds[xEnds.length - 1] || 0;

    const lineGaps: number[] = [];
    for (let i = 0; i < cleanedLines.length - 1; i++) {
      const gap = cleanedLines[i].y - cleanedLines[i + 1].y;
      if (gap > 0 && gap < medianFontSize * 3.5) {
        lineGaps.push(gap);
      }
    }
    lineGaps.sort((a, b) => a - b);
    const medianGap = lineGaps.length > 0 ? lineGaps[Math.floor(lineGaps.length / 2)] : medianFontSize * 1.3;

    // 5. Build reflow blocks with accurate paragraph, dialogue, and indentation detection
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

      // Heading detection
      const isLargeFont = line.maxFontSize >= medianFontSize * 1.22;
      const isChapterHeading =
        /^(?:cap[ií]tulo|parte|livro|se[cç][aã]o|pr[oó]logo|ep[ií]logo|pref[aá]cio|introdu[cç][aã]o)\b/i.test(
          line.text
        ) || /^(?:[IVXLCDM]+|\d{1,3})$/.test(line.text.trim());
      const isHeading = (isLargeFont || isChapterHeading) && line.text.length < 90;

      if (isHeading) {
        flushParagraph();
        blocks.push({
          type: 'heading',
          level: line.maxFontSize >= medianFontSize * 1.4 ? 1 : 2,
          text: line.text
        });
        continue;
      }

      // Paragraph break heuristics:
      // 1) Vertical gap noticeably larger than normal line spacing
      // 2) First-line indentation compared to body left margin
      // 3) Previous line ended well before the right margin (and ended with terminal punctuation)
      // 4) Dialogue line starting with travessão (— / – / - )
      // 5) Table of contents / dotted line
      let shouldBreakParagraph = false;
      if (prevLine) {
        const gap = prevLine.y - line.y;
        const isVerticalGap = gap > medianGap * 1.32;
        const isIndented =
          bodyRightMargin - bodyLeftMargin > medianFontSize * 10 &&
          line.x - bodyLeftMargin > medianFontSize * 0.85;
        const prevEndedShort =
          bodyRightMargin - bodyLeftMargin > medianFontSize * 10 &&
          bodyRightMargin - prevLine.endX > medianFontSize * 2.4 &&
          /[.!?…"”»:)—–]$/.test(prevLine.text);
        const isDialogueStart = /^[—–―]\s*\S|^-\s+[A-ZÀ-Ýa-zà-ÿ"“]/.test(line.text);
        const isDotLeader = /\.{4,}|\s+\d{1,4}$/.test(line.text) && line.text.includes('..');

        if (isVerticalGap || isIndented || prevEndedShort || isDialogueStart || isDotLeader) {
          shouldBreakParagraph = true;
        }
      }

      if (shouldBreakParagraph) {
        flushParagraph();
      }

      // Handle syllabic hyphenation at line end without destroying dialogue dashes (—) or enclitic pronouns (-se, -lo)
      if (currentParagraph.length === 0) {
        currentParagraph = line.text;
      } else if (
        /[a-zà-ÿ]-$/.test(currentParagraph) &&
        /^[a-zà-ÿ]/.test(line.text) &&
        !/^(?:se|me|te|lhe|lhes|nos|vos|lo|la|los|las|no|na|nas)\b/i.test(line.text)
      ) {
        currentParagraph = currentParagraph.slice(0, -1) + line.text;
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
