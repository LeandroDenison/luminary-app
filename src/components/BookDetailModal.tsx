import React, { useState, useEffect } from 'react';
import { X, BookOpen, Trash2, CheckCircle2, Pencil, Check, Archive, ArchiveRestore, Quote, Sparkles, Layers } from 'lucide-react';
import { BookCover } from './BookCover';
import { QuoteCardModal } from './Reader/QuoteCardModal';
import { cleanBookTitleAndAuthor } from '../utils/textCleaner';
import { CoverLoader } from '../services/coverLoader';
import type { Book } from '../types';

interface BookDetailModalProps {
  book: Book | null;
  isOpen: boolean;
  onClose: () => void;
  onRead: (book: Book) => void;
  onDelete: (id: string) => void;
  onUpdate?: (book: Book) => void;
}

export const BookDetailModal: React.FC<BookDetailModalProps> = ({
  book,
  isOpen,
  onClose,
  onRead,
  onDelete,
  onUpdate
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editSeries, setEditSeries] = useState('');
  const [editVolume, setEditVolume] = useState('');
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);

  useEffect(() => {
    if (book) {
      setEditTitle(book.title);
      setEditAuthor(book.author);
      setEditSeries(book.series || '');
      setEditVolume(book.volume || '');
      setIsEditing(false);
      setIsSearchingWeb(false);
    }
  }, [book]);

  if (!isOpen || !book) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const handleSaveEdit = () => {
    if (!editTitle.trim()) return;
    const cleaned = cleanBookTitleAndAuthor(editTitle, editAuthor, editSeries);
    const updated: Book = {
      ...book,
      title: cleaned.title.trim(),
      author: cleaned.author.trim() || 'Autor desconhecido',
      series: editSeries.trim() || cleaned.series,
      volume: editVolume.trim() || cleaned.volume,
      updatedAt: Date.now()
    };
    if (onUpdate) onUpdate(updated);
    setIsEditing(false);
  };

  const handleSearchWeb = async () => {
    setIsSearchingWeb(true);
    try {
      const enriched = await CoverLoader.enrichSingleBook(book);
      if (onUpdate) onUpdate(enriched);
      setEditTitle(enriched.title);
      setEditAuthor(enriched.author);
      setEditSeries(enriched.series || '');
      setEditVolume(enriched.volume || '');
    } catch (e) {
      console.warn('Erro ao buscar dados na web:', e);
    } finally {
      setIsSearchingWeb(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl text-slate-100 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md font-bold">
              {book.format.toUpperCase()}
            </span>
            {book.isArchived && (
              <span className="text-[10px] font-medium uppercase bg-slate-800 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                <Archive size={11} /> Arquivado
              </span>
            )}
            {book.series && (
              <span className="text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 truncate max-w-[150px]">
                <Layers size={10} />
                <span className="truncate">{book.series}</span>
                {book.volume && <span>#{book.volume}</span>}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Book Cover and info */}
        <div className="flex gap-4 items-start">
          <div className="w-24 h-34 shrink-0 rounded-xl overflow-hidden bg-slate-800 shadow-lg border border-slate-700/50 flex items-center justify-center relative">
            <BookCover
              coverUrl={book.coverUrl}
              title={editTitle || book.title}
              author={editAuthor || book.author}
              className="w-full h-full"
            />
            {book.volume && (
              <span className="absolute bottom-1 right-1 text-[9px] font-bold bg-amber-500 text-slate-950 px-1 py-0.2 rounded shadow-xs">
                Vol. {book.volume}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-hidden">
            {isEditing ? (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-slate-400 font-medium">Título</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-hidden focus:border-amber-400"
                    placeholder="Título do livro"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-medium">Autor</label>
                  <input
                    type="text"
                    value={editAuthor}
                    onChange={(e) => setEditAuthor(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-hidden focus:border-amber-400"
                    placeholder="Autor do livro"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="text-[10px] text-slate-400 font-medium">Série</label>
                    <input
                      type="text"
                      value={editSeries}
                      onChange={(e) => setEditSeries(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-hidden focus:border-amber-400"
                      placeholder="Ex: A Torre Negra"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-medium">Volume</label>
                    <input
                      type="text"
                      value={editVolume}
                      onChange={(e) => setEditVolume(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-hidden focus:border-amber-400"
                      placeholder="Ex: 2"
                    />
                  </div>
                </div>
                <div className="flex gap-1.5 pt-1">
                  <button
                    onClick={handleSaveEdit}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold py-1 px-2 rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Check size={12} /> Salvar
                  </button>
                  <button
                    onClick={() => {
                      setEditTitle(book.title);
                      setEditAuthor(book.author);
                      setEditSeries(book.series || '');
                      setEditVolume(book.volume || '');
                      setIsEditing(false);
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-1 px-2 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-1">
                  <div>
                    {book.series && (
                      <p className="text-[10px] text-amber-400 font-semibold tracking-wide">
                        {book.series} {book.volume ? `· Livro ${book.volume}` : ''}
                      </p>
                    )}
                    <h3 className="font-bold text-base leading-snug line-clamp-2">{book.title}</h3>
                  </div>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-1 text-slate-400 hover:text-amber-400 transition-colors shrink-0"
                    title="Editar informações"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{book.author}</p>

                {/* Botão Buscar dados na Web */}
                <button
                  onClick={handleSearchWeb}
                  disabled={isSearchingWeb}
                  className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50"
                  title="Buscar autor oficial, capa em alta resolução e sinopse na web"
                >
                  <Sparkles size={12} className={isSearchingWeb ? 'animate-spin' : 'text-amber-400'} />
                  <span>{isSearchingWeb ? 'Buscando na Web...' : 'Completar Dados na Web'}</span>
                </button>

                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-400 h-full rounded-full transition-all"
                      style={{ width: `${book.progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-amber-400 font-medium">{book.progress}%</span>
                </div>

                {book.progress >= 100 && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                    <CheckCircle2 size={13} />
                    <span>Leitura Concluída</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Metadata info */}
        <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-800/80 text-xs space-y-1.5 text-slate-300">
          <div className="flex justify-between">
            <span className="text-slate-500">Tamanho:</span>
            <span>{formatFileSize(book.fileSize)}</span>
          </div>
          {book.totalPages && (
            <div className="flex justify-between">
              <span className="text-slate-500">Total de Páginas:</span>
              <span>{book.totalPages} páginas</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">Adicionado em:</span>
            <span>{new Date(book.addedAt).toLocaleDateString('pt-BR')}</span>
          </div>
          {book.lastReadAt && (
            <div className="flex justify-between">
              <span className="text-slate-500">Última leitura:</span>
              <span>{new Date(book.lastReadAt).toLocaleDateString('pt-BR')}</span>
            </div>
          )}
        </div>

        {/* Description if any */}
        {book.description && (
          <p className="text-xs text-slate-400 line-clamp-3 italic">
            "{book.description}"
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => {
              onClose();
              onRead(book);
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold py-3 px-4 rounded-xl text-sm shadow-lg shadow-amber-500/20 active:scale-98 transition-all cursor-pointer"
          >
            <BookOpen size={18} />
            <span>{book.progress > 0 ? 'Continuar Leitura' : 'Começar a Ler'}</span>
          </button>

          {/* Botão de Arquivar / Desarquivar */}
          <button
            onClick={() => {
              const nextArchived = !book.isArchived;
              if (onUpdate) {
                onUpdate({
                  ...book,
                  isArchived: nextArchived,
                  updatedAt: Date.now()
                });
              }
              onClose();
            }}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              book.isArchived
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border-slate-700/60'
            }`}
            title={book.isArchived ? 'Desarquivar (mover de volta para a estante)' : 'Arquivar (ocultar da estante)'}
          >
            {book.isArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
          </button>

          {/* Criar Card de Citação */}
          <button
            onClick={() => setShowQuoteModal(true)}
            className="p-3 bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-amber-300 rounded-xl border border-slate-700/60 transition-colors cursor-pointer"
            title="Criar Card de Citação para redes sociais"
          >
            <Quote size={18} />
          </button>

          <button
            onClick={() => {
              if (window.confirm(`Tem certeza que deseja excluir "${book.title}" da sua biblioteca?`)) {
                onDelete(book.id);
                onClose();
              }
            }}
            className="p-3 bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-700/60 transition-colors cursor-pointer"
            title="Excluir livro"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Quote Card Modal */}
      <QuoteCardModal
        isOpen={showQuoteModal}
        onClose={() => setShowQuoteModal(false)}
        bookTitle={book.title}
        bookAuthor={book.author}
        bookCoverUrl={book.coverUrl}
      />
    </div>
  );
};
