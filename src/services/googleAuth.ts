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

  /** True if the user connected a Google account at some point (token may be expired) */
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

    // Limpa estado residual anterior para permitir trocar ou reconectar a conta sem travar
    try {
      await SocialLogin.logout({ provider: 'google' });
    } catch {
      // Ignora erro de logout se não havia sessão
    }

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
   * Returns a valid access token, or null if the user needs to sign in again.
   * On Android, tries to silently get a fresh token.
   */
  async getAccessToken(): Promise<string | null> {
    const stored = this.getStored();
    if (!stored) return null;

    if (stored.expiresAt > Date.now()) {
      return stored.token;
    }

    // Token expired: try silent refresh on native platforms
    if (Capacitor.isNativePlatform()) {
      try {
        await this.init();
        const code = await SocialLogin.getAuthorizationCode({ provider: 'google' });
        const newToken = (typeof code.accessToken === 'string' ? code.accessToken : (code as any).accessToken?.token);
        if (newToken) {
          this.saveToken(newToken);
          return newToken;
        }
      } catch (err) {
        console.warn('Falha ao renovar token Google silenciosamente:', err);
      }
    }

    return null;
  },

  /** Marks the current token as invalid (e.g. after a 401 from the API) */
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
