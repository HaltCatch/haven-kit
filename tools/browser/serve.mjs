import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, extname } from 'node:path';
import { URL } from 'node:url';

const root = resolve(import.meta.dirname, '../../dist/browser-tests/browser');
const port = Number(process.env['HAVEN_BROWSER_PORT'] ?? 4311);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw new Error('Invalid local browser fixture port');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const target = resolve(root, path === '/' ? 'index.html' : '.' + path);
    const location = relative(root, target);
    if (isAbsolute(location) || location.startsWith('..') || !(await stat(target)).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[extname(target)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(await readFile(target));
  } catch {
    response.writeHead(404).end();
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Haven SDK fixture listening on ${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
