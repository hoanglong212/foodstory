const FALSE_VALUES = new Set(['false', '0', 'no', 'off'])
const DEBUG_LEVELS = new Set(['none', 'summary', 'timings'])
const FRAME_SCAN_MODES = new Set(['sampled', 'dense_1fps'])

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  return !FALSE_VALUES.has(String(value).trim().toLowerCase())
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(minimum, Math.min(maximum, Math.round(number)))
}

function enumValue(value, allowed, fallback) {
  const normalized = String(value || '').trim().toLowerCase()
  return allowed.has(normalized) ? normalized : fallback
}

/**
 * One authoritative Vision Auto runtime view.  Raw environment flags are read
 * here exactly once so a child flag can never turn on a parent-disabled
 * provider.  The private key stays on this server-only object and is excluded
 * from diagnostics.
 */
export function getVisionAutoRuntimeConfig(env = process.env) {
  const visionAutoEnabled = booleanValue(env.VISION_AUTO_V2_ENABLED, false)
  const routeEnabled = visionAutoEnabled && booleanValue(env.VISION_AUTO_V2_ROUTE_ENABLED, false)
  const track2Enabled = visionAutoEnabled && booleanValue(env.TRACK2_V3_ENABLED, false) && booleanValue(env.VISION_AUTO_YOUTUBE_TRACK2_V3_ENABLED, true)
  const requestedProvider = String(env.LOCATION_RESOLUTION_PROVIDER || 'disabled').trim().toLowerCase()
  const geoapifyApiKey = String(env.GEOAPIFY_API_KEY || '').trim()
  const geoapifyConfigured = Boolean(geoapifyApiKey)
  const providerAllowsGeoapify = requestedProvider === 'geoapify' || requestedProvider === 'auto'
  const externalResolverEnabled = visionAutoEnabled && providerAllowsGeoapify && geoapifyConfigured
  const externalProvider = externalResolverEnabled ? 'geoapify' : 'disabled'
  const asrParentEnabled = booleanValue(env.TRACK2_V3_ASR_ENABLED, false)
  const geminiParentEnabled = booleanValue(env.TRACK2_V3_GEMINI_VISION_ENABLED, false)

  return {
    visionAutoEnabled,
    routeEnabled,
    track2Enabled,
    localResolverEnabled: visionAutoEnabled && booleanValue(env.VISION_AUTO_LOCAL_RESOLVER_ENABLED, true),
    externalResolverEnabled,
    externalProvider,
    externalProviderConfigured: externalResolverEnabled,
    geoapifyConfigured,
    // Parent switches are authoritative: fallback/judge flags cannot revive a
    // disabled service.
    asrEffectiveEnabled: track2Enabled && asrParentEnabled && booleanValue(env.TRACK2_V3_ASR_FALLBACK_ENABLED, true) && booleanValue(env.TRACK2_V3_WINDOWED_ASR_ENABLED, true),
    geminiEffectiveEnabled: track2Enabled && geminiParentEnabled && booleanValue(env.TRACK2_V3_GEMINI_CROP_JUDGE_ENABLED, true),
    cacheEnabled: visionAutoEnabled && booleanValue(env.VISION_AUTO_CACHE_ENABLED, true),
    cacheTtlMs: boundedInteger(env.VISION_AUTO_CACHE_TTL_MS, 15 * 60_000, 10_000, 24 * 60 * 60_000),
    notFoundCacheTtlMs: boundedInteger(env.VISION_AUTO_NOT_FOUND_CACHE_TTL_MS, 2 * 60_000, 5_000, 60 * 60_000),
    cacheMaxEntries: boundedInteger(env.VISION_AUTO_CACHE_MAX_ENTRIES, 500, 10, 10_000),
    requestDeadlineMs: boundedInteger(env.VISION_AUTO_REQUEST_DEADLINE_MS, 150_000, 30_000, 180_000),
    maxVideoDurationSeconds: boundedInteger(env.VISION_AUTO_MAX_VIDEO_DURATION_SECONDS, 180, 15, 600),
    remoteImageMaxBytes: boundedInteger(env.VISION_AUTO_REMOTE_IMAGE_MAX_BYTES, 5 * 1024 * 1024, 100_000, 20 * 1024 * 1024),
    remoteImageTimeoutMs: boundedInteger(env.VISION_AUTO_REMOTE_IMAGE_TIMEOUT_MS, 20_000, 1_000, 60_000),
    remoteImageMaxRedirects: boundedInteger(env.VISION_AUTO_REMOTE_IMAGE_MAX_REDIRECTS, 3, 0, 5),
    jobMaxConcurrency: boundedInteger(env.VISION_AUTO_JOB_MAX_CONCURRENCY, 2, 1, 8),
    jobPerOriginConcurrency: boundedInteger(env.VISION_AUTO_JOB_PER_ORIGIN_CONCURRENCY, 2, 1, 8),
    jobMaxQueued: boundedInteger(env.VISION_AUTO_JOB_MAX_QUEUED, 20, 1, 200),
    jobRetentionMs: boundedInteger(env.VISION_AUTO_JOB_RETENTION_MS, 30 * 60_000, 60_000, 24 * 60 * 60_000),
    jobFastMetadataEnabled: booleanValue(env.VISION_AUTO_JOB_FAST_METADATA_ENABLED, true),
    jobWorkerStartupTimeoutMs: boundedInteger(env.VISION_AUTO_JOB_WORKER_STARTUP_TIMEOUT_MS, 5_000, 1_000, 30_000),
    jobWorkerHeartbeatTimeoutMs: boundedInteger(env.VISION_AUTO_JOB_WORKER_HEARTBEAT_TIMEOUT_MS, 20_000, 5_000, 60_000),
    jobWorkerCleanupGraceMs: boundedInteger(env.VISION_AUTO_JOB_WORKER_CLEANUP_GRACE_MS, 3_000, 500, 15_000),
    geoapifyTimeoutMs: boundedInteger(env.GEOAPIFY_TIMEOUT_MS, 7_000, 500, 15_000),
    debugLevel: enumValue(env.VISION_AUTO_DEBUG_LEVEL, DEBUG_LEVELS, 'summary'),
    pipelineVersion: String(env.VISION_AUTO_PIPELINE_VERSION || 'resolver-v4').trim().slice(0, 80),
    geoapifyApiKey,

    // Compatibility properties used by the existing collection and Track 2
    // adapters. They are derived, never independently interpreted.
    enabled: visionAutoEnabled,
    locationProvider: externalProvider,
    locationProviderMode: requestedProvider,
    googlePlacesConfigured: false,
    googlePlacesTimeoutMs: boundedInteger(env.GOOGLE_PLACES_TIMEOUT_MS, 8_000, 200, 30_000),
    youtubeTrack2V3Enabled: track2Enabled,
    frameScanEnabled: booleanValue(env.YOUTUBE_FRAME_SCAN_ENABLED, false),
    frameScanMode: enumValue(env.YOUTUBE_FRAME_SCAN_MODE, FRAME_SCAN_MODES, 'sampled'),
    frameScanMaxFrames: boundedInteger(env.YOUTUBE_FRAME_SCAN_MAX_FRAMES, 12, 1, 60),
    frameScanTimeoutMs: boundedInteger(env.YOUTUBE_FRAME_SCAN_TIMEOUT_MS, 12_000, 500, 30_000),
    frameDownloadTimeoutMs: boundedInteger(env.YOUTUBE_FRAME_DOWNLOAD_TIMEOUT_MS, 20_000, 5_000, 30_000),
    frameScanMaxDurationSeconds: boundedInteger(env.YOUTUBE_FRAME_SCAN_MAX_DURATION_SECONDS, 180, 1, 600),
    frameScanTempDir: String(env.YOUTUBE_FRAME_SCAN_TEMP_DIR || '').trim().slice(0, 1_024),
    frameOcrCropEnabled: booleanValue(env.YOUTUBE_FRAME_OCR_CROP_ENABLED, true),
    frameOcrMaxCropsPerFrame: boundedInteger(env.YOUTUBE_FRAME_OCR_MAX_CROPS_PER_FRAME, 4, 0, 4),
    frameOcrUpscaleEnabled: booleanValue(env.YOUTUBE_FRAME_OCR_UPSCALE_ENABLED, true),
    speechToTextEnabled: track2Enabled && asrParentEnabled,
    speechToTextTimeoutMs: boundedInteger(env.GOOGLE_SPEECH_TIMEOUT_MS, 15_000, 500, 30_000),
    metadataOcrEnabled: booleanValue(env.IMAGE_METADATA_OCR_ENABLED, true),
    metadataOcrMaxBytes: boundedInteger(env.SOCIAL_THUMBNAIL_MAX_BYTES, 3_000_000, 100_000, 5_000_000),
    metadataOcrTimeoutMs: boundedInteger(env.SOCIAL_THUMBNAIL_OCR_TIMEOUT_MS, 8_000, 200, 30_000),
    geminiCandidateExtractionEnabled: false,
    geminiCandidateExtractionTimeoutMs: 12_000,
    geminiCandidateExtractionMaxLines: 80,
  }
}

