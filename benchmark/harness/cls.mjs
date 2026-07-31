// TIER 1B — CLS across the Bootstrap grid migration.
//
// Six page-level grids moved from `display:grid` to Bootstrap flex rows in 03510c9.
// Section 3.6.1 only measured static geometry via getBoundingClientRect, which cannot
// see shifts that happen while images and fonts are still arriving. CLS can.
//
// Measured on BOTH sides of the migration:
//   pre  = b996954 (parent of the migration commit)
//   post = 522c5f2 (Final; frontend source identical to HEAD)
//
// Every individual layout-shift entry is recorded: value, timestamp, and the
// element(s) that shifted. Official CLS (largest 5s session window with 1s gaps) is
// computed alongside the naive sum, because they differ and the distinction matters.
//
// Network and CPU are throttled deliberately. On an unthrottled loopback every asset
// arrives before first paint, so image-driven shifts never manifest and the result
// would be a falsely clean 0. Throttling values are recorded in meta.

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { chromePath, meta, writeOut, stats } from '../lib/env.mjs';
import { startStatic } from '../lib/static-server.mjs';

const WT = 'C:/Users/Admin/AppData/Local/Temp/claude/C--COS30043-foodstory/e5c35c90-1054-4830-8a36-65b6131ca0aa/scratchpad/wt';
const PORT = 5173; // CORS-allowed origin; see route-budget.mjs for why this is fixed
const RUNS = 5;

const VERSIONS = [
  { id: 'pre_bootstrap_migration', commit: 'b996954', dist: `${WT}/preboot/frontend/dist`,
    note: 'parent of 03510c9, page-level grids still display:grid' },
  { id: 'final_bootstrap_migration', commit: '522c5f2', dist: `${WT}/final/frontend/dist`,
    note: 'page-level grids migrated to Bootstrap flex rows' },
];

const ROUTES = [
  { id: 'recipes', path: '/recipes', migrated: true },
  { id: 'news',    path: '/news',    migrated: true },
  { id: 'about',   path: '/about',   migrated: true },
  { id: 'home',    path: '/',        migrated: false }, // control: not migrated
];

const VIEWPORTS = [
  { w: 390,  h: 844,  label: '390x844' },
  { w: 768,  h: 1024, label: '768x1024' },
  { w: 1024, h: 768,  label: '1024x768' },
  { w: 1440, h: 900,  label: '1440x900' },
];

// Lighthouse desktop network profile (10 Mbps / 40 ms), identical to Tier 1A so the
// two measurements are comparable, combined with a 4x CPU slowdown to keep layout and
// paint work slow enough that asset-driven shifts still register.
//
// An earlier attempt used a 1.6 Mbps / 150 ms mobile profile. It was abandoned: several
// routes pull remote Unsplash images, and at that bandwidth each page load stalled on
// third-party CDN transfer until the navigation timeout. That measured Unsplash, not
// FoodStory. The bounded profile below keeps the run deterministic and on-topic.
const THROTTLE = {
  offline: false,
  downloadThroughput: (10240 * 1024) / 8,
  uploadThroughput: (10240 * 1024) / 8,
  latency: 40,
};
const CPU_SLOWDOWN = 4;
const NAV_TIMEOUT_MS = 30000;

