// Aggregates every benchmark/out/*.json produced by round 2 into summary.json
// (fixed schema) and a human-readable summary.md.
//
// Anything absent or explicitly unmeasurable is recorded in unavailable[] with a
// reason. No value is ever synthesised, interpolated, or carried over from the
// 2026-07-18 archive.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { meta, OUT } from './lib/env.mjs';

const read = (name) => {
  const p = path.join(OUT, name);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return { __parseError: e.message }; }
};

const unavailable = [];
const note = (measurement, reason) => unavailable.push({ measurement, reason });

// ---------------------------------------------------------------- load sources
const src = {
  routeBudget: read('route-budget-raw.json'),
  cls: read('cls-raw.json'),
  contrast: read('contrast-raw.json'),
  darkMode: read('darkmode-coverage.json'),
  vision: read('vision-lifecycle-raw.json'),
  mapScale: read('map-scale-raw.json'),
  apiFanout: read('api-fanout-raw.json'),
  assetPayload: read('asset-payload.json'),
  cssCoverage: read('css-coverage.json'),
  build: read('build-raw.json'),
  api: read('api-latency-raw.json'),
  realtime: read('realtime-raw.json'),
  responsive: read('responsive-raw.json'),
};

const EXPECTED = {
  routeBudget: 'Tier 1A route weight budget',
  cls: 'Tier 1B CLS across the Bootstrap migration',
  contrast: 'Tier 1C2 WCAG contrast audit',
  darkMode: 'Tier 1C1 dark mode static coverage',
  vision: 'Tier 1D useVisionAuto lifecycle',
  mapScale: 'Tier 2E Leaflet clustering at scale',
  apiFanout: 'Tier 2F API fan-out per route',
  assetPayload: 'Tier 2G image payload truth',
  cssCoverage: 'Tier 2H CSS coverage per route',
  build: 'Tier 3 production build time',
  api: 'Tier 3 API latency',
  realtime: 'Tier 3 WebSocket realtime',
  responsive: 'Tier 3 responsive structural audit',
};
for (const [k, label] of Object.entries(EXPECTED)) {
  if (!src[k]) note(label, 'harness produced no output file');
  else if (src[k].__parseError) note(label, `output file could not be parsed: ${src[k].__parseError}`);
  else if (src[k].status === 'unavailable') note(label, src[k].reason || 'reported unavailable');
}

// ---------------------------------------------------------------- section builders
function routeBudget() {
  const d = src.routeBudget;
  if (!d?.routes) return { status: 'unavailable' };
  const rows = d.routes.map((r) => ({
    route: r.route, path: r.path, status: r.status, reason: r.reason,
    requestCountP50: r.aggregate?.requestCount.p50 ?? null,
    jsRouteChunkBytesP50: r.aggregate?.jsRouteChunksTransfer.p50 ?? null,
    jsSharedChunkBytesP50: r.aggregate?.jsSharedChunksTransfer.p50 ?? null,
    jsTotalBytesP50: r.aggregate?.jsTotalTransfer.p50 ?? null,
    cssBytesP50: r.aggregate?.cssTransfer.p50 ?? null,
    imageBytesP50: r.aggregate?.imageTransfer.p50 ?? null,
    allTransferBytesP50: r.aggregate?.allTransfer.p50 ?? null,
    lcpMsP50: r.aggregate?.lcpMs.p50 ?? null,
    clsP50: r.aggregate?.cls.p50 ?? null,
    tbtMsP50: r.aggregate?.tbtMs.p50 ?? null,
    ttiMsP50: r.aggregate?.ttiMs.p50 ?? null,
  }));
  for (const r of d.routes) if (r.status === 'unavailable') note(`Tier 1A route ${r.path}`, r.reason);

  const ok = rows.filter((r) => r.status === 'measured');
  const pearson = (xs, ys) => {
    const n = xs.length; if (n < 3) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
    return dx && dy ? Number((num / Math.sqrt(dx * dy)).toFixed(4)) : null;
  };
  const sharedVals = ok.map((r) => r.jsSharedChunkBytesP50).filter((x) => x != null);
  return {
    status: 'measured',
    routesMeasured: ok.length,
    routesUnavailable: rows.length - ok.length,
    warmupRuns: d.meta?.warmupRuns, measuredRuns: d.meta?.measuredRuns,
    perRoute: rows,
    sharedVendorFloorBytes: sharedVals.length && sharedVals.every((v) => v === sharedVals[0])
      ? sharedVals[0] : null,
    routeChunkShareOfJs: ok.map((r) => ({
      route: r.route,
      routeChunkPercentOfJs: r.jsTotalBytesP50
        ? Number(((r.jsRouteChunkBytesP50 / r.jsTotalBytesP50) * 100).toFixed(2)) : null,
    })),
    lcpPredictors: {
      note: 'Pearson r across measured routes, p50 values',
      jsTransferVsLcp: pearson(ok.map((r) => r.jsTotalBytesP50), ok.map((r) => r.lcpMsP50)),
      imageTransferVsLcp: pearson(ok.map((r) => r.imageBytesP50), ok.map((r) => r.lcpMsP50)),
      totalTransferVsLcp: pearson(ok.map((r) => r.allTransferBytesP50), ok.map((r) => r.lcpMsP50)),
      requestCountVsLcp: pearson(ok.map((r) => r.requestCountP50), ok.map((r) => r.lcpMsP50)),
    },
  };
}

