import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0'
        /*
          No `hmr: false` here. The dev server runs Vite in middleware mode from
          server.ts, which injects @vite/client into the page whatever this says
          -- and with HMR off that client had no socket to talk to, so its own
          error reporter threw and re-entered itself. server.ts gives it the
          app's http server to run the websocket on instead.
        */
      },
      build: {
        sourcemap: false,
        outDir: 'dist',
        emptyOutDir: true,
        reportCompressedSize: false,
        chunkSizeWarningLimit: 5000,
        target: 'esnext'
      },
      optimizeDeps: {
        include: [
          'react',
          'react-dom',
          'react/jsx-runtime',
          'framer-motion',
          'lucide-react',
          '@google/genai',
          'firebase/app',
          'firebase/firestore',
          'firebase/auth',
          'd3',
          'recharts',
          'date-fns',
          'deep-object-diff',
          'idb-keyval',
          'file-saver',
          'pako',
          'exceljs',
          'xlsx',
          'jspdf',
          'jspdf-autotable'
        ]
      },
      plugins: [
        tailwindcss(),
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
          manifest: {
            id: '/',
            name: 'FFDS Studio & Client Portal',
            short_name: 'FFDS Portal',
            description: 'Interior design studio operating system and live client approval portal.',
            theme_color: '#3D52A0',
            background_color: '#F8FAFC',
            display: 'standalone',
            start_url: '/',
            scope: '/',
            icons: [
              {
                src: '/pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any'
              },
              {
                src: '/pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any'
              },
              {
                src: '/pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable'
              }
            ]
          },
          workbox: {
            maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'google-fonts-cache',
                  expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 60 * 60 * 24 * 365
                  },
                  cacheableResponse: {
                    statuses: [0, 200]
                  }
                }
              },
              {
                urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'gstatic-fonts-cache',
                  expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 60 * 60 * 24 * 365
                  },
                  cacheableResponse: {
                    statuses: [0, 200]
                  }
                }
              }
            ]
          },
          /*
            No service worker in development.

            With this on, Workbox registered a SW on localhost that cached the
            dev module graph and kept serving it across reloads -- a page could
            still be running JavaScript from before a server restart (visible as
            an unchanged HMR handshake token), and a half-stale graph surfaced
            as "Cannot read properties of null (reading 'useState')" because
            React came from one build and its consumers from another.

            This only affects dev; the production PWA is built from the config
            above and is unchanged.
          */
          devOptions: {
            enabled: false,
            type: 'module'
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(process.cwd(), '.'),
        }
      }
    };
});

