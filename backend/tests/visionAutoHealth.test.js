import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import express from 'express'

import { createVisionAutoRouter } from '../routes/visionAutoRoutes.js'

const servers = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
})

async function start(router) {
  const app = express()
  app.use('/api/food-map', router)
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
  })
  servers.push(server)
  return `http://127.0.0.1:${server.address().port}`
}

function routerWith(readiness) {
  return createVisionAutoRouter({
    isRouteEnabled: () => true,
    isServiceEnabled: () => true,
    getConfig: () => ({
      visionAutoEnabled: true,
      track2Enabled: true,
      localResolverEnabled: true,
      externalResolverEnabled: false,
      externalProvider: 'none',
      externalProviderConfigured: false,
      geoapifyConfigured: false,
      asrEffectiveEnabled: false,
      geminiEffectiveEnabled: false,
      cacheEnabled: true,
      cacheMaxEntries: 100,
      requestDeadlineMs: 60_000,
      maxVideoDurationSeconds: 180,
      jobMaxConcurrency: 2,
      jobMaxQueued: 20,
      jobPerOriginConcurrency: 2,
      jobFastMetadataEnabled: false,
      debugLevel: 'summary',
    }),
    getReadiness: async () => readiness,
    jobService: {
      stats: () => ({ active: 0, queued: 0 }),
      get: () => null,
      cancel: () => null,
      submit: () => ({ jobId: 'fixture' }),
    },
  })
}

describe('Vision Auto readiness health endpoint', () => {
  it('returns 503 when required media runtime dependencies are unavailable', async () => {
    const base = await start(routerWith({
      ready: false,
      state: 'not_ready',
      checkedAt: new Date(0).toISOString(),
      checks: [{ name: 'yt_dlp', required: true, ok: false, code: 'ENOENT' }],
    }))
    const response = await fetch(`${base}/api/food-map/vision-auto-v2/health`)
    const payload = await response.json()

    assert.equal(response.status, 503)
    assert.equal(payload.status, 'not_ready')
    assert.equal(payload.readiness.checks[0].name, 'yt_dlp')
  })

  it('returns 200 only when the required runtime is ready', async () => {
    const base = await start(routerWith({
      ready: true,
      state: 'ready',
      checkedAt: new Date(0).toISOString(),
      checks: [{ name: 'yt_dlp', required: true, ok: true }],
    }))
    const response = await fetch(`${base}/api/food-map/vision-auto-v2/health`)
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.status, 'ready')
  })
})
