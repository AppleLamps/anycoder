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
    // Dev-only middleware to support /api/scrape locally
    configureServer(server) {
      server.middlewares.use('/api/scrape', async (req, res) => {
        try {
          const reqUrl = new URL(req.url || '', 'http://localhost');
          const target = reqUrl.searchParams.get('url') || '';
          if (!target) {
            res.statusCode = 400;
            res.end('URL parameter is required');
            return;
          }
          const response = await fetch(target, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.82 Safari/537.36',
            },
          });

          if (!response.ok) {
            res.statusCode = response.status;
            const msg = await response.text().catch(() => response.statusText);
            res.end(`Failed to fetch: ${msg}`);
            return;
          }

          const html = await response.text();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        } catch (error) {
          res.statusCode = 500;
          res.end(`Error fetching URL: ${error?.message || 'Unknown error'}`);
        }
      });
    },
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['highlight.js', 'mammoth', 'jszip'],
    exclude: ['pyodide'] // Load on demand
  }
});
