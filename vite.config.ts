import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'AgroGestión',
        short_name: 'AgroGestión',
        description: 'Software de Gestión y Control Ganadero de Precisión',
        theme_color: '#121212',
        background_color: '#121212',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Excluir PDFs del navegateFallback para que no sean interceptados por el SW
        // cuando el usuario tiene la app abierta (evita que redirija al login)
        navigateFallbackDenylist: [/\.pdf$/i, /\/manual-de-usuario\.pdf/, /\/guia-inicio-rapido\.pdf/],
        runtimeCaching: [
          // La API de Supabase ya NO pasa por el service worker: la capa offline propia (httpOffline.ts)
          // guarda lecturas y encola escrituras. NetworkFirst sin timeout dejaba la app "cargando" con señal débil.
          {
            urlPattern: /^https:\/\/(?:server\.arcgisonline\.com|.*\.tile\.openstreetmap\.org)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-cache',
              expiration: {
                maxEntries: 2000,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 días para navegación en campo
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  // Solo usamos rutas relativas para la app móvil para evitar la pantalla negra.
  // Esto no afecta a la web en producción (Vercel).
  base: process.env.CAPACITOR_BUILD === 'true' ? './' : '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@supabase/')) {
            return 'vendor-supabase';
          }
          if (id.includes('node_modules/dexie') || id.includes('node_modules/dexie-react-hooks')) {
            return 'vendor-dexie';
          }
          if (id.includes('node_modules/date-fns/')) {
            return 'vendor-date';
          }
        }
      }
    },
    chunkSizeWarningLimit: 650
  }
})
