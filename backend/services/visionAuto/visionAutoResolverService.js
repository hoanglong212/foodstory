import { emptyFoodMapEntities } from '../foodMapEntityExtractionService.js'
import { fetchPublicImageBuffer } from '../socialUrlExtractionService.js'
import { collectVisionEvidence } from './visionEvidenceCollectorService.js'
import { extractVisionEntityCandidates } from './visionEntityExtractorService.js'
import { normalizeVisionEvidence } from './visionEvidenceNormalizerService.js'
import { validateVisionEntities } from './visionEvidenceValidatorService.js'
import { getVisionAutoRuntimeConfig } from './visionAutoConfig.js'
import { resolveVisionLocationHypotheses } from './visionPlaceResolverService.js'
import { decideVisionAutoResult } from './visionFinalDecisionService.js'
import { buildVisionAutoResponse } from './visionResponseBuilder.js'
import { buildVisionLocationHypothesesFromEntities } from './visionLocationHypothesisService.js'
import { canonicalVisionAutoCacheKey, getOrCreateVisionAutoResult } from './visionAutoResultCache.js'
import { analyzeVisionAutoYoutubeWithTrack2V3, shouldUseVisionAutoTrack2V3 } from './visionAutoTrack2V3AdapterService.js'
import {
  normalizeVisionAutoUrl,
  VisionAutoUrlPolicyError,
} from './visionAutoUrlPolicyService.js'
import {
  incrementVisionAutoMetric,
  observeVisionAutoDuration,
} from './visionAutoObservabilityService.js'

export class VisionAutoInputError extends Error {
  constructor(message, field = null, code = 'VISION_AUTO_INPUT_INVALID') {
    super(message)
    this.name = 'VisionAutoInputError'
    this.code = code
    this.field = field
  }
}
export class VisionAutoDisabledError extends Error { constructor() { super('Vision Auto is disabled.'); this.name = 'VisionAutoDisabledError'; this.code = 'VISION_AUTO_DISABLED' } }
export class VisionAutoTimeoutError extends Error { constructor() { super('Vision Auto exceeded its request deadline.'); this.name = 'VisionAutoTimeoutError'; this.code = 'VISION_AUTO_TIMEOUT' } }

export function resolveVisionAutoInput({
  image = null,
  url = '',
  assetTypeHint = 'unknown',
  authMode = 'public',
  maxDurationSec = null,
} = {}) {
  const cleanedUrl = String(url || '').trim()
  if (image && cleanedUrl) throw new VisionAutoInputError('Provide either one uploaded image or one URL, not both.')
  if (!image && !cleanedUrl) throw new VisionAutoInputError('Provide one uploaded image or one public URL.')
  if (image) {
    return {
      type: 'uploaded_image',
      assetType: 'image',
      assetTypeHint: 'image',
      authMode: 'none',
      url: null,
      platform: 'image',
      originHost: null,
      fingerprint: null,
      maxDurationSec: null,
    }
  }
  try {
    return {
      ...normalizeVisionAutoUrl(cleanedUrl, { assetTypeHint, authMode }),
      maxDurationSec: Number.isFinite(Number(maxDurationSec))
        ? Math.max(1, Math.min(600, Math.round(Number(maxDurationSec))))
        : null,
    }
  } catch (error) {
    if (error instanceof VisionAutoUrlPolicyError) {
      throw new VisionAutoInputError(error.message, error.field || 'url', error.code)
    }
    throw error
  }
}

function deadlineSignal(parent, deadlineMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new VisionAutoTimeoutError()), deadlineMs)
  timer.unref?.()
  const forward = () => controller.abort(parent?.reason)
  parent?.addEventListener('abort', forward, { once: true })
  return { signal: controller.signal, dispose: () => { clearTimeout(timer); parent?.removeEventListener('abort', forward) } }
}

function raceAbort(promise, signal) {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(signal.reason || new VisionAutoTimeoutError())
  return Promise.race([
    promise,
    new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason || new VisionAutoTimeoutError()), { once: true })),
  ])
}

function isRecipeOnly(entities = {}) {
  const warnings = Array.isArray(entities?.warnings) ? entities.warnings.join(' ') : ''
  const combined = `${entities?.address?.value || ''} ${entities?.placeName?.value || ''} ${warnings}`.toLowerCase()
  return /\b(?:\d+(?:[.,]\d+)?\s*(?:g|gr|kg|ml|muong|muỗng|phut|phút|do|độ)|hat nem|hạt nêm|nuoc mam|nước mắm|nguyen lieu|nguyên liệu|cach lam|cách làm)\b/u.test(combined)
}

