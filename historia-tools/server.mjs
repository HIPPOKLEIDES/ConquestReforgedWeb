// Local helper server for rendering Historia: Rome pack models to PNGs (not part of the website build).
//   node historia-tools/server.mjs            then open http://localhost:8090/tool/render.html
// Serves the pack folders read-only and accepts rendered images at POST /save?path=<relative path>.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACK = process.env.HISTORIA_PACK || 'E:/Archive/Minecraft/Bedrock/Greco-Roman pack/mcm_packaged/HistoriaRome/Content';
const ROOTS = {
  rp: path.join(PACK, 'resource_packs/RP_hrmn'), // marketplace resource pack (retextures + mob models)
  rpw: path.join(PACK, 'world_template/resource_packs/RP_hrmn_w'), // world resource pack (custom blocks, NPCs)
  bp: path.join(PACK, 'world_template/behavior_packs/BP_hrmn_w'),
  tool: HERE,
};
const OUT = process.env.HISTORIA_OUT || path.join(HERE, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.tga': 'application/octet-stream' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/save') {
    const rel = url.searchParams.get('path') || '';
    if (!/^[\w./-]+$/.test(rel) || rel.includes('..')) { res.writeHead(400); return res.end('bad path'); }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      const b64 = body.replace(/^data:image\/png;base64,/, '');
      const file = path.join(OUT, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      res.writeHead(200); res.end('ok');
    });
    return;
  }
  const [, root, ...rest] = decodeURIComponent(url.pathname).split('/');
  const base = ROOTS[root];
  if (!base) { res.writeHead(404); return res.end(); }
  const file = path.join(base, ...rest);
  if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'access-control-allow-origin': '*' });
  fs.createReadStream(file).pipe(res);
}).listen(8090, () => console.log('historia render server on http://localhost:8090'));
