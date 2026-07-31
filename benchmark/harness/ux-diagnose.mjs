// UX diagnostics: broken/placeholder images, nav completeness, footer presence,
// and why /admin redirects. Scrolls the page first so lazy-loaded images get a
// fair chance before being judged broken.

import puppeteer from 'puppeteer-core';
import { chromePath } from '../lib/env.mjs';

const ORIGIN = 'http://localhost:5173';
const BACKEND = 'http://127.0.0.1:3000';
const FIX = { user: { email: 'long@foodstory.test', password: 'User123!' },
              admin: { email: 'admin@foodstory.test', password: 'Admin123!' } };

async function login(f) {
  const r = await fetch(`${BACKEND}/api/auth/login`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
  return r.ok ? r.json() : null;
}

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const tok = { user: await login(FIX.user), admin: await login(FIX.admin) };
console.log('admin token role:', tok.admin?.user?.role, '| user role:', tok.user?.user?.role);

async function open(path, auth) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  if (auth) {
    await page.evaluate((t) => {
      localStorage.setItem('foodstory_token', t.token);
      localStorage.setItem('foodstory_current_user', JSON.stringify(t.user));
    }, tok[auth]);
  }
  await page.goto(ORIGIN + path, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2000));
  return page;
}

// ---------------------------------------------------------------- 1. images
console.log('\n=== /recipes image health (after full scroll) ===');
{
  const page = await open('/recipes');
  // Scroll everything into view so lazy images actually load.
  await page.evaluate(async () => {
    const step = Math.floor(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 180));
    }
    window.scrollTo(0, 0);
  });
  await new Promise((r) => setTimeout(r, 3500));
  const img = await page.evaluate(() => {
    const imgs = [...document.images];
    const cards = document.querySelectorAll('[class*="recipe-card"], article');
    const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0);
    const empty = imgs.filter((i) => !i.getAttribute('src') || i.getAttribute('src') === '');
    const placeholder = imgs.filter((i) => /placeholder|default|fallback|no-image/i.test(i.currentSrc || i.src || ''));
    const zeroSize = imgs.filter((i) => i.getBoundingClientRect().width === 0 || i.getBoundingClientRect().height === 0);
    const lazy = imgs.filter((i) => i.loading === 'lazy');
    return {
      totalImgs: imgs.length, cardCount: cards.length,
      broken: broken.length, empty: empty.length,
      placeholder: placeholder.length, zeroSize: zeroSize.length, lazy: lazy.length,
      brokenSamples: broken.slice(0, 6).map((i) => (i.currentSrc || i.src || '(no src)').slice(-80)),
      placeholderSamples: [...new Set(placeholder.map((i) => (i.currentSrc || i.src).split('/').pop()))].slice(0, 5),
      // Cards whose image area renders nothing at all
      cardsWithoutImg: [...cards].filter((c) => !c.querySelector('img')).length,
    };
  });
  console.log(JSON.stringify(img, null, 2));
  await page.close();
}

// ---------------------------------------------------------------- 2. nav + footer
console.log('\n=== navigation + footer ===');
{
  const page = await open('/');
  const nav = await page.evaluate(() => {
    const links = [...document.querySelectorAll('header a, nav a')]
      .map((a) => ({ text: (a.textContent || '').trim().slice(0, 24), href: a.getAttribute('href') }))
      .filter((l) => l.text);
    const footer = document.querySelector('footer, .site-footer');
    const fr = footer?.getBoundingClientRect();
    return {
      headerLinks: links,
      hasFoodMapLink: links.some((l) => (l.href || '').includes('food-map')),
      footerExists: Boolean(footer),
      footerTag: footer ? footer.tagName + '.' + String(footer.className).slice(0, 40) : null,
      footerHeight: fr ? Math.round(fr.height) : null,
      footerText: footer ? (footer.textContent || '').trim().slice(0, 120) : null,
      bodyEndsWithGap: document.documentElement.scrollHeight
        - (document.querySelector('main')?.getBoundingClientRect().height || 0),
    };
  });
  console.log(JSON.stringify(nav, null, 2));
  await page.close();
}

// ---------------------------------------------------------------- 3. admin redirect
console.log('\n=== /admin redirect investigation ===');
{
  const page = await open('/admin', 'admin');
  const st = await page.evaluate(() => {
    const raw = localStorage.getItem('foodstory_current_user');
    return {
      pathname: location.pathname,
      storedUser: raw ? JSON.parse(raw) : null,
      tokenPresent: Boolean(localStorage.getItem('foodstory_token')),
      bodyStart: document.body.innerText.replace(/\n/g, ' | ').slice(0, 160),
    };
  });
  console.log(JSON.stringify(st, null, 2));
  await page.close();
}

await browser.close();
