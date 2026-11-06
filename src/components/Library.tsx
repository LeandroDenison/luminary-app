import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Sparkles,
  Clock,
  CheckCircle,
  Upload,
  ArrowRight,
  Cloud,
  CloudOff,
  RefreshCw,
  X,
  Archive,
  SlidersHorizontal
} from 'lucide-react';
import { BookDetailModal } from './BookDetailModal';
import { FreeBooksCatalogModal } from './FreeBooksCatalogModal';
import { DriveSyncModal } from './DriveSyncModal';
import { SortFilterModal, type SortOption } from './SortFilterModal';
import { BookCover } from './BookCover';
import { LuminaryIcon, type IconVariant } from './LuminaryIcons';
import { IconStudioModal } from './IconStudioModal';
import { StorageService } from '../services/storage';
import { DriveSync, deduplicateAndMergeBooks, type SyncStatus } from '../services/driveSync';
import { GoogleAuth } from '../services/googleAuth';
import { LiveUpdater, CURRENT_APP_VERSION, type LiveUpdateStatus } from '../services/liveUpdater';
import { CoverLoader } from '../services/coverLoader';
import { parsePdfFile } from '../services/pdfHelper';
import { parseEpubFile } from '../services/epubHelper';
import { matchesBookSearch, cleanBookTitleAndAuthor, normalizeSearchText, isSuspiciousAuthor } from '../utils/textCleaner';
import type { Book, BookFormat } from '../types';

interface LibraryProps {
  books: Book[];
  onOpenBook: (book: Book) => void;
  onRefreshBooks: () => void;
  onReplaySplash?: () => void;
}

type FilterType = 'all' | 'reading' | 'completed' | 'pdf' | 'epub' | 'archived';

