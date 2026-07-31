// TIER 1C2 — WCAG 2.2 AA contrast audit, light and dark.
//
// For every route x {light, dark}: walk every visible text node, resolve the text
// colour against its effective background, compute the contrast ratio, and test it
// against WCAG 2.2 AA (4.5:1 normal, 3:1 for large text >=24px or >=18.66px bold).
//
// Every failure is recorded individually. Nothing is filtered or sampled down.
// Where the effective background genuinely cannot be resolved (background-image or
// gradient behind the text), the node is reported as "indeterminate" rather than
// being given a guessed ratio.

import puppeteer from 'puppeteer-core';
import { chromePath, meta, writeOut } from '../lib/env.mjs';
import { startStatic } from '../lib/static-server.mjs';

const DIST = 'C:/Users/Admin/AppData/Local/Temp/claude/C--COS30043-foodstory/e5c35c90-1054-4830-8a36-65b6131ca0aa/scratchpad/wt/final/frontend/dist';
const BACKEND = 'http://127.0.0.1:3000';
const PORT = 5173;

const ROUTES = [
  { id: 'home', path: '/', auth: null },
  { id: 'news', path: '/news', auth: null },
  { id: 'about', path: '/about', auth: null },
  { id: 'recipes', path: '/recipes', auth: null },
  { id: 'recipe_detail', path: '/recipes/1', auth: null },
  { id: 'food_map', path: '/food-map', auth: null },
  { id: 'profile', path: '/profile', auth: 'user' },
  { id: 'admin', path: '/admin', auth: 'admin' },
];

const FIXTURES = {
  user: { email: 'long@foodstory.test', password: 'User123!' },
  admin: { email: 'admin@foodstory.test', password: 'Admin123!' },
};

const AUDIT = () => {
  const parseColor = (s) => {
    if (!s) return null;
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some((n) => Number.isNaN(n))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const selectorOf = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    let path = '', cur = el, d = 0;
    while (cur && cur.nodeType === 1 && d < 3) { path = path ? `${cur.tagName.toLowerCase()}>${path}` : cur.tagName.toLowerCase(); cur = cur.parentElement; d++; }
    return { selector: `${el.tagName.toLowerCase()}${id}${cls}`, ancestorPath: path };
  };

  const results = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let node;
  while ((node = walker.nextNode())) {
    const text = (node.textContent || '').trim();
    if (!text) continue;
    const el = node.parentElement;
    if (!el) continue;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE'].includes(el.tagName)) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (Number(cs.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    // Off-screen / clipped utility text (skip-links, sr-only) is not rendered to users.
    if (rect.bottom < 0 || rect.right < 0) continue;

    const fontSize = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || (cs.fontWeight === 'bold' ? 700 : 400);
    const isLarge = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
    const required = isLarge ? 3.0 : 4.5;

    const fg = parseColor(cs.color);
    if (!fg) continue;

    // Resolve effective background by walking ancestors.
    //
    // Pseudo-elements must be checked too. The home hero paints its photo through
    // section.hero-section::before (z-index -2) with a gradient scrim in ::after
    // (z-index -1); an element-only walk sees only the pale section background and
    // wrongly reports near-white-on-near-white for text that renders white on a dark
    // photo. Any image or gradient backdrop makes the effective colour unresolvable
    // from computed style, so those nodes are reported indeterminate.
    let bg = null, bgImageBlocked = false, bgSourceSelector = null, bgBlockReason = null;
    let cur = el;
    const layers = [];
    while (cur) {
      const s = getComputedStyle(cur);
      if (s.backgroundImage && s.backgroundImage !== 'none') {
        bgImageBlocked = true; bgSourceSelector = selectorOf(cur).selector;
        bgBlockReason = `element background-image on ${bgSourceSelector}`;
        break;
      }
      let pseudoHit = null;
      for (const pe of ['::before', '::after']) {
        const ps = getComputedStyle(cur, pe);
        if (ps.backgroundImage && ps.backgroundImage !== 'none') { pseudoHit = pe; break; }
        const pc = parseColor(ps.backgroundColor);
        if (pc && pc.a > 0 && ps.content && ps.content !== 'none') { pseudoHit = pe; break; }
      }
      if (pseudoHit) {
        bgImageBlocked = true; bgSourceSelector = selectorOf(cur).selector;
        bgBlockReason = `${pseudoHit} backdrop on ${bgSourceSelector}`;
        break;
      }
      const c = parseColor(s.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) { bgSourceSelector = selectorOf(cur).selector; break; }
      }
      cur = cur.parentElement;
    }
    if (!bgImageBlocked) {
      let base = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
      bg = base;
    }

    const key = `${selectorOf(el).selector}|${cs.color}|${fontSize}|${text.slice(0, 25)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const sel = selectorOf(el);
    if (bgImageBlocked) {
      results.push({
        status: 'indeterminate',
        reason: `text sits on an image or gradient backdrop (${bgBlockReason}); effective backdrop `
          + 'cannot be resolved from computed style and no ratio is claimed',
        ...sel, backgroundOwner: bgSourceSelector,
        color: cs.color, fontSizePx: fontSize, fontWeight: weight, isLargeText: isLarge,
        requiredRatio: required, textSample: text.slice(0, 60),
      });
      continue;
    }

    const effFg = fg.a < 1 ? over(fg, bg) : fg;
    const r = ratio(effFg, bg);
    results.push({
      status: r >= required ? 'pass' : 'fail',
      ...sel,
      color: cs.color, colorHex: hex(effFg),
      background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`, backgroundHex: hex(bg),
      backgroundOwner: bgSourceSelector,
      contrastRatio: Number(r.toFixed(3)),
      requiredRatio: required,
      shortfall: r >= required ? 0 : Number((required - r).toFixed(3)),
      fontSizePx: fontSize, fontWeight: weight, isLargeText: isLarge,
      textSample: text.slice(0, 60),
    });
  }
  return {
    themeAttr: document.documentElement.dataset.theme || null,
    pathname: location.pathname,
    results,
  };
};

