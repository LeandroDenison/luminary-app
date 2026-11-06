import React from 'react';
import { X, List, BookmarkCheck } from 'lucide-react';

export interface TocItem {
  id: string;
  label: string;
  href?: string;
  pageNumber?: number;
  subitems?: TocItem[];
}

interface TableOfContentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  toc: TocItem[];
  currentPage?: number;
  onSelectChapter: (item: TocItem) => void;
}

export const TableOfContentsModal: React.FC<TableOfContentsModalProps> = ({
  isOpen,
  onClose,
  toc,
  currentPage,
  onSelectChapter
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl text-slate-100 max-h-[82vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <List size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-base leading-tight">Índice & Capítulos</h3>
              <p className="text-[11px] text-slate-400">
                {toc.length > 0 ? `${toc.length} capítulos identificados` : 'Capítulos do livro'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </div>

        {/* Chapters List */}
        <div className="mt-3 overflow-y-auto flex-1 space-y-1.5 pr-1">
          {toc.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <List size={28} className="opacity-40" />
              <p>Nenhum capítulo identificado neste documento ainda.</p>
              <p className="text-[10px] text-slate-600">
                O analisador examina o livro conforme as páginas são carregadas.
              </p>
            </div>
          ) : (
            toc.map((item, idx) => {
              const isCurrent = currentPage && item.pageNumber === currentPage;
              return (
                <button
                  key={item.id || idx}
                  onClick={() => {
                    onSelectChapter(item);
                    onClose();
                  }}
                  className={`w-full text-left p-3 rounded-xl text-xs transition-colors flex items-center justify-between border ${
                    isCurrent
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-semibold'
                      : 'bg-slate-800/40 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden mr-2">
                    {isCurrent ? (
                      <BookmarkCheck size={14} className="text-amber-400 shrink-0" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                    )}
                    <span className="truncate">{item.label}</span>
                  </div>

                  {item.pageNumber && (
                    <span className="text-[10px] font-mono font-medium text-slate-500 shrink-0 bg-slate-800 px-2 py-0.5 rounded-md">
                      Pág. {item.pageNumber}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
