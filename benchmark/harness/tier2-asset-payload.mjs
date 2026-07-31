// TIER 2G — the truth about the image payload.
//
// frontend/public is ~51 MB: 200 WebP files were converted but JPGs remain.
// The report says "a directly comparable final total-output measurement was not
// recorded". This measures:
//   - bytes on disk by format
//   - which JPGs remain, their size, and the WebP saving measured by actually
//     running sharp (originals are never overwritten; output goes to a temp dir)
//
// Transferred-bytes-by-route comes from the Tier 1A route budget and is joined here.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { meta, writeOut, stats } from '../lib/env.mjs';

const PUBLIC = 'C:/COS30043/foodstory/frontend/public';
const TMP = path.join(os.tmpdir(), `foodstory-webp-probe-${Date.now()}`);
const ROUTE_BUDGET = 'C:/COS30043/foodstory/benchmark/out/route-budget-raw.json';

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

async function main() {
  const files = walk(PUBLIC);
  const byExt = {};
  let total = 0;
  for (const f of files) {
    const ext = (path.extname(f) || '(none)').toLowerCase();
    const size = fs.statSync(f).size;
    total += size;
    byExt[ext] ??= { count: 0, bytes: 0 };
    byExt[ext].count++; byExt[ext].bytes += size;
  }

  const jpgs = files.filter((f) => /\.jpe?g$/i.test(f));
  console.log(`[G] ${files.length} files, ${(total / 1024 ** 2).toFixed(1)} MB total, ${jpgs.length} JPG remaining`);

  fs.mkdirSync(TMP, { recursive: true });
  const conversions = [];
  let converted = 0;
  for (const f of jpgs) {
    const rel = path.relative(PUBLIC, f).replace(/\\/g, '/');
    const original = fs.statSync(f).size;
    const outPath = path.join(TMP, `${converted}.webp`);
    try {
      // quality 82 is a conventional visually-lossless-ish setting for photos.
      const info = await sharp(f).webp({ quality: 82 }).toFile(outPath);
      const webpBytes = info.size;
      conversions.push({
        file: rel, originalBytes: original, webpBytes,
        savedBytes: original - webpBytes,
        savedPercent: Number((((original - webpBytes) / original) * 100).toFixed(2)),
        width: info.width, height: info.height,
      });
      fs.unlinkSync(outPath);
    } catch (e) {
      conversions.push({ file: rel, originalBytes: original, status: 'error', error: String(e.message).slice(0, 160) });
    }
    converted++;
    if (converted % 25 === 0) console.log(`  converted ${converted}/${jpgs.length}`);
  }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }

  const ok = conversions.filter((c) => c.webpBytes != null);
  const totalOriginal = ok.reduce((s, c) => s + c.originalBytes, 0);
  const totalWebp = ok.reduce((s, c) => s + c.webpBytes, 0);

  // Join transferred-bytes-by-route from Tier 1A if it exists.
  let perRouteImageTransfer = { status: 'unavailable', reason: 'route-budget-raw.json not found' };
  if (fs.existsSync(ROUTE_BUDGET)) {
    const rb = JSON.parse(fs.readFileSync(ROUTE_BUDGET, 'utf8'));
    perRouteImageTransfer = {
      status: 'measured',
      source: 'benchmark/out/route-budget-raw.json (Tier 1A, cold cache, p50 of 5 measured runs)',
      routes: rb.routes.filter((r) => r.aggregate).map((r) => ({
        route: r.route, path: r.path,
        imageTransferBytesP50: r.aggregate.imageTransfer.p50,
        imageRequestCount: r.runs.find((x) => x.kind === 'measured')?.counts.image ?? null,
        allTransferBytesP50: r.aggregate.allTransfer.p50,
        imageShareOfTransfer: r.aggregate.allTransfer.p50
          ? Number((r.aggregate.imageTransfer.p50 / r.aggregate.allTransfer.p50).toFixed(4)) : null,
      })),
    };
  }

  writeOut('asset-payload.json', {
    meta: meta({
      measurement: 'asset-payload', tier: '2G',
      publicDir: PUBLIC,
      sharpVersion: sharp.versions,
      conversionSettings: 'sharp .webp({ quality: 82 }); originals never modified; '
        + 'output written to a temp dir and deleted after measuring',
    }),
    onDisk: {
      fileCount: files.length,
      totalBytes: total,
      totalMb: Number((total / 1024 ** 2).toFixed(2)),
      byExtension: Object.fromEntries(
        Object.entries(byExt).sort((a, b) => b[1].bytes - a[1].bytes)
          .map(([k, v]) => [k, { ...v, mb: Number((v.bytes / 1024 ** 2).toFixed(3)) }]),
      ),
    },
    remainingJpg: {
      count: jpgs.length,
      convertedSuccessfully: ok.length,
      conversionErrors: conversions.length - ok.length,
      totalOriginalBytes: totalOriginal,
      totalWebpBytes: totalWebp,
      totalSavedBytes: totalOriginal - totalWebp,
      totalSavedMb: Number(((totalOriginal - totalWebp) / 1024 ** 2).toFixed(2)),
      totalSavedPercent: totalOriginal
        ? Number((((totalOriginal - totalWebp) / totalOriginal) * 100).toFixed(2)) : null,
      savedPercentDistribution: stats(ok.map((c) => c.savedPercent)),
      filesWhereWebpIsLarger: ok.filter((c) => c.savedBytes < 0)
        .map((c) => ({ file: c.file, originalBytes: c.originalBytes, webpBytes: c.webpBytes })),
      perFile: conversions.sort((a, b) => (b.savedBytes ?? 0) - (a.savedBytes ?? 0)),
    },
    transferredByRoute: perRouteImageTransfer,
  });
}

await main();
