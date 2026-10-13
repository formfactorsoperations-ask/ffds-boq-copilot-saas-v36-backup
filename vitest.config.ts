import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  /* The same `@/` alias as vite.config.ts, or tests of any file that imports `@/lib/...` cannot load. */
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), '.')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
