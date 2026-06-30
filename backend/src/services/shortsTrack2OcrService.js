const VALID_STATUSES = new Set(['OK', 'UNAVAILABLE', 'NO_FRAMES', 'ERROR'])

function safeString(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength)
}

function finiteNumberOrNull(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function sanitizeDiagnostics(diagnostics = []) {
  return (Array.isArray(diagnostics) ? diagnostics : [])
    .map((diagnostic) => {
      if (typeof diagnostic === 'string') {
        return { message: safeString(diagnostic, 240) }
      }

      if (!diagnostic || typeof diagnostic !== 'object') {
        return null
      }

      return {
        ...(diagnostic.stage ? { stage: safeString(diagnostic.stage, 80) } : {}),
        ...(diagnostic.status ? { status: safeString(diagnostic.status, 80) } : {}),
        ...(diagnostic.reason ? { reason: safeString(diagnostic.reason, 120) } : {}),
        ...(diagnostic.code ? { code: safeString(diagnostic.code, 120) } : {}),
        ...(diagnostic.message ? { message: safeString(diagnostic.message, 240) } : {}),
        ...(Number.isFinite(Number(diagnostic.frameIndex))
          ? { frameIndex: Number(diagnostic.frameIndex) }
          : {}),
        ...(Number.isFinite(Number(diagnostic.timestampSeconds))
          ? { timestampSeconds: Number(diagnostic.timestampSeconds) }
          : {}),
        ...(Number.isFinite(Number(diagnostic.httpStatus))
          ? { httpStatus: Number(diagnostic.httpStatus) }
          : {}),
        ...(Number.isFinite(Number(diagnostic.frameCount))
          ? { frameCount: Number(diagnostic.frameCount) }
          : {}),
        ...(Number.isFinite(Number(diagnostic.textBlockCount))
          ? { textBlockCount: Number(diagnostic.textBlockCount) }
          : {}),
        ...(typeof diagnostic.timedOut === 'boolean'
          ? { timedOut: diagnostic.timedOut }
          : {}),
      }
    })
    .filter(Boolean)
    .slice(0, 12)
}

function sanitizeConfidence(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  if (numeric < 0) return 0
  if (numeric > 1) return 1
  return numeric
}

function sanitizeFrames(frames = []) {
  return (Array.isArray(frames) ? frames : [])
    .map((frame) => ({
      frameIndex: finiteNumberOrNull(frame?.frameIndex),
      timestampSeconds: finiteNumberOrNull(frame?.timestampSeconds),
      imagePath: safeString(frame?.imagePath, 500),
      mimeType: safeString(frame?.mimeType || 'image/jpeg', 80),
      sizeBytes: Number.isFinite(Number(frame?.sizeBytes)) ? Number(frame.sizeBytes) : 0,
    }))
    .filter((frame) => frame.imagePath)
}

function sanitizeTextBlocks(textBlocks = []) {
  return (Array.isArray(textBlocks) ? textBlocks : [])
    .map((block) => {
      const text = safeString(block?.text)
      if (!text) return null

      return {
        frameIndex: finiteNumberOrNull(block?.frameIndex),
        timestampSeconds: finiteNumberOrNull(block?.timestampSeconds),
        text,
        confidence: sanitizeConfidence(block?.confidence),
      }
    })
    .filter(Boolean)
}

function createResult({
  status,
  reason,
  textBlocks = [],
  diagnostics = [],
  providerWarnings = [],
}) {
  return {
    status: VALID_STATUSES.has(status) ? status : 'ERROR',
    reason: safeString(reason || 'UNKNOWN', 120),
    textBlocks: sanitizeTextBlocks(textBlocks),
    diagnostics: sanitizeDiagnostics(diagnostics),
    providerWarnings: sanitizeDiagnostics(providerWarnings),
  }
}

function normalizedProviderStatus(status) {
  const value = safeString(status, 40).toUpperCase()
  return value || 'OK'
}

export async function runOcrOnShortsFrames(frameResult, deps = {}) {
  const frames = sanitizeFrames(frameResult?.frames)

  if (!frames.length) {
    return createResult({
      status: 'NO_FRAMES',
      reason: 'NO_FRAMES',
      diagnostics: [{ code: 'NO_FRAMES' }],
    })
  }

  if (typeof deps.track2OcrProvider !== 'function') {
    return createResult({
      status: 'UNAVAILABLE',
      reason: 'OCR_PROVIDER_UNAVAILABLE',
      diagnostics: [{ code: 'MISSING_TRACK2_OCR_PROVIDER' }],
    })
  }

  try {
    const providerResult = await deps.track2OcrProvider({
      frames,
      metadata: frameResult?.metadata || deps.metadata || null,
    })
    const textBlocks = sanitizeTextBlocks(providerResult?.textBlocks)
    const providerStatus = normalizedProviderStatus(providerResult?.status)

    if (providerStatus === 'UNAVAILABLE' || providerStatus === 'ERROR') {
      return createResult({
        status: providerStatus,
        reason: providerResult?.reason ||
          (providerStatus === 'UNAVAILABLE' ? 'OCR_PROVIDER_UNAVAILABLE' : 'OCR_PROVIDER_ERROR'),
        diagnostics: providerResult?.diagnostics,
        providerWarnings: providerResult?.providerWarnings,
      })
    }

    if (providerStatus !== 'OK') {
      return createResult({
        status: 'ERROR',
        reason: 'OCR_PROVIDER_INVALID_STATUS',
        diagnostics: [
          ...sanitizeDiagnostics(providerResult?.diagnostics),
          { code: 'OCR_PROVIDER_INVALID_STATUS', status: providerStatus },
        ],
        providerWarnings: providerResult?.providerWarnings,
      })
    }

    return createResult({
      status: 'OK',
      reason: textBlocks.length ? 'OCR_TEXT_COLLECTED' : 'OCR_NO_TEXT',
      textBlocks,
      diagnostics: providerResult?.diagnostics,
      providerWarnings: providerResult?.providerWarnings,
    })
  } catch (error) {
    return createResult({
      status: 'ERROR',
      reason: 'OCR_PROVIDER_ERROR',
      diagnostics: [
        {
          code: safeString(error?.code || 'OCR_PROVIDER_ERROR', 120),
          message: safeString(error?.message || 'OCR failed', 240),
        },
      ],
    })
  }
}

export const __shortsTrack2OcrTestUtils = {
  normalizedProviderStatus,
  sanitizeTextBlocks,
}

export default {
  runOcrOnShortsFrames,
}