function cls() {
  const d = src.cls;
  if (!d?.versions) return { status: 'unavailable' };
  const out = { status: 'measured', throttling: d.meta?.throttling, versions: {}, beforeAfter: d.beforeAfterComparison ?? [] };
  for (const v of d.versions) {
    if (v.status !== 'measured') { note(`Tier 1B ${v.version}`, v.reason); out.versions[v.version] = { status: v.status, reason: v.reason }; continue; }
    out.versions[v.version] = {
      status: 'measured', commit: v.commit,
      combinations: v.combinations.map((c) => ({
        route: c.route, migrated: c.migrated, viewport: c.viewport,
        clsP50: c.aggregate.clsSessionWindow.p50,
        clsMax: c.aggregate.clsSessionWindow.max,
        entryCountP50: c.aggregate.entryCount.p50,
        anyRunTimedOut: c.runs.some((r) => r.navTimedOut),
      })),
    };
  }
  const worsened = (d.beforeAfterComparison ?? []).filter((c) => c.deltaP50 > 0.005);
  const improved = (d.beforeAfterComparison ?? []).filter((c) => c.deltaP50 < -0.005);
  out.migrationVerdict = {
    combinationsCompared: (d.beforeAfterComparison ?? []).length,
    worsenedByOver0_005: worsened.length,
    improvedByOver0_005: improved.length,
    unchanged: (d.beforeAfterComparison ?? []).length - worsened.length - improved.length,
    worstRegression: worsened.sort((a, b) => b.deltaP50 - a.deltaP50)[0] ?? null,
  };
  return out;
}

function contrast() {
  const d = src.contrast;
  if (!d?.combinations) return { status: 'unavailable' };
  for (const c of d.combinations) if (c.status === 'unavailable') note(`Tier 1C2 ${c.route}/${c.theme}`, c.reason);
  return {
    status: 'measured',
    standard: d.meta?.standard,
    totals: d.totals,
    perCombination: d.combinations.filter((c) => c.status === 'measured').map((c) => ({
      route: c.route, theme: c.theme,
      themeApplied: c.themeAttributeApplied, themeMatchesRequest: c.themeMatchesRequest,
      nodesChecked: c.counts.total, failures: c.counts.fail,
      indeterminate: c.counts.indeterminate,
      failRate: c.failRate, worstRatio: c.worstRatio,
    })),
    worstOffenders: d.combinations.filter((c) => c.status === 'measured')
      .flatMap((c) => (c.failures || []).map((f) => ({ route: c.route, theme: c.theme, ...f })))
      .sort((a, b) => a.contrastRatio - b.contrastRatio).slice(0, 40),
  };
}

