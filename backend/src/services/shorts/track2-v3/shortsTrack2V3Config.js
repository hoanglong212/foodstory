export const DEFAULT_SHORTS_TRACK2_V3_CONFIG = Object.freeze({
  enabled: false,
  maxDurationSeconds: 180,
  cheapFrameCount: 4,
  maxFrames: 8,
  maxOcrImages: 16,
  track2V3OcrBoostEnabled: true,
  ocrBoostEnabled: true,
  ocrBoostFrameCount: 8,
  track2V3GoogleVisionEnabled: false,
  track2V3PlacesEnabled: false,
  track2V3GeminiVisionEnabled: false,
  track2V3SmartOverlayEnabled: true,
  track2V3SmartOverlayDryRun: false,
  track2V3LocalOcrEnabled: false,
  smartOverlaySampleIntervalMs: 750,
  maxSmartOverlayFrames: 60,
  maxSmartOverlaySelectedImages: 24,
  smartOverlayTimeoutMs: 60000,
  smartOverlayDebugEnabled: false,
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

function boundedIntegerEnv(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = integerEnv(value, fallback, { min })
  return Math.min(parsed, max)
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
    track2V3GoogleVisionEnabled: booleanEnv(
      env.TRACK2_V3_GOOGLE_VISION_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3GoogleVisionEnabled,
    ),
    track2V3PlacesEnabled: booleanEnv(
      env.TRACK2_V3_PLACES_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3PlacesEnabled,
    ),
    track2V3GeminiVisionEnabled: booleanEnv(
      env.TRACK2_V3_GEMINI_VISION_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3GeminiVisionEnabled,
    ),
    track2V3SmartOverlayEnabled: booleanEnv(
      env.TRACK2_V3_SMART_OVERLAY_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3SmartOverlayEnabled,
    ),
    track2V3SmartOverlayDryRun: booleanEnv(
      env.TRACK2_V3_SMART_OVERLAY_DRY_RUN,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3SmartOverlayDryRun,
    ),
    track2V3LocalOcrEnabled: booleanEnv(
      env.TRACK2_V3_LOCAL_OCR_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3LocalOcrEnabled,
    ),
    smartOverlaySampleIntervalMs: boundedIntegerEnv(
      env.TRACK2_V3_SMART_OVERLAY_SAMPLE_INTERVAL_MS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.smartOverlaySampleIntervalMs,
      { min: 250, max: 5000 },
    ),
    maxSmartOverlayFrames: boundedIntegerEnv(
      env.TRACK2_V3_MAX_SMART_OVERLAY_FRAMES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxSmartOverlayFrames,
      { min: 1, max: 120 },
    ),
    maxSmartOverlaySelectedImages: boundedIntegerEnv(
      env.TRACK2_V3_MAX_SMART_OVERLAY_SELECTED_IMAGES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxSmartOverlaySelectedImages,
      { min: 1, max: 60 },
    ),
    smartOverlayTimeoutMs: boundedIntegerEnv(
      env.TRACK2_V3_SMART_OVERLAY_TIMEOUT_MS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.smartOverlayTimeoutMs,
      { min: 1000, max: 120000 },
    ),
    smartOverlayDebugEnabled: booleanEnv(
      env.TRACK2_V3_SMART_OVERLAY_DEBUG_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.smartOverlayDebugEnabled,
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
