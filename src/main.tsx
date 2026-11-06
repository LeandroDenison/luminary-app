import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import './index.css'
import App from './App.tsx'

// Confirma imediatamente ao plugin Capgo Updater que o bundle web inicializou sem erros,
// evitando qualquer rollback automático para versões antigas.
if (Capacitor.isNativePlatform()) {
  CapacitorUpdater.notifyAppReady().catch((err) => {
    console.warn('[main] notifyAppReady:', err);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
