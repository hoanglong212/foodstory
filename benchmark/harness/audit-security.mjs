// Security audit of the local FoodStory instance.
//
// Server-side authorization is probed directly: the client hides admin controls, but
// the only thing that matters is whether the API enforces them. Also checks the built
// bundle for leaked secrets and sourcemaps, CORS behaviour, and response headers.

import fs from 'node:fs';
import path from 'node:path';
import { meta, writeOut } from '../lib/env.mjs';

const API = 'http://127.0.0.1:3000/api';
const DIST = 'C:/COS30043/foodstory/frontend/dist';
const SRC = 'C:/COS30043/foodstory/frontend/src';

const findings = [];
const add = (severity, area, title, detail, evidence) =>
  findings.push({ severity, area, title, detail, evidence });

async function login(email, password) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return r.ok ? r.json() : null;
}

const user = await login('long@foodstory.test', 'User123!');
const admin = await login('admin@foodstory.test', 'Admin123!');
console.log('tokens:', { user: Boolean(user), admin: Boolean(admin) });

async function probe(method, route, { token, body } = {}) {
  try {
    const r = await fetch(API + route, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const t = await r.text();
    return { status: r.status, bodyStart: t.slice(0, 160), headers: Object.fromEntries(r.headers) };
  } catch (e) { return { status: null, error: e.message }; }
}

// ---------------------------------------------------- 1. admin endpoint authorization
console.log('\n=== admin endpoints: does the server enforce the role? ===');
const adminRoutes = ['/admin/stats', '/admin/users', '/admin/recipes', '/admin/comments'];
const authzRows = [];
for (const route of adminRoutes) {
  const anon = await probe('GET', route);
  const asUser = await probe('GET', route, { token: user?.token });
  const asAdmin = await probe('GET', route, { token: admin?.token });
  authzRows.push({ route, anon: anon.status, user: asUser.status, admin: asAdmin.status });
  console.log(`  ${route.padEnd(18)} anon=${anon.status} user=${asUser.status} admin=${asAdmin.status}`);
  if (asUser.status && asUser.status >= 200 && asUser.status < 300) {
    add('critical', 'authorization', `Non-admin can read ${route}`,
      'A normal user token received a 2xx from an admin-only endpoint.',
      { route, userStatus: asUser.status, sample: asUser.bodyStart });
  }
  if (anon.status && anon.status >= 200 && anon.status < 300) {
    add('critical', 'authorization', `Unauthenticated access to ${route}`,
      'No token was required for an admin-only endpoint.', { route, sample: anon.bodyStart });
  }
}

// ---------------------------------------------------- 2. ownership enforcement
console.log('\n=== comment ownership ===');
{
  // Create a comment as admin, then try to modify/delete it as the normal user.
  const created = await fetch(`${API}/recipes/1/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
    body: JSON.stringify({ content: '__SECAUDIT__ ownership probe' }),
  });
  const cj = created.ok ? await created.json() : null;
  const cid = cj?.comment?.id ?? cj?.id ?? null;
  console.log('  created comment id:', cid, 'status', created.status);
  if (cid) {
    const edit = await probe('PUT', `/comments/${cid}`, { token: user?.token, body: { content: 'hijacked' } });
    const del = await probe('DELETE', `/comments/${cid}`, { token: user?.token });
    console.log(`  edit by other user  -> ${edit.status}`);
    console.log(`  delete by other user-> ${del.status}`);
    if (edit.status >= 200 && edit.status < 300) {
      add('critical', 'authorization', 'A user can edit another user\'s comment',
        'PUT /comments/:id succeeded with a token that does not own the comment.',
        { commentId: cid, status: edit.status });
    }
    if (del.status >= 200 && del.status < 300) {
      add('critical', 'authorization', 'A user can delete another user\'s comment',
        'DELETE /comments/:id succeeded with a non-owner token.', { commentId: cid, status: del.status });
    }
    // clean up whatever survived
    await probe('DELETE', `/comments/${cid}`, { token: admin?.token });
  }
}

// ---------------------------------------------------- 3. user enumeration + password policy
console.log('\n=== auth behaviour ===');
{
  const wrongPw = await probe('POST', '/auth/login', { body: { email: 'admin@foodstory.test', password: 'definitely-wrong' } });
  const noUser = await probe('POST', '/auth/login', { body: { email: 'nobody-here-xyz@nowhere.test', password: 'definitely-wrong' } });
  console.log(`  existing email + wrong pw : ${wrongPw.status} ${wrongPw.bodyStart.slice(0, 70)}`);
  console.log(`  unknown email + wrong pw  : ${noUser.status} ${noUser.bodyStart.slice(0, 70)}`);
  if (wrongPw.bodyStart !== noUser.bodyStart || wrongPw.status !== noUser.status) {
    add('low', 'auth', 'Login responses distinguish existing from unknown accounts',
      'Different status or message for a known email vs an unknown one enables user enumeration.',
      { existing: { status: wrongPw.status, body: wrongPw.bodyStart },
        unknown: { status: noUser.status, body: noUser.bodyStart } });
  }
  const weak = await probe('POST', '/auth/register', {
    body: { username: `sec_${Date.now()}`, email: `sec_${Date.now()}@probe.test`, password: '1' } });
  console.log(`  register with password "1": ${weak.status} ${weak.bodyStart.slice(0, 90)}`);
  if (weak.status >= 200 && weak.status < 300) {
    add('medium', 'auth', 'Registration accepts a 1-character password',
      'No minimum password strength is enforced server-side.', { status: weak.status });
  }
}

// ---------------------------------------------------- 4. response headers
console.log('\n=== security headers ===');
{
  const r = await probe('GET', '/recipes');
  const h = r.headers || {};
  const expected = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': null,
    'strict-transport-security': null,
    'content-security-policy': null,
    'referrer-policy': null,
  };
  for (const k of Object.keys(expected)) {
    console.log(`  ${k.padEnd(28)} ${h[k] ? h[k].slice(0, 60) : '(absent)'}`);
  }
  const missing = Object.keys(expected).filter((k) => !h[k]);
  if (missing.length) {
    add('low', 'headers', `Missing security headers: ${missing.join(', ')}`,
      'helmet is imported; these headers were absent on an API response over plain HTTP. '
      + 'HSTS is expected to be absent on HTTP, but CSP and frame options are not.',
      { present: Object.keys(h).filter((k) => /^(x-|content-security|strict|referrer)/.test(k)) });
  }
  if (h['x-powered-by']) {
    add('low', 'headers', 'X-Powered-By is exposed', 'Reveals the server framework.',
      { value: h['x-powered-by'] });
  }
}

// ---------------------------------------------------- 5. CORS
console.log('\n=== CORS with an untrusted origin ===');
{
  const r = await fetch(`${API}/recipes`, { headers: { Origin: 'https://evil.example.com' } });
  const acao = r.headers.get('access-control-allow-origin');
  console.log(`  status ${r.status}  access-control-allow-origin: ${acao ?? '(none)'}`);
  if (acao === '*' || acao === 'https://evil.example.com') {
    add('high', 'cors', 'CORS allows an arbitrary origin',
      'An untrusted origin received a permissive Access-Control-Allow-Origin.', { acao });
  }
}

// ---------------------------------------------------- 6. secrets & sourcemaps in dist
console.log('\n=== built bundle hygiene ===');
{
  const walk = (d, acc = []) => {
    if (!fs.existsSync(d)) return acc;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, acc); else acc.push(p);
    }
    return acc;
  };
  const files = walk(DIST);
  const maps = files.filter((f) => f.endsWith('.map'));
  const textFiles = files.filter((f) => /\.(js|css|html|json)$/.test(f));
  const patterns = [
    { id: 'google_api_key', re: /AIza[0-9A-Za-z_\-]{35}/g },
    { id: 'groq_key', re: /gsk_[0-9A-Za-z]{40,}/g },
    { id: 'openai_key', re: /sk-[A-Za-z0-9]{32,}/g },
    { id: 'aws_key', re: /AKIA[0-9A-Z]{16}/g },
    { id: 'jwt_secret_like', re: /JWT_SECRET\s*[:=]\s*["'][^"']{8,}/g },
    { id: 'private_key_block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
    { id: 'bearer_literal', re: /Bearer\s+eyJ[A-Za-z0-9_\-]{20,}/g },
    { id: 'mysql_url', re: /mysql:\/\/[^\s"']+/g },
  ];
  const hits = [];
  for (const f of textFiles) {
    const txt = fs.readFileSync(f, 'utf8');
    for (const p of patterns) {
      const m = txt.match(p.re);
      if (m) hits.push({ file: path.relative(DIST, f).replace(/\\/g, '/'), pattern: p.id,
        count: m.length, sample: String(m[0]).slice(0, 24) + '…' });
    }
  }
  console.log(`  files scanned: ${textFiles.length}, sourcemaps: ${maps.length}, secret hits: ${hits.length}`);
  for (const h of hits) console.log(`   ! ${h.pattern} in ${h.file} (${h.count})`);
  if (hits.length) add('critical', 'secrets', 'Possible secret material in the built bundle',
    'Pattern match inside dist/. Verify before publishing.', hits);
  if (maps.length) add('low', 'bundle', `${maps.length} sourcemap(s) shipped in dist/`,
    'Sourcemaps expose original source to anyone who downloads the site.',
    maps.slice(0, 5).map((m) => path.relative(DIST, m)));

  // VITE_ env vars are inlined at build time - flag any that look sensitive.
  const inlined = [];
  for (const f of textFiles) {
    const txt = fs.readFileSync(f, 'utf8');
    for (const m of txt.matchAll(/VITE_[A-Z0-9_]{3,}/g)) inlined.push(m[0]);
  }
  const uniqueInlined = [...new Set(inlined)];
  console.log(`  VITE_ identifiers found in bundle: ${JSON.stringify(uniqueInlined)}`);
}

// ---------------------------------------------------- 7. XSS surface in source
console.log('\n=== XSS surface (v-html / innerHTML) ===');
{
  const walk = (d, acc = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, acc);
      else if (/\.(vue|js)$/.test(e.name)) acc.push(p);
    }
    return acc;
  };
  const src = walk(SRC);
  const vhtml = [], innerHtml = [];
  for (const f of src) {
    const txt = fs.readFileSync(f, 'utf8');
    txt.split(/\r?\n/).forEach((line, i) => {
      if (/v-html/.test(line)) vhtml.push({ file: path.relative(SRC, f).replace(/\\/g, '/'), line: i + 1, code: line.trim().slice(0, 120) });
      if (/\.innerHTML\s*=/.test(line)) innerHtml.push({ file: path.relative(SRC, f).replace(/\\/g, '/'), line: i + 1, code: line.trim().slice(0, 120) });
    });
  }
  console.log(`  v-html occurrences: ${vhtml.length}, innerHTML assignments: ${innerHtml.length}`);
  for (const v of [...vhtml, ...innerHtml].slice(0, 10)) console.log(`   ${v.file}:${v.line}  ${v.code}`);
  if (vhtml.length) add('medium', 'xss', `${vhtml.length} v-html binding(s)`,
    'v-html renders raw HTML. Safe only if the value is server-sanitised or fully static.', vhtml);
  if (innerHtml.length) add('medium', 'xss', `${innerHtml.length} innerHTML assignment(s)`,
    'Direct innerHTML writes bypass Vue escaping.', innerHtml);
}

// ---------------------------------------------------- 8. stored XSS round trip
console.log('\n=== stored XSS round trip through comments ===');
{
  const payload = '__SECAUDIT__<img src=x onerror=alert(1)><script>alert(2)</script>';
  const created = await fetch(`${API}/recipes/1/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
    body: JSON.stringify({ content: payload }),
  });
  const cj = created.ok ? await created.json() : null;
  const cid = cj?.comment?.id ?? cj?.id ?? null;
  const back = await probe('GET', '/recipes/1/comments');
  const stored = back.bodyStart.includes('onerror') || (back.bodyStart.includes('<img'));
  console.log(`  create status ${created.status}, id ${cid}`);
  console.log(`  payload returned verbatim by API: ${stored}`);
  if (stored) {
    add('medium', 'xss', 'Comment HTML is stored and returned verbatim',
      'The API neither rejects nor sanitises HTML in comment content. This is only safe '
      + 'because Vue escapes interpolation; any future v-html or non-Vue consumer would execute it.',
      { payloadEcho: back.bodyStart.slice(0, 120) });
  }
  if (cid) await probe('DELETE', `/comments/${cid}`, { token: user?.token });
}

