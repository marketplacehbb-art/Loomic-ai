import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import jsxSourceIds from './client/vite-plugins/jsx-source-ids';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devApiProxyTarget = env.VITE_DEV_API_PROXY_TARGET || 'http://localhost:3001';
  const buildSourcemap = env.VITE_BUILD_SOURCEMAP === 'true' || env.VITE_BUILD_SOURCEMAP === '1';

  return {
    root: 'client',
    publicDir: 'public',

    plugins: [react(), jsxSourceIds()],

    server: {
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': {
          target: devApiProxyTarget,
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
      sourcemap: buildSourcemap,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('@monaco-editor') || id.includes('monaco-editor')) return 'vendor-monaco';
            if (id.includes('@codesandbox/sandpack')) return 'vendor-sandpack';
            if (id.includes('recharts')) return 'vendor-charts';
            if (id.includes('@supabase/supabase-js')) return 'vendor-supabase';
            if (id.includes('react-router-dom')) return 'vendor-router';
            if (id.includes('@xyflow/react')) return 'vendor-flow';
            // Let Rollup decide the rest to avoid over-fragmentation/circular chunk edges.
            return;
          }
        }
      }
    },
  };
});
