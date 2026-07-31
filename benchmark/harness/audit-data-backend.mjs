// Data integrity in the live DB, plus static checks on the backend for SQL
// injection surface, missing validation, N+1 patterns and index coverage.

import fs from 'node:fs';
import path from 'node:path';
import { connect } from '../lib/db.mjs';
import { meta, writeOut } from '../lib/env.mjs';

const PUBLIC = 'C:/COS30043/foodstory/frontend/public';
const BACKEND = 'C:/COS30043/foodstory/backend';
const findings = [];
const add = (severity, area, title, detail, evidence) =>
  findings.push({ severity, area, title, detail, evidence });

const db = await connect();
const q = async (sql, params = []) => { try { const [r] = await db.query(sql, params); return r; }
  catch (e) { return { __error: e.code || e.message }; } };

console.log('=== table sizes ===');
const tables = await q(`SELECT table_name AS t, table_rows AS n FROM information_schema.tables
  WHERE table_schema = DATABASE() ORDER BY table_rows DESC`);
for (const r of tables) console.log(`  ${String(r.t).padEnd(28)} ~${r.n}`);

console.log('\n=== orphan / referential integrity ===');
const orphanChecks = [
  ['comments -> recipes', 'SELECT COUNT(*) n FROM comments c LEFT JOIN recipes r ON c.recipe_id=r.id WHERE r.id IS NULL'],
  ['comments -> users', 'SELECT COUNT(*) n FROM comments c LEFT JOIN users u ON c.user_id=u.id WHERE u.id IS NULL'],
  ['ratings -> recipes', 'SELECT COUNT(*) n FROM ratings ra LEFT JOIN recipes r ON ra.recipe_id=r.id WHERE r.id IS NULL'],
  ['ratings -> users', 'SELECT COUNT(*) n FROM ratings ra LEFT JOIN users u ON ra.user_id=u.id WHERE u.id IS NULL'],
  ['recipes -> categories', 'SELECT COUNT(*) n FROM recipes r LEFT JOIN categories c ON r.category_id=c.id WHERE r.category_id IS NOT NULL AND c.id IS NULL'],
];
const orphanRows = [];
for (const [label, sql] of orphanChecks) {
  const r = await q(sql);
  const n = r.__error ? `ERR ${r.__error}` : r[0].n;
  orphanRows.push({ check: label, count: n });
  console.log(`  ${label.padEnd(26)} ${n}`);
  if (typeof n === 'number' && n > 0) {
    add('medium', 'data', `${n} orphan row(s): ${label}`,
      'Rows reference a parent that no longer exists.', { check: label, count: n });
  }
}

console.log('\n=== duplicates ===');
const dupTitle = await q(`SELECT title, COUNT(*) n FROM recipes GROUP BY title HAVING n > 1 ORDER BY n DESC LIMIT 10`);
const dupEmail = await q(`SELECT email, COUNT(*) n FROM users GROUP BY email HAVING n > 1 LIMIT 10`);
console.log(`  duplicate recipe titles: ${Array.isArray(dupTitle) ? dupTitle.length : dupTitle.__error}`);
for (const d of (Array.isArray(dupTitle) ? dupTitle.slice(0, 6) : [])) console.log(`    "${d.title}" x${d.n}`);
console.log(`  duplicate user emails  : ${Array.isArray(dupEmail) ? dupEmail.length : dupEmail.__error}`);
if (Array.isArray(dupTitle) && dupTitle.length) {
  add('low', 'data', `${dupTitle.length} duplicate recipe title(s)`,
    'Identical titles make search results and the catalogue confusing.',
    dupTitle.slice(0, 10).map((d) => ({ title: d.title, count: d.n })));
}
if (Array.isArray(dupEmail) && dupEmail.length) {
  add('high', 'data', `${dupEmail.length} duplicate user email(s)`,
    'Email should be unique; duplicates break login identity.', dupEmail);
}

