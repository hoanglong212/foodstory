// TIER 1A — route weight budget.
//
// Per route: JS bytes (transferred + uncompressed) split into route-owned chunks
// vs shared vendor chunks, CSS bytes, image bytes actually loaded, HTTP request
// count to network idle, and LCP / CLS / TBT / TTI.
//
// One warm-up + five measured Lighthouse runs per route. Every individual run is
// recorded; nothing is averaged away. Nothing is simulated: if a route cannot be
// measured, it is written with status "unavailable" and a reason.

import puppeteer from 'puppeteer-core';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import path from 'node:path';
import fs from 'node:fs';
import { chromePath, meta, writeOut, stats } from '../lib/env.mjs';
import { startStatic } from '../lib/static-server.mjs';

const DIST = process.env.BENCH_DIST
  || 'C:/Users/Admin/AppData/Local/Temp/claude/C--COS30043-foodstory/e5c35c90-1054-4830-8a36-65b6131ca0aa/scratchpad/wt/final/frontend/dist';
const BACKEND = 'http://127.0.0.1:3000';
// Must be 5173: the built bundle falls back to a hardcoded baseURL of
// http://localhost:3000/api (VITE_API_BASE_URL was unset at build time), and the
// backend's non-production CORS allowlist only permits the 5173/5174 dev origins.
// Serving the dist anywhere else makes every authenticated XHR fail CORS, which
// clears the token and redirects the auth-gated routes to /login.
const PORT = 5173;
const WARMUP = 1;
const MEASURED = 5;

// Shared chunks emitted by vite manualChunks + the app entry/runtime.
// Anything else under assets/*.js is treated as route-owned.
const SHARED_CHUNK_RE = /^(chart|vue-vendor|http-vendor|vendor|index|rolldown-runtime)-/;

const ROUTES = [
  { id: 'home',          path: '/',            auth: null },
  { id: 'news',          path: '/news',        auth: null },
  { id: 'about',         path: '/about',       auth: null },
  { id: 'recipes',       path: '/recipes',     auth: null },
  { id: 'recipe_detail', path: '/recipes/1',   auth: null },
  { id: 'food_map',      path: '/food-map',    auth: null },
  { id: 'profile',       path: '/profile',     auth: 'user' },
  { id: 'admin',         path: '/admin',       auth: 'admin' },
];

const FIXTURES = {
  user:  { email: 'long@foodstory.test',  password: 'User123!' },
  admin: { email: 'admin@foodstory.test', password: 'Admin123!' },
};

