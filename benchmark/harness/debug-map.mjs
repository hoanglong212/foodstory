// Why did the map-scale harness page fail?
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromePath } from '../lib/env.mjs';
import { startStatic } from '../lib/static-server.mjs';

const NM = 'C:/COS30043/foodstory/frontend/node_modules';
const dir = path.join(os.tmpdir(), `dbgmap-${Date.now()}`);
fs.mkdirSync(dir, { recursive: true });
for (const [src, dst] of [
  [`${NM}/leaflet/dist/leaflet.js`, 'leaflet.js'],
  [`${NM}/leaflet/dist/leaflet.css`, 'leaflet.css'],
  [`${NM}/leaflet.markercluster/dist/leaflet.markercluster.js`, 'leaflet.markercluster.js'],
  [`${NM}/leaflet.markercluster/dist/MarkerCluster.css`, 'MarkerCluster.css'],
  [`${NM}/leaflet.markercluster/dist/MarkerCluster.Default.css`, 'MarkerCluster.Default.css'],
]) {
  console.log(fs.existsSync(src) ? `  ok   ${dst}` : `  MISS ${src}`);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, dst));
}

// Re-read the real harness page so we debug exactly what it serves.
const harness = fs.readFileSync('C:/COS30043/foodstory/benchmark/harness/tier2-map-scale.mjs', 'utf8');
const m = harness.match(/const PAGE = `([\s\S]*?)`;\n/);
fs.writeFileSync(path.join(dir, 'index.html'), m[1], 'utf8');
console.log('page bytes:', m[1].length);

const srv = await startStatic(dir, 5176);
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info'] });
const page = await browser.newPage();
page.on('console', (msg) => console.log('  [console]', msg.type(), msg.text().slice(0, 200)));
page.on('pageerror', (e) => console.log('  [pageerror]', String(e.message).slice(0, 300)));
page.on('requestfailed', (r) => console.log('  [reqfail]', r.url().slice(-40), r.failure()?.errorText));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${srv.origin}/index.html`, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 800));

console.log('typeof L        :', await page.evaluate(() => typeof window.L));
console.log('typeof cluster  :', await page.evaluate(() => typeof (window.L && window.L.markerClusterGroup)));
console.log('typeof __run    :', await page.evaluate(() => typeof window.__run));

try {
  const r = await page.evaluate(async () => {
    try { return { ok: true, v: await window.__run(50, true) }; }
    catch (e) { return { ok: false, err: String(e && e.message || e), stack: String(e && e.stack || '').slice(0, 400) }; }
  });
  console.log('run result ok:', r.ok);
  if (!r.ok) { console.log('  err  :', r.err); console.log('  stack:', r.stack); }
  else console.log('  drawMs', r.v.drawMs, 'clusters', r.v.clustersRendered, 'panMs', r.v.panMs, 'heap', r.v.heap);
} catch (e) { console.log('evaluate threw:', e.message); }

await browser.close();
await srv.close();
fs.rmSync(dir, { recursive: true, force: true });
