import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Settings, List, Bookmark as BookmarkIcon, Scroll, BookOpen, ChevronLeft, ChevronRight, Quote, Sun, Sparkles, FileText } from 'lucide-react';
import { PdfViewer } from './PdfViewer';
import { EpubViewer } from './EpubViewer';
import { ReaderSettingsModal } from './ReaderSettingsModal';
import { TableOfContentsModal } from './TableOfContentsModal';
import { QuoteCardModal } from './QuoteCardModal';
import { StorageService } from '../../services/storage';
import { DriveSync } from '../../services/driveSync';
import { DriveAuthError } from '../../services/driveApi';
import { ScreenHelper } from '../../services/screenHelper';
import type { Book, ReadingMode, ReaderTheme, Bookmark, ReaderFontFamily, ReaderLineHeight, ReaderMarginSize, PdfDisplayMode } from '../../types';

interface ReaderContainerProps {
  book: Book;
  onBack: () => void;
}

export const ReaderContainer: React.FC<ReaderContainerProps> = ({ book, onBack }) => {
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reader state
  const [readingMode, setReadingMode] = useState<ReadingMode>(book.readingMode || 'paginated');
  const [pdfDisplayMode, setPdfDisplayMode] = useState<PdfDisplayMode>(book.pdfDisplayMode || 'reflow');
  const [theme, setTheme] = useState<ReaderTheme>(book.theme || 'sepia');
  const [fontSize, setFontSize] = useState<number>(book.fontSize || 16);
  const [fontFamily, setFontFamily] = useState<ReaderFontFamily>(book.fontFamily || 'literata');
  const [lineHeight, setLineHeight] = useState<ReaderLineHeight>(book.lineHeight || 1.6);
  const [marginSize, setMarginSize] = useState<ReaderMarginSize>(book.marginSize || 'medium');
  const [currentPage, setCurrentPage] = useState<number>(book.currentPage || 1);
  const [totalPages, setTotalPages] = useState<number>(book.totalPages || 1);
  const [progress, setProgress] = useState<number>(book.progress || 0);
  const [currentCfi, setCurrentCfi] = useState<string | undefined>(book.currentCfi);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(book.bookmarks || []);

  // UI state
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showToc, setShowToc] = useState<boolean>(false);
  const [showQuoteModal, setShowQuoteModal] = useState<boolean>(false);
  const [tocItems, setTocItems] = useState<any[]>([]);

  // Brightness control state
  const [brightness, setBrightness] = useState<number>(() => {
    const saved = localStorage.getItem('luminary_reader_brightness');
    return saved ? Number(saved) : 100;
  });
  const [showBrightnessIndicator, setShowBrightnessIndicator] = useState<boolean>(false);
  const brightnessTimerRef = useRef<any>(null);
  const touchStartY = useRef<number>(0);
  const initialBrightness = useRef<number>(100);

  // Navigation action handlers registered by child viewer
  const navRef = useRef<{ next: () => void; prev: () => void; goTo?: (target: string | number) => void } | null>(null);

  // Status bar handling in reader mode
  useEffect(() => {
    if (showControls) {
      ScreenHelper.showStatusBar();
    } else {
      ScreenHelper.hideStatusBar();
    }
  }, [showControls]);

  useEffect(() => {
    return () => {
      ScreenHelper.showStatusBar();
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showSettings || showToc) return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        navRef.current?.next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        navRef.current?.prev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSettings, showToc]);

  // Load binary data
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        let data = await StorageService.getBookFile(book.id);
        if (!data && book.driveFileId) {
          // Book synced from another device: download it from Google Drive now
          try {
            data = await DriveSync.downloadBookFile(book);
          } catch (driveErr: any) {
            throw new Error(
              driveErr instanceof DriveAuthError
                ? 'Este livro está no Google Drive. Conecte sua conta Google (ícone de nuvem na biblioteca) para baixá-lo.'
                : 'Não foi possível baixar o livro do Google Drive. Verifique sua internet.'
            );
          }
        }
        if (!data) {
          throw new Error('Arquivo do livro não encontrado no armazenamento local.');
        }
        if (active) {
          if (data instanceof Blob) {
            const buf = await data.arrayBuffer();
            setFileData(buf);
          } else {
            setFileData(data);
          }
          setLoading(false);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Erro ao carregar livro');
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [book.id]);

  // Handle PDF page changes
  const handlePdfPageChange = (newPage: number, total: number) => {
    setCurrentPage(newPage);
    setTotalPages(total);
    const newProgress = Math.round((newPage / Math.max(1, total)) * 100);
    setProgress(newProgress);

    StorageService.updateProgress(book.id, {
      currentPage: newPage,
      progress: newProgress,
      totalPages: total,
      readingMode,
      pdfDisplayMode,
      theme,
      fontSize
    });
  };

  // Handle EPUB location change
  const handleEpubLocationChange = (cfi: string, newProgress: number) => {
    setCurrentCfi(cfi);
    setProgress(newProgress);

    StorageService.updateProgress(book.id, {
      currentCfi: cfi,
      progress: newProgress,
      readingMode,
      theme,
      fontSize
    });
  };

  // Change Reading Mode
  const handleModeChange = (mode: ReadingMode) => {
    setReadingMode(mode);
    StorageService.updateProgress(book.id, { readingMode: mode });
  };

  // Change PDF Display Mode (Reflow vs Original)
  const handleTogglePdfDisplayMode = () => {
    const nextMode: PdfDisplayMode = pdfDisplayMode === 'reflow' ? 'original' : 'reflow';
    setPdfDisplayMode(nextMode);
    StorageService.updateProgress(book.id, { pdfDisplayMode: nextMode });
  };

  const handlePdfDisplayModeChange = (mode: PdfDisplayMode) => {
    setPdfDisplayMode(mode);
    StorageService.updateProgress(book.id, { pdfDisplayMode: mode });
  };

  // Change Theme
  const handleThemeChange = (newTheme: ReaderTheme) => {
    setTheme(newTheme);
    StorageService.updateProgress(book.id, { theme: newTheme });
  };

  // Change Font Size
  const handleFontSizeChange = (size: number) => {
    setFontSize(size);
    StorageService.updateProgress(book.id, { fontSize: size });
  };

  // Change Font Family
  const handleFontFamilyChange = (newFont: ReaderFontFamily) => {
    setFontFamily(newFont);
    StorageService.updateProgress(book.id, { fontFamily: newFont });
  };

  // Change Line Height
  const handleLineHeightChange = (newLH: ReaderLineHeight) => {
    setLineHeight(newLH);
    StorageService.updateProgress(book.id, { lineHeight: newLH });
  };

  // Change Margins
  const handleMarginSizeChange = (newMargin: ReaderMarginSize) => {
    setMarginSize(newMargin);
    StorageService.updateProgress(book.id, { marginSize: newMargin });
  };

  // Brightness Control
  const handleBrightnessChange = (val: number) => {
    setBrightness(val);
    localStorage.setItem('luminary_reader_brightness', String(val));
  };

  const handleBrightnessTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    initialBrightness.current = brightness;
    setShowBrightnessIndicator(true);
  };

  const handleBrightnessTouchMove = (e: React.TouchEvent) => {
    const currentY = e.touches[0].clientY;
    const diffY = touchStartY.current - currentY; // Para cima aumenta
    const screenHeight = window.innerHeight || 800;
    const changePercent = Math.round((diffY / (screenHeight * 0.4)) * 100);
    const nextVal = Math.min(100, Math.max(20, initialBrightness.current + changePercent));
    setBrightness(nextVal);
    localStorage.setItem('luminary_reader_brightness', String(nextVal));
    setShowBrightnessIndicator(true);
    if (brightnessTimerRef.current) clearTimeout(brightnessTimerRef.current);
  };

  const handleBrightnessTouchEnd = () => {
    if (brightnessTimerRef.current) clearTimeout(brightnessTimerRef.current);
    brightnessTimerRef.current = setTimeout(() => {
      setShowBrightnessIndicator(false);
    }, 1200);
  };

  // Bookmarks
  const handleAddBookmark = () => {
    const newBm: Bookmark = {
      id: Date.now().toString(),
      pageOrCfi: book.format === 'pdf' ? currentPage : currentCfi || '',
      label: book.format === 'pdf' ? `Página ${currentPage}` : `Marcador (${progress}%)`,
      createdAt: Date.now()
    };
    const updated = [newBm, ...bookmarks];
    setBookmarks(updated);
    StorageService.updateProgress(book.id, { bookmarks: updated });
  };

  const handleDeleteBookmark = (id: string) => {
    const updated = bookmarks.filter((b) => b.id !== id);
    setBookmarks(updated);
    StorageService.updateProgress(book.id, { bookmarks: updated });
  };

  const handleJumpToBookmark = (target: string | number) => {
    if (typeof target === 'number') {
      setCurrentPage(target);
    }
  };

  // Background container color
  const getContainerBg = () => {
    switch (theme) {
      case 'sepia':
        return 'bg-[#f4ebd0] text-[#3d2f1f]';
      case 'dark':
        return 'bg-[#181920] text-slate-200';
      case 'amoled':
        return 'bg-black text-slate-100';
      case 'light':
      default:
        return 'bg-[#fafafa] text-slate-900';
    }
  };

  return (
    <div className={`relative w-full h-full flex flex-col select-none overflow-hidden ${getContainerBg()}`}>
      {/* Top Floating Controls Bar */}
      <div
        className={`absolute top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out ${
          showControls ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div
          className="bg-slate-900/98 backdrop-blur-md border-b border-slate-800 text-slate-100 px-3 pb-2.5 flex items-center justify-between shadow-xl"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px), 32px)'
          }}
        >
          <div className="flex items-center gap-1.5 overflow-hidden mr-2 min-w-0">
            <button
              onClick={onBack}
              className="min-w-[42px] min-h-[42px] flex items-center justify-center p-2 rounded-xl bg-slate-800/80 active:bg-slate-700 text-slate-200 hover:text-white transition-colors touch-manipulation shrink-0"
              title="Voltar à Biblioteca"
              aria-label="Voltar à Biblioteca"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="overflow-hidden min-w-0">
              <h2 className="text-xs font-semibold truncate leading-tight">{book.title}</h2>
              <p className="text-[10px] text-slate-400 truncate">{book.author}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Quick toggle Reflow (Texto Adaptável) vs Original (Layout Fiel) for PDF */}
            {book.format === 'pdf' && (
              <button
                onClick={handleTogglePdfDisplayMode}
                className={`min-h-[42px] px-2.5 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 transition-all touch-manipulation ${
                  pdfDisplayMode === 'reflow'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700'
                }`}
                title={
                  pdfDisplayMode === 'reflow'
                    ? 'Modo Texto Adaptável Ativo (toque para ver Layout Original)'
                    : 'Modo Layout Original Ativo (toque para ver Texto Adaptável)'
                }
              >
                {pdfDisplayMode === 'reflow' ? (
                  <Sparkles size={16} className="text-amber-400" />
                ) : (
                  <FileText size={16} />
                )}
                <span className="text-[10px] font-medium hidden sm:inline">
                  {pdfDisplayMode === 'reflow' ? 'Texto Adaptável' : 'Original'}
                </span>
              </button>
            )}

            {/* Quick toggle mode: Scroll vs Paginated */}
            <button
              onClick={() => handleModeChange(readingMode === 'paginated' ? 'scroll' : 'paginated')}
              className={`min-h-[42px] px-2.5 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 transition-all touch-manipulation ${
                readingMode === 'scroll'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700'
              }`}
              title={readingMode === 'paginated' ? 'Mudar para Scroll Infinito' : 'Mudar para Arrastar Página'}
            >
              {readingMode === 'paginated' ? <BookOpen size={16} /> : <Scroll size={16} />}
              <span className="text-[10px] hidden sm:inline">
                {readingMode === 'paginated' ? 'Páginas' : 'Scroll'}
              </span>
            </button>

            {/* TOC for both PDF and EPUB */}
            <button
              onClick={() => setShowToc(true)}
              className="min-w-[42px] min-h-[42px] flex items-center justify-center p-2 rounded-xl bg-slate-800/80 active:bg-slate-700 text-slate-300 hover:text-white transition-colors touch-manipulation"
              title="Capítulos / Índice"
            >
              <List size={18} />
            </button>

            {/* Quick Bookmark */}
            <button
              onClick={handleAddBookmark}
              className="min-w-[42px] min-h-[42px] flex items-center justify-center p-2 rounded-xl bg-slate-800/80 active:bg-slate-700 text-slate-300 hover:text-amber-400 transition-colors touch-manipulation"
              title="Adicionar Marcador"
            >
              <BookmarkIcon size={18} />
            </button>

            {/* Criar Card de Citação */}
            <button
              onClick={() => setShowQuoteModal(true)}
              className="min-w-[42px] min-h-[42px] flex items-center justify-center p-2 rounded-xl bg-slate-800/80 active:bg-slate-700 text-slate-300 hover:text-amber-400 transition-colors touch-manipulation"
              title="Criar Card de Citação"
            >
              <Quote size={18} />
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettings(true)}
              className="min-w-[42px] min-h-[42px] flex items-center justify-center p-2 rounded-xl bg-slate-800/80 active:bg-slate-700 text-slate-300 hover:text-white transition-colors touch-manipulation"
              title="Configurações de Leitura"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Reader Content Area */}
      <div className="flex-1 w-full h-full relative overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Carregando livro...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center text-rose-400">
            <p className="font-medium text-sm">{error}</p>
            <button
              onClick={onBack}
              className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs hover:bg-slate-700 mt-2 cursor-pointer"
            >
              Voltar à biblioteca
            </button>
          </div>
        ) : fileData ? (
          book.format === 'pdf' ? (
            <PdfViewer
              data={fileData}
              currentPage={currentPage}
              totalPages={totalPages}
              readingMode={readingMode}
              pdfDisplayMode={pdfDisplayMode}
              theme={theme}
              fontSize={fontSize}
              fontFamily={fontFamily}
              lineHeight={lineHeight}
              marginSize={marginSize}
              onPageChange={handlePdfPageChange}
              onToggleControls={() => setShowControls((prev) => !prev)}
              onLoaded={(toc) => setTocItems(toc)}
              registerNavigation={(nav) => {
                navRef.current = nav;
              }}
            />
          ) : (
            <EpubViewer
              data={fileData}
              currentCfi={currentCfi}
              readingMode={readingMode}
              theme={theme}
              fontSize={fontSize}
              fontFamily={fontFamily}
              lineHeight={lineHeight}
              marginSize={marginSize}
              onLocationChange={handleEpubLocationChange}
              onToggleControls={() => setShowControls((prev) => !prev)}
              onLoaded={(toc) => setTocItems(toc)}
              registerNavigation={(nav) => {
                navRef.current = nav;
              }}
            />
          )
        ) : null}

        {/* Zona invisível na borda esquerda para ajuste de brilho por gesto */}
        <div
          className="absolute left-0 top-16 bottom-16 w-10 z-30 touch-none cursor-ns-resize"
          onTouchStart={handleBrightnessTouchStart}
          onTouchMove={handleBrightnessTouchMove}
          onTouchEnd={handleBrightnessTouchEnd}
          title="Deslize verticalmente para ajustar o brilho"
        />

        {/* Indicador flutuante de brilho quando ajustado por gesto */}
        {showBrightnessIndicator && (
          <div className="absolute left-8 top-1/2 -translate-y-1/2 z-50 bg-slate-900/95 backdrop-blur-md border border-amber-500/40 text-amber-300 px-3.5 py-4 rounded-2xl shadow-2xl flex flex-col items-center gap-2.5 animate-in fade-in zoom-in-95 duration-100 pointer-events-none">
            <Sun size={20} className="text-amber-400" />
            <div className="w-2 h-28 bg-slate-800 rounded-full overflow-hidden flex flex-col justify-end p-0.5">
              <div
                className="w-full bg-gradient-to-t from-amber-500 to-amber-300 rounded-full transition-all duration-75"
                style={{ height: `${brightness}%` }}
              />
            </div>
            <span className="text-[11px] font-mono font-bold text-amber-300">{brightness}%</span>
          </div>
        )}

        {/* Película escura de brilho (permite escurecer para leitura noturna além do mínimo do celular) */}
        {brightness < 100 && (
          <div
            className="pointer-events-none fixed inset-0 z-40 bg-black transition-opacity duration-75"
            style={{ opacity: ((100 - brightness) / 100) * 0.8 }}
          />
        )}

        {/* Floating Prev/Next Side Indicators when controls are open and in paginated mode */}
        {showControls && readingMode === 'paginated' && (
          <>
            <button
              onClick={() => navRef.current?.prev()}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white shadow-lg border border-slate-700 flex items-center justify-center transition-transform active:scale-90 z-20 cursor-pointer"
              title="Página Anterior"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => navRef.current?.next()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white shadow-lg border border-slate-700 flex items-center justify-center transition-transform active:scale-90 z-20 cursor-pointer"
              title="Próxima Página"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>

      {/* Bottom Floating Controls Bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-30 transition-all duration-300 ease-in-out ${
          showControls ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="bg-slate-900/95 backdrop-blur-md border-t border-slate-800 text-slate-200 px-4 py-2.5 shadow-2xl flex flex-col gap-2">
          {/* Previous / Next buttons & Progress */}
          <div className="flex items-center justify-between gap-3">
            {readingMode === 'paginated' ? (
              <button
                onClick={() => navRef.current?.prev()}
                className="flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition-all active:scale-95 cursor-pointer"
              >
                <ChevronLeft size={15} />
                <span>Anterior</span>
              </button>
            ) : (
              <span className="text-[11px] text-slate-400">Role para continuar</span>
            )}

            <div className="text-center">
              <span className="text-xs font-mono font-semibold text-amber-400">
                {book.format === 'pdf' ? `Pág. ${currentPage} de ${totalPages}` : `${progress}% lido`}
              </span>
            </div>

            {readingMode === 'paginated' ? (
              <button
                onClick={() => navRef.current?.next()}
                className="flex items-center gap-1 text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-xs cursor-pointer"
              >
                <span>Próxima</span>
                <ChevronRight size={15} />
              </button>
            ) : (
              <span className="text-[11px] text-amber-400 font-mono font-medium">{progress}%</span>
            )}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <ReaderSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        readingMode={readingMode}
        onChangeReadingMode={handleModeChange}
        pdfDisplayMode={pdfDisplayMode}
        onChangePdfDisplayMode={handlePdfDisplayModeChange}
        theme={theme}
        onChangeTheme={handleThemeChange}
        fontSize={fontSize}
        onChangeFontSize={handleFontSizeChange}
        fontFamily={fontFamily}
        onChangeFontFamily={handleFontFamilyChange}
        lineHeight={lineHeight}
        onChangeLineHeight={handleLineHeightChange}
        marginSize={marginSize}
        onChangeMarginSize={handleMarginSizeChange}
        brightness={brightness}
        onChangeBrightness={handleBrightnessChange}
        bookmarks={bookmarks}
        onAddBookmark={handleAddBookmark}
        onJumpToBookmark={handleJumpToBookmark}
        onDeleteBookmark={handleDeleteBookmark}
        format={book.format}
      />

      {/* Quote Card Modal */}
      <QuoteCardModal
        isOpen={showQuoteModal}
        onClose={() => setShowQuoteModal(false)}
        bookTitle={book.title}
        bookAuthor={book.author}
        bookCoverUrl={book.coverUrl}
      />

      {/* Table of Contents Modal */}
      <TableOfContentsModal
        isOpen={showToc}
        onClose={() => setShowToc(false)}
        toc={tocItems}
        currentPage={currentPage}
        onSelectChapter={(item) => {
          if (book.format === 'pdf' && item.pageNumber) {
            handlePdfPageChange(item.pageNumber, totalPages);
            if (readingMode === 'scroll') {
              const el = document.getElementById(
                pdfDisplayMode === 'reflow' ? `pdf-reflow-page-${item.pageNumber}` : `pdf-page-${item.pageNumber}`
              );
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          } else if (book.format === 'epub' && item.href) {
            navRef.current?.goTo?.(item.href);
          }
          setShowToc(false);
        }}
      />
    </div>
  );
};
