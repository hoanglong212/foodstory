// Verify the worst remaining dark-theme contrast failure by screenshotting it.
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
await page.evaluate(() => { localStorage.setItem('foodstory-theme', 'dark'); localStorage.setItem('foodstory_dark_mode', 'true'); });
await page.goto(srv.origin + '/recipes/1', { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 2500));

const hit = await page.evaluate(() => {
  const target = [...document.querySelectorAll('button, span')]
    .find((e) => /Show \d+ more|remaining/i.test(e.textContent || ''));
  if (!target) return { found: false };
  target.scrollIntoView({ block: 'center' });
  const r = target.getBoundingClientRect();
  const cs = getComputedStyle(target);
  const chain = [];
  let cur = target;
  while (cur && chain.length < 7) {
    const s = getComputedStyle(cur);
    chain.push({ tag: cur.tagName.toLowerCase(), cls: String(cur.className).slice(0, 45),
      bg: s.backgroundColor, bgImg: s.backgroundImage.slice(0, 50) });
    cur = cur.parentElement;
  }
  return { found: true, text: target.textContent.trim().slice(0, 40), color: cs.color,
    rect: { x: r.x, y: r.y, w: r.width, h: r.height }, chain,
    theme: document.documentElement.dataset.theme };
});
console.log(JSON.stringify(hit, null, 2));

if (hit.found) {
  await new Promise((r) => setTimeout(r, 400));
  const r2 = await page.evaluate(() => {
    const t = [...document.querySelectorAll('button, span')].find((e) => /Show \d+ more|remaining/i.test(e.textContent || ''));
    const b = t.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  await page.screenshot({ path: 'C:/COS30043/foodstory/benchmark/out/verify-recipedetail-dark.png',
    clip: { x: Math.max(0, r2.x - 40), y: Math.max(0, r2.y - 40),
            width: Math.min(900, r2.w + 300), height: Math.min(220, r2.h + 100) } });
  console.log('wrote out/verify-recipedetail-dark.png');
}
await browser.close();
await srv.close();
