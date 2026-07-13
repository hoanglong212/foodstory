import crypto from 'node:crypto'

import {
  VisionAutoInputError,
  resolveVisionAutoInput,
} from './visionAutoResolverService.js'
import { getVisionAutoRuntimeConfig } from './visionAutoConfig.js'
import { startVisionAutoWorker } from './visionAutoWorkerManager.js'
import {
  incrementVisionAutoMetric,
  logVisionAutoEvent,
  observeVisionAutoDuration,
} from './visionAutoObservabilityService.js'
import { redactedVisionAutoSource } from './visionAutoUrlPolicyService.js'
import { buildVisionAutoResponse } from './visionResponseBuilder.js'

const TERMINAL = new Set(['completed', 'not_found', 'failed', 'cancelled', 'timed_out'])

function sanitizeWorkerResult(result, input) {
  return buildVisionAutoResponse({
    status: result?.status,
    place: result?.place,
    places: result?.places,
    reviewCandidates: result?.reviewCandidates,
    sourceContext: result?.sourceContext,
    reason: result?.reason,
    input,
  })
}

export class VisionAutoQueueFullError extends Error {
  constructor(message = 'Vision Auto is busy. Try again shortly.') {
    super(message)
    this.name = 'VisionAutoQueueFullError'
    this.code = 'VISION_AUTO_QUEUE_FULL'
    this.retryAfterSeconds = 5
  }
}

function safeJobView(job, queue = []) {
  const queuedIndex = job.status === 'queued'
    ? queue.findIndex((candidate) => candidate.id === job.id)
    : -1
  return {
    jobId: job.id,
    requestId: job.requestId,
    status: job.status,
    stage: job.stage || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
    ...(queuedIndex >= 0 ? { queuePosition: queuedIndex + 1 } : {}),
    ...(TERMINAL.has(job.status) && job.result ? { result: job.result } : {}),
  }
}

function canonicalKey({ input, version, tenantId, idempotencyKey }) {
  const basis = idempotencyKey
    ? `idempotency:${tenantId}:${idempotencyKey}`
    : `url:${tenantId}:${input.url}`
  return `${version}:${crypto.createHash('sha256').update(basis).digest('hex')}`
}

function normalizedSubmitRequest(sourceOrRequest, options = {}) {
  if (typeof sourceOrRequest === 'string') {
    return { sourceUrl: sourceOrRequest, ...options }
  }
  return {
    ...(sourceOrRequest && typeof sourceOrRequest === 'object' ? sourceOrRequest : {}),
    ...options,
  }
}

/**
 * Bounded in-memory coordinator.
 *
 * This is intentionally dependency-free for the current FoodStory backend. It
 * gives the process real backpressure and deduplication now. A production
 * multi-instance deployment can replace this service with BullMQ/Redis behind
 * the same public methods without changing the route contract.
 */