async function materializeRemoteImage({ input, config, signal, dependencies }) {
  const download = dependencies.downloadRemoteImage || fetchPublicImageBuffer
  const downloaded = await download(
    { url: input.url },
    {
      maxResponseBytes: config.remoteImageMaxBytes,
      timeoutMs: config.remoteImageTimeoutMs,
      maxRedirects: config.remoteImageMaxRedirects,
      signal,
      ...(dependencies.remoteImageFetchOptions || {}),
    },
  )
  if (downloaded?.status !== 'success' || !Buffer.isBuffer(downloaded.buffer)) {
    const error = new Error('The remote image could not be downloaded safely.')
    error.code = ['unsafe_url', 'unsupported_content_type', 'content_type_mismatch'].includes(downloaded?.status)
      ? 'source_rejected'
      : 'source_unavailable'
    throw error
  }
  return {
    input: {
      ...input,
      type: 'uploaded_image',
      platform: 'image',
      remoteImageSource: true,
    },
    image: {
      buffer: downloaded.buffer,
      mimetype: downloaded.contentType,
      originalname: 'vision-auto-remote-image',
    },
  }
}

async function runPipeline({ input, image, config, signal, dependencies }) {
  if (shouldUseVisionAutoTrack2V3({ input, config, env: dependencies.env || process.env })) {
    return analyzeVisionAutoYoutubeWithTrack2V3({ input, config, dependencies: { ...dependencies, signal } })
  }

  let collectionInput = input
  let collectionImage = image
  if (input?.type === 'remote_image_url') {
    const materialized = await materializeRemoteImage({ input, config, signal, dependencies })
    collectionInput = materialized.input
    collectionImage = materialized.image
  }

  const collect = dependencies.collectEvidence || collectVisionEvidence
  const normalize = dependencies.normalizeEvidence || normalizeVisionEvidence
  const extract = dependencies.extractEntities || extractVisionEntityCandidates
  const validate = dependencies.validateEntities || validateVisionEntities
  const resolve = dependencies.resolvePlaces || resolveVisionLocationHypotheses
  const collection = await collect({ input: collectionInput, image: collectionImage, config, signal }, dependencies.collectorOptions || {})
  const normalizedEvidence = normalize(collection)
  const candidateEntities = extract(normalizedEvidence, dependencies.extractorOptions || {})
  const validated = await validate({ input: collectionInput, normalizedEvidence, candidateEntities, config, signal }, dependencies.validatorOptions || {})
  const entities = validated.entities || emptyFoodMapEntities()
  if (isRecipeOnly(entities) || validated?.validation?.canResolveLocation === false) {
    return buildVisionAutoResponse({ status: 'not_found', reason: 'insufficient_evidence', input })
  }
  const hypotheses = buildVisionLocationHypothesesFromEntities(entities, { sourceMayContainMultiplePlaces: false })
  const resolution = await resolve({ hypotheses, config, signal }, dependencies.placeResolverOptions || {})
  const decision = decideVisionAutoResult({ placeCandidates: resolution.placeCandidates, resolution: resolution.resolution, sourceContext: { isMultiPlace: false } })
  return buildVisionAutoResponse({ ...decision, input })
}

export async function analyzeVisionAutoV2({
  image = null,
  url = '',
  assetTypeHint = 'unknown',
  authMode = 'public',
  maxDurationSec = null,
  signal = null,
} = {}, dependencies = {}) {
  const config = dependencies.config || getVisionAutoRuntimeConfig(dependencies.env || process.env)
  if (!(config.visionAutoEnabled ?? config.enabled)) throw new VisionAutoDisabledError()
  const input = resolveVisionAutoInput({ image, url, assetTypeHint, authMode, maxDurationSec })
  const imageBuffer = image?.buffer || null
  const key = canonicalVisionAutoCacheKey({ ...input, imageBuffer }, config.pipelineVersion)
  const startedAt = Date.now()
  incrementVisionAutoMetric('requests_started', { input_type: input.type })

  const execute = async () => {
    const deadline = deadlineSignal(signal, config.requestDeadlineMs)
    try {
      return await raceAbort(runPipeline({ input, image, config, signal: deadline.signal, dependencies }), deadline.signal)
    } catch (error) {
      if (deadline.signal.aborted && !signal?.aborted) return buildVisionAutoResponse({ status: 'not_found', reason: 'analysis_timeout', input })
      if (error?.name === 'AbortError') throw error
      const reason = error?.code === 'source_unavailable'
        ? 'source_unavailable'
        : error?.code === 'source_rejected'
          ? 'source_rejected'
          : 'service_failure'
      return buildVisionAutoResponse({ status: 'error', reason, input })
    } finally {
      deadline.dispose()
    }
  }

  try {
    if (!key) {
      const result = await execute()
      incrementVisionAutoMetric('requests_completed', { status: result?.status || 'unknown', cache: 'none' })
      return result
    }
    const cached = await getOrCreateVisionAutoResult({
      key,
      cacheEnabled: config.cacheEnabled,
      ttlMs: config.cacheTtlMs,
      notFoundTtlMs: config.notFoundCacheTtlMs,
      maxEntries: config.cacheMaxEntries,
      run: execute,
    })
    incrementVisionAutoMetric('requests_completed', {
      status: cached.result?.status || 'unknown',
      cache: cached.cacheHit ? 'hit' : cached.sharedInFlight ? 'shared' : 'miss',
    })
    return cached.result
  } finally {
    observeVisionAutoDuration('request_duration_ms', Date.now() - startedAt, { input_type: input.type })
  }
}

export default analyzeVisionAutoV2
