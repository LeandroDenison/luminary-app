import React, { useState, useRef, useEffect } from 'react';
import {
  BookOpen,
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
  Archive
} from 'lucide-react';
import { BookDetailModal } from './BookDetailModal';
import { FreeBooksCatalogModal } from './FreeBooksCatalogModal';
import { DriveSyncModal } from './DriveSyncModal';
import { BookCover } from './BookCover';
import { StorageService } from '../services/storage';
import { DriveSync, deduplicateAndMergeBooks, type SyncStatus } from '../services/driveSync';
import { GoogleAuth } from '../services/googleAuth';
import { LiveUpdater, CURRENT_APP_VERSION, type LiveUpdateStatus } from '../services/liveUpdater';
import { CoverLoader } from '../services/coverLoader';
import { parsePdfFile } from '../services/pdfHelper';
import { parseEpubFile } from '../services/epubHelper';
import { matchesBookSearch, cleanBookTitleAndAuthor } from '../utils/textCleaner';
import type { Book, BookFormat } from '../types';

interface LibraryProps {
  books: Book[];
  onOpenBook: (book: Book) => void;
  onRefreshBooks: () => void;
}

type FilterType = 'all' | 'reading' | 'completed' | 'pdf' | 'epub' | 'archived';

export const Library: React.FC<LibraryProps> = ({ books, onOpenBook, onRefreshBooks }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [coverOverrides, setCoverOverrides] = useState<Record<string, string>>({});
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [liveUpdateStatus, setLiveUpdateStatus] = useState<LiveUpdateStatus>(LiveUpdater.getStatus());
  const [activeVersion, setActiveVersion] = useState<string>(CURRENT_APP_VERSION);
  const cloudConnected = GoogleAuth.isConnected();

  useEffect(() => DriveSync.subscribe((s) => setSyncStatus(s)), []);

  // Monitora e carrega capas em segundo plano ao longo do uso do app
  useEffect(() => {
    CoverLoader.queueBooks(books);
  }, [books]);

  useEffect(() => {
    return CoverLoader.subscribe((bookId, newCoverUrl) => {
      setCoverOverrides((prev) => ({ ...prev, [bookId]: newCoverUrl }));
    });
  }, []);
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

  // Auto-sanitiza livros com "Cópia de" e desduplica livros repetidos
  useEffect(() => {
    if (books.length === 0) return;
    let changed = false;
    for (const b of books) {
      const { title, author } = cleanBookTitleAndAuthor(b.title, b.author);
      let cover = b.coverUrl;
      if (cover && (cover.includes('googleusercontent.com') || cover.includes('drive.google.com'))) {
        cover = undefined;
      }
      if (title !== b.title || author !== b.author || cover !== b.coverUrl) {
        changed = true;
        StorageService.saveBook({ ...b, title, author, coverUrl: cover }, undefined, { preserveTimestamp: true }).catch(() => {});
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
  const activeBooks = books.filter((b) => !b.isArchived);

  // Filter books (busca inteligente por título e autor, sem travar em acentos)
  const filteredBooks = books.filter((book) => {
    if (!matchesBookSearch(book, searchTerm)) return false;

    // Se a aba 'arquivados' estiver ativa, mostra apenas arquivados
    if (activeFilter === 'archived') {
      return Boolean(book.isArchived);
    }

    // Em todas as outras abas (incluindo 'all'), os arquivados ficam ocultos
    if (book.isArchived) return false;

    if (activeFilter === 'reading') return book.progress > 0 && book.progress < 100;
    if (activeFilter === 'completed') return book.progress >= 100;
    if (activeFilter === 'pdf') return book.format === 'pdf';
    if (activeFilter === 'epub') return book.format === 'epub';
    return true;
  });

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

      // Remove prefixos automáticos como "Cópia de " e detecta autor/título se estiver no nome
      const cleaned = cleanBookTitleAndAuthor(title, author);
      title = cleaned.title;
      author = cleaned.author;

      const newBook: Book = {
        id: `book-${Date.now()}`,
        title,
        author,
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

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Top Header com espaçamento seguro para relógio e bateria */}
      <header
        className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-md px-4 pb-3 border-b border-slate-800/80"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 38px)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 shadow-md shadow-amber-500/20 shrink-0 aspect-square">
              <BookOpen size={19} className="shrink-0" />
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
              className={`relative p-1.5 rounded-xl border transition-colors ${
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
              className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
              title="Catálogo de Clássicos Grátis"
            >
              <Sparkles size={14} />
              <span className="hidden sm:inline">Livros Grátis</span>
            </button>

            {/* Import Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-3 py-1.5 rounded-xl text-xs transition-transform active:scale-95 shadow-md shadow-amber-500/20"
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

        {/* Search Bar */}
        <div className="relative">
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

        {/* Filters */}
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
              className={`px-3 py-1 rounded-lg text-xs font-medium shrink-0 transition-colors flex items-center gap-1 ${
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
        {!searchTerm && activeFilter === 'all' && recentBook && (
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border border-amber-500/20 p-4 shadow-xl">
            <div className="flex gap-3.5 items-center">
              <div
                onClick={() => onOpenBook(recentBook)}
                className="w-18 h-26 rounded-xl overflow-hidden bg-slate-800 shrink-0 shadow-md border border-slate-700/60 cursor-pointer active:scale-95 transition-transform"
              >
                <BookCover
                  coverUrl={coverOverrides[recentBook.id] || recentBook.coverUrl}
                  title={recentBook.title}
                  author={recentBook.author}
                />
              </div>

              <div className="flex-1 overflow-hidden">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                  <Clock size={12} />
                  <span>Continuar Leitura</span>
                </div>

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
                  className="mt-2.5 inline-flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 font-medium"
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
              {activeFilter === 'all'
                ? 'Todos os Livros'
                : activeFilter === 'archived'
                ? `Livros Arquivados (${filteredBooks.length})`
                : `Filtrados (${filteredBooks.length})`}
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
                    ? 'Para ocultar títulos ou duplicatas de teste da estante principal, abra os detalhes do livro e toque no ícone de arquivar.'
                    : 'Importe arquivos PDF ou EPUB pelo botão acima ou explore clássicos grátis!'}
                </p>
              </div>
              {activeFilter !== 'archived' && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition-colors"
                >
                  Importar livro agora
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
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

                  {/* Title & Author */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
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
        isOpen={!!selectedBook}
        onClose={() => setSelectedBook(null)}
        onRead={(book) => {
          setSelectedBook(null);
          onOpenBook(book);
        }}
        onDelete={handleDeleteBook}
        onUpdate={handleUpdateBook}
      />

      {/* Free Books Catalog Modal */}
      <FreeBooksCatalogModal
        isOpen={showCatalogModal}
        onClose={() => setShowCatalogModal(false)}
        onBookAdded={refreshAndSync}
      />

      {/* Google Drive Sync Modal */}
      <DriveSyncModal
        isOpen={showDriveModal}
        onClose={() => setShowDriveModal(false)}
        onSynced={onRefreshBooks}
      />
    </div>
  );
};
