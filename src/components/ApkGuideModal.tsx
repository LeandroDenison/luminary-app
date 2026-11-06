import React from 'react';
import { X, Smartphone, Terminal, Cpu } from 'lucide-react';

interface ApkGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApkGuideModal: React.FC<ApkGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl text-slate-100 max-h-[88vh] overflow-y-auto flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Cpu size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base">Compilação & Geração do APK</h3>
              <p className="text-[11px] text-slate-400">Como testar no celular e criar o instalador Android</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </div>

        {/* Option 1: Live Preview via Wi-Fi on Real Phone */}
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/60">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm mb-1.5">
            <Smartphone size={16} />
            <span>1. Testar agora no celular da sua namorada (via Wi-Fi)</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Como o servidor Vite roda com <code className="text-amber-300 bg-slate-800 px-1 rounded">host: true</code>, qualquer celular conectado na mesma rede Wi-Fi que o seu computador pode abrir o app diretamente pelo navegador do celular!
          </p>
          <div className="mt-2.5 p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 flex items-center justify-between">
            <span>http://[SEU-IP-LOCAL]:5173</span>
            <span className="text-[10px] text-slate-500 font-sans">Acesse pelo Chrome no celular</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            💡 <b>Dica</b>: No Chrome do celular, ela pode clicar nos 3 pontinhos e selecionar <b>"Adicionar à tela inicial"</b>. O app se comporta exatamente como um aplicativo nativo instalado!
          </p>
        </div>

        {/* Option 2: Capacitor Native APK */}
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/60">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm mb-1.5">
            <Terminal size={16} />
            <span>2. Gerar o arquivo .APK nativo com Capacitor</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Podemos adicionar o suporte ao <b>Capacitor Android</b> com um clique de comando aqui no chat:
          </p>
          <div className="mt-2.5 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 space-y-1">
            <p className="text-slate-500"># 1. Compilar os arquivos do app</p>
            <p className="text-emerald-400">npm run build</p>
            <p className="text-slate-500 mt-2"># 2. Adicionar o módulo nativo Android</p>
            <p className="text-emerald-400">npx cap add android</p>
            <p className="text-slate-500 mt-2"># 3. Gerar o arquivo APK</p>
            <p className="text-emerald-400">cd android && ./gradlew assembleDebug</p>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            O arquivo compilado <b>app-debug.apk</b> ficará pronto para ser enviado pelo WhatsApp ou cabo USB para o celular dela!
          </p>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-xl text-xs transition-colors"
        >
          Entendido, fechar
        </button>
      </div>
    </div>
  );
};
