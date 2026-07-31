// Broken links, failed requests, and the full console log per route.
//
// Vue warnings were filtered out of earlier runs; here everything is kept, because a
// Vue warn usually marks a real component contract violation.

import puppeteer from 'puppeteer-core';
import { chromePath, meta, writeOut } from '../lib/env.mjs';

const ORIGIN = 'http://localhost:5173';
const BACKEND = 'http://127.0.0.1:3000';
const FIX = { user: { email: 'long@foodstory.test', password: 'User123!' },
              admin: { email: 'admin@foodstory.test', password: 'Admin123!' } };

const ROUTES = [
  { id: 'home', path: '/', auth: null },
  { id: 'recipes', path: '/recipes', auth: null },
  { id: 'recipe_detail', path: '/recipes/1', auth: null },
  { id: 'news', path: '/news', auth: null },
  { id: 'news_detail', path: '/news/1', auth: null },
  { id: 'about', path: '/about', auth: null },
  { id: 'food_map', path: '/food-map', auth: null },
  { id: 'login', path: '/login', auth: null },
  { id: 'register', path: '/register', auth: null },
  { id: 'profile', path: '/profile', auth: 'user' },
  { id: 'favorites', path: '/favorites', auth: 'user' },
  { id: 'checklist', path: '/checklist', auth: 'user' },
  { id: 'admin', path: '/admin', auth: 'admin' },
  { id: 'notfound', path: '/this-route-does-not-exist', auth: null },
];

async function login(f) {
  const r = await fetch(`${BACKEND}/api/auth/login`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
  return r.ok ? r.json() : null;
}

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const tok = { user: await login(FIX.user), admin: await login(FIX.admin) };

const perRoute = [];
const allInternalLinks = new Set();
const externalHosts = new Map();

for (const route of ROUTES) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const consoleMsgs = [];
  const failedReqs = [];
  const httpErrors = [];

  page.on('console', (m) => consoleMsgs.push({ type: m.type(), text: m.text().replace(/\s+/g, ' ').slice(0, 220) }));
  page.on('pageerror', (e) => consoleMsgs.push({ type: 'pageerror', text: String(e.message).slice(0, 220) }));
  page.on('requestfailed', (r) => failedReqs.push({ url: r.url().slice(0, 120), reason: r.failure()?.errorText }));
  page.on('response', (r) => {
    if (r.status() >= 400) httpErrors.push({ url: r.url().slice(0, 120), status: r.status(),
      type: r.request().resourceType() });
  });

  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.clear();
    if (t) { localStorage.setItem('foodstory_token', t.token);
      localStorage.setItem('foodstory_current_user', JSON.stringify(t.user)); }
  }, route.auth ? tok[route.auth] : null);

  let navErr = null;
  try { await page.goto(ORIGIN + route.path, { waitUntil: 'networkidle2', timeout: 45000 }); }
  catch (e) { navErr = e.message; }
  await new Promise((r) => setTimeout(r, 2500));
  // Scroll so lazy assets are actually requested and any lazy failures surface.
  await page.evaluate(async () => {
    const step = Math.floor(window.innerHeight * 0.9);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 130));
    }
    window.scrollTo(0, 0);
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));

  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
    .map((a) => ({ href: a.getAttribute('href'), text: (a.textContent || '').trim().slice(0, 40),
      target: a.getAttribute('target'), rel: a.getAttribute('rel') })));

  for (const l of links) {
    if (!l.href) continue;
    if (/^https?:\/\//.test(l.href)) {
      const h = new URL(l.href).host;
      externalHosts.set(h, (externalHosts.get(h) || 0) + 1);
    } else if (l.href.startsWith('/')) allInternalLinks.add(l.href);
  }

  const landed = await page.evaluate(() => location.pathname);
  const emptyLinks = links.filter((l) => ['#', '', 'javascript:void(0)'].includes(l.href));
  const unsafeExternal = links.filter((l) => /^https?:\/\//.test(l.href) && l.target === '_blank'
    && !/noopener/.test(l.rel || ''));

  perRoute.push({
    route: route.id, path: route.path, landed, navErr,
    consoleCounts: consoleMsgs.reduce((a, m) => { a[m.type] = (a[m.type] || 0) + 1; return a; }, {}),
    consoleMessages: consoleMsgs.slice(0, 25),
    httpErrors, failedRequests: failedReqs,
    linkCount: links.length,
    emptyOrHashLinks: emptyLinks.length,
    externalBlankWithoutNoopener: unsafeExternal.map((l) => ({ href: l.href.slice(0, 80), text: l.text })),
  });

  const warn = consoleMsgs.filter((m) => m.type === 'warning' || m.type === 'warn').length;
  const err = consoleMsgs.filter((m) => m.type === 'error' || m.type === 'pageerror').length;
  console.log(`  ${route.id.padEnd(14)} landed=${landed.padEnd(26)} warn=${String(warn).padStart(2)} `
    + `err=${String(err).padStart(2)} http4xx/5xx=${String(httpErrors.length).padStart(2)} `
    + `failedReq=${String(failedReqs.length).padStart(2)} links=${links.length} emptyHref=${emptyLinks.length}`);
  await page.close();
}

// ---- verify every discovered internal link resolves to a real view
console.log('\n=== internal link check ===');
const linkResults = [];
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  for (const href of [...allInternalLinks].sort()) {
    let landed = null, is404 = false;
    try {
      await page.goto(ORIGIN + href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise((r) => setTimeout(r, 900));
      const info = await page.evaluate(() => ({
        path: location.pathname,
        notFound: /page not found|404/i.test(document.body.innerText.slice(0, 600)),
      }));
      landed = info.path; is404 = info.notFound;
    } catch (e) { landed = 'ERROR: ' + e.message.slice(0, 60); }
    linkResults.push({ href, landed, rendered404: is404 });
    if (is404 || String(landed).startsWith('ERROR')) console.log(`   ! ${href} -> ${landed} 404=${is404}`);
  }
  await page.close();
}
console.log(`  checked ${linkResults.length} internal links, ${linkResults.filter((l) => l.rendered404).length} render a 404 view`);

await browser.close();

console.log('\n=== external hosts referenced ===');
for (const [h, n] of [...externalHosts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}x ${h}`);

writeOut('links-console-audit.json', {
  meta: meta({ measurement: 'links-and-console-audit',
    note: 'all console output retained, including Vue warnings which earlier runs filtered out' }),
  totals: {
    routes: perRoute.length,
    totalConsoleWarnings: perRoute.reduce((s, r) => s + (r.consoleCounts.warning || 0) + (r.consoleCounts.warn || 0), 0),
    totalConsoleErrors: perRoute.reduce((s, r) => s + (r.consoleCounts.error || 0) + (r.consoleCounts.pageerror || 0), 0),
    totalHttpErrors: perRoute.reduce((s, r) => s + r.httpErrors.length, 0),
    totalFailedRequests: perRoute.reduce((s, r) => s + r.failedRequests.length, 0),
    internalLinksChecked: linkResults.length,
    internalLinks404: linkResults.filter((l) => l.rendered404).length,
    emptyOrHashLinks: perRoute.reduce((s, r) => s + r.emptyOrHashLinks, 0),
  },
  perRoute,
  internalLinkResults: linkResults,
  externalHosts: Object.fromEntries(externalHosts),
});
