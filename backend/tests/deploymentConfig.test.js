import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