async function login(role) {
  const res = await fetch(`${BACKEND}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(FIXTURES[role]),
  });
  if (!res.ok) throw new Error(`login ${role} failed HTTP ${res.status}`);
  return res.json();
}

function classify(items) {
  const out = {
    js:    { routeChunks: [], sharedChunks: [] },
    css:   [],
    image: [],
    font:  [],
    xhr:   [],
    doc:   [],
    other: [],
  };
  for (const it of items) {
    const url = it.url || '';
    const base = path.posix.basename(new URL(url, 'http://x').pathname);
    const rec = {
      url,
      basename: base,
      resourceType: it.resourceType,
      mimeType: it.mimeType,
      statusCode: it.statusCode,
      transferBytes: it.transferSize ?? null,     // over the wire (gzipped where applicable)
      uncompressedBytes: it.resourceSize ?? null, // decoded body size
      finishedMs: it.networkEndTime != null && it.networkRequestTime != null
        ? Number((it.networkEndTime - it.networkRequestTime).toFixed(2)) : null,
      startMs: it.networkRequestTime != null ? Number(it.networkRequestTime.toFixed(2)) : null,
      endMs: it.networkEndTime != null ? Number(it.networkEndTime.toFixed(2)) : null,
    };
    const t = it.resourceType;
    if (t === 'Script') (SHARED_CHUNK_RE.test(base) ? out.js.sharedChunks : out.js.routeChunks).push(rec);
    else if (t === 'Stylesheet') out.css.push(rec);
    else if (t === 'Image') out.image.push(rec);
    else if (t === 'Font') out.font.push(rec);
    else if (t === 'XHR' || t === 'Fetch') out.xhr.push(rec);
    else if (t === 'Document') out.doc.push(rec);
    else out.other.push(rec);
  }
  return out;
}

const sum = (a, k) => a.reduce((s, x) => s + (x[k] || 0), 0);

function summariseRun(lhr) {
  const netAudit = lhr.audits['network-requests'];
  const items = netAudit?.details?.items ?? [];
  const g = classify(items);
  const num = (id) => {
    const a = lhr.audits[id];
    return a && a.numericValue != null ? Number(a.numericValue.toFixed(3)) : null;
  };
  return {
    requestCount: items.length,
    bytes: {
      jsRouteChunksTransfer: sum(g.js.routeChunks, 'transferBytes'),
      jsRouteChunksUncompressed: sum(g.js.routeChunks, 'uncompressedBytes'),
      jsSharedChunksTransfer: sum(g.js.sharedChunks, 'transferBytes'),
      jsSharedChunksUncompressed: sum(g.js.sharedChunks, 'uncompressedBytes'),
      jsTotalTransfer: sum(g.js.routeChunks, 'transferBytes') + sum(g.js.sharedChunks, 'transferBytes'),
      jsTotalUncompressed: sum(g.js.routeChunks, 'uncompressedBytes') + sum(g.js.sharedChunks, 'uncompressedBytes'),
      cssTransfer: sum(g.css, 'transferBytes'),
      cssUncompressed: sum(g.css, 'uncompressedBytes'),
      imageTransfer: sum(g.image, 'transferBytes'),
      imageUncompressed: sum(g.image, 'uncompressedBytes'),
      fontTransfer: sum(g.font, 'transferBytes'),
      xhrTransfer: sum(g.xhr, 'transferBytes'),
      documentTransfer: sum(g.doc, 'transferBytes'),
      allTransfer: sum(items.map((i) => ({ b: i.transferSize })), 'b'),
    },
    counts: {
      jsRouteChunks: g.js.routeChunks.length,
      jsSharedChunks: g.js.sharedChunks.length,
      css: g.css.length,
      image: g.image.length,
      font: g.font.length,
      xhr: g.xhr.length,
      document: g.doc.length,
      other: g.other.length,
    },
    metrics: {
      lcpMs: num('largest-contentful-paint'),
      cls: num('cumulative-layout-shift'),
      tbtMs: num('total-blocking-time'),
      ttiMs: num('interactive'),
      fcpMs: num('first-contentful-paint'),
      speedIndexMs: num('speed-index'),
      maxPotentialFidMs: num('max-potential-fid'),
      serverResponseMs: num('server-response-time'),
    },
    lighthousePerformanceScore: lhr.categories?.performance?.score ?? null,
    requests: items.map((i) => ({
      basename: path.posix.basename(new URL(i.url, 'http://x').pathname),
      resourceType: i.resourceType,
      statusCode: i.statusCode,
      transferBytes: i.transferSize ?? null,
      uncompressedBytes: i.resourceSize ?? null,
    })),
    runWarnings: lhr.runWarnings ?? [],
  };
}

async function main() {
  if (!fs.existsSync(DIST)) {
    writeOut('route-budget-raw.json', {
      meta: meta({ measurement: 'route-budget' }),
      status: 'unavailable',
      reason: `dist not found at ${DIST}`,
      routes: [],
    });
    return;
  }

  const srv = await startStatic(DIST, PORT, { apiProxy: BACKEND });
  console.log(`[A] serving ${DIST} at ${srv.origin} (api -> ${BACKEND})`);

  const tokens = {};
  for (const role of ['user', 'admin']) {
    try { tokens[role] = await login(role); console.log(`[A] auth ok: ${role}`); }
    catch (e) { console.log(`[A] auth FAILED ${role}: ${e.message}`); tokens[role] = null; }
  }

  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=9222'],
  });
  const wsPort = 9222;

  // Preserve localStorage (needed for the auth-gated routes) but force a cold HTTP
  // cache before every run, so transferBytes are real wire bytes rather than 0.
  // Lighthouse's own storage reset would wipe the seeded auth token, so cache
  // clearing is done explicitly here and applied uniformly to every route.
  const lhConfig = {
    ...desktopConfig,
    settings: { ...desktopConfig.settings, disableStorageReset: true },
  };

  async function clearHttpCache() {
    const page = await browser.newPage();
    const cdp = await page.createCDPSession();
    await cdp.send('Network.clearBrowserCache');
    await cdp.detach();
    await page.close();
  }

  const results = [];
  for (const route of ROUTES) {
    const url = srv.origin + route.path;
    console.log(`\n[A] === ${route.id}  ${route.path} ===`);

    if (route.auth && !tokens[route.auth]) {
      results.push({
        route: route.id, path: route.path, requiresAuth: route.auth,
        status: 'unavailable',
        reason: `login fixture for role "${route.auth}" failed; route redirects guests to /login so metrics would describe the wrong page`,
        runs: [],
      });
      continue;
    }

    // Seed auth into localStorage on the served origin before Lighthouse runs.
    if (route.auth) {
      const page = await browser.newPage();
      await page.goto(srv.origin, { waitUntil: 'domcontentloaded' });
      await page.evaluate((tok) => {
        localStorage.setItem('foodstory_token', tok.token);
        localStorage.setItem('foodstory_current_user', JSON.stringify(tok.user));
      }, tokens[route.auth]);
      await page.close();
    }

    const runs = [];
    for (let i = 0; i < WARMUP + MEASURED; i++) {
      const kind = i < WARMUP ? 'warmup' : 'measured';
      const t0 = Date.now();
      try {
        await clearHttpCache();
        // Re-seed auth each iteration: a redirect to /login can clear it.
        if (route.auth) {
          const page = await browser.newPage();
          await page.goto(srv.origin, { waitUntil: 'domcontentloaded' });
          await page.evaluate((tok) => {
            localStorage.setItem('foodstory_token', tok.token);
            localStorage.setItem('foodstory_current_user', JSON.stringify(tok.user));
          }, tokens[route.auth]);
          await page.close();
        }
        const flags = {
          port: wsPort,
          output: 'json',
          logLevel: 'error',
          onlyCategories: ['performance'],
        };
        const rr = await lighthouse(url, flags, lhConfig);
        const lhr = rr.lhr;
        const landedUrl = lhr.finalDisplayedUrl || lhr.finalUrl;
        // Compare pathnames: "/login?redirect=/profile" also ends with "/profile",
        // so endsWith() on the full URL silently misses the redirect.
        const redirected = new URL(landedUrl).pathname !== route.path;
        const rec = {
          index: i, kind,
          requestedUrl: url,
          landedUrl,
          redirectedAwayFromTarget: redirected,
          wallClockMs: Date.now() - t0,
          ...summariseRun(lhr),
        };
        runs.push(rec);
        console.log(`  ${kind} ${i}: req=${rec.requestCount} js=${rec.bytes.jsTotalTransfer}B `
          + `img=${rec.bytes.imageTransfer}B LCP=${rec.metrics.lcpMs}ms CLS=${rec.metrics.cls} `
          + `TBT=${rec.metrics.tbtMs}ms TTI=${rec.metrics.ttiMs}ms${redirected ? '  [REDIRECTED]' : ''}`);
      } catch (e) {
        runs.push({ index: i, kind, status: 'error', error: e.message, wallClockMs: Date.now() - t0 });
        console.log(`  ${kind} ${i}: ERROR ${e.message}`);
      }
    }

    const measured = runs.filter((r) => r.kind === 'measured' && !r.status);
    const allRedirected = measured.length > 0 && measured.every((r) => r.redirectedAwayFromTarget);
    let status = 'measured';
    let reason;
    if (!measured.length) { status = 'unavailable'; reason = 'all measured Lighthouse runs errored'; }
    else if (allRedirected) {
      status = 'unavailable';
      reason = `every run redirected to ${new URL(measured[0].landedUrl).pathname}; `
        + 'the recorded metrics describe the redirect target, not this route';
    }
    results.push({
      route: route.id,
      path: route.path,
      requiresAuth: route.auth,
      status,
      reason,
      redirectedAwayFromTarget: measured.some((r) => r.redirectedAwayFromTarget),
      runs,
      aggregate: measured.length ? {
        n: measured.length,
        requestCount: stats(measured.map((r) => r.requestCount)),
        jsTotalTransfer: stats(measured.map((r) => r.bytes.jsTotalTransfer)),
        jsRouteChunksTransfer: stats(measured.map((r) => r.bytes.jsRouteChunksTransfer)),
        jsSharedChunksTransfer: stats(measured.map((r) => r.bytes.jsSharedChunksTransfer)),
        cssTransfer: stats(measured.map((r) => r.bytes.cssTransfer)),
        imageTransfer: stats(measured.map((r) => r.bytes.imageTransfer)),
        allTransfer: stats(measured.map((r) => r.bytes.allTransfer)),
        lcpMs: stats(measured.map((r) => r.metrics.lcpMs)),
        cls: stats(measured.map((r) => r.metrics.cls)),
        tbtMs: stats(measured.map((r) => r.metrics.tbtMs)),
        ttiMs: stats(measured.map((r) => r.metrics.ttiMs)),
      } : undefined,
    });
  }

  await browser.close();
  await srv.close();

  writeOut('route-budget-raw.json', {
    meta: meta({
      measurement: 'route-budget',
      tier: '1A',
      dist: DIST,
      distCommitNote: 'frontend source identical to HEAD (git diff 522c5f2..HEAD -- frontend/ is empty)',
      lighthouseConfig: 'lighthouse/core/config/desktop-config.js (desktop preset, rtt 40ms, 10240kbps, cpuSlowdown 1)',
      lighthouseVersion: '13.4.1',
      cachePolicy: 'disableStorageReset=true to preserve the seeded auth token, with an '
        + 'explicit CDP Network.clearBrowserCache before every run (warm-up and measured) '
        + 'so transferBytes are cold-cache wire bytes',
      authHandling: 'auth token re-seeded into localStorage before each iteration; a run whose '
        + 'landed pathname differs from the target path is flagged redirectedAwayFromTarget',
      warmupRuns: WARMUP,
      measuredRuns: MEASURED,
      staticServer: 'benchmark/lib/static-server.mjs, gzip level 6 on text assets, Cache-Control: no-store',
      sharedChunkPattern: String(SHARED_CHUNK_RE),
      backendProxy: BACKEND,
      originNote: `dist served at http://127.0.0.1:${PORT} because the built bundle uses the `
        + 'hardcoded fallback baseURL http://localhost:3000/api and the backend CORS allowlist '
        + 'only accepts the 5173/5174 dev origins; XHR therefore goes direct to the backend, '
        + 'not through the static-server proxy',
    }),
    routes: results,
  });
}

await main();
