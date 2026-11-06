import React from 'react';
import { LuminaryIcon } from './LuminaryIcons';
import { Phone, MessageSquare, Compass, Camera, Music, Settings, Search, Sparkles } from 'lucide-react';

interface MobileHomeScreenProps {
  onLaunchApp: () => void;
}

export const MobileHomeScreen: React.FC<MobileHomeScreenProps> = ({ onLaunchApp }) => {
  const now = new Date();
  const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dateString = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const capitalizedDate = dateString.charAt(0).toUpperCase() + dateString.slice(1);

  return (
    <div className="relative w-full h-full bg-slate-950 text-white overflow-hidden flex flex-col justify-between p-5 select-none font-sans">
      {/* Wallpaper Fotográfico Abstrato Noturno */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-950 to-[#060810] opacity-90" />
      <div className="absolute -top-24 -left-24 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Clock & Weather Widget */}
      <div className="relative z-10 pt-10 px-2 flex flex-col items-center text-center animate-in fade-in duration-500">
        <h1 className="text-6xl font-light tracking-tight text-slate-100 drop-shadow-md">
          {timeString}
        </h1>
        <p className="text-xs font-medium text-amber-200/90 tracking-wide mt-1.5 drop-shadow-sm">
          {capitalizedDate}
        </p>

        {/* Google Search Widget Pill */}
        <div className="mt-6 w-full max-w-[280px] bg-slate-900/70 backdrop-blur-md border border-slate-700/50 rounded-full py-2.5 px-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="font-bold text-xs bg-gradient-to-r from-blue-400 via-rose-400 to-amber-400 bg-clip-text text-transparent">
              G
            </span>
            <span className="text-xs text-slate-400">Pesquisar...</span>
          </div>
          <Search size={14} className="text-slate-400" />
        </div>
      </div>

      {/* Main Apps Grid (incluindo o Luminary em destaque) */}
      <div className="relative z-10 px-2 py-4">
        {/* Banner de instrução */}
        <div className="mb-6 mx-auto max-w-[280px] text-center bg-amber-500/15 border border-amber-500/30 rounded-2xl py-2 px-3 shadow-lg animate-pulse">
          <p className="text-[11px] font-semibold text-amber-300 flex items-center justify-center gap-1.5">
            <Sparkles size={13} />
            <span>Toque no app Luminary abaixo!</span>
          </p>
        </div>

        <div className="grid grid-cols-4 gap-y-6 gap-x-2 text-center items-center justify-center">
          {/* APP 1: LUMINARY (EM GRANDE DESTAQUE) */}
          <div
            onClick={onLaunchApp}
            className="flex flex-col items-center gap-1.5 group cursor-pointer transition-transform active:scale-90"
          >
            <div className="relative w-15 h-15 rounded-2xl p-0.5 flex items-center justify-center shadow-2xl transition-all group-hover:scale-105 group-hover:shadow-amber-500/40">
              {/* Anel de destaque dourado */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-300 to-amber-600 animate-pulse opacity-75 blur-xs" />
              <div className="relative w-full h-full rounded-2xl overflow-hidden flex items-center justify-center bg-slate-900">
                <LuminaryIcon variant="cradled-spine" size={60} />
              </div>
            </div>
            <span className="text-[11px] font-bold text-amber-300 tracking-wide drop-shadow-sm group-hover:text-amber-200">
              Luminary
            </span>
          </div>

          {/* APP 2: Spotify */}
          <div className="flex flex-col items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg">
              <Music size={26} />
            </div>
            <span className="text-[10px] text-slate-300">Músicas</span>
          </div>

          {/* APP 3: Câmera */}
          <div className="flex flex-col items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 shadow-lg">
              <Camera size={26} />
            </div>
            <span className="text-[10px] text-slate-300">Câmera</span>
          </div>

          {/* APP 4: Configurações */}
          <div className="flex flex-col items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400 shadow-lg">
              <Settings size={26} />
            </div>
            <span className="text-[10px] text-slate-300">Ajustes</span>
          </div>
        </div>
      </div>

      {/* Bottom Dock */}
      <div className="relative z-10 mx-auto w-full max-w-[320px] bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-3 flex items-center justify-around shadow-2xl mb-2">
        <div className="w-11 h-11 rounded-2xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
          <Phone size={20} />
        </div>
        <div className="w-11 h-11 rounded-2xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
          <MessageSquare size={20} />
        </div>
        <div className="w-11 h-11 rounded-2xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <Compass size={20} />
        </div>
        <div
          onClick={onLaunchApp}
          className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-md shadow-amber-500/20"
          title="Abrir Luminary"
        >
          <LuminaryIcon variant="cradled-spine" size={32} showBackground={false} />
        </div>
      </div>
    </div>
  );
};
