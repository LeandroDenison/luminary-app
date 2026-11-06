// Service Worker simples para suporte a PWA e funcionamento offline
const CACHE_NAME = 'luminary-pwa-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Pass-through padrão
});
