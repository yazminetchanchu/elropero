/// <reference types="vitest" />
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    base: "./",

    plugins: [react(), tailwindcss()],

    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy: {
        '/uala-api-auth': {
          target: 'https://auth.developers.ar.ua.la/v2/api',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/uala-api-auth/, '')
        },
        '/uala-api-checkout': {
          target: 'https://checkout.developers.ar.ua.la',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/uala-api-checkout/, '')
        },
        '/uala-auth-stage': {
          target: 'https://auth.stage.developers.ar.ua.la/v2/api',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/uala-auth-stage/, '')
        },
        '/uala-api-stage': {
          target: 'https://checkout.stage.developers.ar.ua.la',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/uala-api-stage/, '')
        },
        '/uala-auth-prod': {
          target: 'https://auth.developers.ar.ua.la/v2/api',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/uala-auth-prod/, '')
        },
        '/uala-api-prod': {
          target: 'https://checkout.developers.ar.ua.la',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/uala-api-prod/, '')
        }
      }
    },

    optimizeDeps: {
      include: ['react-router-dom', 'axios']
    },

    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.VITE_UALA_RETURN_URL': JSON.stringify(env.VITE_UALA_RETURN_URL),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },

    build: {
      outDir: "dist",
      assetsDir: "assets",
      emptyOutDir: true,

      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
      },
    },

    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './setupTests.ts',
    },
  };
});
