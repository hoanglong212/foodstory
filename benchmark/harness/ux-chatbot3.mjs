// Confirmation pass for two suspected chatbot defects:
//   A. a non-food query being misrouted into recipe retrieval
//   B. Vietnamese filter keywords not being parsed, unlike their English equivalents
// Each prompt is repeated so a one-off is distinguishable from a reproducible bug.

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { chromePath } from '../lib/env.mjs';

const ORIGIN = 'http://localhost:5173';
const REPEATS = 3;
const PROMPTS = [
  { id: 'A_math', text: 'Solve 17 * 23 and explain the steps' },
  { id: 'A_history', text: 'Who won the 1998 FIFA World Cup?' },
  { id: 'B_vi_veg', text: 'Mon chay nao nhanh nhat duoi 30 phut?' },
  { id: 'B_en_veg', text: 'Which vegetarian dish is fastest under 30 minutes?' },
  { id: 'B_vi_dessert', text: 'Cho toi mon trang mieng' },
  { id: 'B_en_dessert', text: 'Show me a dessert' },
];

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const out = [];

for (const p of PROMPTS) {
  for (let i = 0; i < REPEATS; i++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    // ChatBot persists history via chatConversationMemory, so a fresh tab restores the
    // previous conversation. Without clearing it, a "wait for a new bot message" check
    // is satisfied instantly by restored history and every answer reads one prompt
    // stale — which is exactly what the first version of this script produced.
    await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1500));
    await page.click('.chat-bubble-btn');
    await new Promise((r) => setTimeout(r, 900));

    const before = await page.evaluate(() => [...document.querySelectorAll('.msg-bot')]
      .filter((m) => !m.classList.contains('typing-bubble')).length);
    await page.evaluate(() => document.querySelector('.chat-window textarea').focus());
    await page.keyboard.type(p.text, { delay: 5 });
    const t0 = Date.now();
    await page.keyboard.press('Enter');
    let elapsed = null, text = '(timeout)', provenance = null, cards = 0;
    try {
      await page.waitForFunction((b) => [...document.querySelectorAll('.msg-bot')]
        .filter((m) => !m.classList.contains('typing-bubble')).length > b, { timeout: 40000 }, before);
      elapsed = Date.now() - t0;
      const d = await page.evaluate(() => {
        const bots = [...document.querySelectorAll('.msg-bot')]
          .filter((m) => !m.classList.contains('typing-bubble'));
        const last = bots[bots.length - 1];
        const row = last.closest('.message-row') || last.parentElement;
        let prov = null, n = row?.nextElementSibling, g = 0;
        while (n && g++ < 3) {
          const t = (n.textContent || '').trim();
          if (/Grounded in FoodStory|Groq knowledge/i.test(t)) { prov = t.slice(0, 60); break; }
          n = n.nextElementSibling;
        }
        return { text: (last.textContent || '').trim(),
          cards: row?.querySelectorAll('[class*="card"], li').length || 0, prov };
      });
      text = d.text; provenance = d.prov; cards = d.cards;
    } catch { elapsed = Date.now() - t0; }

    const looksLikeRecipe = /Preparation:|Cooking:|Preheat|Ingredients?:|Nguyên liệu|Cách làm|tbsp|grams?\b/i.test(text);
    const countMatch = text.match(/found (\d+) FoodStory recipes/i);
    out.push({ id: p.id, repeat: i + 1, prompt: p.text, elapsed, provenance, cards,
      looksLikeRecipe, recipesFound: countMatch ? Number(countMatch[1]) : null,
      answer: text.slice(0, 240) });
    await page.close();
  }
}

for (const p of PROMPTS) {
  const rows = out.filter((o) => o.id === p.id);
  console.log(`\n=== ${p.id} : "${p.text}"`);
  for (const r of rows) {
    console.log(`  #${r.repeat} ${String(r.elapsed).padStart(5)}ms  found=${r.recipesFound ?? '-'} `
      + `cards=${r.cards} recipeShaped=${r.looksLikeRecipe}  prov=${r.provenance ?? '-'}`);
    console.log(`      ${r.answer.replace(/\n/g, ' ').slice(0, 150)}`);
  }
}

fs.writeFileSync('C:/COS30043/foodstory/benchmark/out/ux/_chatbot_report3.json', JSON.stringify(out, null, 2));
await browser.close();
