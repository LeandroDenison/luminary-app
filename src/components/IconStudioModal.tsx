import React from 'react';
import { X, Check, Palette, Eye } from 'lucide-react';
import { LuminaryIcon, ICON_CONCEPTS, type IconVariant } from './LuminaryIcons';

interface IconStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVariant: IconVariant;
  onSelectVariant: (variant: IconVariant) => void;
}

export const IconStudioModal: React.FC<IconStudioModalProps> = ({
  isOpen,
  onClose,
  selectedVariant,
  onSelectVariant
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center">
              <Palette size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Estúdio de Ícones Luminary
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Conceito L + Livro
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                A letra L com o livro aninhado no encontro das linhas. Escolha e teste em tempo real!
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Live Active Preview Banner */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-950 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LuminaryIcon variant={selectedVariant} size={42} />
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">Ícone Ativo no App</span>
              <p className="text-xs font-bold text-white">
                {ICON_CONCEPTS.find((c) => c.id === selectedVariant)?.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
            <Eye size={14} className="text-amber-400" />
            <span>Atualiza na hora no app</span>
          </div>
        </div>

        {/* Grid of Icon Concepts */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ICON_CONCEPTS.map((concept) => {
              const isSelected = selectedVariant === concept.id;
              return (
                <div
                  key={concept.id}
                  onClick={() => onSelectVariant(concept.id)}
                  className={`relative p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/50'
                      : 'bg-slate-800/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80'
                  }`}
                >
                  {/* Selected Badge */}
                  {isSelected && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-md">
                      <Check size={12} /> Ativo
                    </div>
                  )}

                  <div>
                    {/* Visual Comparison: Big + Medium + Topbar Scale */}
                    <div className="flex items-center justify-around py-3 px-2 bg-slate-950/80 rounded-xl border border-slate-800/60 mb-3">
                      <div className="text-center">
                        <LuminaryIcon variant={concept.id} size={64} />
                        <span className="text-[9px] text-slate-500 block mt-1 font-mono">64px (App)</span>
                      </div>
                      <div className="text-center">
                        <LuminaryIcon variant={concept.id} size={40} />
                        <span className="text-[9px] text-slate-500 block mt-1 font-mono">40px</span>
                      </div>
                      <div className="text-center">
                        <LuminaryIcon variant={concept.id} size={28} />
                        <span className="text-[9px] text-slate-500 block mt-1 font-mono">28px (Topo)</span>
                      </div>
                    </div>

                    <h3 className="font-bold text-sm text-white group-hover:text-amber-300 transition-colors">
                      {concept.name}
                    </h3>
                    <p className="text-[11px] font-medium text-amber-400/90 mt-0.5">
                      {concept.tagline}
                    </p>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      {concept.description}
                    </p>
                  </div>

                  {/* Apply Button */}
                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      {isSelected ? 'Já aplicado no app' : 'Clique para testar'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectVariant(concept.id);
                      }}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'bg-slate-700/80 hover:bg-amber-500 hover:text-slate-950 text-slate-200'
                      }`}
                    >
                      {isSelected ? 'Selecionado' : 'Testar Este'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0 text-xs text-slate-400">
          <span>💡 O ícone selecionado permanece salvo para você navegar e ler.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-xl transition-all cursor-pointer shadow-md"
          >
            Concluir Teste
          </button>
        </div>
      </div>
    </div>
  );
};
