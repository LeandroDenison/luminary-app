import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';

/**
 * Escopo de acesso ao Drive.
 * Usamos `drive.file` (não confidencial) que permite criar e gerenciar
 * a pasta "Luminary Leitor" e todos os livros e sincronizações criados pelo app.
 */
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const TOKEN_KEY = 'luminary_google_token';

export const GOOGLE_CLIENT_ID: string =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || '762551870735-hgsio2ks31s6gn0r702n1tij9ib6tren.apps.googleusercontent.com';

interface StoredToken {
  token: string;
  expiresAt: number;
  email?: string;
  name?: string;
}

let initialized = false;
let refreshingPromise: Promise<string | null> | null = null;

export const GoogleAuth = {
  isConfigured(): boolean {
    return !!GOOGLE_CLIENT_ID;
  },

  async init(): Promise<void> {
    if (initialized || !GOOGLE_CLIENT_ID) return;
    try {
      await SocialLogin.initialize({
        google: {
          webClientId: GOOGLE_CLIENT_ID,
          mode: 'online'
        }
      });
      initialized = true;
    } catch (e) {
      console.warn('SocialLogin.initialize:', e);
    }
  },

  getStored(): StoredToken | null {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      return raw ? (JSON.parse(raw) as StoredToken) : null;
    } catch {
      return null;
    }
  },

  /** True if the user connected a Google account at some point */
  isConnected(): boolean {
    return !!this.getStored();
  },

  getAccountEmail(): string | undefined {
    return this.getStored()?.email;
  },

  saveToken(token: string, extra?: Partial<StoredToken>, expiresAt?: number) {
    const prev = this.getStored();
    const data: StoredToken = {
      token,
      expiresAt: expiresAt ?? Date.now() + 55 * 60 * 1000,
      email: extra?.email ?? prev?.email,
      name: extra?.name ?? prev?.name
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(data));
  },

  /** Interactive login (must be called from a user tap/click) */
  async signIn(): Promise<StoredToken> {
    await this.init();

    let res: any;
    try {
      res = await SocialLogin.login({
        provider: 'google',
        options: {
          scopes: [DRIVE_SCOPE],
          ...(Capacitor.isNativePlatform() ? {} : { prompt: 'select_account' as const })
        }
      });
    } catch (loginErr: any) {
      const msg = loginErr?.message || String(loginErr);
      if (/cancel|dismiss|closed/i.test(msg)) {
        throw new Error('Seleção de conta Google cancelada.');
      }
      throw new Error(`Falha ao autenticar com o Google: ${msg}`);
    }

    const result: any = res?.result || res || {};
    const token: string | undefined =
      (typeof result?.accessToken === 'string' ? result.accessToken : result?.accessToken?.token) ||
      (typeof result?.token === 'string' ? result.token : undefined) ||
      (typeof result?.idToken === 'string' ? result.idToken : undefined);

    if (!token) {
      throw new Error('O Google não devolveu permissão de acesso ao Drive.');
    }

    let expiresAt: number | undefined;
    const expiresVal = result?.accessToken?.expires || result?.expires;
    if (expiresVal) {
      const parsed = Date.parse(expiresVal);
      if (!isNaN(parsed)) expiresAt = parsed - 60 * 1000;
    }

    this.saveToken(
      token,
      {
        email: result?.profile?.email ?? undefined,
        name: result?.profile?.name ?? undefined
      },
      expiresAt
    );

    return this.getStored()!;
  },

  /**
   * Tenta renovar o token de acesso silenciosamente em segundo plano,
   * sem abrir diálogos ou solicitar aprovação manual do usuário.
   */
  async refreshTokenSilently(): Promise<string | null> {
    if (refreshingPromise) return refreshingPromise;

    refreshingPromise = (async () => {
      try {
        await this.init();
        const res: any = await SocialLogin.login({
          provider: 'google',
          options: {
            scopes: [DRIVE_SCOPE]
          }
        });

        const result: any = res?.result || res || {};
        const token: string | undefined =
          (typeof result?.accessToken === 'string' ? result.accessToken : result?.accessToken?.token) ||
          (typeof result?.token === 'string' ? result.token : undefined) ||
          (typeof result?.idToken === 'string' ? result.idToken : undefined);

        if (token) {
          let expiresAt: number | undefined;
          const expiresVal = result?.accessToken?.expires || result?.expires;
          if (expiresVal) {
            const parsed = Date.parse(expiresVal);
            if (!isNaN(parsed)) expiresAt = parsed - 60 * 1000;
          }

          this.saveToken(
            token,
            {
              email: result?.profile?.email ?? undefined,
              name: result?.profile?.name ?? undefined
            },
            expiresAt
          );
          console.log('[GoogleAuth] Token renovado silenciosamente com sucesso!');
          return token;
        }
      } catch (err) {
        console.warn('[GoogleAuth] Renovação silenciosa falhou:', err);
      }
      return null;
    })().finally(() => {
      refreshingPromise = null;
    });

    return refreshingPromise;
  },

  /**
   * Retorna um token válido. Se expirado ou prestes a expirar,
   * renova automaticamente e de forma transparente.
   */
  async getAccessToken(): Promise<string | null> {
    const stored = this.getStored();
    if (!stored) return null;

    // Se o token ainda tem mais de 3 minutos de validade, usa direto
    if (stored.expiresAt > Date.now() + 3 * 60 * 1000) {
      return stored.token;
    }

    // Perto de expirar ou expirado: tenta renovar silenciosamente
    const refreshed = await this.refreshTokenSilently();
    if (refreshed) {
      return refreshed;
    }

    // Se a renovação silenciosa falhou por falta temporária de rede,
    // ainda tenta usar o token existente como fallback
    return stored.token || null;
  },

  /** Marca o token como inválido caso uma reautenticação manual seja estritamente exigida */
  invalidateToken() {
    const stored = this.getStored();
    if (stored) {
      stored.expiresAt = 0;
      localStorage.setItem(TOKEN_KEY, JSON.stringify(stored));
    }
  },

  async signOut(): Promise<void> {
    localStorage.removeItem(TOKEN_KEY);
    try {
      await this.init();
      await SocialLogin.logout({ provider: 'google' });
    } catch {
      // ignore
    }
  }
};
