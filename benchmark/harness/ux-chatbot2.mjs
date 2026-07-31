// Chatbot follow-ups: does a filtered recommendation actually render the recipes,
// does Vietnamese input get a Vietnamese answer, and how consistent is the
// out-of-scope behaviour?

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { chromePath } from '../lib/env.mjs';

const ORIGIN = 'http://localhost:5173';
const OUT = 'C:/COS30043/foodstory/benchmark/out/ux';

const PROMPTS = [
  { id: 'filter_recipes', text: 'Recommend a vegetarian recipe under 30 minutes' },
  { id: 'vi_question', text: 'Cho toi cong thuc pho bo truyen thong' },
  { id: 'vi_question2', text: 'Mon nao chay va nhanh nhat?' },
  { id: 'off_math', text: 'Solve 17 * 23 and explain the steps' },
  { id: 'off_code', text: 'Write a Python function to reverse a linked list' },
  { id: 'off_medical', text: 'I have chest pain, what medication should I take?' },
];

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1200 });
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 1800));
await page.click('.chat-bubble-btn');
await new Promise((r) => setTimeout(r, 1000));

async function ask(prompt) {
  const before = await page.evaluate(() =>
    [...document.querySelectorAll('.msg-bot')].filter((m) => !m.classList.contains('typing-bubble')).length);
  await page.evaluate(() => document.querySelector('.chat-window textarea').focus());
  await page.keyboard.type(prompt.text, { delay: 6 });
  const t0 = Date.now();
  await page.keyboard.press('Enter');
  let elapsed = null, detail = null;
  try {
    await page.waitForFunction((b) => [...document.querySelectorAll('.msg-bot')]
      .filter((m) => !m.classList.contains('typing-bubble')).length > b, { timeout: 45000 }, before);
    elapsed = Date.now() - t0;
    detail = await page.evaluate(() => {
      const bots = [...document.querySelectorAll('.msg-bot')]
        .filter((m) => !m.classList.contains('typing-bubble'));
      const last = bots[bots.length - 1];
      // The provenance label and any rendered cards sit after the bubble.
      const row = last.closest('.message-row') || last.parentElement;
      const scope = row?.parentElement || document;
      const afterNodes = [];
      let n = row?.nextElementSibling;
      let guard = 0;
      while (n && guard++ < 4) { afterNodes.push({ cls: String(n.className).slice(0, 60),
        text: (n.textContent || '').trim().slice(0, 160) }); n = n.nextElementSibling; }
      return {
        text: (last.textContent || '').trim(),
        links: [...(row?.querySelectorAll('a') || [])].map((a) => a.getAttribute('href')).slice(0, 8),
        cardsInBubble: row?.querySelectorAll('[class*="card"], li').length || 0,
        following: afterNodes,
      };
    });
  } catch { elapsed = Date.now() - t0; }
  return { elapsed, detail };
}

const results = [];
for (const p of PROMPTS) {
  const r = await ask(p);
  results.push({ ...p, ...r });
  console.log(`\n=== ${p.id} (${r.elapsed}ms) ===`);
  console.log(`Q: ${p.text}`);
  console.log(`A: ${(r.detail?.text || '(none)').slice(0, 600)}`);
  if (r.detail) {
    console.log(`   links=${JSON.stringify(r.detail.links)} cardsInBubble=${r.detail.cardsInBubble}`);
    for (const f of r.detail.following) console.log(`   after> [${f.cls}] ${f.text.slice(0, 130)}`);
  }
  await new Promise((x) => setTimeout(x, 700));
}

await page.screenshot({ path: `${OUT}/_chat_followups.png` });
fs.writeFileSync(`${OUT}/_chatbot_report2.json`, JSON.stringify(results, null, 2));
await browser.close();
