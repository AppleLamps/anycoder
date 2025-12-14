import { defineConfig } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';

export default defineConfig({
  plugins: [
    {
      name: 'anycoder-local-api',
      configureServer(server) {
        const modelsPath = path.resolve(__dirname, 'models.json');
        let modelsCache: string | null = null;

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
            res.end(`Error fetching URL: ${(error as any)?.message || 'Unknown error'}`);
          }
        });

        server.middlewares.use('/api/models', async (req, res) => {
          try {
            if ((req.method || '').toUpperCase() !== 'GET') {
              res.statusCode = 405;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'Method not allowed' }));
              return;
            }

            if (!modelsCache) {
              modelsCache = await fs.readFile(modelsPath, 'utf-8');
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(modelsCache);
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: (error as any)?.message || 'Unknown error' }));
          }
        });

        server.middlewares.use('/api/chat', async (req, res) => {
          try {
            if ((req.method || '').toUpperCase() !== 'POST') {
              res.statusCode = 405;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'Method not allowed' }));
              return;
            }

            const apiKeyHeader = (req as any).headers?.['x-poe-api-key'];
            const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
            if (!apiKey || !String(apiKey).trim()) {
              res.statusCode = 401;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'Missing Poe API key' }));
              return;
            }

            const chunks: Buffer[] = [];
            await new Promise<void>((resolve, reject) => {
              (req as any).on('data', (c: any) => chunks.push(Buffer.from(c)));
              (req as any).on('end', () => resolve());
              (req as any).on('error', reject);
            });
            const body = Buffer.concat(chunks).toString('utf-8');

            const upstream = await fetch('https://api.poe.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${String(apiKey).trim()}`,
              },
              body,
            });

            res.statusCode = upstream.status;
            const contentType = upstream.headers.get('content-type');
            if (contentType) res.setHeader('Content-Type', contentType);
            res.setHeader('Connection', 'keep-alive');

            if (!upstream.body) {
              const text = await upstream.text().catch(() => '');
              res.end(text);
              return;
            }

            const reader = upstream.body.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) res.write(Buffer.from(value));
              }
            } finally {
              reader.releaseLock();
            }

            res.end();
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: (error as any)?.message || 'Unknown error' }));
          }
        });
      },
    },
  ],
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
  // Optimize dependencies
  optimizeDeps: {
    include: ['highlight.js', 'mammoth', 'jszip'],
    exclude: ['pyodide'] // Load on demand
  }
});