function darkMode() {
  const d = src.darkMode;
  if (!d?.totals) return { status: 'unavailable' };
  return {
    status: 'measured',
    totals: d.totals,
    reportClaimChecks: d.reportClaimChecks,
    perFile: d.perCssFile.map((f) => ({
      file: f.file, lines: f.totalLines,
      darkRules: f.darkThemeRuleCount, lightRules: f.lightThemeRuleCount,
      colourSelectors: f.colorDeclaringSelectorCount,
      colourSelectorsWithoutDarkCounterpart: f.colorSelectorsWithoutDarkCounterpart,
      darkCoverageRatio: f.darkCoverageRatio,
    })),
  };
}

function vision() {
  const d = src.vision;
  if (!d) return { status: 'unavailable' };
  const o = { status: 'measured' };
  if (d.cancelLatency) {
    o.cancelLatency = {
      iterations: d.cancelLatency.iterations,
      abortObservedCount: d.cancelLatency.aggregate.abortObservedCount,
      reachedIdleCount: d.cancelLatency.aggregate.reachedIdleCount,
      cancelJobCalledCount: d.cancelLatency.aggregate.cancelJobCalledCount,
      intervalsLeftBehindCount: d.cancelLatency.aggregate.intervalsLeftBehindCount,
      abortLatencyMs: d.cancelLatency.aggregate.abortLatencyMs,
      idleLatencyMs: d.cancelLatency.aggregate.idleLatencyMs,
    };
  } else note('Tier 1D cancel latency', 'not present in harness output');
  if (d.lifecycleLeak) {
    o.lifecycleLeak = {
      target: d.lifecycleLeak.target, mountError: d.lifecycleLeak.mountError,
      gcAvailable: d.lifecycleLeak.gcAvailable,
      cycles: d.lifecycleLeak.cycles, trend: d.lifecycleLeak.trend,
    };
    if (d.lifecycleLeak.mountError) {
      note('Tier 1D leak test against FoodMapView',
        `FoodMapView could not mount under jsdom: ${d.lifecycleLeak.mountError}. `
        + 'Measured against a useVisionAuto host component instead.');
    }
  } else note('Tier 1D lifecycle leak', 'not present in harness output');
  if (d.staleRunGuard) {
    o.staleRunGuard = {
      attempts: d.staleRunGuard.attempts,
      staleOverwriteRate: d.staleRunGuard.staleOverwriteRate,
      staleOverwriteCount: d.staleRunGuard.staleOverwriteCount,
      freshMarkerPresentCount: d.staleRunGuard.freshMarkerPresentCount,
      validityCheck: d.staleRunGuard.validityCheck,
    };
  } else note('Tier 1D stale run guard', 'not present in harness output');
  if (d.pollingCost) {
    o.pollingCost = {
      jobDurationMs: d.pollingCost.jobDurationMs, pollCount: d.pollingCost.pollCount,
      totalElapsedMs: d.pollingCost.totalElapsedMs, overshootMs: d.pollingCost.overshootMs,
      configuredPollDelayMs: d.pollingCost.configuredPollDelayMs,
      gapStats: d.pollingCost.gapStats,
    };
  } else note('Tier 1D polling cost', 'not present in harness output');
  return o;
}

