import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

/**
 * URL do manifesto de versão pública no GitHub Pages.
 */
const UPDATE_MANIFEST_URL = import.meta.env.VITE_UPDATE_URL || 'https://leandrodenison.github.io/luminary-app/version.json';

export const CURRENT_APP_VERSION = '1.0.24';

export type LiveUpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'updated' | 'error';

export interface UpdateInfo {
  hasUpdate: boolean;
  version?: string;
  error?: string;
}

type Listener = (status: LiveUpdateStatus, version?: string, error?: string) => void;
const listeners = new Set<Listener>();
let currentStatus: LiveUpdateStatus = 'idle';
let targetVersion: string | undefined;
let lastError: string | undefined;

function setStatus(status: LiveUpdateStatus, ver?: string, err?: string) {
  currentStatus = status;
  if (ver) targetVersion = ver;
  lastError = err;
  listeners.forEach((cb) => cb(currentStatus, targetVersion, lastError));
}

export const LiveUpdater = {
  subscribe(cb: Listener): () => void {
    listeners.add(cb);
    cb(currentStatus, targetVersion, lastError);
    return () => listeners.delete(cb);
  },

  async getRunningVersion(): Promise<string> {
    if (!Capacitor.isNativePlatform()) return CURRENT_APP_VERSION;
    try {
      const current = await CapacitorUpdater.current();
      return current?.bundle?.version || CURRENT_APP_VERSION;
    } catch {
      return CURRENT_APP_VERSION;
    }
  },

  getStatus(): LiveUpdateStatus {
    return currentStatus;
  },

  getLastError(): string | undefined {
    return lastError;
  },

  /**
   * Comunica ao sistema nativo que o app carregou com sucesso.
   * Evita que o plugin faça rollback automático de versão por timeout.
   */
  async notifyReady(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await CapacitorUpdater.notifyAppReady();
      setStatus('updated', CURRENT_APP_VERSION);
    } catch (err) {
      console.warn('[LiveUpdater] notifyAppReady:', err);
    }
  },

  /**
   * Recarrega o app imediatamente para aplicar a atualização baixada.
   */
  async applyUpdateNow(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await CapacitorUpdater.reload();
        return;
      } catch (err) {
        console.warn('Erro ao recarregar via CapacitorUpdater:', err);
      }
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  },

  /**
   * Checa se há atualização disponível no GitHub e aplica.
   * @param isManual Se disparado pelo usuário manualmente para exibir alerts
   */
  async checkForUpdates(isManual = false): Promise<UpdateInfo> {
    if (!Capacitor.isNativePlatform() || !UPDATE_MANIFEST_URL) {
      if (isManual) {
        alert('As atualizações OTA operam exclusivamente no aplicativo instalado no celular.');
      }
      return { hasUpdate: false };
    }

    try {
      setStatus('checking');
      const res = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`);
      if (!res.ok) {
        const msg = `Falha ao conectar ao servidor de versões (HTTP ${res.status})`;
        setStatus('error', undefined, msg);
        if (isManual) alert(msg);
        return { hasUpdate: false, error: msg };
      }

      const data = await res.json();
      if (!data?.version || !data?.url) {
        const msg = 'Manifesto de atualização inválido.';
        setStatus('error', undefined, msg);
        if (isManual) alert(msg);
        return { hasUpdate: false, error: msg };
      }

      const current = await CapacitorUpdater.current();
      const currentVer = current?.bundle?.version || CURRENT_APP_VERSION;

      console.log(`[LiveUpdater] Versão instalada: ${currentVer} | Remota: ${data.version}`);

      // Se a versão remota for diferente da atual
      if (data.version !== currentVer && data.version !== CURRENT_APP_VERSION) {
        setStatus('downloading', data.version);
        if (isManual) {
          console.log(`Baixando atualização ${data.version}...`);
        }

        // CHECKSUM É OBRIGATÓRIO NO NATIVO ANDROID!
        const bundle = await CapacitorUpdater.download({
          url: data.url,
          version: data.version,
          checksum: data.checksum || ''
        });

        console.log('[LiveUpdater] Download concluído! Ativando:', bundle.id);
        setStatus('ready', data.version);

        // Ativa imediatamente e recarrega a tela na hora com o novo código
        try {
          await CapacitorUpdater.set({ id: bundle.id });
          await CapacitorUpdater.reload();
        } catch (setErr) {
          console.warn('Falha no set(), agendando para próximo reinício:', setErr);
          await CapacitorUpdater.next({ id: bundle.id });
        }

        return { hasUpdate: true, version: data.version };
      } else {
        setStatus('updated', currentVer);
        if (isManual) {
          alert(`Você já está na versão mais recente (v${currentVer})! Nenhuma atualização pendente.`);
        }
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[LiveUpdater] Erro ao buscar atualização:', err);
      setStatus('error', undefined, msg);
      if (isManual) {
        alert(`Erro na atualização OTA: ${msg}`);
      }
      return { hasUpdate: false, error: msg };
    }

    return { hasUpdate: false };
  }
};
