import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = path.resolve(backendRoot, '..')

test('backend news seed matches the frontend fallback catalogue', async () => {
  const [backendNews, frontendNews] = await Promise.all([
    fs.readFile(path.join(backendRoot, 'database/newsSeed.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(repositoryRoot, 'frontend/src/data/news.json'), 'utf8').then(JSON.parse),
  ])
  assert.equal(backendNews.length, 12)
  assert.deepEqual(backendNews, frontendNews)
})

test('Render Blueprint keeps secrets external and wires both public services', async () => {
  const blueprint = await fs.readFile(path.join(repositoryRoot, 'render.yaml'), 'utf8')
  assert.match(blueprint, /name: foodstory-api-cos30043-hoanglong212/u)
  assert.equal((blueprint.match(/branch: codex\/render-deployment/gu) || []).length, 2)
  assert.match(blueprint, /startCommand: npm run start:production/u)
  assert.match(blueprint, /healthCheckPath: \/api\/health/u)
  assert.match(blueprint, /name: foodstory-cos30043-hoanglong212/u)
  assert.match(blueprint, /staticPublishPath: \.\/dist/u)
  assert.match(blueprint, /key: DATABASE_URL\s+sync: false/u)
  assert.match(blueprint, /key: JWT_SECRET\s+generateValue: true/u)
  assert.doesNotMatch(blueprint, /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/u)
})

test('backend can import the optional Groq provider without an API key', () => {
  const moduleUrl = pathToFileURL(
    path.join(backendRoot, 'services/groqService.js')
  ).href
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', `await import(${JSON.stringify(moduleUrl)})`],
    {
      cwd: os.tmpdir(),
      encoding: 'utf8',
      env: {
        ...process.env,
        DOTENV_CONFIG_PATH: path.join(os.tmpdir(), 'foodstory-no-dotenv'),
        GROQ_API_KEY: '',
      },
    }
  )

  assert.equal(result.status, 0, result.stderr)
})

test('recipe pagination avoids MySQL 8.4 prepared LIMIT parameters', async () => {
  const recipeRoutes = await fs.readFile(
    path.join(backendRoot, 'routes/recipeRoutes.js'),
    'utf8'
  )

  assert.match(recipeRoutes, /const \[items\] = await pool\.query\(/u)
  assert.doesNotMatch(recipeRoutes, /const \[items\] = await pool\.execute\(/u)
  assert.match(recipeRoutes, /Math\.min\([^\n]+, 200\)/u)
})

test('news pagination avoids MySQL 8.4 prepared LIMIT parameters', async () => {
  const newsRoutes = await fs.readFile(
    path.join(backendRoot, 'routes/newsRoutes.js'),
    'utf8'
  )

  assert.match(newsRoutes, /const \[items\] = await pool\.query\(/u)
  assert.doesNotMatch(newsRoutes, /const \[items\] = await pool\.execute\(/u)
  assert.match(newsRoutes, /Math\.min\([^\n]+, 50\)/u)
})

test('admin list pagination avoids MySQL 8.4 prepared LIMIT parameters', async () => {
  const adminRoutes = await fs.readFile(
    path.join(backendRoot, 'routes/admin.js'),
    'utf8'
  )

  assert.equal((adminRoutes.match(/const \[items\] = await pool\.query\(/gu) || []).length, 3)
  assert.doesNotMatch(adminRoutes, /const \[items\] = await pool\.execute\(/u)
})

test('recipe sorting is server-side, bounded to an allow-list, and deterministic', async () => {
  const recipeRoutes = await fs.readFile(
    path.join(backendRoot, 'routes/recipeRoutes.js'),
    'utf8'
  )

  for (const sort of ['newest', 'popular', 'rating', 'fastest', 'lightest', 'protein', 'saved']) {
    assert.match(recipeRoutes, new RegExp(`\\b${sort}:`))
  }
  assert.match(recipeRoutes, /Object\.hasOwn\(RECIPE_SORT_SQL, sort\)/u)
  assert.match(recipeRoutes, /ORDER BY \$\{RECIPE_SORT_SQL\[sort\]\}/u)
})