export function createVisionAutoJobService({
  startWorker = startVisionAutoWorker,
  getConfig = getVisionAutoRuntimeConfig,
  now = () => Date.now(),
  logger = console,
} = {}) {
  const jobs = new Map()
  const queue = []
  const activeByKey = new Map()
  const activeByOrigin = new Map()
  const completedCache = new Map()
  let activeCount = 0
  let pumpScheduled = false

  function timestamp() {
    return new Date(now()).toISOString()
  }

  function prune() {
    const config = getConfig()
    const current = now()
    for (const [key, cached] of completedCache) {
      if (!cached || cached.expiresAt <= current) completedCache.delete(key)
    }
    for (const [id, job] of jobs) {
      if (
        TERMINAL.has(job.status) &&
        Number(job.settledAt || 0) > 0 &&
        current - job.settledAt > config.jobRetentionMs
      ) {
        jobs.delete(id)
      }
    }
  }

  function markUpdated(job) {
    job.updatedAt = timestamp()
  }

  function settle(job, status, result = null) {
    if (!job || job.settled) return
    job.settled = true
    job.status = status
    job.stage = status
    job.result = result
    job.completedAt = timestamp()
    job.settledAt = now()
    markUpdated(job)
    clearTimeout(job.deadlineTimer)
    clearTimeout(job.readyTimer)
    clearTimeout(job.heartbeatTimer)
    job.deadlineTimer = null
    job.readyTimer = null
    job.heartbeatTimer = null
    activeByKey.delete(job.key)
    if (job.started) {
      activeCount = Math.max(0, activeCount - 1)
      const originCount = activeByOrigin.get(job.originHost) || 0
      if (originCount <= 1) activeByOrigin.delete(job.originHost)
      else activeByOrigin.set(job.originHost, originCount - 1)
      observeVisionAutoDuration('job_worker_duration_ms', now() - job.startedAtMs, {
        status,
        platform: job.input.platform,
      })
    }
    incrementVisionAutoMetric('jobs_settled', { status, platform: job.input.platform })
    logVisionAutoEvent('job_settled', {
      job_id: job.id,
      request_id: job.requestId,
      status,
      platform: job.input.platform,
      host: job.input.originHost,
      video_id: job.input.videoId,
      duration_ms: job.startedAtMs ? now() - job.startedAtMs : 0,
    }, logger)
    schedulePump()
  }

  function finishTimeout(job) {
    if (!job || job.settled) return
    job.controller.abort()
    settle(job, 'timed_out', {
      status: 'not_found',
      reason: 'analysis_timeout',
      sourceContext: {
        isMultiPlace: false,
        resolvedCount: 0,
        platform: job.input.platform,
      },
    })
    job.worker?.terminate?.()
  }

  function canStart(job, config) {
    if (activeCount >= config.jobMaxConcurrency) return false
    return (activeByOrigin.get(job.originHost) || 0) < config.jobPerOriginConcurrency
  }

  function startQueuedJob(job, config) {
    if (!job || job.settled || job.status !== 'queued') return
    job.started = true
    job.status = 'starting'
    job.stage = 'starting'
    job.startedAtMs = now()
    job.startedAt = timestamp()
    markUpdated(job)
    activeCount += 1
    activeByOrigin.set(job.originHost, (activeByOrigin.get(job.originHost) || 0) + 1)
    incrementVisionAutoMetric('jobs_started', { platform: job.input.platform })
    observeVisionAutoDuration('job_queue_wait_ms', now() - job.createdAtMs, {
      platform: job.input.platform,
    })

    const workerDeadlineMs = Math.min(
      210_000,
      Math.max(55_000, config.requestDeadlineMs + 25_000),
    )
    job.deadlineTimer = setTimeout(() => finishTimeout(job), workerDeadlineMs)
    job.deadlineTimer.unref?.()
    const deadlineAt = now() + workerDeadlineMs

    const workerTimedOut = (reason) => {
      if (job.settled) return
      logVisionAutoEvent('job_worker_timeout', {
        job_id: job.id,
        request_id: job.requestId,
        reason,
      }, logger)
      finishTimeout(job)
    }

    const armHeartbeatTimeout = () => {
      clearTimeout(job.heartbeatTimer)
      job.heartbeatTimer = setTimeout(
        () => workerTimedOut('heartbeat_timeout'),
        config.jobWorkerHeartbeatTimeoutMs || 20_000,
      )
      job.heartbeatTimer.unref?.()
    }

    job.readyTimer = setTimeout(
      () => workerTimedOut('startup_timeout'),
      config.jobWorkerStartupTimeoutMs || 5_000,
    )
    job.readyTimer.unref?.()

    try {
      job.worker = startWorker({
        jobId: job.id,
        sourceUrl: job.input.url,
        deadlineAt,
        maxDurationSec: job.input.maxDurationSec || config.maxVideoDurationSeconds,
        fastMetadataEnabled: config.jobFastMetadataEnabled,
        onMessage(message) {
          if (job.settled) return
          if (message.type === 'ready') {
            clearTimeout(job.readyTimer)
            job.readyTimer = null
            armHeartbeatTimeout()
            job.status = 'fast_analysis'
            job.stage = 'ready'
            markUpdated(job)
            return
          }
          if (message.type === 'heartbeat') {
            armHeartbeatTimeout()
            job.stage = message.stage || job.stage
            markUpdated(job)
            return
          }
          if (message.type === 'stage') {
            armHeartbeatTimeout()
            job.stage = message.stage || job.stage
            job.status = message.stage === 'resolving'
              ? 'resolving'
              : ['frame_extraction', 'ocr', 'asr', 'deep_analysis'].includes(message.stage)
                ? 'deep_analysis'
                : 'fast_analysis'
            markUpdated(job)
            return
          }
          if (message.type === 'result') {
            const safeResult = sanitizeWorkerResult(message.result, job.input)
            const finalStatus = safeResult.status === 'not_found'
              ? 'not_found'
              : safeResult.status === 'error'
                ? 'failed'
                : 'completed'
            settle(job, finalStatus, safeResult)
            if (['matched_place', 'external_place_found', 'multi_place', 'not_found'].includes(safeResult.status)) {
              completedCache.set(job.key, {
                jobId: job.id,
                result: safeResult,
                createdAt: job.createdAt,
                expiresAt: now() + (safeResult.status === 'not_found'
                  ? config.notFoundCacheTtlMs
                  : config.cacheTtlMs),
              })
            }
            if (!job.workerExited) {
              job.cleanupTimer = setTimeout(
                () => job.worker?.terminate?.(),
                config.jobWorkerCleanupGraceMs || 3_000,
              )
              job.cleanupTimer.unref?.()
            }
            return
          }
          if (message.type === 'failed') {
            settle(
              job,
              message.reason === 'cancelled' ? 'cancelled' : 'failed',
              message.reason === 'cancelled'
                ? null
                : {
                    status: 'error',
                    reason: 'service_failure',
                    sourceContext: {
                      isMultiPlace: false,
                      resolvedCount: 0,
                      platform: job.input.platform,
                    },
                  },
            )
          }
        },
        onExit() {
          job.workerExited = true
          clearTimeout(job.cleanupTimer)
          job.cleanupTimer = null
          if (!job.settled) {
            settle(job, 'failed', {
              status: 'error',
              reason: 'service_failure',
              sourceContext: {
                isMultiPlace: false,
                resolvedCount: 0,
                platform: job.input.platform,
              },
            })
          }
        },
      })
    } catch {
      settle(job, 'failed', {
        status: 'error',
        reason: 'service_failure',
        sourceContext: {
          isMultiPlace: false,
          resolvedCount: 0,
          platform: job.input.platform,
        },
      })
    }
  }

  function pump() {
    pumpScheduled = false
    prune()
    const config = getConfig()
    let startedAny = true
    while (startedAny && activeCount < config.jobMaxConcurrency) {
      startedAny = false
      const index = queue.findIndex((job) => canStart(job, config))
      if (index < 0) break
      const [job] = queue.splice(index, 1)
      startQueuedJob(job, config)
      startedAny = true
    }
  }

  function schedulePump() {
    if (pumpScheduled) return
    pumpScheduled = true
    queueMicrotask(pump)
  }

  function submit(sourceOrRequest, options = {}) {
    prune()
    const request = normalizedSubmitRequest(sourceOrRequest, options)
    const config = getConfig()
    const input = resolveVisionAutoInput({
      url: request.sourceUrl || request.assetUrl || request.url,
      assetTypeHint: request.assetTypeHint || 'video',
      authMode: request.authMode || 'public',
      maxDurationSec: request.maxDurationSec || config.maxVideoDurationSeconds,
    })
    if (input.type !== 'youtube_url') {
      throw new VisionAutoInputError(
        'Asynchronous URL jobs currently support YouTube video and Shorts URLs.',
        'sourceUrl',
        'VISION_AUTO_JOB_URL_UNSUPPORTED',
      )
    }

    const tenantId = String(request.tenantId || 'default').trim().slice(0, 120) || 'default'
    const idempotencyKey = String(request.idempotencyKey || '').trim().slice(0, 200)
    const key = canonicalKey({
      input,
      version: config.pipelineVersion,
      tenantId,
      idempotencyKey,
    })
    const cached = completedCache.get(key)
    if (cached?.expiresAt > now()) {
      incrementVisionAutoMetric('jobs_cache_hit', { platform: input.platform })
      return {
        jobId: cached.jobId,
        requestId: request.requestId || cached.jobId,
        status: 'completed',
        createdAt: cached.createdAt,
        updatedAt: timestamp(),
        result: cached.result,
        cacheHit: true,
      }
    }
    const active = activeByKey.get(key)
    if (active && !active.settled) return safeJobView(active, queue)
    if (queue.length >= config.jobMaxQueued) {
      incrementVisionAutoMetric('jobs_rejected', { reason: 'queue_full' })
      throw new VisionAutoQueueFullError()
    }

    const createdAt = timestamp()
    const job = {
      id: crypto.randomUUID(),
      requestId: String(request.requestId || '').trim().slice(0, 160) || crypto.randomUUID(),
      tenantId,
      key,
      input,
      originHost: input.originHost || 'unknown',
      createdAt,
      createdAtMs: now(),
      updatedAt: createdAt,
      startedAt: null,
      startedAtMs: null,
      completedAt: null,
      settledAt: null,
      status: 'queued',
      stage: 'queued',
      settled: false,
      started: false,
      result: null,
      controller: new AbortController(),
      deadlineTimer: null,
      readyTimer: null,
      heartbeatTimer: null,
      cleanupTimer: null,
      workerExited: false,
      worker: null,
    }
    jobs.set(job.id, job)
    activeByKey.set(key, job)
    queue.push(job)
    incrementVisionAutoMetric('jobs_submitted', { platform: input.platform })
    const source = redactedVisionAutoSource(input)
    logVisionAutoEvent('job_submitted', {
      job_id: job.id,
      request_id: job.requestId,
      platform: source.platform,
      host: source.host,
      video_id: source.videoId,
      source_fingerprint: source.fingerprint,
      queue_depth: queue.length,
    }, logger)
    schedulePump()
    return safeJobView(job, queue)
  }

  return {
    submit,
    get(id) {
      prune()
      const job = jobs.get(String(id))
      return job ? safeJobView(job, queue) : null
    },
    cancel(id) {
      const job = jobs.get(String(id))
      if (!job || job.settled) return null
      if (job.status === 'queued') {
        const index = queue.findIndex((candidate) => candidate.id === job.id)
        if (index >= 0) queue.splice(index, 1)
        settle(job, 'cancelled')
        return safeJobView(job, queue)
      }
      job.controller.abort()
      job.worker?.cancel?.()
      settle(job, 'cancelled')
      return safeJobView(job, queue)
    },
    stats() {
      const config = getConfig()
      return {
        active: activeCount,
        queued: queue.length,
        jobsRetained: jobs.size,
        completedCacheEntries: completedCache.size,
        maxConcurrency: config.jobMaxConcurrency,
        perOriginConcurrency: config.jobPerOriginConcurrency,
        maxQueued: config.jobMaxQueued,
      }
    },
  }
}

export const visionAutoJobService = createVisionAutoJobService()
