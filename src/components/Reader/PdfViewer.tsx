import React, { useEffect, useRef, useState, useCallback } from 'react';
import { pdfjsLib } from '../../services/pdfHelper';
import { detectPdfChapters } from '../../services/chapterDetector';
import { extractPageReflow, type PageReflowData } from '../../services/pdfReflow';
import { getFontFamilyCSS, getMarginPadding } from './EpubViewer';
import { Sparkles, Image as ImageIcon } from 'lucide-react';
import type { ReaderTheme, ReadingMode, PdfDisplayMode, ReaderFontFamily, ReaderLineHeight, ReaderMarginSize } from '../../types';

interface PdfViewerProps {
  data: ArrayBuffer;
  currentPage: number;
  totalPages?: number;
  readingMode: ReadingMode;
  pdfDisplayMode?: PdfDisplayMode;
  theme: ReaderTheme;
  fontSize?: number;
  fontFamily?: ReaderFontFamily;
  lineHeight?: ReaderLineHeight;
  marginSize?: ReaderMarginSize;
  onPageChange: (newPage: number, totalPages: number) => void;
  onToggleControls: () => void;
  registerNavigation?: (nav: { next: () => void; prev: () => void; goTo: (target: string | number) => void }) => void;
  onLoaded?: (toc: any[]) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  data,
  currentPage,
  readingMode,
  pdfDisplayMode = 'original',
  theme,
  fontSize = 17,
  fontFamily = 'literata',
  lineHeight = 1.6,
  marginSize = 'medium',
  onPageChange,
  onToggleControls,
  registerNavigation,
  onLoaded
}) => {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const scale = 1.3;
  const containerRef = useRef<HTMLDivElement>(null);
  const singleCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  // Register navigation
  useEffect(() => {
    if (registerNavigation) {
      registerNavigation({
        next: () => {
          if (currentPage < numPages) onPageChange(currentPage + 1, numPages);
        },
        prev: () => {
          if (currentPage > 1) onPageChange(currentPage - 1, numPages);
        },
        goTo: (target: string | number) => {
          const page = typeof target === 'number' ? target : parseInt(String(target).replace(/\D/g, ''), 10);
          if (!isNaN(page) && page >= 1 && page <= numPages) {
            onPageChange(page, numPages);
          }
        }
      });
    }
  }, [currentPage, numPages, onPageChange, registerNavigation]);

  // Load document
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);

    const loadDoc = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ data: data.slice(0) });
        const doc = await loadingTask.promise;
        if (!isCancelled) {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setLoading(false);
          onPageChange(currentPage || 1, doc.numPages);

          // Detect chapters asynchronously
          if (onLoaded) {
            detectPdfChapters(doc).then((chapters) => {
              if (!isCancelled && chapters.length > 0) {
                const formatted = chapters.map((c) => ({
                  id: c.id,
                  label: c.title,
                  pageNumber: c.pageNumber,
                  href: `page-${c.pageNumber}`
                }));
                onLoaded(formatted);
              }
            });
          }
        }
      } catch (err) {
        console.error('Erro ao carregar PDF:', err);
        setLoading(false);
      }
    };

    loadDoc();
    return () => {
      isCancelled = true;
    };
  }, [data]);

  // Render single page when in original paginated mode
  const renderPaginatedPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc || !singleCanvasRef.current || pdfDisplayMode === 'reflow') return;

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    try {
      const page = await pdfDoc.getPage(pageNum);
      const canvas = singleCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const containerWidth = containerRef.current ? Math.max(280, containerRef.current.clientWidth - 20) : 360;
      const unscaledViewport = page.getViewport({ scale: 1 });
      const computedScale = Math.min(2.5, Math.max(0.6, containerWidth / unscaledViewport.width));
      const viewport = page.getViewport({ scale: computedScale });

      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      ctx.save();
      ctx.scale(outputScale, outputScale);

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
        canvas: canvas
      };

      const task = page.render(renderContext as any);
      renderTaskRef.current = task;
      await task.promise;
      ctx.restore();
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Erro ao renderizar página:', err);
      }
    }
  }, [pdfDoc, pdfDisplayMode]);

  useEffect(() => {
    if (readingMode === 'paginated' && pdfDoc && pdfDisplayMode === 'original') {
      renderPaginatedPage(currentPage);
    }
  }, [readingMode, pdfDoc, currentPage, pdfDisplayMode, renderPaginatedPage]);

  // Touch Swipe for paginated mode
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (readingMode !== 'paginated') return;
    const diffX = e.changedTouches[0].clientX - touchStartXRef.current;
    const diffY = e.changedTouches[0].clientY - touchStartYRef.current;

    if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX > 0) {
        if (currentPage > 1) onPageChange(currentPage - 1, numPages);
      } else {
        if (currentPage < numPages) onPageChange(currentPage + 1, numPages);
      }
    }
  };

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If text was selected by the user, don't trigger click action
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      return;
    }

    if (readingMode === 'scroll') {
      onToggleControls();
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;

    // Left 22% = Previous
    if (clickX < width * 0.22) {
      if (currentPage > 1) onPageChange(currentPage - 1, numPages);
    } 
    // Right 22% = Next
    else if (clickX > width * 0.78) {
      if (currentPage < numPages) onPageChange(currentPage + 1, numPages);
    } 
    // Middle = Toggle Reader Menu
    else {
      onToggleControls();
    }
  };

  const getThemeFilter = () => {
    switch (theme) {
      case 'sepia':
        return 'sepia(0.35) contrast(0.95) brightness(0.96)';
      case 'dark':
        return 'invert(0.88) hue-rotate(180deg) contrast(0.9)';
      case 'amoled':
        return 'invert(0.95) hue-rotate(180deg) contrast(1.1)';
      default:
        return 'none';
    }
  };

  const isReflow = pdfDisplayMode === 'reflow';

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`relative w-full h-full flex flex-col items-center justify-start overflow-y-auto overflow-x-hidden transition-colors ${
        isReflow ? 'select-text' : 'select-none'
      }`}
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
          <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs">Carregando livro...</p>
        </div>
      ) : isReflow ? (
        /* ===== MODO REFLOW (TEXTO ADAPTÁVEL) ===== */
        readingMode === 'paginated' ? (
          <div
            className="flex-1 w-full max-w-2xl flex flex-col px-3 pb-12 relative animate-in fade-in duration-150"
            style={{
              paddingTop: 'max(env(safe-area-inset-top, 0px), 36px)',
              paddingLeft: getMarginPadding(marginSize),
              paddingRight: getMarginPadding(marginSize)
            }}
          >
            <PdfReflowPageItem
              pageNum={currentPage}
              pdfDoc={pdfDoc}
              filter={getThemeFilter()}
              fontSize={fontSize}
              fontFamily={fontFamily}
              lineHeight={lineHeight}
            />
          </div>
        ) : (
          <InfinitePdfReflowScroll
            pdfDoc={pdfDoc}
            numPages={numPages}
            filter={getThemeFilter()}
            fontSize={fontSize}
            fontFamily={fontFamily}
            lineHeight={lineHeight}
            marginSize={marginSize}
            initialPage={currentPage}
            onPageVisible={(page) => onPageChange(page, numPages)}
          />
        )
      ) : (
        /* ===== MODO ORIGINAL (CANVAS FIEL) ===== */
        readingMode === 'paginated' ? (
          <div
            className="flex-1 w-full flex items-center justify-center px-2 pb-6 relative"
            style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 36px)' }}
          >
            <canvas
              ref={singleCanvasRef}
              className="rounded-lg shadow-xl transition-all duration-200 max-w-full"
              style={{ filter: getThemeFilter() }}
            />
          </div>
        ) : (
          <InfinitePdfScroll
            pdfDoc={pdfDoc}
            numPages={numPages}
            scale={scale}
            filter={getThemeFilter()}
            initialPage={currentPage}
            onPageVisible={(page) => onPageChange(page, numPages)}
          />
        )
      )}
    </div>
  );
};

