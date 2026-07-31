// Accessibility audit: axe-core (WCAG 2.1/2.2 A + AA) on every route in both
// themes, plus keyboard-focus checks that axe cannot see.
//
// Complements the Tier 1C2 contrast pass, which only covered colour ratios.

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { chromePath, meta, writeOut } from '../lib/env.mjs';

const ORIGIN = 'http://localhost:5173';
const BACKEND = 'http://127.0.0.1:3000';
const AXE = fs.readFileSync('C:/COS30043/foodstory/benchmark/node_modules/axe-core/axe.min.js', 'utf8');

const ROUTES = [
  { id: 'home', path: '/', auth: null },
  { id: 'recipes', path: '/recipes', auth: null },
  { id: 'recipe_detail', path: '/recipes/1', auth: null },
  { id: 'news', path: '/news', auth: null },
  { id: 'about', path: '/about', auth: null },
  { id: 'food_map', path: '/food-map', auth: null },
  { id: 'login', path: '/login', auth: null },
  { id: 'register', path: '/register', auth: null },
  { id: 'profile', path: '/profile', auth: 'user' },
  { id: 'admin', path: '/admin', auth: 'admin' },
];
const FIX = { user: { email: 'long@foodstory.test', password: 'User123!' },
              admin: { email: 'admin@foodstory.test', password: 'Admin123!' } };

async function login(f) {
  const r = await fetch(`${BACKEND}/api/auth/login`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
  return r.ok ? r.json() : null;
}

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const tok = { user: await login(FIX.user), admin: await login(FIX.admin) };

const results = [];
for (const route of ROUTES) {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
    await page.evaluate((cfg) => {
      localStorage.clear();
      localStorage.setItem('foodstory_dark_mode', String(cfg.dark));
      localStorage.setItem('foodstory-theme', cfg.dark ? 'dark' : 'light');
      if (cfg.tok) {
        localStorage.setItem('foodstory_token', cfg.tok.token);
        localStorage.setItem('foodstory_current_user', JSON.stringify(cfg.tok.user));
      }
    }, { dark: theme === 'dark', tok: route.auth ? tok[route.auth] : null });

    let navErr = null;
    try { await page.goto(ORIGIN + route.path, { waitUntil: 'networkidle2', timeout: 45000 }); }
    catch (e) { navErr = e.message; }
    await new Promise((r) => setTimeout(r, 2500));

    const landed = await page.evaluate(() => location.pathname);
    await page.evaluate(AXE);
    const axeResult = await page.evaluate(async () => {
      const r = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
        resultTypes: ['violations'],
      });
      return {
        violations: r.violations.map((v) => ({
          id: v.id, impact: v.impact, help: v.help, wcagTags: v.tags.filter((t) => /^wcag/.test(t)),
          nodeCount: v.nodes.length,
          nodes: v.nodes.slice(0, 6).map((n) => ({
            target: n.target.join(' '),
            html: (n.html || '').slice(0, 140),
            failureSummary: (n.failureSummary || '').replace(/\s+/g, ' ').slice(0, 200),
          })),
        })),
        passCount: r.passes?.length ?? null,
      };
    });

    // Keyboard / focus checks axe cannot perform.
    const kb = await page.evaluate(() => {
      const focusables = [...document.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => {
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
        });
      let noVisibleFocusRing = 0;
      const samples = [];
      for (const el of focusables.slice(0, 60)) {
        el.focus();
        const cs = getComputedStyle(el);
        const hasRing = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0)
          || cs.boxShadow !== 'none';
        if (!hasRing) {
          noVisibleFocusRing++;
          if (samples.length < 8) samples.push({
            tag: el.tagName.toLowerCase(),
            cls: String(el.className).slice(0, 50),
            text: (el.textContent || '').trim().slice(0, 30),
            outline: cs.outline, boxShadow: cs.boxShadow.slice(0, 40),
          });
        }
      }
      const positiveTabindex = [...document.querySelectorAll('[tabindex]')]
        .filter((e) => Number(e.getAttribute('tabindex')) > 0)
        .map((e) => ({ tag: e.tagName.toLowerCase(), tabindex: e.getAttribute('tabindex') }));
      const skip = document.querySelector('a[href^="#"]');
      const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
        .map((h) => Number(h.tagName[1]));
      const jumps = [];
      for (let i = 1; i < headings.length; i++) {
        if (headings[i] - headings[i - 1] > 1) jumps.push(`h${headings[i - 1]} -> h${headings[i]}`);
      }
      return {
        focusableCount: focusables.length,
        checkedForFocusRing: Math.min(60, focusables.length),
        withoutVisibleFocusRing: noVisibleFocusRing,
        focusRingSamples: samples,
        positiveTabindex,
        h1Count: document.querySelectorAll('h1').length,
        headingJumps: jumps,
        skipLinkText: skip ? (skip.textContent || '').trim().slice(0, 40) : null,
        skipLinkTarget: skip?.getAttribute('href') || null,
        skipTargetExists: skip ? Boolean(document.querySelector(skip.getAttribute('href'))) : null,
        langAttr: document.documentElement.lang || null,
        imagesWithoutAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).length,
        imagesEmptyAlt: [...document.images].filter((i) => i.getAttribute('alt') === '').length,
        totalImages: document.images.length,
      };
    });

    const v = axeResult.violations;
    results.push({ route: route.id, path: route.path, theme, landed, navErr,
      violationTypes: v.length,
      violationNodes: v.reduce((s, x) => s + x.nodeCount, 0),
      byImpact: v.reduce((a, x) => { a[x.impact || 'unknown'] = (a[x.impact || 'unknown'] || 0) + x.nodeCount; return a; }, {}),
      violations: v, keyboard: kb });

    console.log(`  ${route.id.padEnd(14)} ${theme.padEnd(5)} axe: ${String(v.length).padStart(2)} types / `
      + `${String(v.reduce((s, x) => s + x.nodeCount, 0)).padStart(3)} nodes  `
      + `| noFocusRing ${kb.withoutVisibleFocusRing}/${kb.checkedForFocusRing} `
      + `| h1=${kb.h1Count} jumps=${kb.headingJumps.length} lang=${kb.langAttr} `
      + `| imgNoAlt=${kb.imagesWithoutAlt}/${kb.totalImages}`);
    await page.close();
  }
}

