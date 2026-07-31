// Loads backend/.env and exposes a MySQL connection + the backend's own mysql2.
// Forward slashes throughout: MSYS mangles backslashes when scripts are piped
// through the shell, and Node accepts forward slashes on Windows.

import fs from 'node:fs';

export const REPO_POSIX = 'C:/COS30043/foodstory';

export function loadBackendEnv() {
  const text = fs.readFileSync(`${REPO_POSIX}/backend/.env`, 'utf8');
  for (const rawLine of text.split(/\r?\n/u)) {
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
}

export async function connect() {
  loadBackendEnv();
  const mysql = (await import(`file:///${REPO_POSIX}/backend/node_modules/mysql2/promise.js`)).default;
  return mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
}