function mapScale() {
  const d = src.mapScale;
  if (!d?.results) return { status: 'unavailable' };
  return {
    status: 'measured',
    scopeCaveat: d.meta?.scopeCaveat,
    cells: d.results.map((r) => ({
      markerCount: r.markerCount, chunkedLoading: r.chunkedLoading, status: r.status,
      drawMsP50: r.aggregate?.drawMs.p50 ?? null,
      panMsP50: r.aggregate?.panMs.p50 ?? null,
      zoomMsP50: r.aggregate?.zoomMs.p50 ?? null,
      panFramesOver50msP50: r.aggregate?.panFramesOver50ms.p50 ?? null,
      longTasksOver50msP50: r.aggregate?.longTasksOver50ms.p50 ?? null,
      longestTaskMsP50: r.aggregate?.longestTaskMs.p50 ?? null,
      heapUsedBytesP50: r.aggregate?.heapUsedBytes.p50 ?? null,
    })),
    chunkedLoadingEffect: d.chunkedLoadingEffect,
  };
}

function apiFanout() {
  const d = src.apiFanout;
  if (!d?.routes) return { status: 'unavailable' };
  for (const r of d.routes) if (r.status === 'unavailable') note(`Tier 2F route ${r.path}`, r.reason);
  return {
    status: 'measured',
    perRoute: d.routes.filter((r) => r.status === 'measured').map((r) => ({
      route: r.route, path: r.path, ...r.summary,
    })),
  };
}

function assetPayload() {
  const d = src.assetPayload;
  if (!d?.onDisk) return { status: 'unavailable' };
  return {
    status: 'measured',
    onDisk: { fileCount: d.onDisk.fileCount, totalMb: d.onDisk.totalMb, byExtension: d.onDisk.byExtension },
    remainingJpg: {
      count: d.remainingJpg.count,
      totalOriginalBytes: d.remainingJpg.totalOriginalBytes,
      totalWebpBytes: d.remainingJpg.totalWebpBytes,
      totalSavedMb: d.remainingJpg.totalSavedMb,
      totalSavedPercent: d.remainingJpg.totalSavedPercent,
      filesWhereWebpIsLarger: d.remainingJpg.filesWhereWebpIsLarger?.length ?? 0,
      top10Savings: (d.remainingJpg.perFile || []).slice(0, 10),
    },
    transferredByRoute: d.transferredByRoute,
  };
}

function cssCoverage() {
  const d = src.cssCoverage;
  if (!d?.routes) return { status: 'unavailable' };
  for (const r of d.routes) if (r.status === 'unavailable') note(`Tier 2H route ${r.route}`, r.reason);
  return {
    status: 'measured', totals: d.totals,
    ruleCountCaveat: d.meta?.ruleCountCaveat,
    perRoute: d.routes.filter((r) => r.status === 'measured').map((r) => ({
      route: r.route,
      stylesheetTotalBytes: r.stylesheetTotalBytes,
      stylesheetUsedBytes: r.stylesheetUsedBytes,
      usedBytePercent: r.usedBytePercent,
      wastedBytes: r.wastedBytes,
    })),
  };
}

function build() {
  const d = src.build;
  if (!d || d.status === 'unavailable') return { status: 'unavailable', reason: d?.reason };
  return {
    status: 'measured',
    warmupRuns: d.meta?.warmupRuns, measuredRuns: d.meta?.measuredRuns,
    wallClockMs: d.aggregate.wallClockMs,
    viteReportedMs: d.aggregate.viteReportedMs,
    perRun: d.runs.map((r) => ({ kind: r.kind, wallClockMs: r.wallClockMs, viteReportedMs: r.viteReportedMs, exitCode: r.exitCode })),
    dist: {
      fileCount: d.distBreakdown.fileCount,
      totalMb: d.distBreakdown.totalMb,
      jsTotalGzipBytes: d.distBreakdown.jsTotalGzipBytes,
      jsSharedGzipBytes: d.distBreakdown.jsSharedGzipBytes,
      jsRouteGzipBytes: d.distBreakdown.jsRouteGzipBytes,
      cssTotalGzipBytes: d.distBreakdown.cssTotalGzipBytes,
      byExtension: d.distBreakdown.byExtension,
    },
  };
}

