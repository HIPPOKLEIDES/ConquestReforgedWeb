// Runs a job list through render.html in headless Chrome (needs server.mjs running on :8090).
//   node historia-tools/run-jobs.mjs jobs/paintings.json [size]
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const jobs = process.argv[2];
const size = process.argv[3] || 512;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9800 + Math.floor(Math.random() * 100);
const prof = path.join(os.tmpdir(), `historia-render-${port}`);
const chrome = spawn(CHROME, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = {};
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
await send('Page.navigate', { url: `http://localhost:8090/tool/render.html?size=${size}&jobs=/tool/${jobs}` });
let last = '';
const t0 = Date.now();
for (;;) {
  await sleep(1500);
  const log = (await ev("document.getElementById('log')?.textContent || ''")) || '';
  if (log !== last) { process.stdout.write(log.slice(last.length)); last = log; }
  if (/done: \d+ ok/.test(log) || Date.now() - t0 > 40 * 60 * 1000) break;
}
ws.close(); chrome.kill();
