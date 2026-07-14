const MAX_VIDEO_DURATION_SECONDS = 60
const MAX_AUDIO_SIZE_BYTES = 16 * 1024 * 1024
const MAX_EXTRACTION_BUDGET_MS = 30 * 1000

const VALID_STATUSES = new Set(['OK', 'UNAVAILABLE', 'REJECTED', 'ERROR'])

export const TRACK2_AUDIO_EXTRACTION_LIMITS = Object.freeze({
  maxVideoDurationSeconds: MAX_VIDEO_DURATION_SECONDS,
  maxAudioSizeBytes: MAX_AUDIO_SIZE_BYTES,
  maxExtractionBudgetMs: MAX_EXTRACTION_BUDGET_MS,
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
      if (typeof diagnostic === 'string') return { message: safeString(diagnostic) }
      if (!diagnostic || typeof diagnostic !== 'object') return null

      return {
        ...(diagnostic.stage ? { stage: safeString(diagnostic.stage, 80) } : {}),
        ...(diagnostic.status ? { status: safeString(diagnostic.status, 80) } : {}),
        ...(diagnostic.reason ? { reason: safeString(diagnostic.reason, 120) } : {}),
        ...(diagnostic.code ? { code: safeString(diagnostic.code, 120) } : {}),
        ...(diagnostic.message ? { message: safeString(diagnostic.message) } : {}),
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
        ...(finiteNumberOrNull(diagnostic.budgetMs) !== null
          ? { budgetMs: finiteNumberOrNull(diagnostic.budgetMs) }
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
  const durationSeconds = finiteNumberOrNull(metadata.durationSeconds)
  if (durationSeconds !== null) return durationSeconds

  const durationMs = finiteNumberOrNull(metadata.durationMs)
  if (durationMs !== null) return durationMs / 1000

  return parseIsoDurationSeconds(metadata.duration)
}

function createResult({
  status,
  reason,
  durationSeconds = null,
  maxDurationSeconds = MAX_VIDEO_DURATION_SECONDS,
  budgetMs = MAX_EXTRACTION_BUDGET_MS,
  audio = null,
  diagnostics = [],
}) {
  return {
    status: VALID_STATUSES.has(status) ? status : 'ERROR',
    reason: safeString(reason || 'UNKNOWN', 120),
    ...(finiteNumberOrNull(durationSeconds) !== null ? { durationSeconds } : {}),
    maxDurationSeconds,
    budgetMs,
    audio,
    diagnostics: sanitizeDiagnostics(diagnostics),
  }
}

function sanitizeAudio(providerAudio = null) {
  if (!providerAudio || typeof providerAudio !== 'object') {
    return {
      audio: null,
      diagnostics: [{ code: 'AUDIO_MISSING', message: 'Audio output was missing' }],
    }
  }

  const audioPath = safeString(providerAudio.audioPath, 500)
  if (!audioPath) {
    return {
      audio: null,
      diagnostics: [{ code: 'AUDIO_PATH_MISSING', message: 'Audio output path was missing' }],
    }
  }

  const sizeBytes = positiveIntegerOrZero(providerAudio.sizeBytes)
  if (sizeBytes > MAX_AUDIO_SIZE_BYTES) {
    return {
      audio: null,
      diagnostics: [
        {
          code: 'AUDIO_SIZE_LIMIT_EXCEEDED',
          message: 'Audio dropped because it exceeded max audio size',
          sizeBytes,
          limitBytes: MAX_AUDIO_SIZE_BYTES,
        },
      ],
    }
  }

  const durationSeconds = finiteNumberOrNull(providerAudio.durationSeconds)
  return {
    audio: {
      audioPath,
      mimeType: safeString(providerAudio.mimeType || 'audio/mpeg', 80),
      sizeBytes,
      durationSeconds: durationSeconds === null ? null : durationSeconds,
    },
    diagnostics: [],
  }
}

function boundedExtractionBudgetMs(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return MAX_EXTRACTION_BUDGET_MS
  return Math.min(Math.floor(numeric), MAX_EXTRACTION_BUDGET_MS)
}

async function withExtractionBudget(providerCall, budgetMs, controller) {
  let timeoutId
  try {
    return await Promise.race([
      Promise.resolve().then(providerCall),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error('Audio extraction timed out')
          error.code = 'AUDIO_EXTRACTION_TIMEOUT'
          reject(error)
          controller.abort(error)
        }, budgetMs)
      }),
    ])
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function extractShortsAudioForAsr(track1Result, deps = {}) {
  const metadata = track1Result?.metadata || null
  const sourceUrl = track1Result?.sourceUrl || metadata?.url || null
  const videoId = track1Result?.videoId || metadata?.videoId || null
  const durationSeconds = knownDurationSeconds(metadata || {})
  const maxDurationSeconds = MAX_VIDEO_DURATION_SECONDS
  const budgetMs = boundedExtractionBudgetMs(deps.track2AudioExtractionBudgetMs)

  if (!sourceUrl) {
    return createResult({
      status: 'REJECTED',
      reason: 'MISSING_SOURCE_URL',
      durationSeconds,
      maxDurationSeconds,
      budgetMs,
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
      diagnostics: [
        {
          code: 'VIDEO_TOO_LONG',
          durationSeconds,
          maxDurationSeconds,
        },
      ],
    })
  }

  if (typeof deps.track2AudioExtractor !== 'function') {
    return createResult({
      status: 'UNAVAILABLE',
      reason: 'AUDIO_EXTRACTOR_UNAVAILABLE',
      durationSeconds,
      maxDurationSeconds,
      budgetMs,
      diagnostics: [{ code: 'MISSING_TRACK2_AUDIO_EXTRACTOR' }],
    })
  }

  try {
    const controller = new AbortController()
    const providerResult = await withExtractionBudget(
      () => deps.track2AudioExtractor({
          sourceUrl,
          videoId,
          metadata,
          limits: {
            ...TRACK2_AUDIO_EXTRACTION_LIMITS,
            maxExtractionBudgetMs: budgetMs,
          },
          budgetMs,
          signal: controller.signal,
          tmpDir: deps.tmpDir || null,
        }),
      budgetMs,
      controller,
    )
    const sanitized = sanitizeAudio(providerResult?.audio)
    const providerStatus = VALID_STATUSES.has(providerResult?.status)
      ? providerResult.status
      : 'OK'
    const status = providerStatus === 'OK' && !sanitized.audio
      ? 'ERROR'
      : providerStatus

    return createResult({
      status,
      reason: providerResult?.reason || (status === 'OK' ? 'AUDIO_EXTRACTED' : 'AUDIO_EXTRACTION_RESULT'),
      durationSeconds,
      maxDurationSeconds,
      budgetMs,
      audio: status === 'OK' ? sanitized.audio : null,
      diagnostics: [
        ...sanitizeDiagnostics(providerResult?.diagnostics),
        ...sanitized.diagnostics,
      ],
    })
  } catch (error) {
    const code = safeString(error?.code || 'AUDIO_EXTRACTION_PROVIDER_ERROR', 120)
    if (code === 'AUDIO_EXTRACTION_TIMEOUT' && typeof deps.cleanupTrack2AudioProviders === 'function') {
      try {
        await deps.cleanupTrack2AudioProviders()
      } catch {
        // Best-effort cleanup after abort.
      }
    }
    return createResult({
      status: 'ERROR',
      reason: code || 'AUDIO_EXTRACTION_PROVIDER_ERROR',
      durationSeconds,
      maxDurationSeconds,
      budgetMs,
      diagnostics: [
        {
          code: code || 'AUDIO_EXTRACTION_PROVIDER_ERROR',
          message: safeString(error?.message || 'Audio extraction failed'),
          durationSeconds,
          maxDurationSeconds,
          budgetMs,
        },
      ],
    })
  }
}

export const __shortsTrack2AudioExtractionTestUtils = {
  knownDurationSeconds,
  parseIsoDurationSeconds,
  boundedExtractionBudgetMs,
}

export default {
  extractShortsAudioForAsr,
}
