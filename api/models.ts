import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'node:fs/promises';
import path from 'node:path';

let modelsCache: string | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    if (!modelsCache) {
      const modelsPath = path.resolve(process.cwd(), 'models.json');
      modelsCache = await fs.readFile(modelsPath, 'utf-8');
    }

    res.status(200);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(modelsCache);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
