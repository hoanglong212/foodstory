const DEFAULT_MAX_VIDEO_DURATION_SECONDS = 60
const HARD_MAX_VIDEO_DURATION_SECONDS = 180
const MAX_FRAMES = 8
const MAX_FRAME_SIZE_BYTES = 3 * 1024 * 1024
const MAX_TOTAL_FRAME_BYTES = 16 * 1024 * 1024
const MAX_EXTRACTION_BUDGET_MS = 30 * 1000
const DEFAULT_SAMPLE_STRATEGY = 'UNIFORM'
const HEAD_MID_TAIL_SAMPLE_STRATEGY = 'HEAD_MID_TAIL'

const VALID_STATUSES = new Set(['OK', 'UNAVAILABLE', 'REJECTED', 'ERROR'])

export function resolveTrack2FrameMaxDurationSeconds(
  value = process.env.TRACK2_FRAME_MAX_DURATION_SECONDS,
) {
  const text = String(value ?? '').trim()
  if (!text) return DEFAULT_MAX_VIDEO_DURATION_SECONDS

  const numeric = Number(text)
  if (
    !Number.isInteger(numeric) ||
    numeric < 1 ||
    numeric > HARD_MAX_VIDEO_DURATION_SECONDS
  ) {
    return DEFAULT_MAX_VIDEO_DURATION_SECONDS
  }

  return numeric
}

function enabledFlag(value) {
  return /^(?:1|true|yes|on)$/iu.test(String(value ?? '').trim())
}

export function resolveTrack2FrameSampleStrategy(
  strategy = process.env.TRACK2_FRAME_SAMPLE_STRATEGY,
  smartSamplingEnabled = process.env.TRACK2_SMART_SAMPLING_ENABLED,
) {
  if (!enabledFlag(smartSamplingEnabled)) return DEFAULT_SAMPLE_STRATEGY
  return String(strategy ?? '').trim().toUpperCase() === HEAD_MID_TAIL_SAMPLE_STRATEGY
    ? HEAD_MID_TAIL_SAMPLE_STRATEGY
    : DEFAULT_SAMPLE_STRATEGY
}

function boundedExtractionBudgetMs(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return MAX_EXTRACTION_BUDGET_MS
  return Math.min(Math.floor(numeric), MAX_EXTRACTION_BUDGET_MS)
}

export function getTrack2FrameExtractionLimits({ budgetMs } = {}) {
  return Object.freeze({
    maxVideoDurationSeconds: resolveTrack2FrameMaxDurationSeconds(),
    maxFrames: MAX_FRAMES,
    maxFrameSizeBytes: MAX_FRAME_SIZE_BYTES,
    maxTotalFrameBytes: MAX_TOTAL_FRAME_BYTES,
    maxExtractionBudgetMs: boundedExtractionBudgetMs(budgetMs),
    sampleStrategy: resolveTrack2FrameSampleStrategy(),
  })
}

export const TRACK2_FRAME_EXTRACTION_LIMITS = Object.freeze({
  get maxVideoDurationSeconds() {
    return resolveTrack2FrameMaxDurationSeconds()
  },
  maxFrames: MAX_FRAMES,
  maxFrameSizeBytes: MAX_FRAME_SIZE_BYTES,
  maxTotalFrameBytes: MAX_TOTAL_FRAME_BYTES,
  maxExtractionBudgetMs: MAX_EXTRACTION_BUDGET_MS,
  get sampleStrategy() {
    return resolveTrack2FrameSampleStrategy()
  },
})

