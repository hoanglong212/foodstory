// Diagnostic: why do the auth-gated routes redirect under measurement?
import puppeteer from 'puppeteer-core';
import { chromePath } from '../lib/env.mjs';
import { startStatic } from '../lib/static-server.mjs';

const DIST = 'C:/Users/Admin/AppData/Local/Temp/claude/C--COS30043-foodstory/e5c35c90-1054-4830-8a36-65b6131ca0aa/scratchpad/wt/final/frontend/dist';
const BACKEND = 'http://127.0.0.1:3000';

const srv = await startStatic(DIST, 5174, { apiProxy: BACKEND });
const tok = await (await fetch(`${BACKEND}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'long@foodstory.test', password: 'User123!' }),
})).json();
console.log('token len', tok.token.length, 'user', tok.user.email, tok.user.role);

// Does the proxied /api/auth/me accept this token?
const me = await fetch(`${srv.origin}/api/auth/me`, { headers: { Authorization: `Bearer ${tok.token}` } });
console.log('proxied /api/auth/me ->', me.status, (await me.text()).slice(0, 200));

const browser = await puppeteer.launch({
  executablePath: chromePath(), headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();

page.on('console', (m) => console.log('  [page]', m.type(), m.text().slice(0, 200)));
page.on('requestfailed', (r) => console.log('  [failed]', r.url().slice(0, 90), r.failure()?.errorText));
page.on('response', (r) => {
  if (r.url().includes('/api/')) console.log('  [api]', r.status(), r.url().replace(srv.origin, ''));
});

await page.goto(srv.origin, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => {
  localStorage.setItem('foodstory_token', t.token);
  localStorage.setItem('foodstory_current_user', JSON.stringify(t.user));
}, tok);
console.log('seeded. stored token len:',
  await page.evaluate(() => (localStorage.getItem('foodstory_token') || '').length));

console.log('\n--- navigating to /profile ---');
await page.goto(`${srv.origin}/profile`, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 1500));
console.log('landed pathname:', await page.evaluate(() => location.pathname + location.search));
console.log('token still present:',
  await page.evaluate(() => (localStorage.getItem('foodstory_token') || '').length));
console.log('h1/h2 text:', (await page.evaluate(() => document.body.innerText.slice(0, 200))).replace(/\n/g, ' | '));

await browser.close();
await srv.close();
