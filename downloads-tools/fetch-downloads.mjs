// Snapshot of our Modrinth projects for /downloads (src/data/downloads.json).
//   node downloads-tools/fetch-downloads.mjs
// The page also refreshes the version lists from the Modrinth API in the browser (the API allows any origin),
// so a new release shows up without a site push; this snapshot is what the page starts from (and shows if the
// API can't be reached). Run it now and then so the snapshot doesn't fall far behind.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'data', 'downloads.json');
const API = 'https://api.modrinth.com/v2';
const UA = 'conquest-site-build/1.0 (downloads snapshot)';
// our projects: key -> Modrinth slug
const PROJECTS = {
  mod: 'conquest-reforged',
  packFabric: 'conquest-reforged-modpack',
  packForge: 'conquest-reforged-modpack-forge',
  resourcePack: 'conquest-reforged-resource-pack',
};

const get = async (u) => {
  const res = await fetch(API + u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${u}: ${res.status}`);
  return res.json();
};
// the fields the page uses (the browser trims live API answers the same way, see src/downloads/downloads.js)
const slim = (v) => ({
  id: v.id, name: v.name, version: v.version_number, type: v.version_type, date: v.date_published,
  mc: v.game_versions, loaders: v.loaders,
  files: v.files.map((f) => ({ name: f.filename, size: f.size, url: f.url, primary: f.primary })),
  deps: v.dependencies.filter((d) => d.project_id).map((d) => ({ id: d.project_id, type: d.dependency_type })),
});

const projects = {};
const versions = {};
for (const [key, slug] of Object.entries(PROJECTS)) {
  const p = await get(`/project/${slug}`);
  projects[key] = { id: p.id, slug: p.slug, type: p.project_type, title: p.title, icon: p.icon_url, downloads: p.downloads, updated: p.updated };
  versions[key] = (await get(`/project/${slug}/version`)).map(slim);
  console.log(`${p.title}: ${versions[key].length} versions, newest ${versions[key][0]?.version} (${versions[key][0]?.date.slice(0, 10)})`);
}
// names of the libraries our files depend on (shown on the page; ids rarely change)
const depIds = [...new Set(Object.values(versions).flat().flatMap((v) => v.deps.map((d) => d.id)))];
const libs = {};
for (let i = 0; i < depIds.length; i += 80) {
  for (const p of await get(`/projects?ids=${encodeURIComponent(JSON.stringify(depIds.slice(i, i + 80)))}`)) {
    libs[p.id] = { slug: p.slug, title: p.title, type: p.project_type, icon: p.icon_url };
  }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), projects, versions, libs }, null, 1) + '\n');
console.log(`wrote ${path.relative(ROOT, OUT)} (${Object.keys(libs).length} libraries)`);
