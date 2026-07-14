import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createVisionAutoJobService,
  VisionAutoQueueFullError,
} from '../services/visionAuto/visionAutoJobService.js'

const URL_A = 'https://www.youtube.com/shorts/dQw4w9WgXcQ'
const URL_B = 'https://www.youtube.com/shorts/9bZkp7q19f0'
const URL_C = 'https://www.youtube.com/shorts/JGwWNGJdvx8'

function tick() {
  return new Promise((resolve) => setImmediate(resolve))
}

function config(overrides = {}) {
  return {
    pipelineVersion: 'test-v1',
    requestDeadlineMs: 30_000,
    maxVideoDurationSeconds: 180,
    cacheTtlMs: 900_000,
    notFoundCacheTtlMs: 120_000,
    jobMaxConcurrency: 1,
    jobPerOriginConcurrency: 1,
    jobMaxQueued: 1,
    jobRetentionMs: 60_000,
    jobFastMetadataEnabled: false,
    jobWorkerStartupTimeoutMs: 5_000,
    jobWorkerHeartbeatTimeoutMs: 20_000,
    jobWorkerCleanupGraceMs: 3_000,
    ...overrides,
  }
}

function fakeCoordinator(overrides = {}) {
  const workers = []
  const service = createVisionAutoJobService({
    getConfig: () => config(overrides),
    logger: { info() {} },
    startWorker(options) {
      workers.push(options)
      return {
        cancel() {},
        terminate() {},
      }
    },
  })
  return { service, workers }
}