function api() {
  const d = src.api;
  if (!d?.endpoints) return { status: 'unavailable' };
  for (const e of d.endpoints) if (e.status === 'unavailable') note(`Tier 3 API ${e.endpoint}`, e.reason);
  return {
    status: 'measured', requestsPerEndpoint: d.meta?.requestsPerEndpoint,
    endpoints: d.endpoints.filter((e) => e.status === 'measured').map((e) => ({
      endpoint: e.endpoint, method: e.method, route: e.route,
      n: e.aggregate.n, p50: e.aggregate.p50, p95: e.aggregate.p95,
      min: e.aggregate.min, max: e.aggregate.max, stdev: e.aggregate.stdev,
      responseBytes: e.responseBytesFirst,
    })),
  };
}

function realtime() {
  const d = src.realtime;
  if (!d || d.status === 'unavailable') return { status: 'unavailable', reason: d?.reason };
  return {
    status: 'measured', design: d.meta?.design,
    expectedObservations: d.meta?.expectedObservations,
    totals: d.totals,
    cleanupVerified: d.meta?.cleanupVerified,
    evidenceForZeroClaims: {
      lossMeasuredDirectly: true, lossCount: d.totals.lossCount,
      duplicationMeasuredDirectly: true, duplicateCount: d.totals.duplicateCount,
      orderingMeasuredDirectly: true, misorderedSequences: d.totals.misorderedSequences,
    },
  };
}

function responsive() {
  const d = src.responsive;
  if (!d?.combinations) return { status: 'unavailable' };
  for (const c of d.combinations) if (c.status === 'unavailable') note(`Tier 3 responsive ${c.route}@${c.viewportWidth}`, c.reason);
  return {
    status: 'measured',
    viewportWidths: d.meta?.viewportWidths,
    totalsPerRule: d.totalsPerRule,
    perCombination: d.combinations.filter((c) => c.status === 'measured').map((c) => ({
      route: c.route, viewportWidth: c.viewportWidth,
      violationsPerRule: c.violationsPerRule, totalViolations: c.totalViolations,
    })),
  };
}

// ---------------------------------------------------------------- assemble
const summary = {
  meta: {
    ...meta({ measurement: 'round-2 summary', round: 2, roundDate: '2026-07-30' }),
    supersedes: 'the 2026-07-18 comparative benchmark, archived verbatim at '
      + 'benchmark/archive/comparative-benchmark-20260718/ and never used as a round-2 value',
  },
  routeBudget: routeBudget(),
  cls: cls(),
  contrast: contrast(),
  darkModeCoverage: darkMode(),
  visionLifecycle: vision(),
  mapScale: mapScale(),
  apiFanout: apiFanout(),
  assetPayload: assetPayload(),
  cssCoverage: cssCoverage(),
  build: build(),
  api: api(),
  realtime: realtime(),
  responsive: responsive(),
  unavailable,
};

fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
console.log(`wrote summary.json (${fs.statSync(path.join(OUT, 'summary.json')).size.toLocaleString()} bytes)`);

// ---------------------------------------------------------------- summary.md
const m = summary.meta;
const L = [];
L.push('# FoodStory benchmark — round 2');
L.push('');
L.push(`Measured ${m.runAtIso} on commit \`${m.commitShort}\` (${m.branch}).`);
L.push('');
L.push('| Environment | |');
L.push('|---|---|');
L.push(`| Commit | \`${m.commit}\` |`);
L.push(`| Node / npm | ${m.node} / ${m.npm} |`);
L.push(`| Chrome | ${m.chrome} |`);
L.push(`| OS | ${m.osCaption} |`);
L.push(`| CPU | ${m.cpu} |`);
L.push(`| RAM | ${m.ramGb} GB |`);
L.push(`| Load at summary time | ${m.load} |`);
L.push('');
L.push('This is a new measurement round. It does not reuse any value from the 2026-07-18');
L.push('benchmark, which is archived verbatim at `benchmark/archive/comparative-benchmark-20260718/`.');
L.push('');