// ---------------------------------------------------- 9. input validation / injection
console.log('\n=== injection-ish input handling ===');
{
  const cases = [
    { id: 'sql_or', route: "/recipes?search=' OR '1'='1" },
    { id: 'sql_union', route: '/recipes?search=1%20UNION%20SELECT%20NULL--' },
    { id: 'huge_page', route: '/recipes?page=999999999' },
    { id: 'neg_page', route: '/recipes?page=-1' },
    { id: 'nan_id', route: '/recipes/notanumber' },
    { id: 'huge_id', route: '/recipes/99999999999999999999' },
  ];
  for (const c of cases) {
    const r = await probe('GET', c.route);
    const leaked = /SQLSTATE|ER_|mysql|at Object\.|node_modules|\/backend\//i.test(r.bodyStart);
    console.log(`  ${c.id.padEnd(12)} ${String(r.status).padEnd(4)} leak=${leaked} ${r.bodyStart.slice(0, 70).replace(/\s+/g, ' ')}`);
    if (leaked) add('medium', 'error-handling', `Internal details leaked by ${c.id}`,
      'The API response exposed database or stack internals.', { route: c.route, body: r.bodyStart });
    if (r.status >= 500) add('medium', 'robustness', `${c.id} caused HTTP ${r.status}`,
      'Malformed input produced a server error rather than a validation response.', { route: c.route });
  }
}

console.log(`\n=== ${findings.length} finding(s) ===`);
for (const f of findings) console.log(`  [${f.severity.toUpperCase()}] ${f.area}: ${f.title}`);

writeOut('security-audit.json', {
  meta: meta({ measurement: 'security-audit',
    scope: 'local development instance; authorization probes use the repo\'s own seeded fixtures',
    note: 'rate limits were raised for benchmarking, so throttling behaviour is not represented here' }),
  authorizationMatrix: authzRows,
  findings,
});
