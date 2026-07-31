// TIER 1C1 — static dark-mode coverage across the stylesheet set.
//
// Per stylesheet: total lines, count of [data-theme="dark"] rules, and the count of
// selectors that declare colour/background with no dark-scoped counterpart.
//
// Also re-checks the figures quoted in the report (12,365 CSS lines; 136 [data-theme]
// rules; "five files 02-07 at ~5,693 lines"), since those did not match a quick count.
//
// Pure static analysis: no numbers are inferred, and the counterpart test is a
// documented substring heuristic whose limitations are recorded in the output.

import fs from 'node:fs';
import path from 'node:path';
import { meta, writeOut } from '../lib/env.mjs';

const SRC = 'C:/COS30043/foodstory/frontend/src';

/** Strip comments so they cannot inflate rule or declaration counts. */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Split a stylesheet into top-level-ish rule blocks: { selector, body }. */
function extractRules(css) {
  const rules = [];
  let depth = 0, buf = '', selStart = 0;
  const text = css;
  let selector = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) selector = text.slice(selStart, i).trim();
      depth++;
      if (depth === 1) { buf = ''; continue; }
    } else if (ch === '}') {
      depth--;
      if (depth === 0) { rules.push({ selector, body: buf }); selStart = i + 1; continue; }
    }
    if (depth >= 1) buf += ch;
  }
  return rules;
}

/** Flatten at-rule bodies (@media, @supports) into their inner rules. */
function flatten(rules, inheritedAt = null) {
  const out = [];
  for (const r of rules) {
    if (r.selector.startsWith('@')) {
      const at = r.selector;
      if (/^@(media|supports|container|layer)/.test(at)) {
        out.push(...flatten(extractRules(r.body), inheritedAt ? `${inheritedAt} ${at}` : at));
      }
      continue;
    }
    out.push({ ...r, atRule: inheritedAt });
  }
  return out;
}

