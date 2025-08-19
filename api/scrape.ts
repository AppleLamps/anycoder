import fetch from 'node-fetch';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).send('URL parameter is required');
    return;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.82 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const html = await response.text();
    res.status(200).send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).send(`Error fetching URL: ${message}`);
  }
}
