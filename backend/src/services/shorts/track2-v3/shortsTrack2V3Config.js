export const DEFAULT_SHORTS_TRACK2_V3_CONFIG = Object.freeze({
  enabled: false,
  maxDurationSeconds: 180,
  cheapFrameCount: 4,
  maxFrames: 8,
  maxOcrImages: 16,
  track2V3OcrBoostEnabled: true,
  track2V3CanonicalOrchestratorEnabled: true,
  ocrBoostEnabled: true,
  ocrBoostFrameCount: 8,
  track2V3GoogleVisionEnabled: false,
  track2V3PlacesEnabled: false,
  track2V3GeminiVisionEnabled: false,
  track2V3GeminiCropJudgeEnabled: false,
  geminiCropJudgeModel: 'gemini-3.5-flash',
  geminiCropJudgeMaxPages: 6,
  geminiCropJudgeMaxSelectedCrops: 8,
  geminiCropJudgeTimeoutMs: 60000,
  geminiCropJudgeMaxRequestBytes: 12000000,
  geminiCropJudgeMaxImageBytes: 4000000,
  geminiCropJudgeJpegQuality: 80,
  geminiCropJudgeMaxConcurrency: 1,
  geminiCropJudgeMaxAttempts: 3,
  geminiCropJudgeRetryBaseDelayMs: 2000,
  geminiCropJudgeRetryMaxDelayMs: 30000,
  track2V3SmartOverlayEnabled: true,
  track2V3SmartOverlayDryRun: false,
  track2V3LocalOcrEnabled: false,
  track2V3LocalOcrProvider: 'auto',
  track2V3PaddleOcrEnabled: true,
  track2V3EasyOcrEnabled: true,
  track2V3TesseractEnabled: true,
  paddleOcrAllowModelDownload: false,
  localOcrTimeoutMs: 30000,
  maxLocalOcrImages: 24,
  maxPaddleOcrImages: 6,
  maxEasyOcrImages: 6,
  maxTesseractDeepPassImages: 3,
  localOcrDevice: 'auto',
  easyOcrBatchSize: 4,
  easyOcrWorkers: 0,
  localOcrLanguages: 'vi,en',
  localOcrDebugEnabled: false,
  smartOverlaySampleIntervalMs: 750,
  maxSmartOverlayFrames: 60,
  maxSmartOverlaySelectedImages: 24,
  smartOverlayTimeoutMs: 60000,
  smartOverlayScoringConcurrency: 8,
  textRegionProposalEnabled: true,
  maxDynamicTextRegionsPerFrame: 4,
  temporalEpisodeEnabled: true,
  temporalEpisodeMaxGapSeconds: 2.25,
  temporalEpisodeMaxRepresentatives: 12,
  temporalEpisodeNeighborCount: 2,
  smartOverlayDebugEnabled: false,
  adaptiveFrameSamplingEnabled: false,
  adaptiveFrameMaxAdditionalFrames: 18,
  adaptiveFrameSampleIntervalMs: 500,
  adaptiveFrameMaxSelectedImages: 12,
  adaptiveFrameTimeoutMs: 45000,
  mediaAcquisitionMaxAttempts: 2,
  mediaAcquisitionTimeoutMs: 60000,
  asrFallbackEnabled: false,
  asrTimeoutMs: 300000,
  asrModel: 'small',
  asrDevice: 'cpu',
  asrComputeType: 'int8',
  asrLanguage: 'vi',
  windowedAsrEnabled: true,
  asrFullAudioFallbackPolicy: 'strong_signal_only',
  asrWindowPaddingSeconds: 6,
  asrWindowMaxSeconds: 22,
  asrWindowMaxCount: 3,
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

function asrFullAudioFallbackPolicyEnv(value, fallback) {
  const policy = String(value || fallback).trim().toLowerCase()
  return ['always', 'no_visual_text', 'strong_signal_only'].includes(policy)
    ? policy
    : fallback
}

function localOcrProviderEnv(value, fallback) {
  const provider = String(value || fallback).trim().toLowerCase()
  return ['auto', 'paddleocr', 'easyocr', 'tesseract', 'ensemble'].includes(provider)
    ? provider
    : fallback
}

function localOcrDeviceEnv(value, fallback) {
  const device = String(value || fallback).trim().toLowerCase()
  return ['auto', 'cpu', 'gpu'].includes(device) ? device : fallback
}

function localOcrLanguagesEnv(value, fallback) {
  const languages = String(value || fallback)
    .trim()
    .replace(/[^a-z,+]/giu, '')
    .slice(0, 40)
  return languages || fallback
}

function safeModelEnv(value, fallback) {
  const model = String(value || fallback)
    .trim()
    .replace(/[^a-z0-9._-]+/giu, '')
    .slice(0, 120)
  return model || fallback
}

function safeAsrTokenEnv(value, fallback, maxLength = 40) {
  const token = String(value || fallback)
    .trim()
    .replace(/[^a-z0-9._-]+/giu, '')
    .slice(0, maxLength)
  return token || fallback
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
    track2V3CanonicalOrchestratorEnabled: booleanEnv(
      env.TRACK2_V3_CANONICAL_ORCHESTRATOR_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3CanonicalOrchestratorEnabled,
    ),
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
    track2V3GeminiCropJudgeEnabled: booleanEnv(
      env.TRACK2_V3_GEMINI_CROP_JUDGE_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3GeminiCropJudgeEnabled,
    ),
    geminiCropJudgeModel: safeModelEnv(
      env.TRACK2_V3_GEMINI_CROP_JUDGE_MODEL,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.geminiCropJudgeModel,
    ),
    geminiCropJudgeMaxPages: boundedIntegerEnv(
      env.TRACK2_V3_GEMINI_CROP_JUDGE_MAX_PAGES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.geminiCropJudgeMaxPages,
      { min: 1, max: 20 },
    ),
    geminiCropJudgeMaxSelectedCrops: boundedIntegerEnv(
      env.TRACK2_V3_GEMINI_CROP_JUDGE_MAX_SELECTED_CROPS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.geminiCropJudgeMaxSelectedCrops,
      { min: 1, max: 60 },
    ),
    geminiCropJudgeTimeoutMs: boundedIntegerEnv(
      env.TRACK2_V3_GEMINI_CROP_JUDGE_TIMEOUT_MS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.geminiCropJudgeTimeoutMs,
      { min: 1000, max: 180000 },
    ),
    geminiCropJudgeMaxRequestBytes: boundedIntegerEnv(
      env.TRACK2_V3_GEMINI_CROP_JUDGE_MAX_REQUEST_BYTES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.geminiCropJudgeMaxRequestBytes,
      { min: 1024, max: 19000000 },
    ),
    geminiCropJudgeMaxImageBytes: boundedIntegerEnv(
      env.TRACK2_V3_GEMINI_CROP_JUDGE_MAX_IMAGE_BYTES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.geminiCropJudgeMaxImageBytes,
      { min: 1024, max: 12000000 },
    ),
    geminiCropJudgeJpegQuality: boundedIntegerEnv(
      env.TRACK2_V3_GEMINI_CROP_JUDGE_JPEG_QUALITY,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.geminiCropJudgeJpegQuality,
      { min: 40, max: 95 },
    ),
    geminiCropJudgeMaxConcurrency: boundedIntegerEnv(
      env.TRACK2_V3_GEMINI_CROP_JUDGE_MAX_CONCURRENCY,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.geminiCropJudgeMaxConcurrency,
      { min: 1, max: 8 },
    ),
    geminiCropJudgeMaxAttempts: boundedIntegerEnv(
      env.TRACK2_V3_GEMINI_CROP_JUDGE_MAX_ATTEMPTS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.geminiCropJudgeMaxAttempts,
      { min: 1, max: 5 },
    ),
    geminiCropJudgeRetryBaseDelayMs: boundedIntegerEnv(
      env.TRACK2_V3_GEMINI_CROP_JUDGE_RETRY_BASE_DELAY_MS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.geminiCropJudgeRetryBaseDelayMs,
      { min: 0, max: 30000 },
    ),
    geminiCropJudgeRetryMaxDelayMs: boundedIntegerEnv(
      env.TRACK2_V3_GEMINI_CROP_JUDGE_RETRY_MAX_DELAY_MS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.geminiCropJudgeRetryMaxDelayMs,
      { min: 0, max: 120000 },
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
    track2V3LocalOcrProvider: localOcrProviderEnv(
      env.TRACK2_V3_LOCAL_OCR_PROVIDER,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3LocalOcrProvider,
    ),
    track2V3PaddleOcrEnabled: booleanEnv(
      env.TRACK2_V3_PADDLEOCR_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3PaddleOcrEnabled,
    ),
    track2V3EasyOcrEnabled: booleanEnv(
      env.TRACK2_V3_EASYOCR_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3EasyOcrEnabled,
    ),
    track2V3TesseractEnabled: booleanEnv(
      env.TRACK2_V3_TESSERACT_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3TesseractEnabled,
    ),
    paddleOcrAllowModelDownload: booleanEnv(
      env.TRACK2_V3_PADDLEOCR_ALLOW_MODEL_DOWNLOAD,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.paddleOcrAllowModelDownload,
    ),
    localOcrTimeoutMs: boundedIntegerEnv(
      env.TRACK2_V3_LOCAL_OCR_TIMEOUT_MS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.localOcrTimeoutMs,
      { min: 1000, max: 300000 },
    ),
    maxLocalOcrImages: boundedIntegerEnv(
      env.TRACK2_V3_MAX_LOCAL_OCR_IMAGES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxLocalOcrImages,
      { min: 1, max: 60 },
    ),
    maxPaddleOcrImages: boundedIntegerEnv(
      env.TRACK2_V3_MAX_PADDLEOCR_IMAGES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxPaddleOcrImages,
      { min: 1, max: 60 },
    ),
    maxEasyOcrImages: boundedIntegerEnv(
      env.TRACK2_V3_MAX_EASYOCR_IMAGES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxEasyOcrImages,
      { min: 1, max: 60 },
    ),
    maxTesseractDeepPassImages: boundedIntegerEnv(
      env.TRACK2_V3_MAX_TESSERACT_DEEP_PASS_IMAGES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxTesseractDeepPassImages,
      { min: 0, max: 24 },
    ),
    localOcrDevice: localOcrDeviceEnv(
      env.TRACK2_V3_LOCAL_OCR_DEVICE,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.localOcrDevice,
    ),
    easyOcrBatchSize: boundedIntegerEnv(
      env.TRACK2_V3_EASYOCR_BATCH_SIZE,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.easyOcrBatchSize,
      { min: 1, max: 32 },
    ),
    easyOcrWorkers: boundedIntegerEnv(
      env.TRACK2_V3_EASYOCR_WORKERS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.easyOcrWorkers,
      { min: 0, max: 16 },
    ),
    localOcrLanguages: localOcrLanguagesEnv(
      env.TRACK2_V3_LOCAL_OCR_LANGUAGES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.localOcrLanguages,
    ),
    localOcrDebugEnabled: booleanEnv(
      env.TRACK2_V3_LOCAL_OCR_DEBUG,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.localOcrDebugEnabled,
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
    smartOverlayScoringConcurrency: boundedIntegerEnv(
      env.TRACK2_V3_SMART_OVERLAY_SCORING_CONCURRENCY,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.smartOverlayScoringConcurrency,
      { min: 1, max: 16 },
    ),
    textRegionProposalEnabled: booleanEnv(
      env.TRACK2_V3_TEXT_REGION_PROPOSAL_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.textRegionProposalEnabled,
    ),
    maxDynamicTextRegionsPerFrame: boundedIntegerEnv(
      env.TRACK2_V3_MAX_DYNAMIC_TEXT_REGIONS_PER_FRAME,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxDynamicTextRegionsPerFrame,
      { min: 1, max: 8 },
    ),
    temporalEpisodeEnabled: booleanEnv(
      env.TRACK2_V3_TEMPORAL_EPISODE_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.temporalEpisodeEnabled,
    ),
    temporalEpisodeMaxGapSeconds: Math.max(
      0.25,
      Math.min(
        8,
        Number(env.TRACK2_V3_TEMPORAL_EPISODE_MAX_GAP_SECONDS ||
          DEFAULT_SHORTS_TRACK2_V3_CONFIG.temporalEpisodeMaxGapSeconds),
      ),
    ),
    temporalEpisodeMaxRepresentatives: boundedIntegerEnv(
      env.TRACK2_V3_TEMPORAL_EPISODE_MAX_REPRESENTATIVES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.temporalEpisodeMaxRepresentatives,
      { min: 1, max: 40 },
    ),
    temporalEpisodeNeighborCount: boundedIntegerEnv(
      env.TRACK2_V3_TEMPORAL_EPISODE_NEIGHBOR_COUNT,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.temporalEpisodeNeighborCount,
      { min: 0, max: 4 },
    ),
    smartOverlayDebugEnabled: booleanEnv(
      env.TRACK2_V3_SMART_OVERLAY_DEBUG_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.smartOverlayDebugEnabled,
    ),
    adaptiveFrameSamplingEnabled: booleanEnv(
      env.TRACK2_V3_ADAPTIVE_FRAME_SAMPLING_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.adaptiveFrameSamplingEnabled,
    ),
    adaptiveFrameMaxAdditionalFrames: boundedIntegerEnv(
      env.TRACK2_V3_ADAPTIVE_FRAME_MAX_ADDITIONAL_FRAMES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.adaptiveFrameMaxAdditionalFrames,
      { min: 1, max: 24 },
    ),
    adaptiveFrameSampleIntervalMs: boundedIntegerEnv(
      env.TRACK2_V3_ADAPTIVE_FRAME_SAMPLE_INTERVAL_MS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.adaptiveFrameSampleIntervalMs,
      { min: 250, max: 5000 },
    ),
    adaptiveFrameMaxSelectedImages: boundedIntegerEnv(
      env.TRACK2_V3_ADAPTIVE_FRAME_MAX_SELECTED_IMAGES,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.adaptiveFrameMaxSelectedImages,
      { min: 1, max: 24 },
    ),
    adaptiveFrameTimeoutMs: boundedIntegerEnv(
      env.TRACK2_V3_ADAPTIVE_FRAME_TIMEOUT_MS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.adaptiveFrameTimeoutMs,
      { min: 1000, max: 120000 },
    ),
    mediaAcquisitionMaxAttempts: boundedIntegerEnv(
      env.TRACK2_V3_MEDIA_ACQUISITION_MAX_ATTEMPTS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.mediaAcquisitionMaxAttempts,
      { min: 1, max: 2 },
    ),
    mediaAcquisitionTimeoutMs: boundedIntegerEnv(
      env.TRACK2_V3_MEDIA_ACQUISITION_TIMEOUT_MS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.mediaAcquisitionTimeoutMs,
      { min: 1000, max: 120000 },
    ),
    asrFallbackEnabled: booleanEnv(
      env.TRACK2_V3_ASR_FALLBACK_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.asrFallbackEnabled,
    ),
    asrTimeoutMs: boundedIntegerEnv(
      env.TRACK2_V3_ASR_TIMEOUT_MS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.asrTimeoutMs,
      { min: 1000, max: 600000 },
    ),
    asrModel: safeModelEnv(
      env.TRACK2_V3_ASR_MODEL,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.asrModel,
    ),
    asrDevice: safeAsrTokenEnv(
      env.TRACK2_V3_ASR_DEVICE,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.asrDevice,
    ),
    asrComputeType: safeAsrTokenEnv(
      env.TRACK2_V3_ASR_COMPUTE_TYPE,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.asrComputeType,
    ),
    asrLanguage: safeAsrTokenEnv(
      env.TRACK2_V3_ASR_LANGUAGE,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.asrLanguage,
      20,
    ),
    windowedAsrEnabled: booleanEnv(
      env.TRACK2_V3_WINDOWED_ASR_ENABLED,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.windowedAsrEnabled,
    ),
    asrFullAudioFallbackPolicy: asrFullAudioFallbackPolicyEnv(
      env.TRACK2_V3_ASR_FULL_AUDIO_FALLBACK_POLICY,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.asrFullAudioFallbackPolicy,
    ),
    asrWindowPaddingSeconds: boundedIntegerEnv(
      env.TRACK2_V3_ASR_WINDOW_PADDING_SECONDS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.asrWindowPaddingSeconds,
      { min: 0, max: 20 },
    ),
    asrWindowMaxSeconds: boundedIntegerEnv(
      env.TRACK2_V3_ASR_WINDOW_MAX_SECONDS,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.asrWindowMaxSeconds,
      { min: 5, max: 60 },
    ),
    asrWindowMaxCount: boundedIntegerEnv(
      env.TRACK2_V3_ASR_WINDOW_MAX_COUNT,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.asrWindowMaxCount,
      { min: 1, max: 8 },
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