const DARK_RE = /\[data-theme\s*=\s*["']?dark["']?\]/i;
const LIGHT_RE = /\[data-theme\s*=\s*["']?light["']?\]/i;
const ANY_THEME_RE = /\[data-theme/i;
const COLOR_DECL_RE = /(^|[;{\s])(color|background|background-color|border-color|fill|stroke|outline-color)\s*:/i;

/** Normalise a selector for comparison: drop the theme prefix and collapse space. */
function normaliseSelector(sel) {
  return sel
    .replace(/:?(?:root|html|body)?\s*\[data-theme\s*=\s*["']?(?:dark|light)["']?\]\s*/gi, ' ')
    .replace(/:global\(([^)]*)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function analyseFile(absPath, relPath, source) {
  const raw = fs.readFileSync(absPath, 'utf8');
  const totalLines = raw.split(/\r?\n/).length;
  const css = stripComments(raw);
  const rules = flatten(extractRules(css));

  const darkRules = [];
  const lightRules = [];
  const colorRules = [];

  for (const r of rules) {
    // A selector list can contain several comma-separated selectors.
    const parts = r.selector.split(',').map((s) => s.trim()).filter(Boolean);
    const declaresColor = COLOR_DECL_RE.test(r.body);
    for (const p of parts) {
      if (DARK_RE.test(p)) darkRules.push({ selector: p, atRule: r.atRule, declaresColor });
      else if (LIGHT_RE.test(p)) lightRules.push({ selector: p, atRule: r.atRule, declaresColor });
      else if (declaresColor) colorRules.push({ selector: p, atRule: r.atRule });
    }
  }

  const darkNormalised = new Set(darkRules.map((d) => normaliseSelector(d.selector)).filter(Boolean));
  const darkNormArray = [...darkNormalised];

  const uncovered = [];
  for (const c of colorRules) {
    const n = normaliseSelector(c.selector);
    if (!n) continue;
    const covered = darkNormalised.has(n) || darkNormArray.some((d) => d.includes(n) || n.includes(d));
    if (!covered) uncovered.push({ selector: c.selector, atRule: c.atRule });
  }

  return {
    file: relPath,
    source,
    totalLines,
    ruleCount: rules.length,
    darkThemeRuleCount: darkRules.length,
    lightThemeRuleCount: lightRules.length,
    anyThemeRuleCount: darkRules.length + lightRules.length,
    colorDeclaringSelectorCount: colorRules.length,
    colorSelectorsWithoutDarkCounterpart: uncovered.length,
    darkCoverageRatio: colorRules.length
      ? Number(((colorRules.length - uncovered.length) / colorRules.length).toFixed(4))
      : null,
    uncoveredSelectors: uncovered.slice(0, 400).map((u) => u.selector),
    uncoveredSelectorsTruncated: uncovered.length > 400,
    darkSelectors: darkRules.slice(0, 200).map((d) => d.selector),
  };
}

function collectVueStyleBlocks() {
  const results = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.vue')) {
        const raw = fs.readFileSync(p, 'utf8');
        const blocks = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
        if (!blocks.length) continue;
        const css = stripComments(blocks.join('\n'));
        const rules = flatten(extractRules(css));
        let dark = 0, light = 0, color = 0;
        for (const r of rules) {
          const parts = r.selector.split(',').map((s) => s.trim()).filter(Boolean);
          const dc = COLOR_DECL_RE.test(r.body);
          for (const s of parts) {
            if (DARK_RE.test(s)) dark++;
            else if (LIGHT_RE.test(s)) light++;
            else if (dc) color++;
          }
        }
        results.push({
          file: path.relative(SRC, p).replace(/\\/g, '/'),
          styleBlockLines: blocks.join('\n').split(/\r?\n/).length,
          ruleCount: rules.length,
          darkThemeRuleCount: dark,
          lightThemeRuleCount: light,
          colorDeclaringSelectorCount: color,
        });
      }
    }
  };
  walk(SRC);
  return results;
}

function main() {
  const cssFiles = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.css')) cssFiles.push(p);
    }
  };
  walk(SRC);

  const perFile = cssFiles
    .map((p) => analyseFile(p, path.relative(SRC, p).replace(/\\/g, '/'), 'css-file'))
    .sort((a, b) => a.file.localeCompare(b.file));

  const vueBlocks = collectVueStyleBlocks();

  const stylesDir = perFile.filter((f) => f.file.startsWith('styles/'));
  const numbered0207 = stylesDir.filter((f) => /^styles\/0[2-7]-/.test(f.file));
  const themedFiles = stylesDir.filter((f) => f.darkThemeRuleCount > 0);
  const unthemedFiles = stylesDir.filter((f) => f.darkThemeRuleCount === 0);

  const totalCssLines = perFile.reduce((s, f) => s + f.totalLines, 0);
  const stylesLines = stylesDir.reduce((s, f) => s + f.totalLines, 0);
  const vueDark = vueBlocks.reduce((s, f) => s + f.darkThemeRuleCount, 0);
  const vueLight = vueBlocks.reduce((s, f) => s + f.lightThemeRuleCount, 0);
  const cssDark = perFile.reduce((s, f) => s + f.darkThemeRuleCount, 0);
  const cssLight = perFile.reduce((s, f) => s + f.lightThemeRuleCount, 0);

  writeOut('darkmode-coverage.json', {
    meta: meta({
      measurement: 'darkmode-coverage-static',
      tier: '1C1',
      method: 'brace-matching CSS rule extraction with comments stripped; @media/@supports/'
        + '@container/@layer bodies flattened into their inner rules; comma-separated selector '
        + 'lists split into individual selectors',
      counterpartHeuristic: 'a colour-declaring selector counts as covered when a dark-scoped '
        + 'selector, normalised by removing the [data-theme] prefix, equals it or contains it as '
        + 'a substring (either direction). This is a heuristic: it can over-credit a broad dark '
        + 'selector that happens to contain a narrower one, so the uncovered count is a lower '
        + 'bound on the real gap.',
      scope: 'frontend/src/**/*.css plus <style> blocks in frontend/src/**/*.vue',
    }),
    totals: {
      cssFileCount: perFile.length,
      totalCssLines,
      stylesDirLines: stylesLines,
      darkThemeRulesInCssFiles: cssDark,
      lightThemeRulesInCssFiles: cssLight,
      darkThemeRulesInVueBlocks: vueDark,
      lightThemeRulesInVueBlocks: vueLight,
      darkThemeRulesEverywhere: cssDark + vueDark,
      anyThemeRulesEverywhere: cssDark + cssLight + vueDark + vueLight,
    },
    reportClaimChecks: [
      { claim: 'frontend CSS totals 12,365 lines',
        measured: totalCssLines,
        measuredStylesDirOnly: stylesLines,
        matches: totalCssLines === 12365 || stylesLines === 12365 },
      { claim: '136 [data-theme] rules',
        measuredDarkOnlyCssFiles: cssDark,
        measuredAnyThemeCssFiles: cssDark + cssLight,
        measuredAnyThemeIncludingVue: cssDark + cssLight + vueDark + vueLight,
        matches: [cssDark, cssDark + cssLight, cssDark + vueDark, cssDark + cssLight + vueDark + vueLight].includes(136) },
      { claim: 'five files 02-07 hold ~5,693 lines and 46% of CSS with no dark rules',
        fileCount0207: numbered0207.length,
        lines0207: numbered0207.reduce((s, f) => s + f.totalLines, 0),
        shareOfStylesDir: stylesLines
          ? Number((numbered0207.reduce((s, f) => s + f.totalLines, 0) / stylesLines).toFixed(4)) : null,
        darkRulesIn0207: numbered0207.reduce((s, f) => s + f.darkThemeRuleCount, 0),
        files: numbered0207.map((f) => ({ file: f.file, lines: f.totalLines, darkRules: f.darkThemeRuleCount })) },
      { claim: 'only 01-foundation, 08-recipe-detail and 09-recipe-listing-theme-rails carry dark rules',
        filesWithDarkRules: themedFiles.map((f) => ({ file: f.file, darkRules: f.darkThemeRuleCount })),
        filesWithoutDarkRules: unthemedFiles.map((f) => ({ file: f.file, lines: f.totalLines })) },
    ],
    perCssFile: perFile,
    perVueStyleBlock: vueBlocks.filter((v) => v.ruleCount > 0)
      .sort((a, b) => b.darkThemeRuleCount - a.darkThemeRuleCount),
  });
}

main();
