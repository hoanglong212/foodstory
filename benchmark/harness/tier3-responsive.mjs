// TIER 3 — responsive structural audit: 3 routes x 6 viewports.
// Violations are counted per rule and listed individually, never rolled into one total.

import puppeteer from 'puppeteer-core';
import { chromePath, meta, writeOut } from '../lib/env.mjs';
import { startStatic } from '../lib/static-server.mjs';

const DIST = 'C:/Users/Admin/AppData/Local/Temp/claude/C--COS30043-foodstory/e5c35c90-1054-4830-8a36-65b6131ca0aa/scratchpad/wt/final/frontend/dist';
const BACKEND = 'http://127.0.0.1:3000';
const PORT = 5173;
const WIDTHS = [305, 360, 375, 753, 1009, 1425];
const ROUTES = [
  { id: 'recipes', path: '/recipes' },
  { id: 'news', path: '/news' },
  { id: 'food_map', path: '/food-map' },
];

const AUDIT = (vw) => {
  const sel = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const all = [...document.body.querySelectorAll('*')];
  const rules = {};

  // R1 document-level horizontal overflow
  rules.documentHorizontalOverflow = {
    description: 'document scrollWidth exceeds the viewport width',
    violations: document.documentElement.scrollWidth > vw + 1
      ? [{ scrollWidth: document.documentElement.scrollWidth, viewportWidth: vw,
           overflowPx: document.documentElement.scrollWidth - vw }] : [],
  };

  // R2 individual elements extending past the right edge
  rules.elementOverflowsViewport = {
    description: 'a visible element extends more than 1px past the right viewport edge',
    violations: all.filter((el) => {
      if (!visible(el)) return false;
      const r = el.getBoundingClientRect();
      return r.right > vw + 1 && r.width <= vw * 3;
    }).slice(0, 120).map((el) => {
      const r = el.getBoundingClientRect();
      return { selector: sel(el), right: Math.round(r.right), width: Math.round(r.width),
        overflowPx: Math.round(r.right - vw) };
    }),
  };

  // R3 touch targets below 44x44 CSS px
  const interactive = all.filter((el) =>
    ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)
    || el.getAttribute('role') === 'button');
  rules.touchTargetTooSmall = {
    description: 'interactive element smaller than 44x44 CSS px',
    violations: interactive.filter((el) => {
      if (!visible(el)) return false;
      if (el.tagName === 'INPUT' && ['hidden'].includes(el.type)) return false;
      const r = el.getBoundingClientRect();
      return r.width < 44 || r.height < 44;
    }).slice(0, 120).map((el) => {
      const r = el.getBoundingClientRect();
      return { selector: sel(el), width: Math.round(r.width), height: Math.round(r.height),
        text: (el.textContent || '').trim().slice(0, 30) };
    }),
  };

  // R4 text below 12px
  rules.textTooSmall = {
    description: 'rendered text smaller than 12px',
    violations: all.filter((el) => {
      if (!visible(el)) return false;
      if (!el.textContent || !el.textContent.trim()) return false;
      const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!direct) return false;
      return parseFloat(getComputedStyle(el).fontSize) < 12;
    }).slice(0, 120).map((el) => ({ selector: sel(el),
      fontSizePx: parseFloat(getComputedStyle(el).fontSize),
      text: (el.textContent || '').trim().slice(0, 30) })),
  };

  // R5 images with no intrinsic sizing hint (a layout-shift risk)
  rules.imageWithoutDimensions = {
    description: 'img with neither width/height attributes nor an aspect-ratio style',
    violations: [...document.images].filter((img) => {
      if (!visible(img)) return false;
      const hasAttrs = img.hasAttribute('width') && img.hasAttribute('height');
      const ar = getComputedStyle(img).aspectRatio;
      return !hasAttrs && (!ar || ar === 'auto');
    }).slice(0, 120).map((img) => ({ selector: sel(img),
      src: (img.currentSrc || img.src || '').split('/').pop()?.slice(0, 50),
      renderedWidth: Math.round(img.getBoundingClientRect().width) })),
  };

  // R6 horizontally scrollable inner containers
  rules.innerHorizontalScroll = {
    description: 'a non-root element scrolls horizontally',
    violations: all.filter((el) => {
      if (!visible(el)) return false;
      return el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0
        && ['auto', 'scroll'].includes(getComputedStyle(el).overflowX);
    }).slice(0, 60).map((el) => ({ selector: sel(el),
      scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })),
  };

  return {
    viewportWidth: vw,
    documentScrollWidth: document.documentElement.scrollWidth,
    documentScrollHeight: document.documentElement.scrollHeight,
    elementCount: all.length,
    rules,
  };
};

async function main() {
  const srv = await startStatic(DIST, PORT, { apiProxy: BACKEND });
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  const out = [];
  for (const route of ROUTES) {
    for (const w of WIDTHS) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
      let navError = null;
      try { await page.goto(srv.origin + route.path, { waitUntil: 'networkidle2', timeout: 60000 }); }
      catch (e) { navError = e.message; }
      await new Promise((r) => setTimeout(r, 1800));
      const audit = await page.evaluate(AUDIT, w);
      const landed = await page.evaluate(() => location.pathname);
      await page.close();

      const perRule = Object.fromEntries(
        Object.entries(audit.rules).map(([k, v]) => [k, v.violations.length]));
      const total = Object.values(perRule).reduce((a, b) => a + b, 0);
      out.push({
        route: route.id, path: route.path, viewportWidth: w,
        status: landed === route.path ? 'measured' : 'unavailable',
        reason: landed === route.path ? undefined : `landed on ${landed}`,
        navError,
        documentScrollWidth: audit.documentScrollWidth,
        elementCount: audit.elementCount,
        violationsPerRule: perRule,
        totalViolations: total,
        rules: audit.rules,
      });
      console.log(`  ${route.id.padEnd(10)} ${String(w).padStart(4)}px  `
        + Object.entries(perRule).map(([k, v]) => `${k.replace(/[a-z]/g, '')}=${v}`).join(' ')
        + `  total=${total}`);
    }
  }

  await browser.close();
  await srv.close();

  const measured = out.filter((o) => o.status === 'measured');
  const ruleNames = measured.length ? Object.keys(measured[0].violationsPerRule) : [];
  writeOut('responsive-raw.json', {
    meta: meta({
      measurement: 'responsive-structural-audit', tier: '3',
      viewportWidths: WIDTHS, viewportHeight: 900,
      routes: ROUTES.map((r) => r.path),
      rulesChecked: ruleNames,
      note: 'violation lists are capped at 120 entries per rule per combination to bound file '
        + 'size; the count reported is the capped list length, so a capped rule is a lower bound',
    }),
    totalsPerRule: Object.fromEntries(ruleNames.map((n) => [n,
      measured.reduce((s, o) => s + o.violationsPerRule[n], 0)])),
    combinations: out,
  });
}

await main();