/* ========================================================================= */
/* COMPONENTE: PÁGINA REFLOW INDIVIDUAL (COM SUPORTE A FALLBACK VISUAL)       */
/* ========================================================================= */
interface PdfReflowPageItemProps {
  pageNum: number;
  pdfDoc: any;
  filter: string;
  fontSize: number;
  fontFamily: ReaderFontFamily;
  lineHeight: ReaderLineHeight;
  onVisible?: () => void;
}

const PdfReflowPageItem: React.FC<PdfReflowPageItemProps> = ({
  pageNum,
  pdfDoc,
  filter,
  fontSize,
  fontFamily,
  lineHeight,
  onVisible
}) => {
  const [reflowData, setReflowData] = useState<PageReflowData | null>(null);
  const [loadingText, setLoadingText] = useState(true);
  const [showOriginalCanvas, setShowOriginalCanvas] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isCancelled = false;
    if (!pdfDoc) return;

    setLoadingText(true);
    const extractText = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const docFingerprint = pdfDoc.fingerprints?.[0] || 'doc';
        const extracted = await extractPageReflow(page, docFingerprint);
        if (!isCancelled) {
          setReflowData(extracted);
          setLoadingText(false);
        }
      } catch (err) {
        console.error(`Erro ao extrair reflow da página ${pageNum}:`, err);
        if (!isCancelled) setLoadingText(false);
      }
    };

    extractText();
    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, pageNum]);

  // Observer for scroll mode
  useEffect(() => {
    if (!onVisible || !itemRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            onVisible();
          }
        });
      },
      { rootMargin: '100px' }
    );
    observer.observe(itemRef.current);
    return () => observer.disconnect();
  }, [onVisible]);

  // Render canvas when page has no text or user forces visual mode for this page
  const renderFallbackCanvas = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    try {
      const page = await pdfDoc.getPage(pageNum);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const viewport = page.getViewport({ scale: 1.2 });
      const outputScale = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      ctx.save();
      ctx.scale(outputScale, outputScale);

      await page.render({
        canvasContext: ctx,
        viewport: viewport,
        canvas: canvas
      } as any).promise;

      ctx.restore();
    } catch (err) {
      console.warn('Erro ao renderizar canvas fallback:', err);
    }
  }, [pdfDoc, pageNum]);

  useEffect(() => {
    if ((reflowData && !reflowData.hasText) || showOriginalCanvas) {
      renderFallbackCanvas();
    }
  }, [reflowData, showOriginalCanvas, renderFallbackCanvas]);

  const fontCss = getFontFamilyCSS(fontFamily);

  return (
    <div
      ref={itemRef}
      id={`pdf-reflow-page-${pageNum}`}
      className="w-full flex flex-col justify-start transition-opacity duration-200"
    >
      {/* Indicador de página discreto no topo */}
      <div className="flex items-center justify-between text-[11px] opacity-60 mb-4 pb-1 border-b border-current/10">
        <span className="font-mono">Página {pageNum}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowOriginalCanvas((prev) => !prev);
          }}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-current/10 transition-colors text-[10px]"
          title={showOriginalCanvas ? 'Ver como texto reformatado' : 'Ver página visual original'}
        >
          {showOriginalCanvas ? (
            <>
              <Sparkles size={11} className="text-amber-500" />
              <span>Ver Texto Adaptável</span>
            </>
          ) : (
            <>
              <ImageIcon size={11} />
              <span>Ver Imagem Original</span>
            </>
          )}
        </button>
      </div>

      {loadingText ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 opacity-50">
          <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">Adaptando texto para tela pequena...</span>
        </div>
      ) : showOriginalCanvas || (reflowData && !reflowData.hasText) ? (
        /* Renderização visual fallback quando a página é imagem/esquema ou o usuário pediu */
        <div className="flex flex-col items-center justify-center gap-2 py-2">
          {reflowData && !reflowData.hasText && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[11px] mb-2">
              <ImageIcon size={13} />
              <span>Página visual sem texto selecionável (renderizada em alta resolução)</span>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="rounded-lg shadow-lg max-w-full transition-all"
            style={{ filter }}
          />
        </div>
      ) : (
        /* Conteúdo Reflow Estruturado */
        <div
          className="w-full flex flex-col gap-4 text-justify"
          style={{
            fontFamily: fontCss,
            fontSize: `${fontSize}px`,
            lineHeight: lineHeight
          }}
        >
          {reflowData?.blocks.map((block, idx) => {
            if (block.type === 'heading') {
              return (
                <h3
                  key={idx}
                  className="font-bold tracking-tight text-left mt-3 mb-1"
                  style={{
                    fontSize: `${Math.round(fontSize * (block.level === 1 ? 1.35 : 1.18))}px`,
                    lineHeight: 1.3
                  }}
                >
                  {block.text}
                </h3>
              );
            }
            return (
              <p
                key={idx}
                className="transition-colors leading-relaxed tracking-normal"
                style={{
                  textIndent: '1.25em',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word'
                }}
              >
                {block.text}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ========================================================================= */
/* COMPONENTE: SCROLL INFINITO PARA O MODO REFLOW                            */
/* ========================================================================= */
interface InfinitePdfReflowScrollProps {
  pdfDoc: any;
  numPages: number;
  filter: string;
  fontSize: number;
  fontFamily: ReaderFontFamily;
  lineHeight: ReaderLineHeight;
  marginSize: ReaderMarginSize;
  initialPage: number;
  onPageVisible: (page: number) => void;
}

const InfinitePdfReflowScroll: React.FC<InfinitePdfReflowScrollProps> = ({
  pdfDoc,
  numPages,
  filter,
  fontSize,
  fontFamily,
  lineHeight,
  marginSize,
  initialPage,
  onPageVisible
}) => {
  useEffect(() => {
    if (initialPage > 1) {
      const el = document.getElementById(`pdf-reflow-page-${initialPage}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [initialPage]);

  return (
    <div
      className="w-full max-w-2xl flex flex-col items-center gap-8 pb-16"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 36px)',
        paddingLeft: getMarginPadding(marginSize),
        paddingRight: getMarginPadding(marginSize)
      }}
    >
      {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
        <PdfReflowPageItem
          key={pageNum}
          pageNum={pageNum}
          pdfDoc={pdfDoc}
          filter={filter}
          fontSize={fontSize}
          fontFamily={fontFamily}
          lineHeight={lineHeight}
          onVisible={() => onPageVisible(pageNum)}
        />
      ))}
    </div>
  );
};

/* ========================================================================= */
/* COMPONENTE: SCROLL INFINITO ORIGINAL (CANVAS)                             */
/* ========================================================================= */
interface InfiniteScrollProps {
  pdfDoc: any;
  numPages: number;
  scale: number;
  filter: string;
  initialPage: number;
  onPageVisible: (page: number) => void;
}

const InfinitePdfScroll: React.FC<InfiniteScrollProps> = ({
  pdfDoc,
  numPages,
  scale,
  filter,
  initialPage,
  onPageVisible
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialPage > 1) {
      const el = document.getElementById(`pdf-page-${initialPage}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [initialPage]);

  return (
    <div
      ref={containerRef}
      className="w-full flex flex-col items-center gap-4 px-2 pb-8"
      style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 36px)' }}
    >
      {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
        <PdfPageItem
          key={pageNum}
          pageNum={pageNum}
          pdfDoc={pdfDoc}
          scale={scale}
          filter={filter}
          onVisible={() => onPageVisible(pageNum)}
        />
      ))}
    </div>
  );
};

const PdfPageItem: React.FC<{
  pageNum: number;
  pdfDoc: any;
  scale: number;
  filter: string;
  onVisible: () => void;
}> = ({ pageNum, pdfDoc, scale, filter, onVisible }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const itemRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            onVisible();
            if (!rendered && pdfDoc && canvasRef.current) {
              renderPage();
            }
          }
        });
      },
      { rootMargin: '300px' }
    );

    if (itemRef.current) {
      observer.observe(itemRef.current);
    }
    return () => observer.disconnect();
  }, [pdfDoc, rendered]);

  const renderPage = async () => {
    if (!pdfDoc || !canvasRef.current) return;
    try {
      const page = await pdfDoc.getPage(pageNum);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const viewport = page.getViewport({ scale: scale });
      const outputScale = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      ctx.save();
      ctx.scale(outputScale, outputScale);

      await page.render({
        canvasContext: ctx,
        viewport: viewport,
        canvas: canvas
      } as any).promise;

      ctx.restore();
      setRendered(true);
    } catch (err) {
      console.warn('Erro ao renderizar página no scroll:', err);
    }
  };

  return (
    <div
      id={`pdf-page-${pageNum}`}
      ref={itemRef}
      className="flex flex-col items-center min-h-[300px] justify-center w-full"
    >
      <canvas
        ref={canvasRef}
        className="rounded shadow-md max-w-full transition-all"
        style={{ filter }}
      />
      <span className="text-[11px] text-slate-500 mt-1 opacity-70">Página {pageNum}</span>
    </div>
  );
};