export const Library: React.FC<LibraryProps> = ({ books, onOpenBook, onRefreshBooks, onReplaySplash }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);
  const [showSortFilterModal, setShowSortFilterModal] = useState(false);

  const [coverOverrides, setCoverOverrides] = useState<Record<string, string>>({});
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [activeIconVariant, setActiveIconVariant] = useState<IconVariant>(() => {
    return (localStorage.getItem('luminary_active_icon_v2') as IconVariant) || 'cradled-spine';
  });
  const [showIconStudio, setShowIconStudio] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [liveUpdateStatus, setLiveUpdateStatus] = useState<LiveUpdateStatus>(LiveUpdater.getStatus());
  const [activeVersion, setActiveVersion] = useState<string>(CURRENT_APP_VERSION);
  const cloudConnected = GoogleAuth.isConnected();

  useEffect(() => DriveSync.subscribe((s) => setSyncStatus(s)), []);

  // Permite abrir o estúdio de ícones a partir de eventos do simulador web
  useEffect(() => {
    const handleOpenStudio = () => setShowIconStudio(true);
    window.addEventListener('open-icon-studio', handleOpenStudio);
    return () => window.removeEventListener('open-icon-studio', handleOpenStudio);
  }, []);

  const handleSelectIconVariant = (v: IconVariant) => {
    setActiveIconVariant(v);
    localStorage.setItem('luminary_active_icon_v2', v);
  };

  // Monitora e carrega capas e metadados na web em segundo plano
  useEffect(() => {
    CoverLoader.queueBooks(books);
  }, [books]);

  useEffect(() => {
    return CoverLoader.subscribe((bookId, newCoverUrl, updatedBook) => {
      if (newCoverUrl) {
        setCoverOverrides((prev) => ({ ...prev, [bookId]: newCoverUrl }));
      }
      if (updatedBook) {
        onRefreshBooks();
      }
    });
  }, [onRefreshBooks]);

  useEffect(() => {
    return LiveUpdater.subscribe((s) => {
      setLiveUpdateStatus(s);
      LiveUpdater.getRunningVersion().then(setActiveVersion).catch(() => {});
    });
  }, []);

  /** Refresh the shelf and push changes to the Drive in the background */
  const refreshAndSync = () => {
    onRefreshBooks();
    DriveSync.syncQuietly().then((r) => {
      if (r) onRefreshBooks();
    });
  };

  // Auto-sanitiza livros com "Cópia de", extrai série/volume e desduplica livros repetidos
  useEffect(() => {
    if (books.length === 0) return;
    let changed = false;
    for (const b of books) {
      const { title, author, series, volume } = cleanBookTitleAndAuthor(b.title, b.author, b.series);
      let cover = b.coverUrl;
      if (cover && (cover.includes('googleusercontent.com') || cover.includes('drive.google.com'))) {
        cover = undefined;
      }
      if (
        title !== b.title ||
        author !== b.author ||
        cover !== b.coverUrl ||
        (series && !b.series) ||
        (volume && !b.volume)
      ) {
        changed = true;
        StorageService.saveBook(
          {
            ...b,
            title,
            author,
            coverUrl: cover,
            series: b.series || series,
            volume: b.volume || volume
          },
          undefined,
          { preserveTimestamp: true }
        ).catch(() => {});
      }
    }

    if (books.length > 1) {
      deduplicateAndMergeBooks(books).then((hadDups) => {
        if (hadDups || changed) {
          onRefreshBooks();
        }
      });
    } else if (changed) {
      onRefreshBooks();
    }
  }, [books.length]);

  const handleUpdateBook = async (updated: Book) => {
    await StorageService.saveBook(updated, undefined, { preserveTimestamp: true });
    setSelectedBook(updated);
    refreshAndSync();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const archivedCount = books.filter((b) => b.isArchived).length;
  const activeBooks = useMemo(() => books.filter((b) => !b.isArchived), [books]);

  // Lista dinâmica de autores com contagem de livros (exclui termos que são séries ou títulos)
  const authorCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of activeBooks) {
      if (b.author && !/desconhecido/i.test(b.author) && !isSuspiciousAuthor(b.author, b.title)) {
        counts.set(b.author, (counts.get(b.author) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([author, count]) => ({ author, count }))
      .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author, 'pt-BR'));
  }, [activeBooks]);

  // Lista dinâmica de séries
  const seriesList = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of activeBooks) {
      if (b.series) {
        counts.set(b.series, (counts.get(b.series) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([series, count]) => ({ series, count }))
      .sort((a, b) => b.count - a.count || a.series.localeCompare(b.series, 'pt-BR'));
  }, [activeBooks]);

  // Filtragem
  const filteredBooks = useMemo(() => {
    const result = books.filter((book) => {
      if (!matchesBookSearch(book, searchTerm)) return false;

      // Se a aba 'arquivados' estiver ativa, mostra apenas arquivados
      if (activeFilter === 'archived') {
        return Boolean(book.isArchived);
      }

      // Em todas as outras abas (incluindo 'all'), os arquivados ficam ocultos
      if (book.isArchived) return false;

      // Filtro por autor selecionado
      if (selectedAuthor && normalizeSearchText(book.author) !== normalizeSearchText(selectedAuthor)) {
        return false;
      }

      // Filtro por série selecionada
      if (selectedSeries && (!book.series || normalizeSearchText(book.series) !== normalizeSearchText(selectedSeries))) {
        return false;
      }

      if (activeFilter === 'reading') return book.progress > 0 && book.progress < 100;
      if (activeFilter === 'completed') return book.progress >= 100;
      if (activeFilter === 'pdf') return book.format === 'pdf';
      if (activeFilter === 'epub') return book.format === 'epub';
      return true;
    });

    // Ordenação
    result.sort((a, b) => {
      switch (sortBy) {
        case 'title-asc':
          return a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
        case 'title-desc':
          return b.title.localeCompare(a.title, 'pt-BR', { sensitivity: 'base' });
        case 'author-asc':
          return (a.author || '').localeCompare(b.author || '', 'pt-BR', { sensitivity: 'base' });
        case 'progress':
          return (b.progress || 0) - (a.progress || 0);
        case 'recent':
        default:
          return (b.lastReadAt || b.addedAt || 0) - (a.lastReadAt || a.addedAt || 0);
      }
    });

    return result;
  }, [books, searchTerm, activeFilter, selectedAuthor, selectedSeries, sortBy]);

  // Recent book to "Continue Reading" (ignora arquivados)
  const recentBook = activeBooks.find((b) => b.progress > 0 && b.progress < 100) || activeBooks[0];

  // File import handler
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFile = async (file: File) => {
    const fileName = file.name;
    const isPdf = fileName.toLowerCase().endsWith('.pdf');
    const isEpub = fileName.toLowerCase().endsWith('.epub');

    if (!isPdf && !isEpub) {
      alert('Por favor selecione um arquivo no formato PDF ou EPUB.');
      return;
    }

    setIsImporting(true);
    setImportStatus('Lendo arquivo do livro...');

    try {
      const buffer = await file.arrayBuffer();
      const format: BookFormat = isPdf ? 'pdf' : 'epub';

      setImportStatus('Extraindo capa e informações...');

      let title = fileName.replace(/\.[^/.]+$/, '');
      let author = 'Autor desconhecido';
      let coverUrl: string | undefined;
      let totalPages: number | undefined;
      let description: string | undefined;

      if (isPdf) {
        const meta = await parsePdfFile(buffer);
        if (meta.title && meta.title !== 'Documento PDF') title = meta.title;
        if (meta.author && meta.author !== 'Desconhecido') author = meta.author;
        coverUrl = meta.coverDataUrl;
        totalPages = meta.totalPages;
      } else {
        const meta = await parseEpubFile(buffer);
        if (meta.title && meta.title !== 'Livro EPUB') title = meta.title;
        if (meta.author && meta.author !== 'Autor Desconhecido') author = meta.author;
        coverUrl = meta.coverDataUrl;
        description = meta.description;
      }

      // Remove prefixos automáticos como "Cópia de " e extrai série/volume se presente
      const cleaned = cleanBookTitleAndAuthor(title, author);
      title = cleaned.title;
      author = cleaned.author;

      const newBook: Book = {
        id: `book-${Date.now()}`,
        title,
        author,
        series: cleaned.series,
        volume: cleaned.volume,
        format,
        coverUrl,
        addedAt: Date.now(),
        fileSize: file.size,
        totalPages,
        progress: 0,
        readingMode: 'paginated',
        theme: 'sepia',
        fontSize: 16,
        bookmarks: [],
        description
      };

      setImportStatus('Salvando na estante...');
      await StorageService.saveBook(newBook, buffer);
      refreshAndSync();
    } catch (err) {
      console.error('Erro ao importar livro:', err);
      alert('Houve um erro ao processar o arquivo. Tente novamente.');
    } finally {
      setIsImporting(false);
      setImportStatus('');
    }
  };

  const handleDeleteBook = async (id: string) => {
    await StorageService.deleteBook(id);
    refreshAndSync();
  };

  const isFilterActive = sortBy !== 'recent' || selectedAuthor !== null || selectedSeries !== null;

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Top Header com espaçamento seguro para relógio e bateria */}
      <header
        className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-md px-4 pb-3 border-b border-slate-800/80"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 38px)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Logo do App (toque para rever a animação de entrada L-Livro) */}
            <div
              onClick={() => (onReplaySplash ? onReplaySplash() : setShowIconStudio(true))}
              className="cursor-pointer hover:scale-105 active:scale-95 transition-transform shrink-0"
              title="Toque para ver a animação de abertura Luminary"
            >
              <LuminaryIcon variant={activeIconVariant} size={36} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight text-white m-0 truncate">Minha Biblioteca</h1>
              <p className="text-[11px] text-slate-400 font-medium m-0 flex items-center gap-1.5 truncate">
                <span>{activeFilter === 'archived' ? `${archivedCount} arquivados` : `${activeBooks.length} ${activeBooks.length === 1 ? 'livro' : 'livros'}`}</span>
                {liveUpdateStatus === 'downloading' ? (
                  <span className="text-amber-400 flex items-center gap-1 font-semibold">
                    <RefreshCw size={10} className="animate-spin shrink-0" /> Baixando OTA...
                  </span>
                ) : liveUpdateStatus === 'checking' ? (
                  <span className="text-sky-400 flex items-center gap-1 font-semibold">
                    <RefreshCw size={10} className="animate-spin shrink-0" /> Verificando...
                  </span>
                ) : liveUpdateStatus === 'ready' ? (
                  <button
                    onClick={() => LiveUpdater.applyUpdateNow()}
                    className="text-amber-300 underline font-semibold animate-pulse active:opacity-75"
                    title="Toque para reiniciar e aplicar a nova versão"
                  >
                    · Toque para reiniciar
                  </button>
                ) : (
                  <button
                    onClick={() => LiveUpdater.checkForUpdates(true)}
                    className="text-emerald-400/90 hover:text-emerald-300 flex items-center gap-1 font-medium transition-colors cursor-pointer"
                    title="Toque para buscar atualizações OTA agora"
                  >
                    · v{activeVersion} <RefreshCw size={9} className="opacity-70 hover:opacity-100" />
                  </button>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Cloud / Google Drive Button */}
            <button
              onClick={() => setShowDriveModal(true)}
              className={`relative p-1.5 rounded-xl border transition-colors cursor-pointer ${
                cloudConnected
                  ? 'bg-sky-500/10 text-sky-300 border-sky-500/30 hover:bg-sky-500/20'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title="Nuvem — Google Drive"
            >
              {syncStatus === 'syncing' ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : cloudConnected && (syncStatus === 'error' || syncStatus === 'auth-required') ? (
                <CloudOff size={16} className="text-rose-400" />
              ) : (
                <Cloud size={16} />
              )}
            </button>

            {/* Free Books Button */}
            <button
              onClick={() => setShowCatalogModal(true)}
              className="p-1.5 rounded-xl border bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 transition-colors cursor-pointer shrink-0"
              title="Catálogo de Livros Grátis"
            >
              <Sparkles size={16} />
            </button>

            {/* Import Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-3 py-1.5 rounded-xl text-xs transition-transform active:scale-95 shadow-md shadow-amber-500/20 cursor-pointer"
              title="Importar PDF ou EPUB"
            >
              <Plus size={16} />
              <span>Importar</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.epub"
              onChange={handleFileSelected}
              className="hidden"
            />
          </div>
        </div>

        {/* Search Bar + Sort/Filter Button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por título ou autor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-hidden focus:border-amber-500/50"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 rounded-full cursor-pointer"
                title="Limpar busca"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Sort & Filter Button no canto direito da barra de pesquisa */}
          <button
            onClick={() => setShowSortFilterModal(true)}
            className={`p-2 rounded-xl border text-xs font-medium transition-all flex items-center justify-center shrink-0 cursor-pointer relative ${
              isFilterActive
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-semibold'
                : 'bg-slate-900 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
            }`}
            title="Ordenar (A-Z, Z-A) e filtrar por autor ou série"
          >
            <SlidersHorizontal size={16} />
            {isFilterActive && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full border-2 border-slate-950" />
            )}
          </button>
        </div>

        {/* Active Filter Chips (se algum filtro ou ordenação diferente estiver ativo) */}
        {isFilterActive && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2">
            {sortBy !== 'recent' && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-lg">
                <span>
                  {sortBy === 'title-asc'
                    ? 'A → Z'
                    : sortBy === 'title-desc'
                    ? 'Z → A'
                    : sortBy === 'author-asc'
                    ? 'Autor A-Z'
                    : 'Maior Progresso'}
                </span>
                <button
                  onClick={() => setSortBy('recent')}
                  className="hover:text-white cursor-pointer ml-0.5"
                  title="Remover ordenação"
                >
                  <X size={11} />
                </button>
              </span>
            )}
            {selectedAuthor && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-lg">
                <span className="truncate max-w-[140px]">Autor: {selectedAuthor}</span>
                <button
                  onClick={() => setSelectedAuthor(null)}
                  className="hover:text-white cursor-pointer ml-0.5"
                  title="Remover filtro de autor"
                >
                  <X size={11} />
                </button>
              </span>
            )}
            {selectedSeries && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-lg">
                <span className="truncate max-w-[140px]">Série: {selectedSeries}</span>
                <button
                  onClick={() => setSelectedSeries(null)}
                  className="hover:text-white cursor-pointer ml-0.5"
                  title="Remover filtro de série"
                >
                  <X size={11} />
                </button>
              </span>
            )}
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-1.5 mt-2.5 overflow-x-auto pb-0.5 no-scrollbar">
          {[
            { id: 'all' as const, label: 'Todos' },
            { id: 'reading' as const, label: 'Lendo' },
            { id: 'completed' as const, label: 'Concluídos' },
            { id: 'pdf' as const, label: 'PDFs' },
            { id: 'epub' as const, label: 'EPUBs' },
            { id: 'archived' as const, label: archivedCount > 0 ? `Arquivados (${archivedCount})` : 'Arquivados' }
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium shrink-0 transition-colors flex items-center gap-1 cursor-pointer ${
                activeFilter === f.id
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800/80'
              }`}
            >
              {f.id === 'archived' && (
                <Archive size={11} className={activeFilter === f.id ? 'text-slate-950' : 'text-slate-400'} />
              )}
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 pb-20 space-y-6">
        {/* Status of importing */}
        {isImporting && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3 text-amber-300 animate-pulse">
            <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-xs font-medium">{importStatus}</span>
          </div>
        )}

        {/* "Continuar Lendo" Card (Hero) */}
        {!searchTerm && !isFilterActive && activeFilter === 'all' && recentBook && (
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border border-amber-500/20 p-4 shadow-xl">
            <div className="flex gap-3.5 items-center">
              <div
                onClick={() => onOpenBook(recentBook)}
                className="w-18 h-26 rounded-xl overflow-hidden bg-slate-800 shrink-0 shadow-md border border-slate-700/60 cursor-pointer active:scale-95 transition-transform relative"
              >
                <BookCover
                  coverUrl={coverOverrides[recentBook.id] || recentBook.coverUrl}
                  title={recentBook.title}
                  author={recentBook.author}
                />
                {recentBook.volume && (
                  <span className="absolute bottom-1 right-1 text-[8px] font-bold bg-amber-500 text-slate-950 px-1 rounded shadow-xs">
                    Vol. {recentBook.volume}
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-hidden">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                  <Clock size={12} />
                  <span>Continuar Leitura</span>
                </div>

                {recentBook.series && (
                  <p className="text-[10px] text-amber-400/90 font-semibold tracking-wide truncate mt-0.5">
                    {recentBook.series} {recentBook.volume ? `· #${recentBook.volume}` : ''}
                  </p>
                )}

                <h3
                  onClick={() => onOpenBook(recentBook)}
                  className="font-bold text-sm text-white truncate mt-0.5 cursor-pointer hover:text-amber-300 transition-colors"
                >
                  {recentBook.title}
                </h3>
                <p className="text-xs text-slate-400 truncate">{recentBook.author}</p>

                {/* Progress bar */}
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="flex-1 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-400 h-full rounded-full transition-all"
                      style={{ width: `${recentBook.progress}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-amber-400">{recentBook.progress}%</span>
                </div>

                <button
                  onClick={() => onOpenBook(recentBook)}
                  className="mt-2.5 inline-flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 font-medium cursor-pointer"
                >
                  <span>Abrir leitor</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Books Grid */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 m-0">
              {activeFilter === 'all' && !isFilterActive
                ? 'Todos os Livros'
                : activeFilter === 'archived'
                ? `Livros Arquivados (${filteredBooks.length})`
                : `Livros (${filteredBooks.length})`}
            </h2>
          </div>

          {filteredBooks.length === 0 ? (
            <div className="py-12 px-4 text-center rounded-2xl border border-dashed border-slate-800 flex flex-col items-center justify-center gap-3 text-slate-500">
              <div className="p-3 bg-slate-900 rounded-full text-slate-400">
                {activeFilter === 'archived' ? <Archive size={24} /> : <Upload size={24} />}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300">
                  {activeFilter === 'archived' ? 'Nenhum livro arquivado' : 'Nenhum livro encontrado'}
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  {activeFilter === 'archived'
                    ? 'Para ocultar títulos da estante principal, abra os detalhes do livro e toque no ícone de arquivar.'
                    : isFilterActive
                    ? 'Nenhum livro corresponde aos filtros selecionados. Tente limpar os filtros de autor ou série.'
                    : 'Importe arquivos PDF ou EPUB pelo botão acima ou explore clássicos grátis!'}
                </p>
              </div>
              {isFilterActive ? (
                <button
                  onClick={() => {
                    setSelectedAuthor(null);
                    setSelectedSeries(null);
                    setSortBy('recent');
                    setSearchTerm('');
                  }}
                  className="mt-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Limpar todos os filtros
                </button>
              ) : activeFilter !== 'archived' ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                >
                  Importar livro agora
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3.5">
              {filteredBooks.map((book) => (
                <div
                  key={book.id}
                  onClick={() => setSelectedBook(book)}
                  className={`group relative flex flex-col bg-slate-900/60 hover:bg-slate-900 border rounded-2xl p-2.5 transition-all cursor-pointer shadow-sm hover:shadow-lg ${
                    book.isArchived
                      ? 'border-amber-500/30 opacity-85 hover:opacity-100'
                      : 'border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  {/* Cover */}
                  <div className="relative aspect-[3/4] w-full rounded-xl overflow-hidden bg-slate-800 shadow-md mb-2 flex items-center justify-center">
                    <BookCover
                      coverUrl={coverOverrides[book.id] || book.coverUrl}
                      title={book.title}
                      author={book.author}
                      className="group-hover:scale-105 transition-transform duration-300"
                    />

                    {/* Format Badge */}
                    <span className="absolute top-1.5 left-1.5 text-[9px] font-mono font-bold uppercase bg-black/70 backdrop-blur-xs text-slate-200 px-1.5 py-0.5 rounded-md border border-white/10">
                      {book.format}
                    </span>

                    {/* Volume Badge on Cover */}
                    {book.volume && (
                      <span className="absolute bottom-1.5 right-1.5 text-[9px] font-bold bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded-md shadow-md">
                        Vol. {book.volume}
                      </span>
                    )}

                    {/* Archived badge or Finished indicator */}
                    {book.isArchived ? (
                      <span className="absolute top-1.5 right-1.5 text-[9px] font-semibold bg-amber-500/90 text-slate-950 px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shadow-md">
                        <Archive size={10} /> Arquivado
                      </span>
                    ) : (
                      book.progress >= 100 && (
                        <div className="absolute top-1.5 right-1.5 bg-emerald-500 text-slate-950 p-1 rounded-full shadow-md">
                          <CheckCircle size={12} />
                        </div>
                      )
                    )}

                    {/* Progress Bar overlay at bottom of cover */}
                    {book.progress > 0 && book.progress < 100 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                        <div
                          className="bg-amber-400 h-full transition-all"
                          style={{ width: `${book.progress}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Title & Author & Series */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      {book.series && (
                        <span className="text-[10px] font-semibold text-amber-400/90 truncate block tracking-wide">
                          {book.series}{book.volume ? ` · #${book.volume}` : ''}
                        </span>
                      )}
                      <h4 className="font-semibold text-xs text-slate-200 line-clamp-1 group-hover:text-amber-300 transition-colors">
                        {book.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{book.author}</p>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                      <span>{book.progress > 0 ? `${book.progress}% lido` : 'Não iniciado'}</span>
                      <span className="text-amber-400/80 font-medium">Ler ›</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Book Detail Modal */}
      <BookDetailModal
        book={selectedBook}
        isOpen={Boolean(selectedBook)}
        onClose={() => setSelectedBook(null)}
        onRead={(book) => {
          setSelectedBook(null);
          onOpenBook(book);
        }}
        onDelete={handleDeleteBook}
        onUpdate={handleUpdateBook}
      />

      {/* Sort & Filter Modal */}
      <SortFilterModal
        isOpen={showSortFilterModal}
        onClose={() => setShowSortFilterModal(false)}
        sortBy={sortBy}
        onSelectSort={(sort) => setSortBy(sort)}
        selectedAuthor={selectedAuthor}
        onSelectAuthor={(author) => setSelectedAuthor(author)}
        authorCounts={authorCounts}
        selectedSeries={selectedSeries}
        onSelectSeries={(series) => setSelectedSeries(series)}
        seriesList={seriesList}
        onReset={() => {
          setSortBy('recent');
          setSelectedAuthor(null);
          setSelectedSeries(null);
        }}
      />

      {/* Free Books Catalog Modal */}
      <FreeBooksCatalogModal
        isOpen={showCatalogModal}
        onClose={() => setShowCatalogModal(false)}
        onBookAdded={() => refreshAndSync()}
      />

      {/* Google Drive Sync Modal */}
      <DriveSyncModal
        isOpen={showDriveModal}
        onClose={() => setShowDriveModal(false)}
        onSynced={() => refreshAndSync()}
      />

      {/* Estúdio de Teste de Ícones (L + Livro) */}
      <IconStudioModal
        isOpen={showIconStudio}
        onClose={() => setShowIconStudio(false)}
        selectedVariant={activeIconVariant}
        onSelectVariant={handleSelectIconVariant}
      />
    </div>
  );
};
