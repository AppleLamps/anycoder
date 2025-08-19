import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      // Use the browser build of mammoth in the client bundle
      mammoth: 'mammoth/mammoth.browser.js',
    },
  },
  server: {
    proxy: {
      // Proxy requests from /api-proxy to OpenRouter
      '/api-proxy': {
        target: 'https://openrouter.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy/, ''),
        headers: {
          'Referer': 'https://openrouter.ai/'
        }
      },
    },
  },
});
