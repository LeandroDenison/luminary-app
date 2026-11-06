import React, { useState } from 'react';
import { X, SlidersHorizontal, ArrowDownAZ, ArrowUpAZ, Clock, TrendingUp, User, Layers, Check, RotateCcw, Search } from 'lucide-react';

export type SortOption = 'recent' | 'title-asc' | 'title-desc' | 'author-asc' | 'progress';

interface SortFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  sortBy: SortOption;
  onSelectSort: (sort: SortOption) => void;
  selectedAuthor: string | null;
  onSelectAuthor: (author: string | null) => void;
  authorCounts: { author: string; count: number }[];
  selectedSeries: string | null;
  onSelectSeries: (series: string | null) => void;
  seriesList: { series: string; count: number }[];
  onReset: () => void;
}

export const SortFilterModal: React.FC<SortFilterModalProps> = ({
  isOpen,
  onClose,
  sortBy,
  onSelectSort,
  selectedAuthor,
  onSelectAuthor,
  authorCounts,
  selectedSeries,
  onSelectSeries,
  seriesList,
  onReset
}) => {
  const [authorSearch, setAuthorSearch] = useState('');

  if (!isOpen) return null;

  const filteredAuthors = authorCounts.filter((item) =>
    item.author.toLowerCase().includes(authorSearch.toLowerCase().trim())
  );

  const isCustomActive =
    sortBy !== 'recent' || selectedAuthor !== null || selectedSeries !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl text-slate-100 flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-5 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
              <SlidersHorizontal size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Filtros & Ordenação</h3>
              <p className="text-[11px] text-slate-400">Organize sua estante de livros</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isCustomActive && (
              <button
                onClick={onReset}
                className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-medium px-2 py-1 rounded-lg hover:bg-amber-500/10 transition-colors cursor-pointer"
                title="Restaurar padrão"
              >
                <RotateCcw size={12} />
                <span>Limpar</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1 -mr-1">
          {/* Ordenar Por */}
          <div>
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2.5">
              Ordenar por
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'title-asc' as const, label: 'Título: A → Z', icon: ArrowDownAZ },
                { id: 'title-desc' as const, label: 'Título: Z → A', icon: ArrowUpAZ },
                { id: 'recent' as const, label: 'Mais Recentes', icon: Clock },
                { id: 'progress' as const, label: 'Maior Progresso', icon: TrendingUp },
                { id: 'author-asc' as const, label: 'Autor: A → Z', icon: User }
              ].map((opt) => {
                const Icon = opt.icon;
                const isSelected = sortBy === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => onSelectSort(opt.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer text-left ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300 font-semibold shadow-xs'
                        : 'bg-slate-800/60 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={14} className={isSelected ? 'text-amber-400' : 'text-slate-400'} />
                      <span>{opt.label}</span>
                    </div>
                    {isSelected && <Check size={14} className="text-amber-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filtrar por Série (se houver) */}
          {seriesList.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers size={13} className="text-amber-400" />
                  <span>Séries & Continuações</span>
                </label>
                {selectedSeries && (
                  <button
                    onClick={() => onSelectSeries(null)}
                    className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                  >
                    Todas as séries
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
                <button
                  onClick={() => onSelectSeries(null)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    selectedSeries === null
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Todas
                </button>
                {seriesList.map((s) => {
                  const isSelected = selectedSeries === s.series;
                  return (
                    <button
                      key={s.series}
                      onClick={() => onSelectSeries(isSelected ? null : s.series)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                          : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <span>{s.series}</span>
                      <span className={`text-[10px] ${isSelected ? 'text-slate-950/80 font-bold' : 'text-slate-500'}`}>
                        ({s.count})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filtrar por Autor */}
          {authorCounts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <User size={13} className="text-amber-400" />
                  <span>Filtrar por Autor</span>
                </label>
                {selectedAuthor && (
                  <button
                    onClick={() => onSelectAuthor(null)}
                    className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                  >
                    Todos os autores
                  </button>
                )}
              </div>

              {/* Busca rápida de autor */}
              {authorCounts.length > 6 && (
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Buscar autor..."
                    value={authorSearch}
                    onChange={(e) => setAuthorSearch(e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-hidden focus:border-amber-500/50"
                  />
                </div>
              )}

              {/* Lista com scroll de autores */}
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1 rounded-xl bg-slate-950/40 p-1.5 border border-slate-800/60">
                <button
                  onClick={() => onSelectAuthor(null)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    selectedAuthor === null
                      ? 'bg-amber-500/20 text-amber-300 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <span>Todos os autores ({authorCounts.reduce((acc, c) => acc + c.count, 0)})</span>
                  {selectedAuthor === null && <Check size={14} className="text-amber-400" />}
                </button>

                {filteredAuthors.map((item) => {
                  const isSelected = selectedAuthor === item.author;
                  return (
                    <button
                      key={item.author}
                      onClick={() => onSelectAuthor(isSelected ? null : item.author)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left ${
                        isSelected
                          ? 'bg-amber-500/20 text-amber-300 font-semibold'
                          : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                      }`}
                    >
                      <span className="truncate pr-2">{item.author}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-slate-500 font-mono">
                          {item.count} {item.count === 1 ? 'livro' : 'livros'}
                        </span>
                        {isSelected && <Check size={14} className="text-amber-400" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-colors cursor-pointer text-center shadow-md"
          >
            Ver Livros
          </button>
        </div>
      </div>
    </div>
  );
};
