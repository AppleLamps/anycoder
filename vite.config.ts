import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      // Use the browser build of mammoth in the client bundle
      mammoth: 'mammoth/mammoth.browser.js',
    },
  },
  build: {
    // Enable code splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          'pdf': ['pdfjs-dist'],
          'ocr': ['tesseract.js'],
          'python': ['pyodide'],
          'vendor': ['highlight.js', 'jszip', 'mammoth']
        }
      }
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    // Enable minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
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
  // Optimize dependencies
  optimizeDeps: {
    include: ['highlight.js', 'mammoth', 'jszip'],
    exclude: ['pyodide'] // Load on demand
  }
});
