import React, { useEffect, useState } from 'react';
import { X, Cloud, CloudOff, RefreshCw, LogOut, UserPlus, AlertTriangle, CheckCircle2, FolderOpen, Info } from 'lucide-react';
import { GoogleAuth } from '../services/googleAuth';
import { DriveSync, type SyncStatus } from '../services/driveSync';
import { DriveApi } from '../services/driveApi';

interface DriveSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSynced: () => void;
}

function timeAgo(ts: number | null) {
  if (!ts) return 'nunca';
  const diff = Math.round((Date.now() - ts) / 1000);
  if (diff < 60) return 'agora mesmo';
  if (diff < 3600) return `há ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.round(diff / 3600)} h`;
  return new Date(ts).toLocaleString('pt-BR');
}

export const DriveSyncModal: React.FC<DriveSyncModalProps> = ({ isOpen, onClose, onSynced }) => {
  const [status, setStatus] = useState<SyncStatus>(DriveSync.getStatus());
  const [statusMsg, setStatusMsg] = useState<string | undefined>();
  const [email, setEmail] = useState<string | undefined>(GoogleAuth.getAccountEmail());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [folder, setFolder] = useState(DriveSync.getCachedFolder());
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [shareEmail, setShareEmail] = useState('');

  const configured = GoogleAuth.isConfigured();
  const connected = !!email;

  useEffect(() => {
    return DriveSync.subscribe((s, m) => {
      setStatus(s);
      setStatusMsg(m);
    });
  }, []);

  useEffect(() => {
    if (!isOpen || !connected) return;
    setFolder(DriveSync.getCachedFolder());
    if (DriveSync.getCachedFolder()?.ownedByMe) {
      DriveSync.listSharedWith().then(setSharedWith).catch(() => {});
    }
  }, [isOpen, connected]);

  if (!isOpen) return null;

  const runSync = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const r = await DriveSync.sync();
      setFolder(DriveSync.getCachedFolder());
      const parts = [];
      if (r.uploaded) parts.push(`${r.uploaded} enviado(s)`);
      if (r.imported) parts.push(`${r.imported} importado(s) do Drive`);
      if (r.updatedLocal) parts.push(`${r.updatedLocal} atualizado(s)`);
      if (r.removedLocal) parts.push(`${r.removedLocal} removido(s)`);
      setInfo(parts.length ? `Sincronizado: ${parts.join(', ')}.` : 'Tudo já estava sincronizado.');
      onSynced();
      if (DriveSync.getCachedFolder()?.ownedByMe) {
        DriveSync.listSharedWith().then(setSharedWith).catch(() => {});
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao sincronizar.');
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = async () => {
    setError(null);
    setBusy(true);
    try {
      const stored = await GoogleAuth.signIn();
      let accountEmail = stored.email;
      if (!accountEmail) {
        try {
          const user = await DriveApi.getUser();
          accountEmail = user.email;
          GoogleAuth.saveToken(stored.token, { email: user.email, name: user.name }, stored.expiresAt);
        } catch (uErr) {
          console.warn('Não foi possível obter detalhes do perfil:', uErr);
        }
      }
      setEmail(accountEmail || 'Conectado');
      setBusy(false);
      await runSync();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Não foi possível conectar à conta Google.');
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Desconectar do Google Drive? Os livros continuam salvos neste aparelho.')) return;
    await GoogleAuth.signOut();
    DriveSync.clearCache();
    setEmail(undefined);
    setFolder(null);
    setSharedWith([]);
    setInfo(null);
  };

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareEmail.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await DriveSync.shareFolder(shareEmail.trim());
      setSharedWith(await DriveSync.listSharedWith());
      setInfo(`Pasta compartilhada com ${shareEmail.trim()}. Agora é só ela conectar a conta dela no app.`);
      setShareEmail('');
    } catch (err: any) {
      setError(err?.message || 'Erro ao compartilhar a pasta.');
    } finally {
      setBusy(false);
    }
  };

  const needsReconnect = status === 'auth-required';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl text-slate-100 max-h-[88vh] overflow-y-auto flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
              <Cloud size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Nuvem — Google Drive</h3>
              <p className="text-[11px] text-slate-400">Livros, capas e progresso salvos no Drive</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800">
            <X size={20} />
          </button>
        </div>

        {!configured ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-200 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <AlertTriangle size={16} />
              <span>Falta configurar a credencial do Google</span>
            </div>
            <p className="leading-relaxed">
              Crie um <b>ID do cliente OAuth</b> no Google Cloud Console e coloque no arquivo{' '}
              <code className="bg-slate-800 px-1 rounded">.env.local</code> do projeto:
            </p>
            <pre className="bg-slate-950 p-2 rounded-lg text-emerald-300 overflow-x-auto">VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com</pre>
            <p className="text-amber-200/80">O passo a passo completo está no guia de configuração.</p>
          </div>
        ) : !connected ? (
          <div className="space-y-3">
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/60 text-xs text-slate-300 space-y-2 leading-relaxed">
              <p>Conecte uma conta Google para guardar a biblioteca no Drive. Tudo fica numa pasta chamada <b>"Luminary Leitor"</b>.</p>
              <p className="text-slate-400">
                💡 Se a pasta já foi compartilhada com você, o app encontra e usa a pasta compartilhada automaticamente.
              </p>
            </div>
            <button
              onClick={handleConnect}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-900 font-semibold py-3 rounded-xl text-sm transition-all active:scale-98 disabled:opacity-60"
            >
              {busy ? (
                <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                </svg>
              )}
              <span>Entrar com Google</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Account */}
            <div className="bg-slate-800/50 rounded-2xl p-3 border border-slate-700/60 flex items-center justify-between gap-2">
              <div className="overflow-hidden">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Conta conectada</p>
                <p className="text-sm font-medium truncate">{email}</p>
              </div>
              <button
                onClick={handleDisconnect}
                className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 shrink-0"
                title="Desconectar"
              >
                <LogOut size={16} />
              </button>
            </div>

            {/* Folder */}
            {folder && (
              <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-800 text-xs flex items-start gap-2">
                <FolderOpen size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-slate-200 font-medium">Pasta &quot;{folder.rootName || 'Luminary Leitor'}&quot;</p>
                  <p className="text-slate-400">
                    {folder.ownedByMe ? 'No seu Drive (você é o dono)' : `Compartilhada por ${folder.ownerEmail || 'outra conta'}`}
                  </p>
                </div>
              </div>
            )}

            {/* Sync status */}
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-slate-400 flex items-center gap-1.5">
                {status === 'syncing' ? (
                  <RefreshCw size={13} className="animate-spin text-sky-400" />
                ) : status === 'error' || needsReconnect ? (
                  <CloudOff size={13} className="text-rose-400" />
                ) : (
                  <CheckCircle2 size={13} className="text-emerald-400" />
                )}
                {status === 'syncing' ? statusMsg : `Última sincronização: ${timeAgo(DriveSync.getLastSync())}`}
              </span>
            </div>

            {needsReconnect ? (
              <button
                onClick={handleConnect}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60"
              >
                <RefreshCw size={16} />
                <span>Reconectar ao Google</span>
              </button>
            ) : (
              <button
                onClick={runSync}
                disabled={busy || status === 'syncing'}
                className="w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold py-2.5 rounded-xl text-sm transition-all active:scale-98 disabled:opacity-60"
              >
                <RefreshCw size={16} className={status === 'syncing' ? 'animate-spin' : ''} />
                <span>{status === 'syncing' ? 'Sincronizando...' : 'Sincronizar agora'}</span>
              </button>
            )}

            {/* Share (owner only) */}
            {folder?.ownedByMe && (
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <p className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <UserPlus size={14} className="text-amber-400" />
                  Compartilhar biblioteca
                </p>
                {sharedWith.length > 0 && (
                  <div className="text-[11px] text-slate-400 space-y-0.5">
                    {sharedWith.map((e) => (
                      <p key={e}>✓ {e}</p>
                    ))}
                  </div>
                )}
                <form onSubmit={handleShare} className="flex gap-2">
                  <input
                    type="email"
                    placeholder="E-mail Google dela"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-hidden focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={busy || !shareEmail.trim()}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-3 py-2 rounded-xl text-xs disabled:opacity-50"
                  >
                    Compartilhar
                  </button>
                </form>
              </div>
            )}

            <div className="text-[11px] text-slate-500 flex gap-1.5 leading-relaxed">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>
                Dica: PDFs e EPUBs colocados direto na pasta "Luminary Leitor" pelo site do Drive aparecem na estante na próxima sincronização.
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex flex-col gap-1.5">
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-400" />
              <span className="break-words font-medium">{error}</span>
            </div>
            {/16|reauth|Credential/i.test(error) && (
              <div className="mt-1 p-2 bg-slate-900/80 rounded-lg border border-rose-500/20 text-[11px] text-slate-300 space-y-1">
                <p className="font-semibold text-amber-300">💡 Como liberar o acesso no Google Cloud:</p>
                <p>1. Adicione a sua conta como <strong>Usuário de Teste</strong> na <em>Tela de Permissão OAuth</em>.</p>
                <p>2. Crie uma credencial de <strong>Aplicativo Android</strong> com:</p>
                <p className="text-[10px] font-mono bg-slate-950 p-1 rounded text-slate-400 select-all">
                  Pacote: com.luminary.reader<br />
                  SHA-1: 71:C7:2F:9B:BF:B6:15:61:11:B9:97:F1:11:B4:F0:C2:28:B9:AC:E7
                </p>
              </div>
            )}
          </div>
        )}
        {info && !error && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs">{info}</div>
        )}
      </div>
    </div>
  );
};
