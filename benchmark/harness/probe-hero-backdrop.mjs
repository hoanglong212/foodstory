// Where does the hero's dark photo actually come from? The ancestor
// background-color walk missed it, so the contrast analyser needs fixing.

import puppeteer from 'puppeteer-core';
import { chromePath } from '../lib/env.mjs';
import { startStatic } from '../lib/static-server.mjs';

const DIST = 'C:/Users/Admin/AppData/Local/Temp/claude/C--COS30043-foodstory/e5c35c90-1054-4830-8a36-65b6131ca0aa/scratchpad/wt/final/frontend/dist';
const srv = await startStatic(DIST, 5173, { apiProxy: 'http://127.0.0.1:3000' });
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(srv.origin, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.setItem('foodstory-theme', 'light'); localStorage.setItem('foodstory_dark_mode', 'false'); });
await page.goto(srv.origin + '/', { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate(() => {
  const el = document.querySelector('p.hero-copy');
  const r = el.getBoundingClientRect();
  const res = { pseudo: [], overlapping: [] };
  let cur = el;
  while (cur) {
    for (const pe of ['::before', '::after']) {
      const s = getComputedStyle(cur, pe);
      if (s.backgroundImage && s.backgroundImage !== 'none') {
        res.pseudo.push({ owner: cur.tagName.toLowerCase() + '.' + String(cur.className).slice(0, 40),
          pseudo: pe, backgroundImage: s.backgroundImage.slice(0, 120),
          backgroundColor: s.backgroundColor, opacity: s.opacity, position: s.position, zIndex: s.zIndex });
      }
    }
    cur = cur.parentElement;
  }
  // Anything painted behind the text rect with an image
  for (const e of document.querySelectorAll('*')) {
    const b = e.getBoundingClientRect();
    const overlaps = b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top;
    if (!overlaps) continue;
    const s = getComputedStyle(e);
    const hasImg = (s.backgroundImage && s.backgroundImage !== 'none') || e.tagName === 'IMG';
    if (!hasImg) continue;
    res.overlapping.push({
      tag: e.tagName.toLowerCase(), cls: String(e.className).slice(0, 50),
      backgroundImage: (s.backgroundImage || '').slice(0, 100),
      src: e.tagName === 'IMG' ? (e.currentSrc || e.src).slice(-60) : null,
      position: s.position, zIndex: s.zIndex, opacity: s.opacity,
      rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
    });
  }
  return res;
});

console.log('pseudo-elements with background-image in the ancestor chain:');
console.log(JSON.stringify(out.pseudo, null, 2));
console.log('\nelements overlapping the text rect that carry an image:');
console.log(JSON.stringify(out.overlapping, null, 2));

await browser.close();
await srv.close();
