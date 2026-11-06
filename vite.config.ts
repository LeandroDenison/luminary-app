import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api/gutendex': {
        target: 'https://gutendex.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gutendex/, '')
      },
      '/api/gutenberg': {
        target: 'https://www.gutenberg.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gutenberg/, '')
      }
    }
  }
})