export function getSanitizedVisionAutoRuntimeConfig(config = getVisionAutoRuntimeConfig()) {
  return {
    visionAutoEnabled: config.visionAutoEnabled,
    track2Enabled: config.track2Enabled,
    localResolverEnabled: config.localResolverEnabled,
    externalResolverEnabled: config.externalResolverEnabled,
    externalProvider: config.externalProvider,
    externalProviderConfigured: config.externalProviderConfigured,
    geoapifyConfigured: config.geoapifyConfigured,
    asrEffectiveEnabled: config.asrEffectiveEnabled,
    geminiEffectiveEnabled: config.geminiEffectiveEnabled,
    cacheEnabled: config.cacheEnabled,
    cacheMaxEntries: config.cacheMaxEntries,
    requestDeadlineMs: config.requestDeadlineMs,
    maxVideoDurationSeconds: config.maxVideoDurationSeconds,
    jobMaxConcurrency: config.jobMaxConcurrency,
    jobMaxQueued: config.jobMaxQueued,
    jobPerOriginConcurrency: config.jobPerOriginConcurrency,
    jobFastMetadataEnabled: config.jobFastMetadataEnabled,
    jobWorkerStartupTimeoutMs: config.jobWorkerStartupTimeoutMs,
    jobWorkerHeartbeatTimeoutMs: config.jobWorkerHeartbeatTimeoutMs,
    debugLevel: config.debugLevel,
  }
}

export function logVisionAutoRuntimeDiagnostics(config = getVisionAutoRuntimeConfig(), logger = console) {
  logger.info?.('[vision-auto] runtime', getSanitizedVisionAutoRuntimeConfig(config))
}

export const getVisionAutoConfig = getVisionAutoRuntimeConfig
export const visionAutoRouteEnabled = (env = process.env) => getVisionAutoRuntimeConfig(env).routeEnabled
export const visionAutoServiceEnabled = (env = process.env) => getVisionAutoRuntimeConfig(env).visionAutoEnabled