async function login(role) {
  const res = await fetch(`${BACKEND}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(FIXTURES[role]),
  });
  if (!res.ok) throw new Error(`login ${role} HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const srv = await startStatic(DIST, PORT, { apiProxy: BACKEND });
  const tokens = {};
  for (const r of ['user', 'admin']) {
    try { tokens[r] = await login(r); } catch (e) { tokens[r] = null; console.log(`  auth fail ${r}: ${e.message}`); }
  }

  const browser = await puppeteer.launch({
    executablePath: chromePath(), headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const out = [];
  for (const route of ROUTES) {
    for (const theme of ['light', 'dark']) {
      if (route.auth && !tokens[route.auth]) {
        out.push({ route: route.id, path: route.path, theme, status: 'unavailable',
          reason: `login fixture for "${route.auth}" failed` });
        continue;
      }
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(srv.origin, { waitUntil: 'domcontentloaded' });
      await page.evaluate((cfg) => {
        localStorage.setItem('foodstory_dark_mode', String(cfg.dark));
        localStorage.setItem('foodstory-theme', cfg.dark ? 'dark' : 'light');
        if (cfg.tok) {
          localStorage.setItem('foodstory_token', cfg.tok.token);
          localStorage.setItem('foodstory_current_user', JSON.stringify(cfg.tok.user));
        }
      }, { dark: theme === 'dark', tok: route.auth ? tokens[route.auth] : null });

      let navError = null;
      try { await page.goto(srv.origin + route.path, { waitUntil: 'networkidle2', timeout: 60000 }); }
      catch (e) { navError = e.message; }
      await new Promise((r) => setTimeout(r, 2500));

      const audit = await page.evaluate(AUDIT);
      await page.close();

      const fails = audit.results.filter((r) => r.status === 'fail');
      const passes = audit.results.filter((r) => r.status === 'pass');
      const indet = audit.results.filter((r) => r.status === 'indeterminate');
      const redirected = audit.pathname !== route.path;

      out.push({
        route: route.id, path: route.path, theme,
        status: redirected ? 'unavailable' : 'measured',
        reason: redirected ? `landed on ${audit.pathname} instead of ${route.path}` : undefined,
        navError,
        themeAttributeApplied: audit.themeAttr,
        themeMatchesRequest: audit.themeAttr === theme,
        landedPathname: audit.pathname,
        counts: { total: audit.results.length, pass: passes.length, fail: fails.length, indeterminate: indet.length },
        failRate: audit.results.length ? Number((fails.length / (fails.length + passes.length || 1)).toFixed(4)) : null,
        worstRatio: fails.length ? Math.min(...fails.map((f) => f.contrastRatio)) : null,
        failures: fails.sort((a, b) => a.contrastRatio - b.contrastRatio),
        indeterminate: indet,
      });
      console.log(`  ${route.id.padEnd(14)} ${theme.padEnd(5)} theme=${String(audit.themeAttr).padEnd(5)} `
        + `nodes=${String(audit.results.length).padStart(4)} fail=${String(fails.length).padStart(3)} `
        + `indet=${String(indet.length).padStart(3)} worst=${fails.length ? Math.min(...fails.map((f) => f.contrastRatio)).toFixed(2) : '-'}`
        + `${redirected ? '  [REDIRECTED ' + audit.pathname + ']' : ''}`);
    }
  }

  await browser.close();
  await srv.close();

  const measured = out.filter((o) => o.status === 'measured');
  writeOut('contrast-raw.json', {
    meta: meta({
      measurement: 'wcag-contrast',
      tier: '1C2',
      standard: 'WCAG 2.2 AA: 4.5:1 normal text, 3:1 large text (>=24px, or >=18.66px at weight >=700)',
      viewport: '1440x900',
      method: 'TreeWalker over every text node; computed colour composited over the nearest '
        + 'opaque ancestor background; alpha layers composited in order over white',
      limitations: 'nodes whose backdrop is an image or gradient - on the element itself or on '
        + 'its ::before/::after - are reported as indeterminate rather than assigned a guessed '
        + 'ratio; duplicate selector+colour+size+text combinations are counted once. An earlier '
        + 'revision checked only element backgrounds and therefore reported the home hero as '
        + 'near-white-on-near-white; a screenshot showed white text on a dark Unsplash photo '
        + 'painted by section.hero-section::before, so pseudo-element backdrops are now detected. '
        + 'Indeterminate means unverified, not passing: those nodes still need manual review.',
      themeControl: 'localStorage foodstory_dark_mode and foodstory-theme set before navigation; '
        + 'the applied documentElement.dataset.theme is recorded per run so a theme that failed '
        + 'to apply is visible rather than silent',
    }),
    totals: {
      combinationsMeasured: measured.length,
      totalFailures: measured.reduce((s, o) => s + o.counts.fail, 0),
      totalIndeterminate: measured.reduce((s, o) => s + o.counts.indeterminate, 0),
      totalNodesChecked: measured.reduce((s, o) => s + o.counts.total, 0),
      failuresLightTheme: measured.filter((o) => o.theme === 'light').reduce((s, o) => s + o.counts.fail, 0),
      failuresDarkTheme: measured.filter((o) => o.theme === 'dark').reduce((s, o) => s + o.counts.fail, 0),
    },
    combinations: out,
  });
}

await main();
