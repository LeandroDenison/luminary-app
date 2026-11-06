import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore
import ePub from 'epubjs';
import type { ReaderTheme, ReadingMode, ReaderFontFamily, ReaderLineHeight, ReaderMarginSize } from '../../types';

interface EpubViewerProps {
  data: ArrayBuffer;
  currentCfi?: string;
  readingMode: ReadingMode;
  theme: ReaderTheme;
  fontSize: number;
  fontFamily?: ReaderFontFamily;
  lineHeight?: ReaderLineHeight;
  marginSize?: ReaderMarginSize;
  onLocationChange: (cfi: string, progress: number) => void;
  onToggleControls: () => void;
  onLoaded?: (toc: any[]) => void;
  registerNavigation?: (nav: { next: () => void; prev: () => void; goTo: (target: string | number) => void }) => void;
}

export function getFontFamilyCSS(f?: ReaderFontFamily): string {
  switch (f) {
    case 'merriweather': return '"Merriweather", Georgia, serif';
    case 'lora': return '"Lora", Georgia, serif';
    case 'atkinson': return '"Atkinson Hyperlegible", sans-serif';
    case 'inter': return '"Inter", system-ui, sans-serif';
    case 'system': return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    case 'literata':
    default:
      return '"Literata", Georgia, serif';
  }
}

export function getMarginPadding(m?: ReaderMarginSize): string {
  switch (m) {
    case 'small': return '14px';
    case 'large': return '34px';
    case 'medium':
    default:
      return '22px';
  }
}

// Recursively unpack nested EPUB chapters
function flattenEpubToc(items: any[]): any[] {
  let list: any[] = [];
  if (!items || !Array.isArray(items)) return list;

  for (const item of items) {
    const rawLabel = item.label || item.title || '';
    const cleanLabel = rawLabel.replace(/\s+/g, ' ').trim();
    // Exclude title page fragments commonly emitted as parent TOC wrappers
    const isNoise = /^(DE|POR|MACHADO DE ASSIS|JOSÉ DE ALENCAR|ALUÍSIO AZEVEDO|MEMORIAS POSTHUMAS|BRAZ CUBAS)$/i.test(cleanLabel);

    if (cleanLabel && !isNoise && item.href) {
      list.push({
        id: item.id || `toc-${Math.random().toString(36).substring(2, 9)}`,
        label: cleanLabel,
        href: item.href
      });
    }

    if (item.subitems && item.subitems.length > 0) {
      list = list.concat(flattenEpubToc(item.subitems));
    }
  }
  return list;
}

