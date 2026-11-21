// Verifies the production build can start fully offline: the service worker
// must precache the page, every asset it references and the manifest icons,
// and nothing in the shipped CSS or HTML may depend on a remote host.
// Run after `pnpm run build`: node scripts/check-offline.mjs
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const base = process.env.VITE_BASE ?? '/license-plate-game/';
const problems = [];

function read(path) {
  if (!existsSync(join(DIST, path))) {
    problems.push(`Missing build output: ${path} (run the build first)`);
    return '';
  }
  return readFileSync(join(DIST, path), 'utf8');
}

const stripBase = (url) => (url.startsWith(base) ? url.slice(base.length) : url.replace(/^\//, ''));
const isRemote = (url) => /^(https?:)?\/\//.test(url);

const sw = read('sw.js');
const precached = new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]));
if (precached.size === 0) problems.push('sw.js has no precache entries');

if (!precached.has('index.html')) problems.push('index.html is not precached');
if (!/NavigationRoute/.test(sw) && !/createHandlerBoundToURL/.test(sw)) {
  problems.push('sw.js has no navigation fallback to index.html');
}

const html = read('index.html');
for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (isRemote(url)) {
    problems.push(`index.html loads a remote resource: ${url}`);
    continue;
  }
  const local = stripBase(url);
  if (!precached.has(local))
    problems.push(`index.html references ${local}, which is not precached`);
}

const manifest = read('manifest.webmanifest');
if (manifest) {
  for (const icon of JSON.parse(manifest).icons ?? []) {
    const local = stripBase(icon.src);
    if (!precached.has(local)) problems.push(`Manifest icon ${local} is not precached`);
  }
}

for (const file of readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.css'))) {
  const css = read(`assets/${file}`);
  for (const [, url] of css.matchAll(/url\(\s*["']?([^"')]+)/g)) {
    if (isRemote(url)) problems.push(`${file} loads a remote resource: ${url}`);
  }
  if (/@import\s+(?:url\()?["']?https?:/.test(css))
    problems.push(`${file} @imports a remote stylesheet`);
}

if (problems.length > 0) {
  console.error('Offline check failed:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(
  `Offline check passed: ${precached.size} precached files cover the page, assets and icons.`,
);