await browser.close();

const allViolations = {};
for (const r of results) {
  for (const v of r.violations) {
    allViolations[v.id] ??= { id: v.id, impact: v.impact, help: v.help, wcagTags: v.wcagTags,
      totalNodes: 0, routes: new Set() };
    allViolations[v.id].totalNodes += v.nodeCount;
    allViolations[v.id].routes.add(`${r.route}/${r.theme}`);
  }
}
const ranked = Object.values(allViolations)
  .map((v) => ({ ...v, routes: [...v.routes] }))
  .sort((a, b) => b.totalNodes - a.totalNodes);

writeOut('a11y-raw.json', {
  meta: meta({ measurement: 'accessibility-audit',
    tool: `axe-core ${JSON.parse(fs.readFileSync('C:/COS30043/foodstory/benchmark/node_modules/axe-core/package.json', 'utf8')).version}`,
    tags: 'wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice',
    viewport: '1440x900',
    note: 'focus-ring check inspects computed outline/box-shadow on the first 60 focusable '
      + 'elements per page after programmatic focus; it cannot detect rings drawn only on '
      + ':focus-visible via keyboard interaction, so it is indicative rather than definitive' }),
  totals: {
    combinations: results.length,
    distinctViolationRules: ranked.length,
    totalViolationNodes: results.reduce((s, r) => s + r.violationNodes, 0),
  },
  rankedViolations: ranked,
  perCombination: results,
});
