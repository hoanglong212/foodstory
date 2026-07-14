const VALID_STATUSES = new Set(['OK', 'UNAVAILABLE', 'NO_AUDIO', 'ERROR'])

function safeString(value, maxLength = 4000) {
  return String(value || '').trim().slice(0, maxLength)
}

function finiteNumberOrNull(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function sanitizeConfidence(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  if (numeric < 0) return 0
  if (numeric > 1) return 1
  return numeric
}

function sanitizeDiagnostics(diagnostics = []) {
  return (Array.isArray(diagnostics) ? diagnostics : [])
    .map((diagnostic) => {
      if (typeof diagnostic === 'string') return { message: safeString(diagnostic, 240) }
      if (!diagnostic || typeof diagnostic !== 'object') return null

      return {
        ...(diagnostic.stage ? { stage: safeString(diagnostic.stage, 80) } : {}),
        ...(diagnostic.status ? { status: safeString(diagnostic.status, 80) } : {}),
        ...(diagnostic.reason ? { reason: safeString(diagnostic.reason, 120) } : {}),
        ...(diagnostic.code ? { code: safeString(diagnostic.code, 120) } : {}),
        ...(diagnostic.message ? { message: safeString(diagnostic.message, 240) } : {}),
        ...(Number.isFinite(Number(diagnostic.httpStatus))
          ? { httpStatus: Number(diagnostic.httpStatus) }
          : {}),
        ...(typeof diagnostic.timedOut === 'boolean'
          ? { timedOut: diagnostic.timedOut }
          : {}),
      }
    })
    .filter(Boolean)
    .slice(0, 12)
}

function sanitizeAudio(audio = null) {
  if (!audio || typeof audio !== 'object') return null
  const audioPath = safeString(audio.audioPath, 500)
  if (!audioPath) return null
  return {
    audioPath,
    mimeType: safeString(audio.mimeType || 'audio/mpeg', 80),
    sizeBytes: Number.isFinite(Number(audio.sizeBytes)) ? Number(audio.sizeBytes) : 0,
    durationSeconds: finiteNumberOrNull(audio.durationSeconds),
  }
}

function sanitizeSegments(segments = []) {
  return (Array.isArray(segments) ? segments : [])
    .map((segment) => {
      const text = safeString(segment?.text)
      if (!text) return null

      return {
        startSeconds: finiteNumberOrNull(segment?.startSeconds),
        endSeconds: finiteNumberOrNull(segment?.endSeconds),
        text,
        confidence: sanitizeConfidence(segment?.confidence),
      }
    })
    .filter(Boolean)
}

function sanitizeTranscript(providerResult = {}) {
  const text = safeString(providerResult?.text)
  const segments = sanitizeSegments(providerResult?.segments)
  if (!text && !segments.length) return null

  return {
    text,
    language: providerResult?.language ? safeString(providerResult.language, 80) : null,
    confidence: sanitizeConfidence(providerResult?.confidence),
    segments,
  }
}

function createResult({
  status,
  reason,
  transcript = null,
  diagnostics = [],
  providerWarnings = [],
}) {
  return {
    status: VALID_STATUSES.has(status) ? status : 'ERROR',
    reason: safeString(reason || 'UNKNOWN', 120),
    transcript,
    diagnostics: sanitizeDiagnostics(diagnostics),
    providerWarnings: sanitizeDiagnostics(providerWarnings),
  }
}

function normalizedProviderStatus(status) {
  const value = safeString(status, 40).toUpperCase()
  return value || 'OK'
}

export async function runAsrOnShortsAudio(audioResult, deps = {}) {
  const audio = sanitizeAudio(audioResult?.audio)

  if (!audio) {
    return createResult({
      status: 'NO_AUDIO',
      reason: 'NO_AUDIO',
      diagnostics: [{ code: 'NO_AUDIO' }],
    })
  }

  if (typeof deps.track2AsrProvider !== 'function') {
    return createResult({
      status: 'UNAVAILABLE',
      reason: 'ASR_PROVIDER_UNAVAILABLE',
      diagnostics: [{ code: 'MISSING_TRACK2_ASR_PROVIDER' }],
    })
  }

  try {
    const providerResult = await deps.track2AsrProvider({
      audio,
      metadata: audioResult?.metadata || deps.metadata || null,
    })
    const transcript = sanitizeTranscript(providerResult)
    const providerStatus = normalizedProviderStatus(providerResult?.status)

    if (providerStatus === 'UNAVAILABLE' || providerStatus === 'ERROR') {
      return createResult({
        status: providerStatus,
        reason: providerResult?.reason ||
          (providerStatus === 'UNAVAILABLE' ? 'ASR_PROVIDER_UNAVAILABLE' : 'ASR_PROVIDER_ERROR'),
        diagnostics: providerResult?.diagnostics,
        providerWarnings: providerResult?.providerWarnings,
      })
    }

    if (providerStatus !== 'OK') {
      return createResult({
        status: 'ERROR',
        reason: 'ASR_PROVIDER_INVALID_STATUS',
        diagnostics: [
          ...sanitizeDiagnostics(providerResult?.diagnostics),
          { code: 'ASR_PROVIDER_INVALID_STATUS', status: providerStatus },
        ],
        providerWarnings: providerResult?.providerWarnings,
      })
    }

    return createResult({
      status: 'OK',
      reason: transcript ? 'ASR_TRANSCRIPT_COLLECTED' : 'NO_TRANSCRIPT',
      transcript,
      diagnostics: providerResult?.diagnostics,
      providerWarnings: providerResult?.providerWarnings,
    })
  } catch (error) {
    return createResult({
      status: 'ERROR',
      reason: 'ASR_PROVIDER_ERROR',
      diagnostics: [
        {
          code: safeString(error?.code || 'ASR_PROVIDER_ERROR', 120),
          message: safeString(error?.message || 'ASR failed', 240),
        },
      ],
    })
  }
}

export const __shortsTrack2AsrTestUtils = {
  normalizedProviderStatus,
  sanitizeSegments,
  sanitizeTranscript,
}

export default {
  runAsrOnShortsAudio,
}
