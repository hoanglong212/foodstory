const FALSE_VALUES = new Set(['false', '0', 'no', 'off'])
const DEBUG_LEVELS = new Set(['none', 'summary'])
const VALIDATOR_MODES = new Set(['rule', 'gemini', 'hybrid'])
const LOCATION_PROVIDERS = new Set(['disabled', 'google'])
const FRAME_SCAN_MODES = new Set(['sampled', 'dense_1fps'])

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  return !FALSE_VALUES.has(String(value).trim().toLowerCase())
}

function enumValue(value, allowed, fallback) {
  const normalized = String(value || '').trim().toLowerCase()
  return allowed.has(normalized) ? normalized : fallback
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(minimum, Math.min(maximum, Math.round(number)))
}

export function getVisionAutoConfig(env = process.env) {
  return {
    enabled: booleanValue(env.VISION_AUTO_V2_ENABLED, false),
    routeEnabled: booleanValue(env.VISION_AUTO_V2_ROUTE_ENABLED, false),
    debugLevel: enumValue(
      env.VISION_AUTO_DEBUG_LEVEL,
      DEBUG_LEVELS,
      'summary',
    ),
    // Vision Auto v2 is intentionally Google Vision-only. Keep these explicit
    // so a broad application OCR setting cannot silently enable Tesseract here.
    ocrProvider: 'google_vision',
    ocrFallbackToTesseract: false,
    googleVisionTimeoutMs: boundedInteger(
      env.GOOGLE_VISION_TIMEOUT_MS,
      15_000,
      1_500,
      30_000,
    ),
    metadataOcrEnabled: booleanValue(
      env.IMAGE_METADATA_OCR_ENABLED,
      true,
    ),
    metadataOcrMaxBytes: boundedInteger(
      env.SOCIAL_THUMBNAIL_MAX_BYTES,
      3_000_000,
      100_000,
      5_000_000,
    ),
    metadataOcrTimeoutMs: boundedInteger(
      env.SOCIAL_THUMBNAIL_OCR_TIMEOUT_MS,
      8_000,
      200,
      30_000,
    ),
    evidenceValidator: enumValue(
      env.FOOD_MAP_EVIDENCE_VALIDATOR,
      VALIDATOR_MODES,
      'hybrid',
    ),
    geminiOcrAddressRepairEnabled: booleanValue(
      env.GEMINI_OCR_ADDRESS_REPAIR_ENABLED,
      true,
    ),
    geminiOcrAddressRepairTimeoutMs: boundedInteger(
      env.GEMINI_OCR_ADDRESS_REPAIR_TIMEOUT_MS || env.GEMINI_TIMEOUT_MS,
      12_000,
      500,
      30_000,
    ),
    locationProvider: enumValue(
      env.LOCATION_RESOLUTION_PROVIDER,
      LOCATION_PROVIDERS,
      'disabled',
    ),
    googlePlacesTimeoutMs: boundedInteger(
      env.GOOGLE_PLACES_TIMEOUT_MS,
      8_000,
      200,
      30_000,
    ),
    frameScanEnabled: booleanValue(
      env.YOUTUBE_FRAME_SCAN_ENABLED,
      false,
    ),
    frameScanMode: enumValue(
      env.YOUTUBE_FRAME_SCAN_MODE,
      FRAME_SCAN_MODES,
      'sampled',
    ),
    frameScanMaxFrames: boundedInteger(
      env.YOUTUBE_FRAME_SCAN_MAX_FRAMES,
      12,
      1,
      60,
    ),
    frameScanTimeoutMs: boundedInteger(
      env.YOUTUBE_FRAME_SCAN_TIMEOUT_MS,
      180_000,
      500,
      180_000,
    ),
    frameDownloadTimeoutMs: boundedInteger(
      env.YOUTUBE_FRAME_DOWNLOAD_TIMEOUT_MS,
      180_000,
      5_000,
      180_000,
    ),
    frameScanMaxDurationSeconds: boundedInteger(
      env.YOUTUBE_FRAME_SCAN_MAX_DURATION_SECONDS,
      180,
      1,
      600,
    ),
    frameScanTempDir: String(
      env.YOUTUBE_FRAME_SCAN_TEMP_DIR || '',
    ).trim().slice(0, 1_024),
    frameOcrCropEnabled: booleanValue(
      env.YOUTUBE_FRAME_OCR_CROP_ENABLED,
      true,
    ),
    frameOcrMaxCropsPerFrame: boundedInteger(
      env.YOUTUBE_FRAME_OCR_MAX_CROPS_PER_FRAME,
      4,
      0,
      4,
    ),
    frameOcrUpscaleEnabled: booleanValue(
      env.YOUTUBE_FRAME_OCR_UPSCALE_ENABLED,
      true,
    ),
    speechToTextEnabled: booleanValue(
      env.SPEECH_TO_TEXT_ENABLED,
      false,
    ),
    speechToTextTimeoutMs: boundedInteger(
      env.GOOGLE_SPEECH_TIMEOUT_MS,
      15_000,
      500,
      30_000,
    ),
  }
}

export function visionAutoRouteEnabled(env = process.env) {
  return getVisionAutoConfig(env).routeEnabled
}

export function visionAutoServiceEnabled(env = process.env) {
  return getVisionAutoConfig(env).enabled
}
