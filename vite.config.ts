import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0'
      },
      build: {
        sourcemap: false,
        outDir: 'dist',
        emptyOutDir: true,
        reportCompressedSize: false,
        chunkSizeWarningLimit: 5000,
        target: 'esnext',
        minify: false,
        cssCodeSplit: true,
        rollupOptions: {
          maxParallelFileOps: 1,
          output: {
            manualChunks: {
              'vendor-react': ['react', 'react-dom'],
              'vendor-framer': ['framer-motion'],
              'vendor-icons': ['lucide-react'],
              'vendor-firebase': ['firebase/app', 'firebase/firestore', 'firebase/auth'],
              'vendor-excel': ['exceljs', 'xlsx'],
              'vendor-pdf': ['jspdf', 'jspdf-autotable'],
              'vendor-charts': ['recharts', 'd3']
            }
          }
        }
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
        react()
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

