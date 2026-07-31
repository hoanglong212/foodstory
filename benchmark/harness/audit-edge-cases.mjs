// Edge cases and failure behaviour: what does a user actually see when things go
// wrong? Invalid ids, the 404 route, a dead API, and client-side form validation.

import puppeteer from 'puppeteer-core';
import { chromePath, meta, writeOut } from '../lib/env.mjs';

const ORIGIN = 'http://localhost:5173';
const BACKEND = 'http://127.0.0.1:3000';
const results = [];

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function visit(path, { blockApi = false, wait = 2500 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 150)));
  if (blockApi) {
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().includes('/api/') ? r.abort('failed') : r.continue()));
  }
  await page.goto(ORIGIN + path, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, wait));
  const info = await page.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, ' ').trim();
    return {
      path: location.pathname,
      title: document.title,
      textLength: t.length,
      visibleText: t.slice(0, 300),
      hasSpinner: Boolean(document.querySelector('[class*="spinner"], [class*="skeleton"], [class*="loading"]')),
      // Does anything look like a raw technical error leaking to the user?
      leaksTechnical: /(TypeError|undefined is not|Cannot read|ECONN|Network Error|AxiosError|at Object\.)/i.test(t),
      hasRetry: /try again|retry|reload/i.test(t),
    };
  });
  await page.close();
  return { ...info, pageErrors: errors };
}

console.log('=== invalid / edge route ids ===');
for (const p of ['/recipes/999999', '/recipes/0', '/recipes/abc', '/news/999999',
                 '/news/abc', '/this-route-does-not-exist', '/recipes/1/edit']) {
  const r = await visit(p);
  results.push({ scenario: 'route:' + p, ...r });
  console.log(`  ${p.padEnd(28)} -> ${r.path.padEnd(22)} title="${r.title.slice(0, 28)}" `
    + `len=${String(r.textLength).padStart(4)} leak=${r.leaksTechnical} spinner=${r.hasSpinner} retry=${r.hasRetry}`);
  console.log(`      "${r.visibleText.slice(0, 130)}"`);
}

console.log('\n=== API unreachable (all /api/ requests aborted) ===');
for (const p of ['/', '/recipes', '/recipes/1', '/news', '/food-map']) {
  const r = await visit(p, { blockApi: true, wait: 6000 });
  results.push({ scenario: 'api-down:' + p, ...r });
  console.log(`  ${p.padEnd(14)} len=${String(r.textLength).padStart(4)} leak=${r.leaksTechnical} `
    + `spinner=${r.hasSpinner} retry=${r.hasRetry} pageErrors=${r.pageErrors.length}`);
  console.log(`      "${r.visibleText.slice(0, 150)}"`);
}

console.log('\n=== client-side form validation ===');
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(ORIGIN + '/login', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));

  const formInfo = await page.evaluate(() => {
    const form = document.querySelector('form');
    const inputs = [...document.querySelectorAll('input')].map((i) => ({
      type: i.type, name: i.name, id: i.id, required: i.required,
      minLength: i.minLength, autocomplete: i.getAttribute('autocomplete'),
      hasLabel: Boolean(i.labels?.length) || Boolean(i.getAttribute('aria-label')),
      placeholder: i.getAttribute('placeholder'),
    }));
    return { hasForm: Boolean(form), noValidate: form?.noValidate ?? null, inputs };
  });
  console.log('  login inputs:', JSON.stringify(formInfo, null, 1).slice(0, 700));

  // Submit empty
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /log ?in|sign in/i.test(x.textContent || ''));
    b?.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  const emptySubmit = await page.evaluate(() => ({
    path: location.pathname,
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200),
  }));
  console.log('  empty submit ->', JSON.stringify(emptySubmit.text.slice(0, 140)));

  // Bad credentials
  await page.evaluate(() => {
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
      s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const em = document.querySelector('input[type="email"], input[name*="email" i]');
    const pw = document.querySelector('input[type="password"]');
    if (em) set(em, 'admin@foodstory.test');
    if (pw) set(pw, 'wrong-password-here');
  });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /log ?in|sign in/i.test(x.textContent || ''));
    b?.click();
  });
  await new Promise((r) => setTimeout(r, 2500));
  const badCreds = await page.evaluate(() => ({
    path: location.pathname,
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 260),
  }));
  console.log('  bad credentials ->', JSON.stringify(badCreds.text.slice(0, 180)));
  results.push({ scenario: 'login-form', formInfo, emptySubmit, badCreds });
  await page.close();
}

await browser.close();

writeOut('edge-cases-audit.json', {
  meta: meta({ measurement: 'edge-cases-and-error-states',
    method: 'API failure simulated by aborting every /api/ request at the network layer' }),
  results,
});
