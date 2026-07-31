// Shared environment + metadata helpers for FoodStory benchmark round 2.
// Every measurement file embeds meta() so a run is never ambiguous about
// which commit, machine, or runtime produced it.

import { execFileSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

export const REPO = 'C:\\COS30043\\foodstory';
export const OUT = path.join(REPO, 'benchmark', 'out');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

export function chromePath() {
  for (const c of CHROME_CANDIDATES) if (fs.existsSync(c)) return c;
  throw new Error('No Chrome/Edge binary found');
}

export function chromeVersion() {
  try {
    const p = chromePath();
    const out = execFileSync('powershell', [
      '-NoProfile', '-Command',
      `(Get-Item '${p}').VersionInfo.ProductVersion`,
    ], { encoding: 'utf8' });
    return out.trim();
  } catch { return 'unknown'; }
}

function sh(cmd, args, opts = {}) {
  try { return execFileSync(cmd, args, { cwd: REPO, encoding: 'utf8', ...opts }).trim(); }
  catch { return 'unknown'; }
}

// Node >=20 on Windows refuses to spawn a .cmd shim without a shell, so `npm -v`
// silently returned "unknown" until this used shell:true.
function npmVersion() {
  return sh('npm', ['-v'], process.platform === 'win32' ? { shell: true } : {});
}

/** Instantaneous CPU load, used to record whether the machine was busy. */
export function loadSnapshot() {
  try {
    const raw = execFileSync('powershell', [
      '-NoProfile', '-Command',
      "(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average",
    ], { encoding: 'utf8' }).trim();
    const pct = Number(raw);
    return Number.isFinite(pct) ? `cpu_load_percent=${pct}` : `cpu_load_percent=unknown(${raw})`;
  } catch { return 'cpu_load_percent=unavailable'; }
}

let cpuModel = null;
function cpu() {
  if (cpuModel) return cpuModel;
  const cpus = os.cpus();
  cpuModel = `${cpus[0]?.model?.trim() ?? 'unknown'} (${cpus.length} logical)`;
  return cpuModel;
}

export function meta(extra = {}) {
  return {
    commit: sh('git', ['rev-parse', 'HEAD']),
    commitShort: sh('git', ['rev-parse', '--short', 'HEAD']),
    branch: sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
    runAtIso: new Date().toISOString(),
    node: process.version,
    npm: npmVersion(),
    chrome: chromeVersion(),
    os: `${os.type()} ${os.release()} (${os.platform()} ${os.arch()})`,
    osCaption: 'Microsoft Windows 11 Home Single Language 10.0.26200',
    cpu: cpu(),
    cpuCores: os.cpus().length,
    ramGb: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
    load: loadSnapshot(),
    harnessVersion: '2.0.0',
    ...extra,
  };
}

export function writeOut(name, payload) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  const bytes = fs.statSync(file).size;
  console.log(`  wrote ${name} (${bytes.toLocaleString()} bytes)`);
  return file;
}

/** Percentile over a numeric array (linear interpolation). */
export function pct(arr, p) {
  const a = arr.filter((x) => Number.isFinite(x)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  if (a.length === 1) return a[0];
  const idx = (p / 100) * (a.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (idx - lo);
}

export function stats(arr) {
  const a = arr.filter((x) => Number.isFinite(x));
  if (!a.length) return { n: 0, status: 'unavailable', reason: 'no finite samples' };
  const mean = a.reduce((s, x) => s + x, 0) / a.length;
  const sd = a.length > 1
    ? Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / (a.length - 1))
    : 0;
  return {
    n: a.length,
    min: Math.min(...a),
    max: Math.max(...a),
    mean: Number(mean.toFixed(4)),
    stdev: Number(sd.toFixed(4)),
    p50: Number(pct(a, 50).toFixed(4)),
    p95: Number(pct(a, 95).toFixed(4)),
  };
}

/** Uniform shape for anything that could not be measured. */
export function unavailable(measurement, reason) {
  return { measurement, status: 'unavailable', reason };
}