export const EpubViewer: React.FC<EpubViewerProps> = ({
  data,
  currentCfi,
  readingMode,
  theme,
  fontSize,
  fontFamily = 'literata',
  lineHeight = 1.6,
  marginSize = 'medium',
  onLocationChange,
  onToggleControls,
  onLoaded,
  registerNavigation
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<any>(null);
  const bookRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize EPUB
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    const initBook = async () => {
      try {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = '';

        const book = ePub(data);
        bookRef.current = book;
        await book.ready;

        if (isCancelled || !containerRef.current) return;

        // Extract TOC with recursive flattening
        try {
          const navigation = await book.loaded.navigation;
          if (navigation?.toc) {
            const flattened = flattenEpubToc(navigation.toc);
            if (onLoaded && flattened.length > 0) {
              onLoaded(flattened);
            }
          }
        } catch (tocErr) {
          console.warn('Erro ao carregar sumário:', tocErr);
        }

        // Render book with proper flow
        const isScroll = readingMode === 'scroll';
        const rendition = book.renderTo(containerRef.current, {
          width: '100%',
          height: '100%',
          flow: isScroll ? 'scrolled' : 'paginated',
          manager: isScroll ? 'continuous' : 'default',
          spread: 'none'
        });
        renditionRef.current = rendition;

        // Register navigation controls for parent container
        if (registerNavigation) {
          registerNavigation({
            next: () => rendition.next(),
            prev: () => rendition.prev(),
            goTo: (target: string | number) => {
              if (typeof target === 'string') {
                rendition.display(target);
              }
            }
          });
        }

        // Apply theme and styles
        applyThemes(rendition);
        setThemeAndFont(rendition, theme, fontSize, fontFamily, lineHeight, marginSize);

        // Register DOM event listeners INSIDE the iframe content
        rendition.hooks.content.register((contents: any) => {
          const doc = contents.document;
          if (!doc) return;

          // Injetar Google Fonts se ainda não existir
          if (!doc.getElementById('luminary-fonts')) {
            const fontLink = doc.createElement('link');
            fontLink.id = 'luminary-fonts';
            fontLink.rel = 'stylesheet';
            fontLink.href = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@400;500;600;700&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&family=Lora:ital,wght@0,400;0,600;1,400&family=Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400&display=swap';
            doc.head.appendChild(fontLink);
          }

          let style = doc.getElementById('luminary-reader-styles');
          if (!style) {
            style = doc.createElement('style');
            style.id = 'luminary-reader-styles';
            doc.head.appendChild(style);
          }
          style.innerHTML = `
            * {
              -webkit-tap-highlight-color: transparent;
            }
            body {
              font-family: ${getFontFamilyCSS(fontFamily)} !important;
              line-height: ${lineHeight} !important;
              margin: 0 !important;
              padding: max(env(safe-area-inset-top, 0px), 36px) ${getMarginPadding(marginSize)} 48px ${getMarginPadding(marginSize)} !important;
              max-width: 100% !important;
              box-sizing: border-box !important;
              word-break: break-word;
              overflow-wrap: break-word;
            }
            p, span, div, li {
              font-family: inherit !important;
              line-height: inherit !important;
            }
            img {
              max-width: 100% !important;
              height: auto !important;
            }
          `;

          // Click handler inside iframe
          doc.addEventListener('click', (e: MouseEvent) => {
            const width = doc.documentElement.clientWidth || window.innerWidth;
            const x = e.clientX;

            if (readingMode === 'paginated') {
              if (x < width * 0.25) {
                rendition.prev();
                return;
              }
              if (x > width * 0.75) {
                rendition.next();
                return;
              }
            }
            onToggleControls();
          });

          // Touch swipe inside iframe
          let touchStartX = 0;
          let touchStartY = 0;
          doc.addEventListener('touchstart', (e: TouchEvent) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
          }, { passive: true });

          doc.addEventListener('touchend', (e: TouchEvent) => {
            if (readingMode !== 'paginated') return;
            const diffX = e.changedTouches[0].clientX - touchStartX;
            const diffY = e.changedTouches[0].clientY - touchStartY;

            if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
              if (diffX > 0) {
                rendition.prev();
              } else {
                rendition.next();
              }
            }
          }, { passive: true });
        });

        // Display at saved location or start
        if (currentCfi) {
          await rendition.display(currentCfi);
        } else {
          await rendition.display();
        }

        // Generate locations in background for percentage calculation
        book.locations.generate(800).then(() => {
          if (!isCancelled) {
            updateCurrentProgress(rendition);
          }
        }).catch((locErr: any) => {
          console.warn('Erro ao gerar localizações:', locErr);
        });

        // Relocated listener
        rendition.on('relocated', (location: any) => {
          if (location && location.start) {
            const cfi = location.start.cfi;
            let percent = 0;
            if (book.locations && book.locations.length()) {
              percent = Math.round(book.locations.percentageFromCfi(cfi) * 100);
            }
            onLocationChange(cfi, Math.min(100, Math.max(0, percent)));
          }
        });

        setLoading(false);
      } catch (err: any) {
        console.error('Erro ao carregar EPUB:', err);
        setError('Não foi possível exibir este arquivo EPUB.');
        setLoading(false);
      }
    };

    initBook();

    return () => {
      isCancelled = true;
      if (renditionRef.current) {
        try {
          renditionRef.current.destroy();
        } catch (_) {}
      }
      if (bookRef.current) {
        try {
          bookRef.current.destroy();
        } catch (_) {}
      }
    };
  }, [data, readingMode]);

  // Apply themes
  const applyThemes = (rendition: any) => {
    rendition.themes.register('light', {
      body: {
        background: '#ffffff !important',
        color: '#1a202c !important',
        'line-height': '1.6 !important'
      }
    });
    rendition.themes.register('sepia', {
      body: {
        background: '#fbf0d9 !important',
        color: '#433422 !important',
        'line-height': '1.6 !important'
      }
    });
    rendition.themes.register('dark', {
      body: {
        background: '#181920 !important',
        color: '#cbd5e1 !important',
        'line-height': '1.6 !important'
      }
    });
    rendition.themes.register('amoled', {
      body: {
        background: '#000000 !important',
        color: '#e2e8f0 !important',
        'line-height': '1.6 !important'
      }
    });
  };

  const setThemeAndFont = (
    rendition: any,
    currentTheme: ReaderTheme,
    currentSize: number,
    currentFont: ReaderFontFamily,
    currentLineHeight: ReaderLineHeight,
    currentMargin: ReaderMarginSize
  ) => {
    if (!rendition) return;
    try {
      rendition.themes.select(currentTheme);
      rendition.themes.fontSize(`${currentSize}px`);
      rendition.themes.font(getFontFamilyCSS(currentFont));

      // Atualiza estilo dinamicamente no conteúdo de todos os capítulos carregados
      const contents = rendition.getContents?.() || [];
      contents.forEach((c: any) => {
        const doc = c.document;
        if (!doc) return;
        const style = doc.getElementById('luminary-reader-styles');
        if (style) {
          style.innerHTML = `
            * {
              -webkit-tap-highlight-color: transparent;
            }
            body {
              font-family: ${getFontFamilyCSS(currentFont)} !important;
              line-height: ${currentLineHeight} !important;
              margin: 0 !important;
              padding: max(env(safe-area-inset-top, 0px), 36px) ${getMarginPadding(currentMargin)} 48px ${getMarginPadding(currentMargin)} !important;
              max-width: 100% !important;
              box-sizing: border-box !important;
              word-break: break-word;
              overflow-wrap: break-word;
            }
            p, span, div, li {
              font-family: inherit !important;
              line-height: inherit !important;
            }
            img {
              max-width: 100% !important;
              height: auto !important;
            }
          `;
        }
      });
    } catch (err) {
      console.warn('Erro ao aplicar tema/fonte:', err);
    }
  };

  useEffect(() => {
    if (renditionRef.current) {
      setThemeAndFont(renditionRef.current, theme, fontSize, fontFamily, lineHeight, marginSize);
    }
  }, [theme, fontSize, fontFamily, lineHeight, marginSize]);

  const updateCurrentProgress = (rendition: any) => {
    try {
      const loc = rendition.currentLocation();
      if (loc && loc.start && bookRef.current?.locations) {
        const percent = Math.round(bookRef.current.locations.percentageFromCfi(loc.start.cfi) * 100);
        onLocationChange(loc.start.cfi, Math.min(100, Math.max(0, percent)));
      }
    } catch (_) {}
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/70 backdrop-blur-xs gap-3 text-slate-300">
          <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs">Abrindo páginas do livro...</p>
        </div>
      )}

      {error && (
        <div className="p-6 text-center text-rose-400 text-sm">
          {error}
        </div>
      )}

      {/* EPUB Container */}
      <div
        ref={containerRef}
        className={`w-full h-full ${readingMode === 'scroll' ? 'overflow-y-auto' : 'overflow-hidden'}`}
      />
    </div>
  );
};
