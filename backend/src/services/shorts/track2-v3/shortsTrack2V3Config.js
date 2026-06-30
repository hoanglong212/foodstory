export const DEFAULT_SHORTS_TRACK2_V3_CONFIG = Object.freeze({
  enabled: false,
  maxDurationSeconds: 180,
  cheapFrameCount: 4,
  maxFrames: 8,
  maxOcrImages: 16,
  track2V3OcrBoostEnabled: true,
  ocrBoostEnabled: true,
  ocrBoostFrameCount: 8,
  maxGeminiImages: 2,
  maxPlacesQueries: 3,
  timeoutMs: 45000,
})

function booleanEnv(value, fallback) {
  if (value == null || value === '') return fallback
  return String(value).trim().toLowerCase() === 'true'
}

function integerEnv(value, fallback, { min = 0 } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed < min) return fallback
  return parsed
}

export function getShortsTrack2V3Config(env = process.env) {
  const ocrBoostEnabled = booleanEnv(
    env.TRACK2_V3_OCR_BOOST_ENABLED,
    DEFAULT_SHORTS_TRACK2_V3_CONFIG.ocrBoostEnabled,
  )

  return {
    enabled: booleanEnv(env.TRACK2_V3_ENABLED, DEFAULT_SHORTS_TRACK2_V3_CONFIG.enabled),
    maxDurationSeconds: integerEnv(
      env.TRACK2_V3_MAX_DURATION_SECONDS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxDurationSeconds,
      { min: 1 },
    ),
    cheapFrameCount: integerEnv(
      env.TRACK2_V3_CHEAP_FRAME_COUNT,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.cheapFrameCount,
      { min: 0 },
    ),
    maxFrames: integerEnv(
      env.TRACK2_V3_MAX_FRAMES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxFrames,
      { min: 0 },
    ),
    maxOcrImages: integerEnv(
      env.TRACK2_V3_MAX_OCR_IMAGES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxOcrImages,
      { min: 0 },
    ),
    track2V3OcrBoostEnabled: ocrBoostEnabled,
    ocrBoostEnabled,
    ocrBoostFrameCount: integerEnv(
      env.TRACK2_V3_OCR_BOOST_FRAME_COUNT,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.ocrBoostFrameCount,
      { min: 0 },
    ),
    maxGeminiImages: integerEnv(
      env.TRACK2_V3_MAX_GEMINI_IMAGES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxGeminiImages,
      { min: 0 },
    ),
    maxPlacesQueries: integerEnv(
      env.TRACK2_V3_MAX_PLACES_QUERIES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxPlacesQueries,
      { min: 0 },
    ),
    timeoutMs: integerEnv(
      env.TRACK2_V3_TIMEOUT_MS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.timeoutMs,
      { min: 1 },
    ),
  }
}

export function isShortsTrack2V3Enabled(env = process.env) {
  return getShortsTrack2V3Config(env).enabled
}
