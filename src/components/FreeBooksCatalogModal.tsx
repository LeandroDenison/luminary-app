import React, { useState } from 'react';
import { X, Download, Sparkles, Check, AlertCircle, Search, BookOpen, Globe } from 'lucide-react';
import { POPULAR_FREE_BOOKS } from '../services/freeBooksCatalog';
import { searchOnlinePtBrBooks, type OnlineBookResult } from '../services/bookSearchApi';
import { StorageService } from '../services/storage';
import { parseEpubFile } from '../services/epubHelper';
import { BookCover } from './BookCover';
import type { FreeBookItem, Book } from '../types';

interface FreeBooksCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookAdded: () => void;
}

export const FreeBooksCatalogModal: React.FC<FreeBooksCatalogModalProps> = ({
  isOpen,
  onClose,
  onBookAdded
}) => {
  const [activeTab, setActiveTab] = useState<'featured' | 'search'>('featured');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search API state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<OnlineBookResult[]>([]);
  const [searchedOnce, setSearchedOnce] = useState(false);

  if (!isOpen) return null;

  // Handler for Curated local books
  const handleDownloadCurated = async (item: FreeBookItem) => {
    setDownloadingId(item.id);
    setErrorMsg(null);
    try {
      const res = await fetch(item.downloadUrl);
      if (!res.ok) {
        throw new Error(`Falha ao ler o arquivo local (${res.status})`);
      }

      const buffer = await res.arrayBuffer();
      const meta = await parseEpubFile(buffer);

      const newBook: Book = {
        id: `book-${Date.now()}-${item.id}`,
        title: item.title,
        author: item.author,
        format: 'epub',
        coverUrl: meta.coverDataUrl || item.coverUrl,
        addedAt: Date.now(),
        fileSize: buffer.byteLength,
        progress: 0,
        readingMode: 'paginated',
        theme: 'sepia',
        fontSize: 16,
        bookmarks: [],
        description: item.description
      };

      await StorageService.saveBook(newBook, buffer);
      setDownloadedIds((prev) => new Set(prev).add(item.id));
      onBookAdded();
    } catch (err: any) {
      console.error('Erro ao adicionar livro:', err);
      setErrorMsg('Não foi possível adicionar este livro no momento. Tente novamente.');
    } finally {
      setDownloadingId(null);
    }
  };

  // Handler for Online API Search
  const handleSearchApi = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setErrorMsg(null);
    try {
      const results = await searchOnlinePtBrBooks(searchQuery.trim());
      setSearchResults(results);
      setSearchedOnce(true);
    } catch (err) {
      setErrorMsg('Erro ao conectar com a API de livros. Verifique sua conexão.');
    } finally {
      setIsSearching(false);
    }
  };

  // Handler for downloading from Online API Search with robust fallbacks
  const handleDownloadOnline = async (item: OnlineBookResult) => {
    setDownloadingId(item.id);
    setErrorMsg(null);
    try {
      let buffer: ArrayBuffer | null = null;

      // Candidate download URLs
      const urlsToTry = [
        item.downloadUrl,
        item.downloadUrl.replace('https://www.gutenberg.org', '/api/gutenberg'),
        `https://corsproxy.io/?${encodeURIComponent(item.downloadUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(item.downloadUrl)}`
      ];

      for (const url of urlsToTry) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            buffer = await res.arrayBuffer();
            if (buffer && buffer.byteLength > 1000) {
              break;
            }
          }
        } catch (_) {}
      }

      if (!buffer) {
        throw new Error('Falha ao descarregar arquivo de todas as fontes disponíveis.');
      }

      const meta = await parseEpubFile(buffer);

      const newBook: Book = {
        id: `book-${Date.now()}-${item.id}`,
        title: item.title,
        author: item.author,
        format: item.format,
        coverUrl: meta.coverDataUrl || item.coverUrl,
        addedAt: Date.now(),
        fileSize: buffer.byteLength,
        progress: 0,
        readingMode: 'paginated',
        theme: 'sepia',
        fontSize: 16,
        bookmarks: [],
        description: 'Livro gratuito em domínio público (Literatura em Português do Brasil).'
      };

      await StorageService.saveBook(newBook, buffer);
      setDownloadedIds((prev) => new Set(prev).add(item.id));
      onBookAdded();
    } catch (err) {
      console.error('Erro ao baixar livro online:', err);
      setErrorMsg('Não foi possível baixar este título da rede externa no momento.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl text-slate-100 max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-base leading-tight">Biblioteca Grátis</h3>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold px-1.5 py-0.2 rounded-sm">
                  100% PT-BR 🇧🇷
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Clássicos em Português do Brasil sem custos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 mt-3 p-1 bg-slate-950 rounded-xl border border-slate-800 shrink-0">
          <button
            onClick={() => setActiveTab('featured')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'featured'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen size={14} />
            <span>Obras Prontas (PT-BR)</span>
          </button>

          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'search'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe size={14} />
            <span>Buscar na API Online</span>
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Tab 1: Curated PT-BR Classics */}
        {activeTab === 'featured' && (
          <div className="mt-3 overflow-y-auto flex-1 space-y-3 pr-1">
            {POPULAR_FREE_BOOKS.map((item) => {
              const isDownloading = downloadingId === item.id;
              const isDownloaded = downloadedIds.has(item.id);

              return (
                <div
                  key={item.id}
                  className="flex gap-3 bg-slate-800/40 hover:bg-slate-800/70 p-3 rounded-2xl border border-slate-800/80 transition-colors"
                >
                  <div className="w-16 h-22 rounded-xl overflow-hidden shrink-0 shadow-md border border-slate-700/50">
                    <BookCover coverUrl={item.coverUrl} title={item.title} author={item.author} />
                  </div>

                  <div className="flex-1 flex flex-col justify-between overflow-hidden">
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-amber-400 tracking-wider">
                        {item.genre}
                      </span>
                      <h4 className="font-semibold text-sm leading-snug truncate mt-0.5">{item.title}</h4>
                      <p className="text-xs text-slate-400">{item.author}</p>
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-1">{item.description}</p>
                    </div>

                    <div className="mt-2 flex justify-end">
                      {isDownloaded ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                          <Check size={14} />
                          <span>Adicionado</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleDownloadCurated(item)}
                          disabled={isDownloading}
                          className="flex items-center gap-1.5 text-xs bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-medium px-3 py-1.5 rounded-xl border border-amber-500/30 transition-all active:scale-95 disabled:opacity-50"
                        >
                          {isDownloading ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              <span>Baixando...</span>
                            </>
                          ) : (
                            <>
                              <Download size={14} />
                              <span>Adicionar à Estante</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Online Search API */}
        {activeTab === 'search' && (
          <div className="mt-3 flex-1 flex flex-col overflow-hidden">
            {/* Search Input */}
            <form onSubmit={handleSearchApi} className="flex gap-2 mb-3 shrink-0">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar autor ou livro (ex: Machado de Assis)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-hidden focus:border-amber-500"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim()}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-4 py-2 rounded-xl text-xs transition-colors disabled:opacity-50"
              >
                {isSearching ? 'Buscando...' : 'Buscar'}
              </button>
            </form>

            {/* Strict PT-BR Security Notice */}
            <div className="mb-2 text-[10px] text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 flex items-center justify-between shrink-0">
              <span>🛡️ Filtro ativo: <b>Apenas Português do Brasil (PT-BR)</b></span>
              <span className="text-emerald-400">Autores PT-PT bloqueados</span>
            </div>

            {/* Search Results List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {isSearching ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Consultando base pública de livros...</span>
                </div>
              ) : searchedOnce && searchResults.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Nenhum livro em Português do Brasil encontrado para essa busca. Tente buscar pelo sobrenome do autor (ex: "Assis", "Alencar", "Azevedo").
                </div>
              ) : !searchedOnce ? (
                <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                  <Globe size={28} className="opacity-40" />
                  <p>Digite o nome de uma obra ou autor brasileiro para pesquisar em tempo real na API.</p>
                </div>
              ) : (
                searchResults.map((item) => {
                  const isDownloading = downloadingId === item.id;
                  const isDownloaded = downloadedIds.has(item.id);

                  return (
                    <div
                      key={item.id}
                      className="flex gap-3 bg-slate-800/40 hover:bg-slate-800/70 p-3 rounded-2xl border border-slate-800/80 transition-colors"
                    >
                      <div className="w-16 h-22 rounded-xl overflow-hidden shrink-0 shadow-md border border-slate-700/50">
                        <BookCover coverUrl={item.coverUrl} title={item.title} author={item.author} />
                      </div>

                      <div className="flex-1 flex flex-col justify-between overflow-hidden">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-semibold text-emerald-400">
                              {item.languageNote}
                            </span>
                            <span className="text-[9px] uppercase font-mono bg-slate-800 text-slate-400 px-1 py-0.2 rounded-xs">
                              {item.format}
                            </span>
                          </div>
                          <h4 className="font-semibold text-sm leading-snug truncate mt-0.5">{item.title}</h4>
                          <p className="text-xs text-slate-400">{item.author}</p>
                        </div>

                        <div className="mt-2 flex justify-end">
                          {isDownloaded ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                              <Check size={14} />
                              <span>Adicionado</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => handleDownloadOnline(item)}
                              disabled={isDownloading}
                              className="flex items-center gap-1.5 text-xs bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-medium px-3 py-1.5 rounded-xl border border-amber-500/30 transition-all active:scale-95 disabled:opacity-50"
                            >
                              {isDownloading ? (
                                <>
                                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  <span>Importando...</span>
                                </>
                              ) : (
                                <>
                                  <Download size={14} />
                                  <span>Adicionar à Estante</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
