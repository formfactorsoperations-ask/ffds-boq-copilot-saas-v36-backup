import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        hmr: false,
      },
      build: {
        outDir: 'dist',
        emptyOutDir: true,
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          devOptions: {
            enabled: false
          },
          workbox: {
            maximumFileSizeToCacheInBytes: 10000000 // 10MB
          },
          manifest: {
            name: 'FFDS Execution Hub',
            short_name: 'FFDS Hub',
            description: 'Site execution and project management portal for Form Factors Design Studio',
            theme_color: '#0f172a',
            background_color: '#ffffff',
            display: 'standalone',
            icons: [
              {
                src: '/pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png'
              },
              {
                src: '/pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png'
              }
            ]
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
