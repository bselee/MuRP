import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          'node:util': path.resolve(__dirname, 'polyfills/node-util.ts'),
        }
      },
      optimizeDeps: {
        exclude: ['node-fetch', '@google-cloud/local-auth', 'googleapis']
      },
      build: {
        rollupOptions: {
          external: ['node-fetch', '@google-cloud/local-auth', 'googleapis']
        }
      }
    };
});
