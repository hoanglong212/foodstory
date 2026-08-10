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

test('Render Blueprint keeps secrets external and wires all public services', async () => {
  const blueprint = await fs.readFile(path.join(repositoryRoot, 'render.yaml'), 'utf8')
  assert.match(blueprint, /name: foodstory-api-cos30043-hoanglong212/u)
  assert.equal((blueprint.match(/branch: codex\/render-deployment/gu) || []).length, 3)
  assert.match(blueprint, /runtime: docker/u)
  assert.match(blueprint, /dockerfilePath: \.\/Dockerfile\.vision-auto/u)
  assert.match(blueprint, /dockerContext: \./u)
  assert.match(blueprint, /healthCheckPath: \/api\/health/u)
  assert.match(blueprint, /name: foodstory-cos30043-hoanglong212/u)
  assert.match(blueprint, /staticPublishPath: \.\/dist/u)
  assert.match(blueprint, /key: DATABASE_URL\s+sync: false/u)
  assert.match(blueprint, /key: JWT_SECRET\s+generateValue: true/u)
  assert.match(blueprint, /key: GROQ_API_KEY\s+sync: false/u)
  assert.match(blueprint, /key: VISION_SEARCH_PROVIDER\s+value: groq/u)
  assert.match(blueprint, /key: GROQ_VISION_MODEL\s+value: qwen\/qwen3\.6-27b/u)
  assert.match(blueprint, /key: GEMINI_API_KEY\s+sync: false/u)
  assert.match(blueprint, /key: GEOAPIFY_API_KEY\s+sync: false/u)
  assert.match(blueprint, /key: GUARDIAN_API_KEY\s+sync: false/u)
  assert.match(blueprint, /key: VISION_AUTO_V2_ENABLED\s+value: "true"/u)
  assert.match(blueprint, /key: VISION_AUTO_V2_ROUTE_ENABLED\s+value: "true"/u)
  assert.match(blueprint, /key: VISION_DISH_EXTERNAL_SEARCH_ENABLED\s+value: "true"/u)
  assert.match(blueprint, /key: AI_SERVICE_URL\s+value: https:\/\/foodstory-ai-cos30043-hoanglong212\.onrender\.com/u)
  assert.equal((blueprint.match(/key: AI_SERVICE_API_TOKEN\s+sync: false/gu) || []).length, 2)
  assert.match(blueprint, /name: foodstory-ai-cos30043-hoanglong212/u)
  assert.match(blueprint, /rootDir: ai-service/u)
  assert.match(blueprint, /buildCommand: pip install --no-cache-dir "torch==2\.13\.0\+cpu" --index-url https:\/\/download\.pytorch\.org\/whl\/cpu && pip install --no-cache-dir -r requirements-render\.txt/u)
  assert.match(blueprint, /startCommand: uvicorn main:app --host 0\.0\.0\.0 --port \$PORT/u)
  assert.match(blueprint, /key: AI_SERVICE_ENABLE_CLIP\s+value: "false"/u)
  assert.doesNotMatch(blueprint, /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/u)
})

test('AI embedding repository reuses the DATABASE_URL and SSL-aware shared pool', async () => {
  const repository = await fs.readFile(
    path.join(backendRoot, 'services/aiEmbeddingRepository.js'),
    'utf8'
  )

  assert.match(repository, /import pool from '\.\.\/db\.js'/u)
  assert.doesNotMatch(repository, /mysql\.createPool/u)
  assert.doesNotMatch(repository, /127\.0\.0\.1/u)
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

test('recipe browse metadata hides category and tag filters with no approved recipes', async () => {
  const recipeRoutes = await fs.readFile(
    path.join(backendRoot, 'routes/recipeRoutes.js'),
    'utf8'
  )

  assert.match(recipeRoutes, /browse_recipe\.category_id = c\.id AND browse_recipe\.status = 'approved'/u)
  assert.match(recipeRoutes, /browse_recipe_tag\.tag_id = t\.id AND browse_recipe\.status = 'approved'/u)
})

test('structured recipe queries use only columns present in the production recipe schema', async () => {
  const [recipeService, schema] = await Promise.all([
    fs.readFile(path.join(backendRoot, 'services/recipeStructuredService.js'), 'utf8'),
    fs.readFile(path.join(backendRoot, 'database/schema.sql'), 'utf8'),
  ])

  const recipeTable = schema.match(
    /CREATE TABLE IF NOT EXISTS recipes \(([\s\S]*?)\n\);/u
  )?.[1]
  const recipeSelect = recipeService.match(
    /const RECIPE_SELECT = `([\s\S]*?)`/u
  )?.[1]
  assert.ok(recipeTable)
  assert.ok(recipeSelect)

  const schemaColumns = new Set(
    [...recipeTable.matchAll(/^\s{2}([a-z_]+)\s+(?:INT|VARCHAR|ENUM|TEXT|DATETIME|TIMESTAMP)\b/gmu)]
      .map((match) => match[1])
  )
  const selectedRecipeColumns = [
    ...new Set([...recipeSelect.matchAll(/\br\.([a-z_]+)\b/gu)].map((match) => match[1])),
  ]

  assert.deepEqual(
    selectedRecipeColumns.filter((column) => !schemaColumns.has(column)),
    []
  )
})