if (summary.routeBudget.status === 'measured') {
  L.push('## Tier 1A — route weight budget');
  L.push('');
  L.push('| Route | Req | JS route | JS shared | CSS | Images | LCP p50 | CLS | TBT | TTI |');
  L.push('|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
  for (const r of summary.routeBudget.perRoute) {
    if (r.status !== 'measured') { L.push(`| \`${r.path}\` | — | — | — | — | — | — | — | — | unavailable |`); continue; }
    L.push(`| \`${r.path}\` | ${r.requestCountP50} | ${r.jsRouteChunkBytesP50} | ${r.jsSharedChunkBytesP50} | ${r.cssBytesP50} | ${r.imageBytesP50} | ${r.lcpMsP50} | ${r.clsP50} | ${r.tbtMsP50} | ${r.ttiMsP50} |`);
  }
  L.push('');
  const p = summary.routeBudget.lcpPredictors;
  L.push(`Bundle vs images as an LCP predictor — Pearson r: JS **${p.jsTransferVsLcp}**, `
    + `images **${p.imageTransferVsLcp}**, total transfer **${p.totalTransferVsLcp}**, `
    + `request count **${p.requestCountVsLcp}**.`);
  if (summary.routeBudget.sharedVendorFloorBytes) {
    L.push('');
    L.push(`Shared vendor floor is identical on every route: **${summary.routeBudget.sharedVendorFloorBytes} bytes** transferred.`);
  }
  L.push('');
}

if (summary.cls.status === 'measured') {
  L.push('## Tier 1B — CLS across the Bootstrap grid migration');
  L.push('');
  const v = summary.cls.migrationVerdict;
  L.push(`${v.combinationsCompared} route x viewport combinations compared before and after. `
    + `Worsened by >0.005: **${v.worsenedByOver0_005}**. Improved: **${v.improvedByOver0_005}**. `
    + `Unchanged: **${v.unchanged}**.`);
  L.push('');
  if (summary.cls.beforeAfter.length) {
    L.push('| Route | Migrated | Viewport | CLS before | CLS after | Delta |');
    L.push('|---|---|---|--:|--:|--:|');
    for (const c of summary.cls.beforeAfter) {
      L.push(`| ${c.route} | ${c.migrated ? 'yes' : 'control'} | ${c.viewport} | ${c.preClsP50} | ${c.postClsP50} | ${c.deltaP50} |`);
    }
    L.push('');
  }
}

if (summary.darkModeCoverage.status === 'measured') {
  L.push('## Tier 1C1 — dark mode coverage');
  L.push('');
  L.push('| Stylesheet | Lines | Dark rules | Light rules | Colour selectors | No dark counterpart |');
  L.push('|---|--:|--:|--:|--:|--:|');
  for (const f of summary.darkModeCoverage.perFile) {
    L.push(`| \`${f.file}\` | ${f.lines} | ${f.darkRules} | ${f.lightRules} | ${f.colourSelectors} | ${f.colourSelectorsWithoutDarkCounterpart} |`);
  }
  L.push('');
}

if (summary.contrast.status === 'measured') {
  L.push('## Tier 1C2 — WCAG 2.2 AA contrast');
  L.push('');
  L.push(`${summary.contrast.totals.totalNodesChecked} text nodes checked across `
    + `${summary.contrast.totals.combinationsMeasured} route x theme combinations. `
    + `**${summary.contrast.totals.totalFailures} failures** `
    + `(${summary.contrast.totals.failuresLightTheme} light, ${summary.contrast.totals.failuresDarkTheme} dark), `
    + `${summary.contrast.totals.totalIndeterminate} indeterminate.`);
  L.push('');
  L.push('| Route | Theme | Nodes | Failures | Worst ratio |');
  L.push('|---|---|--:|--:|--:|');
  for (const c of summary.contrast.perCombination) {
    L.push(`| ${c.route} | ${c.theme} | ${c.nodesChecked} | ${c.failures} | ${c.worstRatio ?? '—'} |`);
  }
  L.push('');
}

if (summary.visionLifecycle.status === 'measured') {
  L.push('## Tier 1D — useVisionAuto lifecycle');
  L.push('');
  const v = summary.visionLifecycle;
  if (v.cancelLatency) {
    L.push(`**Cancel** (${v.cancelLatency.iterations} iterations): abort observed `
      + `${v.cancelLatency.abortObservedCount}/${v.cancelLatency.iterations}, reached idle `
      + `${v.cancelLatency.reachedIdleCount}/${v.cancelLatency.iterations}, cancelJob called `
      + `${v.cancelLatency.cancelJobCalledCount}/${v.cancelLatency.iterations}, intervals left behind `
      + `${v.cancelLatency.intervalsLeftBehindCount}.`);
  }
  if (v.staleRunGuard) L.push(`**Stale-run guard**: ${v.staleRunGuard.staleOverwriteRate} superseded runs overwrote state.`);
  if (v.pollingCost) {
    L.push(`**Polling**: ${v.pollingCost.pollCount} polls for a ${v.pollingCost.jobDurationMs} ms job `
      + `(configured delay ${v.pollingCost.configuredPollDelayMs} ms, overshoot ${v.pollingCost.overshootMs} ms).`);
  }
  if (v.lifecycleLeak) {
    const t = v.lifecycleLeak.trend;
    L.push(`**Leak** (${v.lifecycleLeak.cycles} mount/unmount cycles against ${v.lifecycleLeak.target}, `
      + `global.gc ${v.lifecycleLeak.gcAvailable ? 'forced' : 'NOT available'}): `
      + `listener delta **${t.listenerDeltaTotal}**, live-timer delta **${t.timerDeltaTotal}**, `
      + `retained DOM nodes **${t.domNodesFinal}**. `
      + `Heap slope ${t.heapSlopeBytesPerCycle} B/cycle over all cycles but `
      + `**${t.heapSlopeSecondHalfBytesPerCycle} B/cycle over the second half** — `
      + `${t.slopeInterpretation}`);
  }
  L.push('');
}

for (const [key, title] of [
  ['mapScale', 'Tier 2E — Leaflet clustering at scale'],
  ['apiFanout', 'Tier 2F — API fan-out'],
  ['assetPayload', 'Tier 2G — image payload'],
  ['cssCoverage', 'Tier 2H — CSS coverage'],
  ['build', 'Tier 3 — build'],
  ['api', 'Tier 3 — API latency'],
  ['realtime', 'Tier 3 — WebSocket'],
  ['responsive', 'Tier 3 — responsive audit'],
]) {
  const s = summary[key];
  L.push(`## ${title}`);
  L.push('');
  if (s.status !== 'measured') { L.push(`Unavailable: ${s.reason ?? 'no data'}`); L.push(''); continue; }
  if (key === 'cssCoverage') {
    L.push('Rule-count percentages are deliberately omitted: CDP reports only rules it observed');
    L.push('as used, so used/total is always a constant 100% artifact. Byte coverage against the');
    L.push('full stylesheet text is the valid measure.');
    L.push('');
    L.push('| Route | Used bytes | Stylesheet bytes | Used % of bytes | Unused bytes |');
    L.push('|---|--:|--:|--:|--:|');
    for (const r of s.perRoute) {
      L.push(`| ${r.route} | ${r.stylesheetUsedBytes} | ${r.stylesheetTotalBytes} | ${r.usedBytePercent} | ${r.wastedBytes} |`);
    }
  } else if (key === 'api') {
    L.push('| Endpoint | n | p50 ms | p95 ms | min | max |');
    L.push('|---|--:|--:|--:|--:|--:|');
    for (const e of s.endpoints) L.push(`| ${e.method} ${e.route} | ${e.n} | ${e.p50} | ${e.p95} | ${e.min} | ${e.max} |`);
  } else if (key === 'responsive') {
    L.push('Violations per rule, summed across all measured combinations:');
    L.push('');
    for (const [r, n] of Object.entries(s.totalsPerRule)) L.push(`- \`${r}\`: **${n}**`);
  } else if (key === 'realtime') {
    L.push(`${s.totals.observations} observations (design: ${s.design}). `
      + `Loss **${s.totals.lossCount}**, duplication **${s.totals.duplicateCount}**, `
      + `misordered sequences **${s.totals.misorderedSequences}**. `
      + `Latency p50 ${s.totals.latencyMs.p50} ms, p95 ${s.totals.latencyMs.p95} ms.`);
  } else if (key === 'build') {
    L.push(`Wall clock p50 **${s.wallClockMs.p50} ms** (p95 ${s.wallClockMs.p95}), `
      + `vite-reported p50 **${s.viteReportedMs.p50} ms**. `
      + `dist ${s.dist.totalMb} MB across ${s.dist.fileCount} files; `
      + `JS gzip ${s.dist.jsTotalGzipBytes} B (shared ${s.dist.jsSharedGzipBytes}, route ${s.dist.jsRouteGzipBytes}).`);
  } else if (key === 'assetPayload') {
    L.push(`public/ is ${s.onDisk.totalMb} MB across ${s.onDisk.fileCount} files. `
      + `${s.remainingJpg.count} JPGs remain; converting them to WebP q82 would save `
      + `**${s.remainingJpg.totalSavedMb} MB (${s.remainingJpg.totalSavedPercent}%)**.`);
  } else if (key === 'mapScale') {
    L.push(`_Scope_: ${s.scopeCaveat}`);
    L.push('');
    L.push('| Markers | chunked | Draw p50 ms | Pan p50 ms | Zoom p50 ms | Long tasks >50ms | Worst task ms |');
    L.push('|--:|---|--:|--:|--:|--:|--:|');
    for (const c of s.cells) L.push(`| ${c.markerCount} | ${c.chunkedLoading} | ${c.drawMsP50} | ${c.panMsP50} | ${c.zoomMsP50} | ${c.longTasksOver50msP50} | ${c.longestTaskMsP50} |`);
  } else if (key === 'apiFanout') {
    L.push('| Route | API reqs | Unique endpoints | Max parallel | Longest chain | Last API − LCP ms |');
    L.push('|---|--:|--:|--:|--:|--:|');
    for (const r of s.perRoute) L.push(`| \`${r.path}\` | ${r.apiRequestCountMedian} | ${r.uniqueEndpoints?.length ?? '—'} | ${r.maxConcurrentApiCalls} | ${r.longestSequentialChainLength} | ${r.lastApiEndMinusLcpMsMedian ?? '—'} |`);
  }
  L.push('');
}

L.push('## Unavailable measurements');
L.push('');
if (!unavailable.length) L.push('None — every planned measurement produced data.');
else for (const u of unavailable) L.push(`- **${u.measurement}** — ${u.reason}`);
L.push('');

fs.writeFileSync(path.join(OUT, 'summary.md'), L.join('\n'), 'utf8');
console.log(`wrote summary.md (${fs.statSync(path.join(OUT, 'summary.md')).size.toLocaleString()} bytes)`);

// ---------------------------------------------------------------- checksums
const files = fs.readdirSync(OUT).filter((f) => f !== 'CHECKSUMS.txt').sort();
const lines = files.map((f) => {
  const buf = fs.readFileSync(path.join(OUT, f));
  return `${crypto.createHash('sha256').update(buf).digest('hex')}  ${f}`;
});
fs.writeFileSync(path.join(OUT, 'CHECKSUMS.txt'), lines.join('\n') + '\n', 'utf8');
console.log(`wrote CHECKSUMS.txt (${files.length} files)`);
