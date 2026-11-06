import React from 'react';
import { X, Sun, Moon, BookOpen, Scroll, Type, Bookmark as BookmarkIcon } from 'lucide-react';
import type { ReadingMode, ReaderTheme, Bookmark, ReaderFontFamily, ReaderLineHeight, ReaderMarginSize } from '../../types';

interface ReaderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  readingMode: ReadingMode;
  onChangeReadingMode: (mode: ReadingMode) => void;
  theme: ReaderTheme;
  onChangeTheme: (theme: ReaderTheme) => void;
  fontSize: number;
  onChangeFontSize: (size: number) => void;
  fontFamily?: ReaderFontFamily;
  onChangeFontFamily?: (font: ReaderFontFamily) => void;
  lineHeight?: ReaderLineHeight;
  onChangeLineHeight?: (lh: ReaderLineHeight) => void;
  marginSize?: ReaderMarginSize;
  onChangeMarginSize?: (m: ReaderMarginSize) => void;
  brightness: number;
  onChangeBrightness: (b: number) => void;
  bookmarks: Bookmark[];
  onAddBookmark: () => void;
  onJumpToBookmark: (pageOrCfi: string | number) => void;
  onDeleteBookmark: (id: string) => void;
  format: 'pdf' | 'epub';
}

export const ReaderSettingsModal: React.FC<ReaderSettingsModalProps> = ({
  isOpen,
  onClose,
  readingMode,
  onChangeReadingMode,
  theme,
  onChangeTheme,
  fontSize,
  onChangeFontSize,
  fontFamily = 'literata',
  onChangeFontFamily,
  lineHeight = 1.6,
  onChangeLineHeight,
  marginSize = 'medium',
  onChangeMarginSize,
  brightness,
  onChangeBrightness,
  bookmarks,
  onAddBookmark,
  onJumpToBookmark,
  onDeleteBookmark,
  format
}) => {
  if (!isOpen) return null;

  const themes: { id: ReaderTheme; name: string; bg: string; text: string; icon: any }[] = [
    { id: 'light', name: 'Claro', bg: 'bg-white', text: 'text-slate-800', icon: Sun },
    { id: 'sepia', name: 'Sépia', bg: 'bg-[#fbf0d9]', text: 'text-[#5f4b32]', icon: BookOpen },
    { id: 'dark', name: 'Escuro', bg: 'bg-[#1e1e24]', text: 'text-slate-200', icon: Moon },
    { id: 'amoled', name: 'AMOLED', bg: 'bg-black', text: 'text-zinc-300', icon: Moon }
  ];

  const fontOptions: { id: ReaderFontFamily; name: string; fontClass: string; desc: string }[] = [
    { id: 'literata', name: 'Literata', fontClass: 'font-literata', desc: 'Google Play Books' },
    { id: 'merriweather', name: 'Merriweather', fontClass: 'font-merriweather', desc: 'Serifada clássica' },
    { id: 'lora', name: 'Lora', fontClass: 'font-lora', desc: 'Elegante e suave' },
    { id: 'atkinson', name: 'Atkinson', fontClass: 'font-atkinson', desc: 'Alta legibilidade' },
    { id: 'inter', name: 'Inter', fontClass: 'font-inter', desc: 'Sans-serif moderna' },
    { id: 'system', name: 'Sistema', fontClass: 'font-system', desc: 'Padrão do aparelho' }
  ];

  const lineHeights: { val: ReaderLineHeight; label: string }[] = [
    { val: 1.4, label: '1.4x' },
    { val: 1.6, label: '1.6x' },
    { val: 1.8, label: '1.8x' },
    { val: 2.0, label: '2.0x' }
  ];

  const margins: { id: ReaderMarginSize; label: string }[] = [
    { id: 'small', label: 'Estreita' },
    { id: 'medium', label: 'Média' },
    { id: 'large', label: 'Ampla' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl text-slate-100 max-h-[88vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <h3 className="font-semibold text-base">Preferências de Leitura</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* ☀️ Controle de Brilho da Tela */}
        <div className="mt-4 bg-slate-800/40 p-3 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
              <Sun size={13} className="text-amber-400" />
              <span>Brilho da Tela</span>
            </span>
            <span className="text-xs text-amber-400 font-mono font-medium">{brightness}%</span>
          </div>
          <div className="flex items-center gap-3">
            <Sun size={14} className="text-slate-500" />
            <input
              type="range"
              min="20"
              max="100"
              step="1"
              value={brightness}
              onChange={(e) => onChangeBrightness(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <Sun size={20} className="text-amber-400" />
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5 italic">
            💡 Dica: você também pode deslizar o dedo na borda esquerda da tela para ajustar o brilho na hora.
          </p>
        </div>

        {/* Modo de Passar a Página */}
        <div className="mt-5">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-2">
            Modo de Passar a Página
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onChangeReadingMode('paginated')}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                readingMode === 'paginated'
                  ? 'border-amber-500 bg-amber-500/15 text-amber-300 ring-1 ring-amber-500'
                  : 'border-slate-800 bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <BookOpen size={18} />
              <span>Arrastar / Livro</span>
            </button>

            <button
              onClick={() => onChangeReadingMode('scroll')}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                readingMode === 'scroll'
                  ? 'border-amber-500 bg-amber-500/15 text-amber-300 ring-1 ring-amber-500'
                  : 'border-slate-800 bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Scroll size={18} />
              <span>Scroll Infinito</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5 px-1">
            {readingMode === 'paginated'
              ? 'Toque nas laterais ou deslize o dedo para virar a folha.'
              : 'Role para baixo suavemente como uma página contínua.'}
          </p>
        </div>

        {/* Temas visuais de leitura */}
        <div className="mt-5">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-2">
            Tema de Leitura
          </label>
          <div className="grid grid-cols-4 gap-2">
            {themes.map((t) => {
              const Icon = t.icon;
              const isSelected = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => onChangeTheme(t.id)}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected ? 'border-amber-500 ring-2 ring-amber-500/40' : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-xs ${t.bg} ${t.text}`}>
                    <Icon size={16} />
                  </div>
                  <span className={`text-xs ${isSelected ? 'text-amber-300 font-medium' : 'text-slate-400'}`}>
                    {t.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Configurações Tipográficas para EPUB */}
        {format === 'epub' && (
          <>
            {/* Seletor de Fontes */}
            <div className="mt-5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-2">
                Tipografia & Fonte
              </label>
              <div className="grid grid-cols-3 gap-2">
                {fontOptions.map((f) => {
                  const isSelected = fontFamily === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => onChangeFontFamily && onChangeFontFamily(f.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-amber-500 bg-amber-500/15 ring-1 ring-amber-500'
                          : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800'
                      }`}
                    >
                      <span className={`text-sm ${f.fontClass} ${isSelected ? 'text-amber-300 font-bold' : 'text-slate-200'}`}>
                        {f.name}
                      </span>
                      <span className="text-[9px] text-slate-400 truncate mt-0.5">
                        {f.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tamanho da Fonte */}
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Tamanho da Letra
                </label>
                <span className="text-xs text-amber-400 font-mono font-medium">{fontSize}px</span>
              </div>
              <div className="flex items-center gap-3 bg-slate-800/50 p-2 rounded-xl border border-slate-800">
                <Type size={14} className="text-slate-400" />
                <input
                  type="range"
                  min="13"
                  max="28"
                  step="1"
                  value={fontSize}
                  onChange={(e) => onChangeFontSize(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <Type size={22} className="text-slate-400" />
              </div>
            </div>

            {/* Espaçamento entre Linhas & Margens */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              {/* Entrelinha */}
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-2">
                  Espaçamento
                </label>
                <div className="grid grid-cols-4 gap-1 bg-slate-800/50 p-1 rounded-xl border border-slate-800">
                  {lineHeights.map((lh) => (
                    <button
                      key={lh.val}
                      onClick={() => onChangeLineHeight && onChangeLineHeight(lh.val)}
                      className={`py-1.5 text-center text-xs rounded-lg transition-all cursor-pointer ${
                        lineHeight === lh.val
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {lh.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Margens */}
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-2">
                  Margens Laterais
                </label>
                <div className="grid grid-cols-3 gap-1 bg-slate-800/50 p-1 rounded-xl border border-slate-800">
                  {margins.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onChangeMarginSize && onChangeMarginSize(m.id)}
                      className={`py-1.5 text-center text-xs rounded-lg transition-all cursor-pointer truncate ${
                        marginSize === m.id
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Marcadores de Página */}
        <div className="mt-5 pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Marcadores ({bookmarks.length})
            </label>
            <button
              onClick={onAddBookmark}
              className="flex items-center gap-1 text-xs bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30 transition-colors cursor-pointer"
            >
              <BookmarkIcon size={12} />
              <span>Marcar Atual</span>
            </button>
          </div>

          {bookmarks.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">Nenhum marcador salvo ainda.</p>
          ) : (
            <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
              {bookmarks.map((bm) => (
                <div
                  key={bm.id}
                  className="flex items-center justify-between bg-slate-800/60 hover:bg-slate-800 p-2 rounded-lg text-xs"
                >
                  <button
                    onClick={() => {
                      onJumpToBookmark(bm.pageOrCfi);
                      onClose();
                    }}
                    className="text-left font-medium text-slate-300 hover:text-amber-300 flex-1 truncate cursor-pointer"
                  >
                    {bm.label}
                  </button>
                  <button
                    onClick={() => onDeleteBookmark(bm.id)}
                    className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                    title="Remover"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
