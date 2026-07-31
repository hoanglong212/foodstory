// Starts the Final backend (current working tree) on PORT for benchmark runs.
// Loads backend/.env manually so we never depend on cwd. Read-only w.r.t. source.

import fs from 'node:fs';

const ENV = 'C:\\COS30043\\foodstory\\backend\\.env';
const envText = fs.readFileSync(ENV, 'utf8');
for (const rawLine of envText.split(/\r?\n/u)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const sep = line.indexOf('=');
  if (sep < 1) continue;
  const key = line.slice(0, sep).trim();
  let value = line.slice(sep + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (!(key in process.env)) process.env[key] = value;
}

process.env.PORT = process.env.BENCH_PORT || '3000';

// The app ships a global limiter of 500 requests / 15 min per IP (API_RATE_LIMIT_MAX,
// server.js) plus 25 failed auth attempts. A benchmark run issues far more than that
// from one address, so measured latency would degrade into 429s partway through -
// which happened: the first API sweep exhausted the quota and the checklist endpoint
// returned 200 five times then 429 twenty-five times.
//
// These overrides raise the ceiling for the measurement environment only. They are
// supplied through the documented env vars, not by editing server.js, and are recorded
// in every run's metadata so the deviation from shipped defaults is visible.
process.env.API_RATE_LIMIT_MAX = process.env.API_RATE_LIMIT_MAX || '1000000';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX || '1000000';
process.env.API_RATE_LIMIT_WINDOW_MS = process.env.API_RATE_LIMIT_WINDOW_MS || '60000';
// Keep controlled runs off paid/network providers, matching the 2026-07-18 policy.
process.env.TRACK2_V3_GOOGLE_VISION_ENABLED = 'false';
process.env.TRACK2_V3_PLACES_ENABLED = 'false';
process.env.TRACK2_V3_GEMINI_VISION_ENABLED = 'false';
process.env.TRACK2_V3_ASR_ENABLED = 'false';

console.log(`[start-backend] PORT=${process.env.PORT} DB=${process.env.DB_NAME}@${process.env.DB_HOST}:${process.env.DB_PORT}`);
await import('file:///C:/COS30043/foodstory/backend/server.js');
