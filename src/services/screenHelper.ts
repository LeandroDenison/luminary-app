import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

export const ScreenHelper = {
  /**
   * Oculta a barra de status e ativa tela cheia imersiva durante a leitura.
   */
  async hideStatusBar(): Promise<void> {
    // 1. Tenta ocultar via plugin nativo do Capacitor
    if (Capacitor.isPluginAvailable('StatusBar')) {
      try {
        await StatusBar.hide();
      } catch {
        // Ignora caso não suporte no ambiente
      }
    }

    // 2. Tenta Fullscreen API padrão do navegador/WebView
    try {
      if (typeof document !== 'undefined' && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignora erro de permissão caso o navegador bloqueie
    }
  },

  /**
   * Restaura a barra de status e desativa a tela cheia.
   */
  async showStatusBar(): Promise<void> {
    // 1. Restaura plugin nativo do Capacitor
    if (Capacitor.isPluginAvailable('StatusBar')) {
      try {
        await StatusBar.show();
      } catch {
        // Ignora
      }
    }

    // 2. Restaura Fullscreen API padrão
    try {
      if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignora
    }
  }
};
