import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Load env file based on `mode` in the current working directory
    // Set the third parameter to '' to load all env regardless of the `VITE_` prefix
    const env = loadEnv(mode, process.cwd(), '');
    
    return {
      server: {
        port: env.APP_PORT ? Number(env.APP_PORT) : 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // Provide explicit app-level constants derived from env vars
        '__APP_ENV__': JSON.stringify(env.APP_ENV || mode),
        '__APP_VERSION__': JSON.stringify(env.npm_package_version || '1.0.0'),
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        // Shopify integration flag from environment
        '__SHOPIFY_ENABLED__': JSON.stringify(env.VITE_SHOPIFY_INTEGRATION_ENABLED === 'true'),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          'node:util': path.resolve(__dirname, 'polyfills/node-util.ts'),
          'googleapis': path.resolve(__dirname, 'polyfills/googleapis.ts'),
        }
      },
      optimizeDeps: {
        exclude: ['node-fetch', '@google-cloud/local-auth', 'googleapis']
      },
      build: {
        sourcemap: mode !== 'production',
        chunkSizeWarningLimit: 600,
        rollupOptions: {
          external: ['node-fetch', '@google-cloud/local-auth', 'googleapis'],
          output: {
            manualChunks(id) {
              // React core
              if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
                return 'react-vendor';
              }
              // Supabase
              if (id.includes('node_modules/@supabase/')) {
                return 'supabase-vendor';
              }
              // Lucide icons (large)
              if (id.includes('node_modules/lucide-react/')) {
                return 'icons-vendor';
              }
              // Markdown rendering
              if (id.includes('node_modules/react-markdown/') || id.includes('node_modules/remark-') || id.includes('node_modules/unified/') || id.includes('node_modules/mdast-') || id.includes('node_modules/micromark')) {
                return 'markdown-vendor';
              }
              // Zod validation
              if (id.includes('node_modules/zod/')) {
                return 'zod-vendor';
              }
            }
          }
        }
      }
    };
});
