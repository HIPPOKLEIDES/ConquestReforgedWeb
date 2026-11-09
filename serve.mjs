// Tiny static preview server for ./dist  ->  node serve.mjs  (http://localhost:8080)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
const port = process.env.PORT || 8080;

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const candidates = [url, path.join(url, 'index.html'), url + '.html'].map((p) => path.join(DIST, path.normalize(p)));
  const file = candidates.find((f) => f.startsWith(DIST) && fs.existsSync(f) && fs.statSync(f).isFile());
  if (!file) {
    const notFound = path.join(DIST, '404.html');
    // dist/ is empty for a moment while build.mjs runs: say so instead of crashing
    if (!fs.existsSync(notFound)) {
      res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '2' });
      return res.end('<meta http-equiv="refresh" content="2">Rebuilding, one moment...');
    }
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(notFound));
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Preview at http://localhost:${port}`));
