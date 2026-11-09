// Local preview with auto-rebuild  ->  node dev.mjs  (http://localhost:8080)
// Builds once, serves ./dist, and rebuilds whenever src/ or a build script changes.
// Refresh the browser after a rebuild to see the change.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const build = () => spawnSync(process.execPath, ['build.mjs'], { cwd: ROOT, stdio: 'inherit' }).status === 0;

build();
// serve.mjs can fall over when a request lands mid-rebuild (dist/ is empty for a moment): start it again
(function serve() {
  spawn(process.execPath, ['serve.mjs'], { cwd: ROOT, stdio: 'inherit' }).on('exit', () => setTimeout(serve, 300));
})();

let timer = null;
let building = false;
let again = false;
function schedule(file) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (building) { again = true; return; }
    building = true;
    console.log(`\nChanged: ${file} - rebuilding...`);
    build();
    building = false;
    if (again) { again = false; schedule('(more changes)'); }
  }, 200);
}

fs.watch(path.join(ROOT, 'src'), { recursive: true }, (_, f) => schedule(path.join('src', f || '')));
fs.watch(ROOT, (_, f) => { if (f && f.endsWith('.mjs') && f !== 'dev.mjs') schedule(f); });
console.log('Watching src/ and build scripts for changes.');
