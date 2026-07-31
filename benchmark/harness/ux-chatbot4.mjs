// Is the Vietnamese filter gap about the language, or about missing diacritics?
// Same intent expressed three ways, isolated conversation each time.

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { chromePath } from '../lib/env.mjs';

const ORIGIN = 'http://localhost:5173';
const REPEATS = 3;
const PROMPTS = [
  { id: 'vi_diacritics_veg', text: 'Món chay nào nhanh nhất dưới 30 phút?' },
  { id: 'vi_plain_veg',      text: 'Mon chay nao nhanh nhat duoi 30 phut?' },
  { id: 'en_veg',            text: 'Which vegetarian dish is fastest under 30 minutes?' },
  { id: 'vi_diacritics_des', text: 'Cho tôi món tráng miệng' },
  { id: 'vi_plain_des',      text: 'Cho toi mon trang mieng' },
  { id: 'en_des',            text: 'Show me a dessert' },
];

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const out = [];

for (const p of PROMPTS) {
  for (let i = 0; i < REPEATS; i++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1400));
    await page.click('.chat-bubble-btn');
    await new Promise((r) => setTimeout(r, 800));

    const before = await page.evaluate(() => [...document.querySelectorAll('.msg-bot')]
      .filter((m) => !m.classList.contains('typing-bubble')).length);
    // Typing non-ASCII reliably requires insertText rather than key events.
    await page.evaluate((t) => {
      const ta = document.querySelector('.chat-window textarea');
      ta.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, t);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, p.text);
    const t0 = Date.now();
    await page.keyboard.press('Enter');

    let elapsed = null, text = '(timeout)';
    try {
      await page.waitForFunction((b) => [...document.querySelectorAll('.msg-bot')]
        .filter((m) => !m.classList.contains('typing-bubble')).length > b, { timeout: 40000 }, before);
      elapsed = Date.now() - t0;
      text = await page.evaluate(() => {
        const bots = [...document.querySelectorAll('.msg-bot')]
          .filter((m) => !m.classList.contains('typing-bubble'));
        return (bots[bots.length - 1]?.textContent || '').trim();
      });
    } catch { elapsed = Date.now() - t0; }

    const failed = /không thể hiểu|không thể xác định|Which recipe do you mean/i.test(text);
    const gaveDish = /Ingredients?:|Nguyên liệu|Preparation|Cách làm/i.test(text)
      || /found \d+ FoodStory recipes/i.test(text);
    out.push({ id: p.id, repeat: i + 1, prompt: p.text, elapsed, failed, gaveDish,
      answer: text.replace(/\s+/g, ' ').slice(0, 200) });
    await page.close();
  }
}

for (const p of PROMPTS) {
  const rows = out.filter((o) => o.id === p.id);
  const fails = rows.filter((r) => r.failed).length;
  const good = rows.filter((r) => r.gaveDish).length;
  console.log(`\n=== ${p.id}  "${p.text}"`);
  console.log(`    failed ${fails}/${rows.length} | gave a dish ${good}/${rows.length}`);
  console.log(`    e.g. ${rows[0].answer.slice(0, 160)}`);
}

fs.writeFileSync('C:/COS30043/foodstory/benchmark/out/ux/_chatbot_report4.json', JSON.stringify(out, null, 2));
await browser.close();
