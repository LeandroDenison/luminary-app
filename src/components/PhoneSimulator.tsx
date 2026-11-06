import React, { useState, useEffect } from 'react';
import { Smartphone, Monitor, RotateCw, Wifi, BatteryCharging, DownloadCloud } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

interface PhoneSimulatorProps {
  children: React.ReactNode;
  onOpenApkGuide: () => void;
}

export const PhoneSimulator: React.FC<PhoneSimulatorProps> = ({ children, onOpenApkGuide }) => {
  // Detecta se é o aplicativo nativo (APK) OU celular real
  const isRealMobile = Capacitor.isNativePlatform() || (typeof window !== 'undefined' && (
    window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  ));

  const [isPhoneFrame, setIsPhoneFrame] = useState(!isRealMobile);
  const [isLandscape, setIsLandscape] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  // Se for celular real, renderiza 100% da tela sem moldura falsa de celular
  if (isRealMobile) {
    return (
      <div className="w-full h-full bg-slate-950 text-slate-100 overflow-hidden">
        {children}
      </div>
    );
  }

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-screen h-screen flex flex-col bg-[#07090e] text-slate-100 overflow-hidden select-none">
      {/* Top Simulator Control Bar */}
      <header className="h-12 bg-slate-900/90 border-b border-slate-800/80 px-4 flex items-center justify-between shrink-0 z-40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold tracking-wide text-slate-200">
              Leitor Luminary Mobile
            </span>
          </div>

          <div className="hidden sm:flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60 text-xs">
            <button
              onClick={() => setIsPhoneFrame(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                isPhoneFrame
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Simular visual no celular"
            >
              <Smartphone size={14} />
              <span>Simulador Celular</span>
            </button>
            <button
              onClick={() => setIsPhoneFrame(false)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                !isPhoneFrame
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Expandir para tela cheia"
            >
              <Monitor size={14} />
              <span>Tela Cheia</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPhoneFrame && (
            <button
              onClick={() => setIsLandscape((prev) => !prev)}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg text-xs border border-slate-700/80 transition-colors"
              title="Rotacionar orientação"
            >
              <RotateCw size={13} />
              <span className="hidden md:inline">{isLandscape ? 'Retrato' : 'Paisagem'}</span>
            </button>
          )}

          <button
            onClick={onOpenApkGuide}
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium px-3 py-1 rounded-lg text-xs shadow-md transition-all active:scale-95"
            title="Como compilar e gerar o arquivo APK"
          >
            <DownloadCloud size={14} />
            <span>Gerar APK Android</span>
          </button>
        </div>
      </header>

      {/* Simulator Canvas / Background Area */}
      <div className="flex-1 w-full h-full flex items-center justify-center p-2 sm:p-4 overflow-hidden bg-radial from-slate-900 to-[#07090e]">
        {isPhoneFrame ? (
          /* Realistic Smartphone Bezel */
          <div
            className={`relative transition-all duration-300 ease-out bg-slate-950 border-[10px] border-slate-800 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] rounded-[44px] overflow-hidden flex flex-col ring-1 ring-white/10 ${
              isLandscape
                ? 'w-[780px] max-w-[95vw] h-[400px] max-h-[85vh]'
                : 'w-[390px] max-w-[95vw] h-[780px] max-h-[88vh]'
            }`}
          >
            {/* Phone Notch / Dynamic Island */}
            {!isLandscape && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-900 rounded-full z-50 flex items-center justify-center gap-2 border border-slate-800/80">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-950 border border-slate-800" />
                <div className="w-1.5 h-1.5 rounded-full bg-blue-950" />
              </div>
            )}

            {/* Simulated Phone Status Bar */}
            <div className="h-7 bg-slate-950 px-6 pt-1 flex items-center justify-between text-[11px] font-medium text-slate-400 select-none shrink-0 z-40">
              <span>{currentTime}</span>
              <div className="flex items-center gap-2">
                <Wifi size={12} />
                <span className="text-[10px]">5G</span>
                <div className="flex items-center gap-0.5 text-emerald-400">
                  <span className="text-[10px]">100%</span>
                  <BatteryCharging size={13} />
                </div>
              </div>
            </div>

            {/* App Screen Container */}
            <div className="flex-1 w-full h-full relative overflow-hidden bg-slate-950">
              {children}
            </div>

            {/* Bottom Home Indicator Bar (Android / iOS) */}
            <div className="h-4 bg-slate-950 flex items-center justify-center shrink-0">
              <div className="w-32 h-1 bg-slate-700/80 rounded-full" />
            </div>
          </div>
        ) : (
          /* Full Screen View */
          <div className="w-full h-full rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
            {children}
          </div>
        )}
      </div>
    </div>
  );
};
