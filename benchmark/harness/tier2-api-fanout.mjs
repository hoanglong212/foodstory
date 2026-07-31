// TIER 2F — API fan-out per route.
//
// FoodMapView reaches for many endpoints, RecipeDetail several, Home/About/Login none.
// Measures the consequence: how many requests run before interactive, whether they are
// parallel or sequential, when the last one lands relative to LCP, and which ones the
// main thread waits on.

import puppeteer from 'puppeteer-core';
import { chromePath, meta, writeOut } from '../lib/env.mjs';
import { startStatic } from '../lib/static-server.mjs';

const DIST = 'C:/Users/Admin/AppData/Local/Temp/claude/C--COS30043-foodstory/e5c35c90-1054-4830-8a36-65b6131ca0aa/scratchpad/wt/final/frontend/dist';
const BACKEND = 'http://127.0.0.1:3000';
const PORT = 5173;
const RUNS = 3;

const ROUTES = [
  { id: 'home', path: '/', auth: null },
  { id: 'about', path: '/about', auth: null },
  { id: 'login', path: '/login', auth: null },
  { id: 'news', path: '/news', auth: null },
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

/** Longest chain of API calls where each starts after the previous finished. */
function longestSequentialChain(calls) {
  const sorted = calls.slice().sort((a, b) => a.startMs - b.startMs);
  let best = [], cur = [];
  for (const c of sorted) {
    if (!cur.length) { cur = [c]; continue; }
    const prev = cur[cur.length - 1];
    if (c.startMs >= prev.endMs - 5) cur.push(c);
    else { if (cur.length > best.length) best = cur; cur = [c]; }
  }
  if (cur.length > best.length) best = cur;
  return best;
}

async function measure(browser, origin, route, tok) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');

  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  if (route.auth) {
    await page.evaluate((t) => {
      localStorage.setItem('foodstory_token', t.token);
      localStorage.setItem('foodstory_current_user', JSON.stringify(t.user));
    }, tok);
  }

  await page.evaluateOnNewDocument(() => {
    window.__lcp = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    window.__longTasks = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__longTasks.push({ startMs: e.startTime, durationMs: e.duration });
      }).observe({ type: 'longtask', buffered: true });
    } catch { /* longtask unsupported */ }
  });

  const t0 = Date.now();
  let navError = null;
  try { await page.goto(origin + route.path, { waitUntil: 'networkidle2', timeout: 60000 }); }
  catch (e) { navError = e.message; }
  await new Promise((r) => setTimeout(r, 1200));

  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource').map((r) => ({
      name: r.name, initiatorType: r.initiatorType,
      startMs: Number(r.startTime.toFixed(2)),
      endMs: Number(r.responseEnd.toFixed(2)),
      durationMs: Number(r.duration.toFixed(2)),
      transferSize: r.transferSize, decodedBodySize: r.decodedBodySize,
    }));
    return {
      lcpMs: Number((window.__lcp || 0).toFixed(2)),
      domContentLoadedMs: nav ? Number(nav.domContentLoadedEventEnd.toFixed(2)) : null,
      loadEventMs: nav ? Number(nav.loadEventEnd.toFixed(2)) : null,
      longTasks: window.__longTasks || [],
      resources: res,
    };
  });
  const landed = await page.evaluate(() => location.pathname);
  await page.close();

  const apiCalls = perf.resources.filter((r) => /\/api\//.test(r.name))
    .map((r) => ({ ...r, endpoint: new URL(r.name).pathname }));
  const chain = longestSequentialChain(apiCalls);
  const lastEnd = apiCalls.length ? Math.max(...apiCalls.map((c) => c.endMs)) : null;
  const firstStart = apiCalls.length ? Math.min(...apiCalls.map((c) => c.startMs)) : null;

  // Concurrency: max number of API calls in flight at once.
  let maxConcurrent = 0;
  if (apiCalls.length) {
    const points = [];
    for (const c of apiCalls) { points.push([c.startMs, 1], [c.endMs, -1]); }
    points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cur = 0;
    for (const [, d] of points) { cur += d; maxConcurrent = Math.max(maxConcurrent, cur); }
  }

  const blocking = perf.longTasks.filter((t) => t.durationMs >= 50);
  return {
    navError, landedPathname: landed, wallClockMs: Date.now() - t0,
    lcpMs: perf.lcpMs,
    domContentLoadedMs: perf.domContentLoadedMs,
    loadEventMs: perf.loadEventMs,
    totalRequests: perf.resources.length,
    apiRequestCount: apiCalls.length,
    uniqueEndpoints: [...new Set(apiCalls.map((c) => c.endpoint))],
    uniqueEndpointCount: new Set(apiCalls.map((c) => c.endpoint)).size,
    firstApiStartMs: firstStart,
    lastApiEndMs: lastEnd,
    lastApiEndMinusLcpMs: lastEnd != null && perf.lcpMs ? Number((lastEnd - perf.lcpMs).toFixed(2)) : null,
    apiFinishedBeforeLcp: lastEnd != null && perf.lcpMs ? lastEnd <= perf.lcpMs : null,
    maxConcurrentApiCalls: maxConcurrent,
    longestSequentialChainLength: chain.length,
    longestSequentialChain: chain.map((c) => ({ endpoint: c.endpoint, startMs: c.startMs, endMs: c.endMs })),
    parallelismRatio: apiCalls.length ? Number((maxConcurrent / apiCalls.length).toFixed(3)) : null,
    longTasksOver50ms: blocking.length,
    longTasks: blocking,
    apiCalls: apiCalls.map((c) => ({ endpoint: c.endpoint, startMs: c.startMs, endMs: c.endMs,
      durationMs: c.durationMs, transferSize: c.transferSize })),
  };
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
      out.push({ route: route.id, path: route.path, status: 'unavailable', reason: 'login fixture failed' });
      continue;
    }
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push({ run: i + 1, ...await measure(browser, srv.origin, route, tok[route.auth]) });
    const good = runs.filter((r) => r.landedPathname === route.path);
    out.push({
      route: route.id, path: route.path, requiresAuth: route.auth,
      status: good.length ? 'measured' : 'unavailable',
      reason: good.length ? undefined : `all runs landed elsewhere (${runs[0]?.landedPathname})`,
      runs,
      summary: good.length ? {
        apiRequestCountMedian: good.map((r) => r.apiRequestCount).sort((a, b) => a - b)[Math.floor(good.length / 2)],
        uniqueEndpoints: good[0].uniqueEndpoints,
        maxConcurrentApiCalls: Math.max(...good.map((r) => r.maxConcurrentApiCalls)),
        longestSequentialChainLength: Math.max(...good.map((r) => r.longestSequentialChainLength)),
        lastApiEndMinusLcpMsMedian: good.map((r) => r.lastApiEndMinusLcpMs)
          .filter((x) => x != null).sort((a, b) => a - b)[Math.floor(good.length / 2)] ?? null,
        longTasksOver50msMax: Math.max(...good.map((r) => r.longTasksOver50ms)),
      } : undefined,
    });
    const s = out[out.length - 1].summary;
    console.log(`  ${route.id.padEnd(14)} api=${s?.apiRequestCountMedian ?? '-'} `
      + `uniq=${s?.uniqueEndpoints?.length ?? '-'} maxPar=${s?.maxConcurrentApiCalls ?? '-'} `
      + `chain=${s?.longestSequentialChainLength ?? '-'} lastApi-LCP=${s?.lastApiEndMinusLcpMsMedian ?? '-'}ms `
      + `longTasks=${s?.longTasksOver50msMax ?? '-'}`);
  }

  await browser.close();
  await srv.close();
  writeOut('api-fanout-raw.json', {
    meta: meta({
      measurement: 'api-fanout', tier: '2F', runsPerRoute: RUNS,
      method: 'PerformanceResourceTiming for request timing, PerformanceObserver for LCP and '
        + 'longtask, cold HTTP cache per run',
      definitions: {
        maxConcurrentApiCalls: 'peak number of /api/ requests in flight simultaneously',
        longestSequentialChain: 'longest run of API calls where each starts at or after the '
          + 'previous one finished (within 5ms), i.e. a waterfall rather than a fan-out',
        lastApiEndMinusLcpMs: 'positive means API traffic was still arriving after LCP',
      },
    }),
    routes: out,
  });
}

await main();
