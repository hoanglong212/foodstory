// Sanity check for the Tier 1C2 findings: screenshot the hero in light mode and dump
// the real computed backdrop chain for the worst-scoring node, so a reported failure
// is confirmed against what actually renders rather than trusted blindly.

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
await page.evaluate(() => {
  localStorage.setItem('foodstory_dark_mode', 'false');
  localStorage.setItem('foodstory-theme', 'light');
});
await page.goto(srv.origin + '/', { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 2500));

const info = await page.evaluate(() => {
  const el = document.querySelector('p.hero-copy');
  if (!el) return { found: false };
  const chain = [];
  let cur = el;
  while (cur && cur !== document.documentElement.parentElement) {
    const s = getComputedStyle(cur);
    chain.push({
      tag: cur.tagName.toLowerCase(),
      cls: typeof cur.className === 'string' ? cur.className.slice(0, 60) : '',
      backgroundColor: s.backgroundColor,
      backgroundImage: s.backgroundImage.slice(0, 90),
      opacity: s.opacity,
      color: s.color,
      position: s.position,
      zIndex: s.zIndex,
    });
    cur = cur.parentElement;
  }
  const r = el.getBoundingClientRect();
  return { found: true, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, chain,
    theme: document.documentElement.dataset.theme };
});

console.log('theme:', info.theme);
console.log('hero-copy rect:', JSON.stringify(info.rect));
console.log('\nbackdrop chain from the text node upward:');
for (const c of info.chain) {
  console.log(`  <${c.tag}${c.cls ? ' class="' + c.cls + '"' : ''}>`);
  console.log(`      color=${c.color} bg=${c.backgroundColor} bgImage=${c.backgroundImage} opacity=${c.opacity} pos=${c.position} z=${c.zIndex}`);
}

// Sample the actual rendered pixels behind the text.
await page.screenshot({ path: 'C:/COS30043/foodstory/benchmark/out/verify-home-light-hero.png',
  clip: { x: Math.max(0, info.rect.x - 10), y: Math.max(0, info.rect.y - 60),
          width: Math.min(1400, info.rect.w + 20), height: Math.min(300, info.rect.h + 120) } });
console.log('\nwrote out/verify-home-light-hero.png');

await browser.close();
await srv.close();