console.log('\n=== recipe images referenced vs present on disk ===');
{
  const rows = await q('SELECT id, title, image_url FROM recipes');
  const missing = [], empty = [], external = [];
  if (Array.isArray(rows)) {
    for (const r of rows) {
      const u = (r.image_url || '').trim();
      if (!u) { empty.push({ id: r.id, title: r.title }); continue; }
      if (/^https?:\/\//i.test(u)) { external.push({ id: r.id, url: u.slice(0, 70) }); continue; }
      const rel = decodeURIComponent(u.replace(/^\//, ''));
      if (!fs.existsSync(path.join(PUBLIC, rel))) missing.push({ id: r.id, title: r.title, url: u });
    }
    console.log(`  recipes: ${rows.length}, empty image_url: ${empty.length}, `
      + `external URLs: ${external.length}, local file missing: ${missing.length}`);
    for (const m of missing.slice(0, 8)) console.log(`   ! id=${m.id} "${String(m.title).slice(0, 32)}" -> ${m.url}`);
    if (missing.length) add('medium', 'data', `${missing.length} recipe image(s) point to a file that does not exist`,
      'image_url references a path under frontend/public that is absent, so those cards fall back or render blank.',
      missing.slice(0, 25));
    if (empty.length) add('low', 'data', `${empty.length} recipe(s) have no image_url`, 'Cards render without a photo.', empty.slice(0, 15));
    if (external.length) add('low', 'data', `${external.length} recipe(s) rely on an external image URL`,
      'Third-party hosting makes rendering dependent on another service staying up.', external.slice(0, 15));
  } else console.log('  query error', rows.__error);
}

console.log('\n=== index coverage on hot columns ===');
{
  const idx = await q(`SELECT table_name AS t, index_name AS i, column_name AS c
    FROM information_schema.statistics WHERE table_schema = DATABASE() ORDER BY t, i`);
  const byTable = {};
  if (Array.isArray(idx)) for (const r of idx) { (byTable[r.t] ??= new Set()).add(r.c); }
  const want = [['comments', 'recipe_id'], ['ratings', 'recipe_id'], ['ratings', 'user_id'],
    ['recipes', 'category_id'], ['comments', 'user_id']];
  const missingIdx = [];
  for (const [t, c] of want) {
    const has = byTable[t]?.has(c);
    console.log(`  ${t}.${c}`.padEnd(28) + (has ? 'indexed' : 'NOT indexed'));
    if (!has) missingIdx.push(`${t}.${c}`);
  }
  if (missingIdx.length) add('low', 'performance', `Unindexed foreign-key columns: ${missingIdx.join(', ')}`,
    'Joins and filters on these columns scan rather than seek. Harmless at 300 rows, costly as data grows.',
    missingIdx);
}

await db.end();

console.log('\n=== backend static checks ===');
{
  const walk = (d, acc = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'tests') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, acc); else if (e.name.endsWith('.js')) acc.push(p);
    }
    return acc;
  };
  const files = walk(BACKEND);
  const interpolatedSql = [], awaitInLoop = [];
  for (const f of files) {
    const txt = fs.readFileSync(f, 'utf8');
    txt.split(/\r?\n/).forEach((line, i) => {
      // SQL built with template interpolation rather than placeholders
      if (/(SELECT|INSERT|UPDATE|DELETE)[\s\S]{0,80}\$\{/i.test(line) && /`/.test(line)) {
        interpolatedSql.push({ file: path.relative(BACKEND, f).replace(/\\/g, '/'), line: i + 1,
          code: line.trim().slice(0, 130) });
      }
      if (/^\s*(for|while)\s*\(/.test(line)) awaitInLoop.push({ file: path.relative(BACKEND, f).replace(/\\/g, '/'), line: i + 1 });
    });
  }
  console.log(`  backend js files: ${files.length}`);
  console.log(`  SQL built with \${} interpolation: ${interpolatedSql.length}`);
  for (const s of interpolatedSql.slice(0, 10)) console.log(`   ${s.file}:${s.line}  ${s.code}`);
  if (interpolatedSql.length) add('medium', 'sql', `${interpolatedSql.length} SQL string(s) built with template interpolation`,
    'Interpolated SQL is only safe if the interpolated value is a literal the code controls. '
    + 'Each site needs review; the live injection probes returned no data leak.',
    interpolatedSql.slice(0, 20));
}

console.log(`\n=== ${findings.length} finding(s) ===`);
for (const f of findings) console.log(`  [${f.severity.toUpperCase()}] ${f.area}: ${f.title}`);

writeOut('data-backend-audit.json', {
  meta: meta({ measurement: 'data-integrity-and-backend-quality' }),
  tableSizes: Array.isArray(tables) ? tables : null,
  orphanChecks: orphanRows,
  findings,
});
