// Food Map specifics: does the basemap follow the dark theme, does the guest banner
// truncate, and does the chat launcher collide with the bottom ticker?

import puppeteer from 'puppeteer-core';
import { chromePath } from '../lib/env.mjs';

const ORIGIN = 'http://localhost:5173';
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.clear();
    localStorage.setItem('foodstory_dark_mode', String(t === 'dark'));
    localStorage.setItem('foodstory-theme', t);
  }, theme);
  await page.goto(ORIGIN + '/food-map', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));

  const d = await page.evaluate(() => {
    const tile = document.querySelector('.leaflet-tile');
    const tileUrls = [...document.querySelectorAll('.leaflet-tile')]
      .map((t) => t.getAttribute('src') || '').filter(Boolean).slice(0, 2);
    const rectOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
    const overlap = (a, b) => (a && b) ? !(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y) : null;

    const launcher = document.querySelector('.chat-bubble-btn');
    // Ticker / bottom bar candidates
    const ticker = document.querySelector('[class*="ticker"], [class*="discovery-tray"], [class*="taste-now"]');
    const banner = [...document.querySelectorAll('*')].find((e) =>
      /Exploring as a guest/i.test(e.textContent || '') && e.children.length < 6);

    let bannerInfo = null;
    if (banner) {
      const p = [...banner.querySelectorAll('p, span, div')]
        .find((x) => /Vision and map browsing/i.test(x.textContent || ''));
      if (p) {
        const cs = getComputedStyle(p);
        bannerInfo = {
          text: (p.textContent || '').trim(),
          truncated: p.scrollWidth > p.clientWidth + 1 || cs.textOverflow === 'ellipsis',
          scrollWidth: p.scrollWidth, clientWidth: p.clientWidth,
          overflow: cs.overflow, textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace,
          webkitLineClamp: cs.webkitLineClamp,
        };
      }
    }

    return {
      theme: document.documentElement.dataset.theme,
      tileSample: tileUrls,
      tileFilter: tile ? getComputedStyle(tile).filter : null,
      tilePaneFilter: document.querySelector('.leaflet-tile-pane')
        ? getComputedStyle(document.querySelector('.leaflet-tile-pane')).filter : null,
      markerCount: document.querySelectorAll('.leaflet-marker-icon').length,
      launcherRect: rectOf(launcher),
      tickerRect: rectOf(ticker),
      tickerClass: ticker ? String(ticker.className).slice(0, 60) : null,
      launcherOverlapsTicker: overlap(rectOf(launcher), rectOf(ticker)),
      bannerInfo,
    };
  });
  console.log(`\n=== theme=${theme} ===`);
  console.log(JSON.stringify(d, null, 2));
  await page.close();
}
await browser.close();
