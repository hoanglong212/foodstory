// TIER 2H — CSS coverage per route via CDP CSS.startRuleUsageTracking.
//
// Gives a concrete number for the section 3.6 argument that maintaining two layout
// systems raises cost: how much of the shipped CSS each route actually uses.

import puppeteer from 'puppeteer-core';
import { chromePath, meta, writeOut } from '../lib/env.mjs';
import { startStatic } from '../lib/static-server.mjs';

const DIST = 'C:/Users/Admin/AppData/Local/Temp/claude/C--COS30043-foodstory/e5c35c90-1054-4830-8a36-65b6131ca0aa/scratchpad/wt/final/frontend/dist';
const BACKEND = 'http://127.0.0.1:3000';
const PORT = 5173;

const ROUTES = [
  { id: 'home', path: '/', auth: null },
  { id: 'news', path: '/news', auth: null },
  { id: 'about', path: '/about', auth: null },
  { id: 'recipes', path: '/recipes', auth: null },
  { id: 'recipe_detail', path: '/recipes/1', auth: null },
  { id: 'food_map', path: '/food-map', auth: null },
  { id: 'profile', path: '/profile', auth: 'user' },
  { id: 'admin', path: '/admin', auth: 'admin' },
];
const FIX = { user: { email: 'long@foodstory.test', password: 'User123!' },
              admin: { email: 'admin@foodstory.test', password: 'Admin123!' } };

async function login(f) {
  const r = await fetch(`${BACKEND}/api/auth/login`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function main() {
  const srv = await startStatic(DIST, PORT, { apiProxy: BACKEND });
  const tok = {};
  for (const k of ['user', 'admin']) { try { tok[k] = await login(FIX[k]); } catch { tok[k] = null; } }

  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  const out = [];
  for (const route of ROUTES) {
    if (route.auth && !tok[route.auth]) {
      out.push({ route: route.id, status: 'unavailable', reason: 'login fixture failed' });
      continue;
    }
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const cdp = await page.createCDPSession();
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable'); await cdp.send('Page.enable');

    await page.goto(srv.origin, { waitUntil: 'domcontentloaded' });
    if (route.auth) {
      await page.evaluate((t) => {
        localStorage.setItem('foodstory_token', t.token);
        localStorage.setItem('foodstory_current_user', JSON.stringify(t.user));
      }, tok[route.auth]);
    }

    await cdp.send('CSS.startRuleUsageTracking');
    let navError = null;
    try { await page.goto(srv.origin + route.path, { waitUntil: 'networkidle2', timeout: 60000 }); }
    catch (e) { navError = e.message; }
    await new Promise((r) => setTimeout(r, 1500));
    // Scroll so rules used only by below-the-fold content are counted as used.
    await page.evaluate(async () => {
      const step = Math.floor(window.innerHeight * 0.9);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await new Promise((r) => setTimeout(r, 500));

    const { ruleUsage } = await cdp.send('CSS.stopRuleUsageTracking');
    const landed = await page.evaluate(() => location.pathname);

    // Aggregate used byte ranges per stylesheet.
    const perSheet = new Map();
    for (const u of ruleUsage) {
      const e = perSheet.get(u.styleSheetId) ?? { usedBytes: 0, usedRules: 0, totalRules: 0 };
      if (u.used) { e.usedBytes += (u.endOffset - u.startOffset); e.usedRules++; }
      e.totalRules++;
      perSheet.set(u.styleSheetId, e);
    }

    const sheets = [];
    for (const [id, agg] of perSheet) {
      let header = null, textLen = null;
      try {
        const t = await cdp.send('CSS.getStyleSheetText', { styleSheetId: id });
        textLen = t.text.length;
      } catch { /* inline or detached sheet */ }
      sheets.push({
        styleSheetId: id, url: header,
        totalBytes: textLen,
        usedBytes: agg.usedBytes,
        usedRules: agg.usedRules,
        totalRulesSeen: agg.totalRules,
        usedRulePercent: agg.totalRules ? Number(((agg.usedRules / agg.totalRules) * 100).toFixed(2)) : null,
        usedBytePercent: textLen ? Number(((agg.usedBytes / textLen) * 100).toFixed(2)) : null,
      });
    }

    const totalRules = ruleUsage.length;
    const usedRules = ruleUsage.filter((u) => u.used).length;
    const totalBytes = sheets.reduce((s, x) => s + (x.totalBytes || 0), 0);
    const usedBytes = sheets.reduce((s, x) => s + x.usedBytes, 0);

    out.push({
      route: route.id, path: route.path,
      status: landed === route.path ? 'measured' : 'unavailable',
      reason: landed === route.path ? undefined : `landed on ${landed}`,
      navError, landedPathname: landed,
      totalRulesTracked: totalRules,
      usedRules,
      unusedRules: totalRules - usedRules,
      usedRulePercent: totalRules ? Number(((usedRules / totalRules) * 100).toFixed(2)) : null,
      stylesheetTotalBytes: totalBytes,
      stylesheetUsedBytes: usedBytes,
      usedBytePercent: totalBytes ? Number(((usedBytes / totalBytes) * 100).toFixed(2)) : null,
      wastedBytes: totalBytes - usedBytes,
      perStylesheet: sheets.sort((a, b) => (b.totalBytes || 0) - (a.totalBytes || 0)),
    });
    console.log(`  ${route.id.padEnd(14)} rules ${usedRules}/${totalRules} `
      + `(${totalRules ? ((usedRules / totalRules) * 100).toFixed(1) : '-'}%) `
      + `bytes ${usedBytes}/${totalBytes} (${totalBytes ? ((usedBytes / totalBytes) * 100).toFixed(1) : '-'}%)`);
    await page.close();
  }

  await browser.close();
  await srv.close();

  const measured = out.filter((o) => o.status === 'measured');
  writeOut('css-coverage.json', {
    meta: meta({
      measurement: 'css-coverage', tier: '2H',
      method: 'CDP CSS.startRuleUsageTracking / stopRuleUsageTracking at 1440x900, with a '
        + 'full-page scroll before stopping so below-the-fold rules count as used',
      caveat: 'coverage is per page visit; a rule unused on every measured route may still be '
        + 'used by an unmeasured route, an interaction state, or another viewport',
      headlineMetric: 'usedBytePercent',
      ruleCountCaveat: 'IGNORE usedRulePercent. CDP returns entries only for rules it observed '
        + 'as used, so usedRules always equals totalRulesTracked and the ratio is a constant '
        + '100% artifact, not a measurement. The valid figure is usedBytes divided by the full '
        + 'stylesheet text length fetched via CSS.getStyleSheetText, reported as usedBytePercent.',
    }),
    totals: {
      routesMeasured: measured.length,
      meanUsedBytePercent: measured.length
        ? Number((measured.reduce((s, o) => s + (o.usedBytePercent || 0), 0) / measured.length).toFixed(2)) : null,
      minUsedBytePercent: measured.length ? Math.min(...measured.map((o) => o.usedBytePercent || 0)) : null,
      maxUsedBytePercent: measured.length ? Math.max(...measured.map((o) => o.usedBytePercent || 0)) : null,
      meanWastedBytes: measured.length
        ? Math.round(measured.reduce((s, o) => s + o.wastedBytes, 0) / measured.length) : null,
      meanUsedRulePercent: 'not reported - see meta.ruleCountCaveat',
    },
    routes: out,
  });
}

await main();
