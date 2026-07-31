// Chatbot review: open FoodBot, screenshot the UI, send a spread of prompts, and
// record latency plus the actual answer text. Includes off-domain and adversarial
// prompts to see whether it stays in scope.

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { chromePath } from '../lib/env.mjs';

const ORIGIN = 'http://localhost:5173';
const OUT = 'C:/COS30043/foodstory/benchmark/out/ux';

const PROMPTS = [
  { id: 'greet_vi', text: 'Xin chao' },
  { id: 'domain_dish', text: 'What is pho and what goes in it?' },
  { id: 'domain_filter', text: 'Recommend a vegetarian recipe under 30 minutes' },
  { id: 'followup', text: 'What about a dessert instead?' },
  { id: 'site_feature', text: 'How do I use the Food Map?' },
  { id: 'offdomain', text: 'What is the capital of France?' },
  { id: 'gibberish', text: 'asdkjhasd qweqwe zzzz' },
];

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const apiCalls = [];
page.on('response', (r) => {
  if (r.url().includes('/chatbot/') || r.url().includes('/vision/')) {
    apiCalls.push({ url: r.url().replace(/^.*\/api/, '/api'), status: r.status() });
  }
});
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + String(e.message).slice(0, 160)));

await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 2000));

// --- launcher
const launcher = await page.evaluate(() => {
  const b = document.querySelector('.chat-bubble-btn');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  const cs = getComputedStyle(b);
  return { text: (b.textContent || '').trim().slice(0, 60),
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    position: cs.position, zIndex: cs.zIndex,
    ariaLabel: b.getAttribute('aria-label'), tag: b.tagName };
});
console.log('launcher:', JSON.stringify(launcher));

await page.click('.chat-bubble-btn');
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${OUT}/_chat_open.png` });

const windowInfo = await page.evaluate(() => {
  const w = document.querySelector('.chat-window');
  if (!w) return null;
  const r = w.getBoundingClientRect();
  const input = w.querySelector('textarea, input[type="text"]');
  const msgs = w.querySelectorAll('.msg-bot, .msg-user');
  return {
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    viewport: { w: window.innerWidth, h: window.innerHeight },
    fitsViewport: r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1 && r.top >= -1,
    inputTag: input?.tagName, inputPlaceholder: input?.getAttribute('placeholder'),
    initialMessages: msgs.length,
    initialText: [...msgs].map((m) => (m.textContent || '').trim().slice(0, 150)),
    hint: (w.querySelector('.composer-hint')?.textContent || '').trim().slice(0, 120),
  };
});
console.log('window:', JSON.stringify(windowInfo, null, 1));

async function ask(prompt) {
  const before = await page.evaluate(() => document.querySelectorAll('.msg-bot').length);
  await page.evaluate(() => {
    const w = document.querySelector('.chat-window');
    const i = w.querySelector('textarea, input[type="text"]');
    i.focus();
  });
  await page.keyboard.type(prompt.text, { delay: 8 });
  const t0 = Date.now();
  await page.keyboard.press('Enter');

  // Wait for a new bot message beyond the typing indicator.
  let elapsed = null, answer = '(timeout)';
  try {
    await page.waitForFunction((b) => {
      const bots = [...document.querySelectorAll('.msg-bot')]
        .filter((m) => !m.classList.contains('typing-bubble'));
      return bots.length > b;
    }, { timeout: 45000 }, before);
    elapsed = Date.now() - t0;
    answer = await page.evaluate(() => {
      const bots = [...document.querySelectorAll('.msg-bot')]
        .filter((m) => !m.classList.contains('typing-bubble'));
      return (bots[bots.length - 1]?.textContent || '').trim();
    });
  } catch { elapsed = Date.now() - t0; }
  return { elapsed, answer };
}

const results = [];
for (const p of PROMPTS) {
  const r = await ask(p);
  results.push({ ...p, ...r });
  console.log(`\n--- ${p.id} (${r.elapsed}ms) ---`);
  console.log(`Q: ${p.text}`);
  console.log(`A: ${r.answer.slice(0, 500)}${r.answer.length > 500 ? ' …[' + r.answer.length + ' chars]' : ''}`);
  await new Promise((r2) => setTimeout(r2, 700));
}

await page.screenshot({ path: `${OUT}/_chat_conversation.png` });

// Mobile check
await page.setViewport({ width: 390, height: 844 });
await new Promise((r) => setTimeout(r, 1200));
const mobileFit = await page.evaluate(() => {
  const w = document.querySelector('.chat-window');
  if (!w) return null;
  const r = w.getBoundingClientRect();
  return { rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    viewport: { w: window.innerWidth, h: window.innerHeight },
    overflowsRight: r.right > window.innerWidth + 1,
    overflowsBottom: r.bottom > window.innerHeight + 1,
    coversViewportPercent: Math.round((r.width * r.height) / (window.innerWidth * window.innerHeight) * 100) };
});
console.log('\nmobile window:', JSON.stringify(mobileFit));
await page.screenshot({ path: `${OUT}/_chat_mobile.png` });

fs.writeFileSync(`${OUT}/_chatbot_report.json`, JSON.stringify(
  { launcher, windowInfo, mobileFit, results, apiCalls, consoleErrors }, null, 2));
console.log('\napi calls:', JSON.stringify(apiCalls));
console.log('console errors:', consoleErrors.length);
await browser.close();
