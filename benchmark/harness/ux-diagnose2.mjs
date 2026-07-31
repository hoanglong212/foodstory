// Focused follow-ups: what exactly are the imageless recipe cards, is the footer
// actually visible, and how flaky is the /admin landing?

import puppeteer from 'puppeteer-core';
import { chromePath } from '../lib/env.mjs';

const ORIGIN = 'http://localhost:5173';
const BACKEND = 'http://127.0.0.1:3000';

async function login(f) {
  const r = await fetch(`${BACKEND}/api/auth/login`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
  return r.ok ? r.json() : null;
}
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const admin = await login({ email: 'admin@foodstory.test', password: 'Admin123!' });

// ------------------------------------------------- 1. recipe grid image reality
console.log('=== /recipes: what renders in the "All Recipes" grid ===');
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(ORIGIN + '/recipes', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
  await page.evaluate(async () => {
    const step = Math.floor(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 200));
    }
  });
  await new Promise((r) => setTimeout(r, 4000));

  const g = await page.evaluate(() => {
    // Identify the main results grid by the densest repeated card class.
    const counts = {};
    for (const el of document.querySelectorAll('[class]')) {
      for (const c of String(el.className).split(/\s+/)) if (c) counts[c] = (counts[c] || 0) + 1;
    }
    const topClasses = Object.entries(counts).filter(([c]) => /card|item|tile/i.test(c))
      .sort((a, b) => b[1] - a[1]).slice(0, 8);

    const imgs = [...document.images];
    const visible = imgs.filter((i) => {
      const r = i.getBoundingClientRect();
      return r.width > 40 && r.height > 40;
    });
    const loaded = visible.filter((i) => i.complete && i.naturalWidth > 0);
    const notLoaded = visible.filter((i) => !(i.complete && i.naturalWidth > 0));
    return {
      topRepeatedClasses: topClasses,
      totalImgs: imgs.length,
      visibleSizedImgs: visible.length,
      loaded: loaded.length,
      notLoaded: notLoaded.length,
      notLoadedSamples: notLoaded.slice(0, 5).map((i) => ({
        src: (i.currentSrc || i.getAttribute('src') || '(none)').slice(-70),
        complete: i.complete, naturalWidth: i.naturalWidth,
      })),
      loadedSample: loaded.slice(0, 3).map((i) => (i.currentSrc || '').slice(-70)),
    };
  });
  console.log(JSON.stringify(g, null, 2));
  await page.close();
}

// ------------------------------------------------- 2. footer visibility
console.log('\n=== footer: is it actually visible? ===');
for (const theme of ['light', 'dark']) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('foodstory_dark_mode', String(t === 'dark'));
    localStorage.setItem('foodstory-theme', t);
  }, theme);
  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2' }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2000));
  const f = await page.evaluate(() => {
    const foot = document.querySelector('footer, .site-footer');
    if (!foot) return { exists: false };
    foot.scrollIntoView({ block: 'center' });
    const cs = getComputedStyle(foot);
    const sampleText = foot.querySelector('a, p, span, h3, h4');
    const ts = sampleText ? getComputedStyle(sampleText) : null;
    const r = foot.getBoundingClientRect();
    return {
      exists: true,
      height: Math.round(r.height),
      topInViewport: Math.round(r.top),
      background: cs.backgroundColor, backgroundImage: cs.backgroundImage.slice(0, 60),
      color: cs.color, opacity: cs.opacity, visibility: cs.visibility, display: cs.display,
      sampleTag: sampleText?.tagName, sampleText: (sampleText?.textContent || '').trim().slice(0, 40),
      sampleColor: ts?.color, sampleFontSize: ts?.fontSize,
      linkCount: foot.querySelectorAll('a').length,
    };
  });
  console.log(` ${theme}:`, JSON.stringify(f));
  await page.screenshot({ path: `C:/COS30043/foodstory/benchmark/out/ux/_footer_${theme}.png`,
    clip: { x: 0, y: Math.max(0, 900 - 460), width: 1440, height: 460 } });
  await page.close();
}

// ------------------------------------------------- 3. /admin landing flakiness
console.log('\n=== /admin landing over 10 cold loads ===');
{
  const landings = [];
  for (let i = 0; i < 10; i++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Network.clearBrowserCache');
    await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('foodstory_token', t.token);
      localStorage.setItem('foodstory_current_user', JSON.stringify(t.user));
    }, admin);
    const t0 = Date.now();
    await page.goto(ORIGIN + '/admin', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
    const p = await page.evaluate(() => location.pathname);
    landings.push({ run: i + 1, landed: p, ms: Date.now() - t0 });
    await page.close();
  }
  const ok = landings.filter((l) => l.landed === '/admin').length;
  console.log(`  reached /admin ${ok}/10`);
  for (const l of landings) console.log(`   run ${l.run}: ${l.landed} (${l.ms}ms)`);
}

await browser.close();
