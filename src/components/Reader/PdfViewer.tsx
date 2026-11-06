import React, { useEffect, useRef, useState, useCallback } from 'react';
import { pdfjsLib } from '../../services/pdfHelper';
import { detectPdfChapters } from '../../services/chapterDetector';
import type { ReaderTheme, ReadingMode } from '../../types';

interface PdfViewerProps {
  data: ArrayBuffer;
  currentPage: number;
  totalPages?: number;
  readingMode: ReadingMode;
  theme: ReaderTheme;
  onPageChange: (newPage: number, totalPages: number) => void;
  onToggleControls: () => void;
  registerNavigation?: (nav: { next: () => void; prev: () => void; goTo: (target: string | number) => void }) => void;
  onLoaded?: (toc: any[]) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  data,
  currentPage,
  readingMode,
  theme,
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
                // Format for TOC modal
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

  // Render single page when in paginated mode
  const renderPaginatedPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc || !singleCanvasRef.current) return;

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
      const computedScale = Math.min(2.5, Math.max(0.6, (containerWidth / unscaledViewport.width)));
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
  }, [pdfDoc]);

  useEffect(() => {
    if (readingMode === 'paginated' && pdfDoc) {
      renderPaginatedPage(currentPage);
    }
  }, [readingMode, pdfDoc, currentPage, renderPaginatedPage]);

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
    if (readingMode === 'scroll') {
      onToggleControls();
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;

    // Left 25% = Previous
    if (clickX < width * 0.25) {
      if (currentPage > 1) onPageChange(currentPage - 1, numPages);
    } 
    // Right 25% = Next
    else if (clickX > width * 0.75) {
      if (currentPage < numPages) onPageChange(currentPage + 1, numPages);
    } 
    // Middle 50% = Toggle Reader Menu
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

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="relative w-full h-full flex flex-col items-center justify-start overflow-y-auto overflow-x-hidden transition-colors select-none"
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
          <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs">Carregando livro...</p>
        </div>
      ) : readingMode === 'paginated' ? (
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
      )}
    </div>
  );
};

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