const COLLECTOR = () => {
  window.__shifts = [];
  const describe = (node) => {
    if (!node || node.nodeType !== 1) return null;
    const el = node;
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).slice(0, 4).join('.')
      : '';
    let path = '';
    let cur = el, depth = 0;
    while (cur && cur.nodeType === 1 && depth < 4) {
      const t = cur.tagName.toLowerCase();
      path = path ? `${t}>${path}` : t;
      cur = cur.parentElement; depth++;
    }
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      selector: `${el.tagName.toLowerCase()}${id}${cls}`,
      ancestorPath: path,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      textStart: (el.textContent || '').trim().slice(0, 40),
    };
  };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__shifts.push({
        value: entry.value,
        startTimeMs: Number(entry.startTime.toFixed(2)),
        hadRecentInput: entry.hadRecentInput,
        sources: (entry.sources || []).map((s) => ({
          node: describe(s.node),
          previousRect: s.previousRect
            ? { x: Math.round(s.previousRect.x), y: Math.round(s.previousRect.y), w: Math.round(s.previousRect.width), h: Math.round(s.previousRect.height) }
            : null,
          currentRect: s.currentRect
            ? { x: Math.round(s.currentRect.x), y: Math.round(s.currentRect.y), w: Math.round(s.currentRect.width), h: Math.round(s.currentRect.height) }
            : null,
        })),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
};

/** Official CLS: largest session window, 5s max length, 1s max gap. */
function sessionWindowCls(entries) {
  const eligible = entries.filter((e) => !e.hadRecentInput);
  let best = 0, cur = 0, first = 0, prev = 0;
  for (const e of eligible) {
    if (cur > 0 && (e.startTimeMs - prev > 1000 || e.startTimeMs - first > 5000)) {
      best = Math.max(best, cur); cur = 0;
    }
    if (cur === 0) first = e.startTimeMs;
    cur += e.value; prev = e.startTimeMs;
    best = Math.max(best, cur);
  }
  return best;
}

async function measure(browser, origin, route, vp) {
  const page = await browser.newPage();
  await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.emulateNetworkConditions', THROTTLE);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  await page.evaluateOnNewDocument(COLLECTOR);

  let navError = null;
  let navTimedOut = false;
  try {
    await page.goto(origin + route.path, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT_MS });
  } catch (e) {
    navError = e.message;
    navTimedOut = /timeout/i.test(e.message);
  }

  // Let late images/fonts settle and any deferred shift register.
  await new Promise((r) => setTimeout(r, 3000));
  // Scroll through the page: below-the-fold grid items are exactly where a
  // grid->flex regression would show up, and they only load once revealed.
  try {
    await page.evaluate(async () => {
      const step = Math.floor(window.innerHeight * 0.8);
      const max = document.body.scrollHeight;
      for (let y = 0; y < max; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 250));
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 500));
    });
  } catch { /* ignore */ }
  await new Promise((r) => setTimeout(r, 1500));

  const entries = await page.evaluate(() => window.__shifts || []);
  const landed = await page.evaluate(() => location.pathname);
  const docHeight = await page.evaluate(() => document.body.scrollHeight);
  await page.close();

  const eligible = entries.filter((e) => !e.hadRecentInput);
  return {
    navError,
    navTimedOut,
    landedPathname: landed,
    documentHeightPx: docHeight,
    entryCount: entries.length,
    eligibleEntryCount: eligible.length,
    clsSessionWindow: Number(sessionWindowCls(entries).toFixed(5)),
    clsNaiveSum: Number(eligible.reduce((s, e) => s + e.value, 0).toFixed(5)),
    largestSingleShift: eligible.length ? Number(Math.max(...eligible.map((e) => e.value)).toFixed(5)) : 0,
    entries,
  };
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: chromePath(), headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const out = [];
  for (const v of VERSIONS) {
    if (!fs.existsSync(v.dist)) {
      out.push({ version: v.id, commit: v.commit, status: 'unavailable',
        reason: `dist not found at ${v.dist}`, combinations: [] });
      continue;
    }
    const srv = await startStatic(v.dist, PORT, { apiProxy: 'http://127.0.0.1:3000' });
    console.log(`\n[B] ${v.id} (${v.commit}) served at ${srv.origin}`);
    const combos = [];
    for (const route of ROUTES) {
      for (const vp of VIEWPORTS) {
        const runs = [];
        for (let i = 0; i < RUNS; i++) {
          const r = await measure(browser, srv.origin, route, vp);
          runs.push({ run: i + 1, ...r });
        }
        const sw = runs.map((r) => r.clsSessionWindow);
        combos.push({
          route: route.id, path: route.path, migrated: route.migrated,
          viewport: vp.label, viewportWidth: vp.w, viewportHeight: vp.h,
          runs,
          aggregate: {
            clsSessionWindow: stats(sw),
            clsNaiveSum: stats(runs.map((r) => r.clsNaiveSum)),
            entryCount: stats(runs.map((r) => r.entryCount)),
          },
        });
        console.log(`  ${route.id.padEnd(8)} ${vp.label.padEnd(9)} `
          + `CLS p50=${stats(sw).p50} min=${stats(sw).min} max=${stats(sw).max} `
          + `entries=${runs.map((r) => r.entryCount).join('/')}`);
      }
    }
    out.push({ version: v.id, commit: v.commit, note: v.note, dist: v.dist,
      status: 'measured', combinations: combos });
    await srv.close();
  }

  await browser.close();

  // Direct before/after delta per route x viewport.
  const pre = out.find((o) => o.version === 'pre_bootstrap_migration');
  const post = out.find((o) => o.version === 'final_bootstrap_migration');
  const comparison = [];
  if (pre?.status === 'measured' && post?.status === 'measured') {
    for (const a of pre.combinations) {
      const b = post.combinations.find((c) => c.route === a.route && c.viewport === a.viewport);
      if (!b) continue;
      comparison.push({
        route: a.route, migrated: a.migrated, viewport: a.viewport,
        preClsP50: a.aggregate.clsSessionWindow.p50,
        postClsP50: b.aggregate.clsSessionWindow.p50,
        deltaP50: Number((b.aggregate.clsSessionWindow.p50 - a.aggregate.clsSessionWindow.p50).toFixed(5)),
        preEntryP50: a.aggregate.entryCount.p50,
        postEntryP50: b.aggregate.entryCount.p50,
      });
    }
  }

  writeOut('cls-raw.json', {
    meta: meta({
      measurement: 'cls-bootstrap-migration',
      tier: '1B',
      runsPerCombination: RUNS,
      routes: ROUTES.map((r) => `${r.path}${r.migrated ? ' (migrated)' : ' (control, not migrated)'}`),
      viewports: VIEWPORTS.map((v) => v.label),
      throttling: {
        network: 'downlink/uplink 10240 Kbps, RTT 40 ms (CDP Network.emulateNetworkConditions), '
          + 'matching the Lighthouse desktop profile used in Tier 1A',
        cpu: `${CPU_SLOWDOWN}x slowdown (CDP Emulation.setCPUThrottlingRate)`,
        navigationTimeoutMs: NAV_TIMEOUT_MS,
        rationale: 'unthrottled loopback delivers every asset before first paint, which hides '
          + 'the image- and font-driven shifts that a grid-to-flex migration risks; the CPU '
          + 'slowdown keeps layout work observable',
        rejectedProfile: 'a 1.6 Mbps / 150 ms mobile profile was tried first and abandoned: '
          + 'routes that pull remote Unsplash images stalled on third-party CDN transfer until '
          + 'the navigation timeout, which would have measured Unsplash rather than FoodStory. '
          + 'Runs where navigation still timed out are flagged navTimedOut.',
      },
      clsDefinition: 'clsSessionWindow is the official metric (largest 5s session window, 1s gap). '
        + 'clsNaiveSum is the sum of all non-input shifts, reported alongside because they differ.',
      interaction: 'each run scrolls the full document in 80%-viewport steps then returns to top, '
        + 'so below-the-fold grid rows are actually rendered',
      cachePolicy: 'CDP Network.clearBrowserCache before every run',
    }),
    versions: out,
    beforeAfterComparison: comparison,
  });
}

await main();
