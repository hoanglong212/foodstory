// TIER 3 — API latency: 30 sequential requests per endpoint, every value kept.
//
// Application-only latency over loopback. No throttling, no external providers.
// Endpoints cover the four flows the report cites: login, recipe list, recipe
// detail, and checklist.

import { performance } from 'node:perf_hooks';
import { meta, writeOut, stats } from '../lib/env.mjs';

const API = 'http://127.0.0.1:3000/api';
const N = 30;
const FIX = { email: 'long@foodstory.test', password: 'User123!' };

async function timed(method, route, { token, body } = {}) {
  const t0 = performance.now();
  let status = null, bytes = null, error = null;
  try {
    const r = await fetch(API + route, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = r.status;
    const text = await r.text();
    bytes = Buffer.byteLength(text);
  } catch (e) { error = e.message; }
  return { ms: Number((performance.now() - t0).toFixed(3)), status, bytes, error };
}

async function main() {
  let token = null, loginErr = null;
  try {
    const r = await fetch(`${API}/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(FIX) });
    if (r.ok) token = (await r.json()).token; else loginErr = `HTTP ${r.status}`;
  } catch (e) { loginErr = e.message; }

  const endpoints = [
    { id: 'login', method: 'POST', route: '/auth/login', body: FIX, auth: false,
      note: 'includes bcrypt verification, so it is expected to dominate the others' },
    { id: 'recipe_list', method: 'GET', route: '/recipes', auth: false },
    { id: 'recipe_detail', method: 'GET', route: '/recipes/1', auth: false },
    { id: 'checklist', method: 'GET', route: '/checklists', auth: true,
      note: 'the fixture user long@foodstory.test has no checklists, so this endpoint returns '
        + '{"items":[]} (12 bytes). The latency therefore reflects auth plus an empty query, '
        + 'not the cost of serialising a populated checklist. Compare responseBytesFirst before '
        + 'reading anything into how fast it looks.' },
  ];

  const results = [];
  for (const ep of endpoints) {
    if (ep.auth && !token) {
      results.push({ endpoint: ep.id, method: ep.method, route: ep.route,
        status: 'unavailable', reason: `auth required but login failed: ${loginErr}` });
      continue;
    }
    // One warm-up outside the recorded set.
    await timed(ep.method, ep.route, { token: ep.auth ? token : undefined, body: ep.body });

    const runs = [];
    for (let i = 0; i < N; i++) {
      const r = await timed(ep.method, ep.route, { token: ep.auth ? token : undefined, body: ep.body });
      runs.push({ run: i + 1, ...r });
    }
    const ok = runs.filter((r) => r.status && r.status >= 200 && r.status < 300);
    results.push({
      endpoint: ep.id, method: ep.method, route: ep.route, note: ep.note,
      status: ok.length ? 'measured' : 'unavailable',
      reason: ok.length ? undefined : `no 2xx responses; first status ${runs[0]?.status}, error ${runs[0]?.error}`,
      requests: N,
      successCount: ok.length,
      nonSuccessCount: runs.length - ok.length,
      statusDistribution: runs.reduce((acc, r) => {
        const k = r.error ? `error:${r.error}` : String(r.status);
        acc[k] = (acc[k] || 0) + 1; return acc;
      }, {}),
      responseBytesFirst: runs[0]?.bytes ?? null,
      allValuesMs: runs.map((r) => r.ms),
      runs,
      aggregate: stats(ok.map((r) => r.ms)),
    });
    const a = stats(ok.map((r) => r.ms));
    console.log(`  ${ep.id.padEnd(14)} n=${ok.length}/${N} p50=${a.p50}ms p95=${a.p95}ms `
      + `min=${a.min} max=${a.max} bytes=${runs[0]?.bytes}`);
  }

  writeOut('api-latency-raw.json', {
    meta: meta({
      measurement: 'api-latency', tier: '3',
      requestsPerEndpoint: N,
      warmup: '1 unrecorded warm-up per endpoint',
      transport: 'loopback HTTP to 127.0.0.1:3000, no throttling',
      scope: 'application latency only; external providers disabled',
      rateLimitDeviation: 'the backend under test was started with API_RATE_LIMIT_MAX and '
        + 'AUTH_RATE_LIMIT_MAX raised via env vars. Shipped defaults are 500 requests / 15 min '
        + 'globally per IP and 25 failed auth attempts. At the defaults a benchmark run exhausts '
        + 'the quota and later endpoints return HTTP 429 instead of being measured. Endpoint '
        + 'statusDistribution is recorded per endpoint so any remaining throttling is visible.',
    }),
    endpoints: results,
  });
}

await main();
