// Why is an authenticated admin sometimes bounced from /admin to /?
//
// router.beforeEach awaits authStore.fetchMe({ timeoutMs: 3000 }) and then checks
// requiresAdmin && !isAdmin. Hypothesis: if that session-verification call is slow
// or fails, isAdmin is false and a genuine admin is redirected away.
//
// Tested by throttling the network so /api/auth/me exceeds the 3s budget.

import puppeteer from 'puppeteer-core';
import { chromePath } from '../lib/env.mjs';

const ORIGIN = 'http://localhost:5173';
const BACKEND = 'http://127.0.0.1:3000';

const admin = await (await fetch(`${BACKEND}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@foodstory.test', password: 'Admin123!' }),
})).json();
console.log('admin role:', admin.user.role);

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function trial({ label, delayMeMs = 0, failMe = false, runs = 6 }) {
  const landings = [];
  for (let i = 0; i < runs; i++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    if (delayMeMs || failMe) {
      await page.setRequestInterception(true);
      page.on('request', async (req) => {
        if (req.url().includes('/api/auth/me')) {
          if (failMe) return req.abort('failed');
          await new Promise((r) => setTimeout(r, delayMeMs));
          return req.continue();
        }
        req.continue();
      });
    }

    await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.clear();
      localStorage.setItem('foodstory_token', t.token);
      localStorage.setItem('foodstory_current_user', JSON.stringify(t.user));
    }, admin);

    await page.goto(ORIGIN + '/admin', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 5200));
    const st = await page.evaluate(() => ({
      path: location.pathname,
      banner: (document.body.innerText.match(/Admin permission is required[^\n]*/i) || [null])[0],
      tokenStillThere: Boolean(localStorage.getItem('foodstory_token')),
    }));
    landings.push(st);
    await page.close();
  }
  const ok = landings.filter((l) => l.path === '/admin').length;
  console.log(`\n${label}: reached /admin ${ok}/${runs}`);
  for (const [i, l] of landings.entries()) {
    console.log(`   ${i + 1}: ${l.path.padEnd(10)} token=${l.tokenStillThere} ${l.banner ? '| ' + l.banner : ''}`);
  }
  return { label, ok, runs, landings };
}

const out = [];
out.push(await trial({ label: 'A. normal network', runs: 6 }));
out.push(await trial({ label: 'B. /api/auth/me delayed 3500ms (over the 3000ms budget)', delayMeMs: 3500, runs: 6 }));
out.push(await trial({ label: 'C. /api/auth/me fails outright', failMe: true, runs: 6 }));

console.log('\n=== summary ===');
for (const t of out) console.log(`  ${t.label}: ${t.ok}/${t.runs} reached /admin`);
await browser.close();
