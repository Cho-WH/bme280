import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, sep, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Serve the repo root so the sub-app can reuse ../js, ../firmware and ../bmp280-wiring.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.argv[2] || 8766);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.hex': 'application/octet-stream', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  try {
    let path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    const local = relative(root, path);
    if (isAbsolute(local) || local.split(sep).some((part) => part.startsWith('.'))) {
      response.writeHead(403).end(); return;
    }
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    await stat(path);
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(path).on('error', () => response.destroy()).pipe(response);
  } catch { response.writeHead(404).end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}/gay-lussac/`));
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
