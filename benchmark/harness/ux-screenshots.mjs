// UX review: capture full-page screenshots of every major route in both themes
// and at desktop + mobile, against the live dev server.
//
// Diagnostic tooling for a design review; not a measurement harness.

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { chromePath } from '../lib/env.mjs';

const ORIGIN = 'http://localhost:5173';
const BACKEND = 'http://127.0.0.1:3000';
const OUT = 'C:/COS30043/foodstory/benchmark/out/ux';
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { id: 'home', path: '/', auth: null },
  { id: 'recipes', path: '/recipes', auth: null },
  { id: 'recipe_detail', path: '/recipes/1', auth: null },
  { id: 'news', path: '/news', auth: null },
  { id: 'about', path: '/about', auth: null },
  { id: 'food_map', path: '/food-map', auth: null },
  { id: 'login', path: '/login', auth: null },
  { id: 'profile', path: '/profile', auth: 'user' },
  { id: 'admin', path: '/admin', auth: 'admin' },
];

const VIEWPORTS = [
  { id: 'desktop', w: 1440, h: 900 },
  { id: 'mobile', w: 390, h: 844 },
];

const FIX = { user: { email: 'long@foodstory.test', password: 'User123!' },
              admin: { email: 'admin@foodstory.test', password: 'Admin123!' } };

const only = process.argv[2] || null;      // optional route filter
const themes = (process.argv[3] || 'light,dark').split(',');

async function login(f) {
  const r = await fetch(`${BACKEND}/api/auth/login`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });

const tok = {};
for (const k of ['user', 'admin']) { try { tok[k] = await login(FIX[k]); } catch (e) { tok[k] = null; console.log('auth fail', k, e.message); } }

const report = [];
for (const route of ROUTES) {
  if (only && route.id !== only) continue;
  for (const vp of VIEWPORTS) {
    for (const theme of themes) {
      const page = await browser.newPage();
      await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
      const consoleErrors = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 180)); });
      page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + String(e.message).slice(0, 180)));

      await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
      await page.evaluate((cfg) => {
        localStorage.setItem('foodstory_dark_mode', String(cfg.dark));
        localStorage.setItem('foodstory-theme', cfg.dark ? 'dark' : 'light');
        if (cfg.tok) {
          localStorage.setItem('foodstory_token', cfg.tok.token);
          localStorage.setItem('foodstory_current_user', JSON.stringify(cfg.tok.user));
        }
      }, { dark: theme === 'dark', tok: route.auth ? tok[route.auth] : null });

      let navErr = null;
      try { await page.goto(ORIGIN + route.path, { waitUntil: 'networkidle2', timeout: 45000 }); }
      catch (e) { navErr = e.message; }
      await new Promise((r) => setTimeout(r, 2600));

      const info = await page.evaluate(() => ({
        pathname: location.pathname,
        theme: document.documentElement.dataset.theme,
        scrollH: document.documentElement.scrollHeight,
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      }));

      const name = `${route.id}__${vp.id}__${theme}.png`;
      await page.screenshot({ path: `${OUT}/${name}`, fullPage: vp.id === 'desktop' });
      report.push({ route: route.id, viewport: vp.id, theme, file: name,
        landed: info.pathname, themeApplied: info.theme,
        overflowPx: info.scrollW - info.innerW,
        pageHeight: info.scrollH, navErr, consoleErrors });
      console.log(`  ${name.padEnd(38)} landed=${info.pathname.padEnd(14)} theme=${String(info.theme).padEnd(5)} `
        + `overflow=${info.scrollW - info.innerW}px h=${info.scrollH} errs=${consoleErrors.length}`);
      await page.close();
    }
  }
}

fs.writeFileSync(`${OUT}/_report.json`, JSON.stringify(report, null, 2));
await browser.close();
console.log(`\nwrote ${report.length} screenshots to ${OUT}`);