describe('Vision Auto asynchronous job backpressure', () => {
  it('runs only the configured number of workers and starts queued jobs later', async () => {
    const { service, workers } = fakeCoordinator()
    const first = service.submit(URL_A)
    await tick()
    assert.equal(workers.length, 1)
    assert.equal(service.stats().active, 1)

    const second = service.submit(URL_B)
    assert.equal(second.status, 'queued')
    assert.equal(second.queuePosition, 1)
    assert.equal(service.stats().queued, 1)

    workers[0].onMessage({
      type: 'result',
      jobId: first.jobId,
      result: { status: 'not_found', reason: 'fixture' },
    })
    await tick()
    assert.equal(workers.length, 2)
    assert.equal(service.get(second.jobId).status, 'starting')
  })

  it('rejects submissions with 429-compatible queue-full error', async () => {
    const { service } = fakeCoordinator()
    service.submit(URL_A)
    await tick()
    service.submit(URL_B)
    assert.throws(() => service.submit(URL_C), VisionAutoQueueFullError)
  })

  it('deduplicates identical active jobs by canonical URL', async () => {
    const { service, workers } = fakeCoordinator()
    const first = service.submit('https://youtu.be/dQw4w9WgXcQ?si=one')
    await tick()
    const duplicate = service.submit('https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=two')
    assert.equal(duplicate.jobId, first.jobId)
    assert.equal(workers.length, 1)
  })

  it('uses an idempotency key across equivalent client retries', async () => {
    const { service, workers } = fakeCoordinator()
    const first = service.submit({
      sourceUrl: URL_A,
      tenantId: 'tenant-a',
      idempotencyKey: 'request-42',
    })
    await tick()
    const duplicate = service.submit({
      sourceUrl: URL_B,
      tenantId: 'tenant-a',
      idempotencyKey: 'request-42',
    })
    assert.equal(duplicate.jobId, first.jobId)
    assert.equal(workers.length, 1)
  })

  it('can cancel a queued job without starting a worker', async () => {
    const { service, workers } = fakeCoordinator()
    service.submit(URL_A)
    await tick()
    const queued = service.submit(URL_B)
    const cancelled = service.cancel(queued.jobId)
    assert.equal(cancelled.status, 'cancelled')
    assert.equal(service.stats().queued, 0)
    assert.equal(workers.length, 1)
  })

  it('whitelists worker results before polling and caching them', async () => {
    const { service, workers } = fakeCoordinator()
    const submitted = service.submit(URL_A)
    await tick()
    workers[0].onMessage({
      type: 'result',
      jobId: submitted.jobId,
      result: {
        status: 'matched_place',
        place: {
          sourceType: 'foodstory',
          id: 'foodstory:restaurant:1',
          sourceId: '1',
          name: 'Safe Place',
          formattedAddress: '1 Safe Street',
          lat: 10.7,
          lng: 106.7,
          _score: 0.99,
          debug: { rawOcr: 'private' },
          asrTranscript: 'private',
        },
        _score: 0.99,
        debug: { ocr: ['private'] },
        evidence: ['private'],
      },
    })

    const terminal = service.get(submitted.jobId)
    assert.equal(terminal.status, 'completed')
    assert.equal(terminal.result.status, 'matched_place')
    assert.equal(terminal.result.place.sourceId, '1')
    assert.equal(JSON.stringify(terminal).includes('_score'), false)
    assert.equal(JSON.stringify(terminal).includes('private'), false)

    const cached = service.submit(URL_A)
    assert.equal(cached.cacheHit, true)
    assert.equal(JSON.stringify(cached).includes('_score'), false)
    assert.equal(JSON.stringify(cached).includes('private'), false)
  })

  it('settles a worker that never becomes ready exactly once', async () => {
    const { service, workers } = fakeCoordinator({ jobWorkerStartupTimeoutMs: 15 })
    const submitted = service.submit(URL_A)
    await tick()
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(service.get(submitted.jobId).status, 'timed_out')
    workers[0].onMessage({
      type: 'result',
      jobId: submitted.jobId,
      result: { status: 'matched_place' },
    })
    assert.equal(service.get(submitted.jobId).status, 'timed_out')
  })

  it('times out a ready worker that stops heartbeating', async () => {
    const { service, workers } = fakeCoordinator({ jobWorkerHeartbeatTimeoutMs: 15 })
    const submitted = service.submit(URL_A)
    await tick()
    workers[0].onMessage({ type: 'ready', jobId: submitted.jobId })
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(service.get(submitted.jobId).status, 'timed_out')
  })

  it('re-arms the heartbeat deadline before timing out a stalled worker', async () => {
    const { service, workers } = fakeCoordinator({ jobWorkerHeartbeatTimeoutMs: 20 })
    const submitted = service.submit(URL_A)
    await tick()
    workers[0].onMessage({ type: 'ready', jobId: submitted.jobId })
    await new Promise((resolve) => setTimeout(resolve, 10))
    workers[0].onMessage({ type: 'heartbeat', jobId: submitted.jobId, stage: 'metadata' })
    await new Promise((resolve) => setTimeout(resolve, 12))
    assert.equal(service.get(submitted.jobId).status, 'fast_analysis')
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(service.get(submitted.jobId).status, 'timed_out')
  })

  it('fails safely when a worker exits without a result', async () => {
    const { service, workers } = fakeCoordinator()
    const submitted = service.submit(URL_A)
    await tick()
    workers[0].onExit({ code: 1 })
    assert.equal(service.get(submitted.jobId).status, 'failed')
    assert.equal(service.get(submitted.jobId).result.status, 'error')
  })

  it('settles a result before bounded worker cleanup completes', async () => {
    let terminateCalls = 0
    const workers = []
    const service = createVisionAutoJobService({
      getConfig: () => config({ jobWorkerCleanupGraceMs: 15 }),
      logger: { info() {} },
      startWorker(options) {
        workers.push(options)
        return { cancel() {}, terminate() { terminateCalls += 1 } }
      },
    })
    const submitted = service.submit(URL_A)
    await tick()
    workers[0].onMessage({
      type: 'result',
      jobId: submitted.jobId,
      result: { status: 'not_found', reason: 'no_resolver_match' },
    })
    assert.equal(service.get(submitted.jobId).status, 'not_found')
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(terminateCalls, 1)
  })
})
