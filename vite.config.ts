import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import jsxSourceIds from './client/vite-plugins/jsx-source-ids';

export default defineConfig({
  root: 'client',
  publicDir: 'public',

  plugins: [react(), jsxSourceIds()],

  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    },
    hmr: {
      host: 'localhost',
      port: 3000
    }
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@components': path.resolve(__dirname, './client/src/components'),
      '@lib': path.resolve(__dirname, './client/src/lib'),
      '@hooks': path.resolve(__dirname, './client/src/hooks'),
      '@config': path.resolve(__dirname, './client/src/config'),
    },
  },

  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
