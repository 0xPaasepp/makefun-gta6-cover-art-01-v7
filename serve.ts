import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(join(fileURLToPath(new URL('.', import.meta.url)), 'app'));
// Serves app/ only, with correct MIME types; the entry works offline with
// zero network requests, so nothing here ever fetches a remote resource.

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

const port = Number(process.env.PORT ?? 8080);

createServer(async (req, res) => {
  const raw = new URL(req.url ?? '/', 'http://localhost').pathname;
  const rel = normalize(decodeURIComponent(raw)).replace(/^[/\\]+/, '') || 'index.html';
  const file = join(root, rel);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(port, () => {
  console.log(`Velvet Heat — Cover Studio serving http://localhost:${port}/`);
});