function safeString(value, maxLength = 240) {
  return String(value || '').trim().slice(0, maxLength)
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function positiveIntegerOrZero(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return 0
  return Math.floor(numeric)
}

function sanitizeDiagnostics(diagnostics = []) {
  return (Array.isArray(diagnostics) ? diagnostics : [])
    .map((diagnostic) => {
      if (typeof diagnostic === 'string') {
        return { message: safeString(diagnostic) }
      }

      if (!diagnostic || typeof diagnostic !== 'object') {
        return null
      }

      return {
        ...(diagnostic.stage ? { stage: safeString(diagnostic.stage, 80) } : {}),
        ...(diagnostic.status ? { status: safeString(diagnostic.status, 80) } : {}),
        ...(diagnostic.reason ? { reason: safeString(diagnostic.reason, 120) } : {}),
        ...(diagnostic.code ? { code: safeString(diagnostic.code, 120) } : {}),
        ...(diagnostic.message ? { message: safeString(diagnostic.message) } : {}),
        ...(diagnostic.sampleStrategy
          ? { sampleStrategy: safeString(diagnostic.sampleStrategy, 40) }
          : {}),
        ...(Number.isFinite(Number(diagnostic.frameIndex))
          ? { frameIndex: Number(diagnostic.frameIndex) }
          : {}),
        ...(Number.isFinite(Number(diagnostic.timestampSeconds))
          ? { timestampSeconds: Number(diagnostic.timestampSeconds) }
          : {}),
        ...(Number.isFinite(Number(diagnostic.sizeBytes))
          ? { sizeBytes: Number(diagnostic.sizeBytes) }
          : {}),
        ...(Number.isFinite(Number(diagnostic.limitBytes))
          ? { limitBytes: Number(diagnostic.limitBytes) }
          : {}),
        ...(finiteNumberOrNull(diagnostic.durationSeconds) !== null
          ? { durationSeconds: finiteNumberOrNull(diagnostic.durationSeconds) }
          : {}),
        ...(finiteNumberOrNull(diagnostic.maxDurationSeconds) !== null
          ? { maxDurationSeconds: finiteNumberOrNull(diagnostic.maxDurationSeconds) }
          : {}),
        ...(Number.isFinite(Number(diagnostic.budgetMs))
          ? { budgetMs: Number(diagnostic.budgetMs) }
          : {}),
        ...(Number.isFinite(Number(diagnostic.frameCount))
          ? { frameCount: Number(diagnostic.frameCount) }
          : {}),
        ...(Number.isFinite(Number(diagnostic.maxFrames))
          ? { maxFrames: Number(diagnostic.maxFrames) }
          : {}),
        ...(Array.isArray(diagnostic.sampledTimestamps)
          ? {
              sampledTimestamps: diagnostic.sampledTimestamps
                .map(finiteNumberOrNull)
                .filter((value) => value !== null && value >= 0)
                .slice(0, MAX_FRAMES),
            }
          : {}),
      }
    })
    .filter(Boolean)
    .slice(0, 12)
}

function parseIsoDurationSeconds(value) {
  const text = safeString(value)
  if (!text) return null

  const match = /^P(?:(\d+(?:\.\d+)?)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/iu.exec(text)
  if (!match) return null

  const days = Number(match[1] || 0)
  const hours = Number(match[2] || 0)
  const minutes = Number(match[3] || 0)
  const seconds = Number(match[4] || 0)
  return days * 86400 + hours * 3600 + minutes * 60 + seconds
}

function knownDurationSeconds(metadata = {}) {
  const numericDuration = finiteNumberOrNull(metadata.durationSeconds)
  if (numericDuration !== null && numericDuration > 0) return numericDuration

  const numericDurationMs = finiteNumberOrNull(metadata.durationMs)
  if (numericDurationMs !== null && numericDurationMs > 0) return numericDurationMs / 1000

  const isoDurationSeconds = parseIsoDurationSeconds(metadata.duration)
  return isoDurationSeconds !== null && isoDurationSeconds > 0 ? isoDurationSeconds : null
}

function createResult({
  status,
  reason,
  durationSeconds = null,
  maxDurationSeconds = resolveTrack2FrameMaxDurationSeconds(),
  budgetMs = MAX_EXTRACTION_BUDGET_MS,
  sampleStrategy = resolveTrack2FrameSampleStrategy(),
  maxFrames = MAX_FRAMES,
  sampledTimestamps = [],
  frames = [],
  diagnostics = [],
}) {
  return {
    status: VALID_STATUSES.has(status) ? status : 'ERROR',
    reason: safeString(reason || 'UNKNOWN'),
    ...(finiteNumberOrNull(durationSeconds) !== null
      ? { durationSeconds: finiteNumberOrNull(durationSeconds) }
      : {}),
    maxDurationSeconds: resolveTrack2FrameMaxDurationSeconds(maxDurationSeconds),
    budgetMs: boundedExtractionBudgetMs(budgetMs),
    sampleStrategy: sampleStrategy === HEAD_MID_TAIL_SAMPLE_STRATEGY
      ? HEAD_MID_TAIL_SAMPLE_STRATEGY
      : DEFAULT_SAMPLE_STRATEGY,
    maxFrames: Math.max(1, Math.min(positiveIntegerOrZero(maxFrames) || MAX_FRAMES, MAX_FRAMES)),
    sampledTimestamps: (Array.isArray(sampledTimestamps) ? sampledTimestamps : [])
      .map(finiteNumberOrNull)
      .filter((value) => value !== null && value >= 0)
      .slice(0, MAX_FRAMES),
    frameCount: Array.isArray(frames) ? frames.length : 0,
    frames: Array.isArray(frames) ? frames : [],
    diagnostics: sanitizeDiagnostics(diagnostics),
  }
}

function sanitizeProviderFrames(providerFrames = [], providerTimestamps = []) {
  const diagnostics = []
  const frames = []
  let totalBytes = 0

  for (const rawFrame of Array.isArray(providerFrames) ? providerFrames : []) {
    if (frames.length >= MAX_FRAMES) {
      diagnostics.push({
        code: 'MAX_FRAMES_EXCEEDED',
        message: 'Frame dropped because max frame count was exceeded',
        maxFrames: MAX_FRAMES,
      })
      continue
    }

    const imagePath = safeString(rawFrame?.imagePath, 500)
    if (!imagePath) {
      diagnostics.push({
        code: 'FRAME_IMAGE_PATH_MISSING',
        message: 'Frame dropped because imagePath was missing',
      })
      continue
    }

    const sizeBytes = positiveIntegerOrZero(rawFrame?.sizeBytes)
    if (sizeBytes > MAX_FRAME_SIZE_BYTES) {
      diagnostics.push({
        code: 'FRAME_SIZE_LIMIT_EXCEEDED',
        message: 'Frame dropped because it exceeded max frame size',
        sizeBytes,
        limitBytes: MAX_FRAME_SIZE_BYTES,
      })
      continue
    }

    if (totalBytes + sizeBytes > MAX_TOTAL_FRAME_BYTES) {
      diagnostics.push({
        code: 'TOTAL_FRAME_BYTES_LIMIT_EXCEEDED',
        message: 'Frame dropped because total frame bytes exceeded the limit',
        sizeBytes: totalBytes + sizeBytes,
        limitBytes: MAX_TOTAL_FRAME_BYTES,
      })
      continue
    }

    const fallbackIndex = frames.length
    const frameIndex = finiteNumberOrNull(rawFrame?.frameIndex)
    const timestampSeconds = finiteNumberOrNull(rawFrame?.timestampSeconds)

    frames.push({
      frameIndex: frameIndex === null ? fallbackIndex : frameIndex,
      timestampSeconds: timestampSeconds === null ? null : timestampSeconds,
      imagePath,
      mimeType: safeString(rawFrame?.mimeType || 'image/jpeg', 80),
      sizeBytes,
    })
    totalBytes += sizeBytes
  }

  const sampledTimestamps = (Array.isArray(providerTimestamps) && providerTimestamps.length
    ? providerTimestamps
    : frames.map((frame) => frame.timestampSeconds))
    .map(finiteNumberOrNull)
    .filter((value) => value !== null && value >= 0)
    .slice(0, MAX_FRAMES)

  return { frames, sampledTimestamps, diagnostics }
}

async function withExtractionBudget(providerCall, budgetMs, controller) {
  let timeoutId
  try {
    return await Promise.race([
      Promise.resolve().then(providerCall),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error('Frame extraction timed out')
          error.code = 'FRAME_EXTRACTION_TIMEOUT'
          reject(error)
          controller.abort(error)
        }, budgetMs)
      }),
    ])
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function extractShortsFramesForOcr(track1Result, deps = {}) {
  const metadata = track1Result?.metadata || null
  const sourceUrl = track1Result?.sourceUrl || metadata?.url || null
  const videoId = track1Result?.videoId || metadata?.videoId || null
  const durationSeconds = knownDurationSeconds(metadata || {})
  const budgetMs = boundedExtractionBudgetMs(deps.track2FrameExtractionBudgetMs)
  const limits = getTrack2FrameExtractionLimits({ budgetMs })
  const maxDurationSeconds = limits.maxVideoDurationSeconds
  const sampleStrategy = limits.sampleStrategy

  if (!sourceUrl) {
    return createResult({
      status: 'REJECTED',
      reason: 'MISSING_SOURCE_URL',
      durationSeconds,
      maxDurationSeconds,
      budgetMs,
      sampleStrategy,
      diagnostics: [{ code: 'MISSING_SOURCE_URL' }],
    })
  }

  if (durationSeconds !== null && durationSeconds > maxDurationSeconds) {
    return createResult({
      status: 'REJECTED',
      reason: 'VIDEO_TOO_LONG',
      durationSeconds,
      maxDurationSeconds,
      budgetMs,
      sampleStrategy,
      diagnostics: [
        {
          code: 'VIDEO_TOO_LONG',
          durationSeconds,
          maxDurationSeconds,
        },
      ],
    })
  }

  if (typeof deps.track2FrameExtractor !== 'function') {
    return createResult({
      status: 'UNAVAILABLE',
      reason: 'FRAME_EXTRACTOR_UNAVAILABLE',
      durationSeconds,
      maxDurationSeconds,
      budgetMs,
      sampleStrategy,
      diagnostics: [{ code: 'MISSING_TRACK2_FRAME_EXTRACTOR' }],
    })
  }

  try {
    const controller = new AbortController()
    const providerResult = await withExtractionBudget(
      () => deps.track2FrameExtractor({
          sourceUrl,
          videoId,
          metadata,
          limits,
          budgetMs,
          signal: controller.signal,
          tmpDir: deps.tmpDir || null,
        }),
      budgetMs,
      controller,
    )
    const sanitized = sanitizeProviderFrames(
      providerResult?.frames,
      providerResult?.sampledTimestamps,
    )
    const providerStatus = VALID_STATUSES.has(providerResult?.status)
      ? providerResult.status
      : 'OK'
    const status = providerStatus === 'OK' && sanitized.frames.length === 0
      ? 'OK'
      : providerStatus

    return createResult({
      status,
      reason: providerResult?.reason || (status === 'OK' ? 'FRAMES_EXTRACTED' : 'FRAME_EXTRACTION_RESULT'),
      durationSeconds,
      maxDurationSeconds,
      budgetMs,
      sampleStrategy,
      sampledTimestamps: sanitized.sampledTimestamps,
      frames: status === 'OK' ? sanitized.frames : [],
      diagnostics: [
        ...sanitizeDiagnostics(providerResult?.diagnostics),
        ...sanitized.diagnostics,
      ],
    })
  } catch (error) {
    const code = safeString(error?.code || 'FRAME_EXTRACTION_PROVIDER_ERROR', 120)
    if (code === 'FRAME_EXTRACTION_TIMEOUT' && typeof deps.cleanupTrack2LiveProviders === 'function') {
      try {
        await deps.cleanupTrack2LiveProviders()
      } catch {
        // Best-effort cleanup after abort.
      }
    }
    return createResult({
      status: 'ERROR',
      reason: code || 'FRAME_EXTRACTION_PROVIDER_ERROR',
      durationSeconds,
      maxDurationSeconds,
      budgetMs,
      sampleStrategy,
      diagnostics: [
        {
          code: code || 'FRAME_EXTRACTION_PROVIDER_ERROR',
          message: safeString(error?.message || 'Frame extraction failed'),
          durationSeconds,
          maxDurationSeconds,
          budgetMs,
          sampleStrategy,
        },
      ],
    })
  }
}

export const __shortsTrack2FrameExtractionTestUtils = {
  knownDurationSeconds,
  parseIsoDurationSeconds,
  boundedExtractionBudgetMs,
  enabledFlag,
  resolveTrack2FrameMaxDurationSeconds,
  resolveTrack2FrameSampleStrategy,
}

export default {
  extractShortsFramesForOcr,
}
