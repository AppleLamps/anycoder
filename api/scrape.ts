import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) {
    return res.status(400).send('URL parameter is required');
  }
  try {
    const response = await fetch(url as string, {
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
    res.status(500).send(`Error fetching URL: ${error.message}`);
  }
}
