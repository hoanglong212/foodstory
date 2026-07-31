// TIER 3 — production build time: 1 warm-up + 5 measured `npm run build`,
// each run recorded, plus a dist/ breakdown by extension and chunk class.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { meta, writeOut, stats, loadSnapshot } from '../lib/env.mjs';

const FRONTEND = 'C:/COS30043/foodstory/frontend';
const DIST = `${FRONTEND}/dist`;
const WARMUP = 1;
const MEASURED = 5;
const SHARED_CHUNK_RE = /^(chart|vue-vendor|http-vendor|vendor|index|rolldown-runtime)-/;

function walk(dir) {
  const out = [];
  const rec = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p); else out.push(p);
    }
  };
  if (fs.existsSync(dir)) rec(dir);
  return out;
}

function distBreakdown() {
  const files = walk(DIST);
  const byExt = {};
  let total = 0;
  const assets = [];
  for (const f of files) {
    const ext = (path.extname(f) || '(none)').toLowerCase();
    const size = fs.statSync(f).size;
    total += size;
    byExt[ext] ??= { count: 0, bytes: 0 };
    byExt[ext].count++; byExt[ext].bytes += size;
    const rel = path.relative(DIST, f).replace(/\\/g, '/');
    if (/\.(js|css)$/.test(ext)) {
      const base = path.basename(f);
      let gz = null;
      try { gz = zlib.gzipSync(fs.readFileSync(f), { level: 6 }).length; } catch { /* ignore */ }
      assets.push({
        file: rel, bytes: size, gzipBytes: gz,
        kind: ext === '.js' ? (SHARED_CHUNK_RE.test(base) ? 'shared-chunk' : 'route-chunk') : 'css',
      });
    }
  }
  const js = assets.filter((a) => a.file.endsWith('.js'));
  const css = assets.filter((a) => a.file.endsWith('.css'));
  return {
    fileCount: files.length,
    totalBytes: total,
    totalMb: Number((total / 1024 ** 2).toFixed(2)),
    byExtension: Object.fromEntries(
      Object.entries(byExt).sort((a, b) => b[1].bytes - a[1].bytes)
        .map(([k, v]) => [k, { ...v, mb: Number((v.bytes / 1024 ** 2).toFixed(3)) }]),
    ),
    jsTotalBytes: js.reduce((s, a) => s + a.bytes, 0),
    jsTotalGzipBytes: js.reduce((s, a) => s + (a.gzipBytes || 0), 0),
    jsSharedGzipBytes: js.filter((a) => a.kind === 'shared-chunk').reduce((s, a) => s + (a.gzipBytes || 0), 0),
    jsRouteGzipBytes: js.filter((a) => a.kind === 'route-chunk').reduce((s, a) => s + (a.gzipBytes || 0), 0),
    cssTotalBytes: css.reduce((s, a) => s + a.bytes, 0),
    cssTotalGzipBytes: css.reduce((s, a) => s + (a.gzipBytes || 0), 0),
    assets: assets.sort((a, b) => b.bytes - a.bytes),
  };
}

function runBuild() {
  const t0 = Date.now();
  // shell:true is required on Windows under Node >=20: spawning a .cmd shim without a
  // shell is refused, which returns exitCode null and a ~1ms fake "build".
  const r = spawnSync('npm', ['run', 'build'], {
    cwd: FRONTEND, encoding: 'utf8', shell: true,
  });
  const ms = Date.now() - t0;
  const m = /built in ([\d.]+)\s*(ms|s)/.exec(r.stdout || '');
  const viteMs = m ? (m[2] === 's' ? Number(m[1]) * 1000 : Number(m[1])) : null;
  return { wallClockMs: ms, viteReportedMs: viteMs, exitCode: r.status,
    stderrTail: (r.stderr || '').split('\n').filter(Boolean).slice(-3).join(' | ') || null };
}

function main() {
  const runs = [];
  for (let i = 0; i < WARMUP + MEASURED; i++) {
    const kind = i < WARMUP ? 'warmup' : 'measured';
    const load = loadSnapshot();
    const r = runBuild();
    runs.push({ index: i, kind, loadAtStart: load, ...r });
    console.log(`  ${kind} ${i}: wall=${r.wallClockMs}ms vite=${r.viteReportedMs}ms exit=${r.exitCode} (${load})`);
  }
  const measured = runs.filter((r) => r.kind === 'measured' && r.exitCode === 0);

  writeOut('build-raw.json', {
    meta: meta({
      measurement: 'production-build', tier: '3',
      command: 'npm run build (vite build) in frontend/',
      warmupRuns: WARMUP, measuredRuns: MEASURED,
      note: 'wallClockMs includes npm and node startup; viteReportedMs is vite\'s own '
        + 'bundling time. Filesystem cache is not flushed between runs, matching the '
        + '2026-07-18 run\'s stated limitation.',
    }),
    status: measured.length ? 'measured' : 'unavailable',
    reason: measured.length ? undefined : 'no build exited 0',
    runs,
    aggregate: {
      wallClockMs: stats(measured.map((r) => r.wallClockMs)),
      viteReportedMs: stats(measured.map((r) => r.viteReportedMs)),
    },
    distBreakdown: distBreakdown(),
  });
}

main();
