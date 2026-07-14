import path from 'node:path'

import { DEFAULT_SHORTS_TRACK2_V3_CONFIG } from './shortsTrack2V3Config.js'
import { selectShortsTrack2V3SmartOverlayCrops } from './shortsTrack2V3SmartOverlaySelectorService.js'

const DEFAULT_DURATION_SECONDS = 60
const MAX_DURATION_SECONDS = 180

function finiteNumber(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function boundedInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed < min) return fallback
  return Math.min(parsed, max)
}

function parseIsoDurationSeconds(value) {
  const match = String(value || '').trim().match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/iu)
  if (!match) return null
  const hours = finiteNumber(match[1], 0)
  const minutes = finiteNumber(match[2], 0)
  const seconds = finiteNumber(match[3], 0)
  const total = (hours * 3600) + (minutes * 60) + seconds
  return total > 0 ? total : null
}

function durationSecondsFromContext(context = {}, config = {}) {
  const metadata = context.metadata || {}
  const direct = finiteNumber(
    context.durationSeconds ??
      metadata.durationSeconds ??
      metadata.lengthSeconds ??
      metadata.videoDurationSeconds,
    null,
  )
  const configuredMax = boundedInteger(
    config.maxDurationSeconds,
    DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxDurationSeconds,
    { min: 1, max: MAX_DURATION_SECONDS },
  )
  if (direct !== null && direct > 0) return Math.min(direct, configuredMax, MAX_DURATION_SECONDS)
  return Math.min(
    parseIsoDurationSeconds(context.duration || metadata.duration) || DEFAULT_DURATION_SECONDS,
    configuredMax,
    MAX_DURATION_SECONDS,
  )
}

function normalizeConfig(config = {}) {
  return {
    enabled: config.adaptiveFrameSamplingEnabled === true,
    maxAdditionalFrames: boundedInteger(
      config.adaptiveFrameMaxAdditionalFrames,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.adaptiveFrameMaxAdditionalFrames,
      { min: 1, max: 24 },
    ),
    sampleIntervalMs: boundedInteger(
      config.adaptiveFrameSampleIntervalMs,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.adaptiveFrameSampleIntervalMs,
      { min: 250, max: 5000 },
    ),
    maxSelectedImages: boundedInteger(
      config.adaptiveFrameMaxSelectedImages,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.adaptiveFrameMaxSelectedImages,
      { min: 1, max: 24 },
    ),
    timeoutMs: boundedInteger(
      config.adaptiveFrameTimeoutMs,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.adaptiveFrameTimeoutMs,
      { min: 1000, max: 120000 },
    ),
  }
}

function evenlySelect(values = [], limit = 0) {
  if (values.length <= limit) return values
  return Array.from({ length: limit }, (_, index) => {
    const valueIndex = Math.round(index * (values.length - 1) / Math.max(1, limit - 1))
    return values[valueIndex]
  })
}

function nearestTimestampGap(timestamp, existing = []) {
  if (!existing.length) return Number.POSITIVE_INFINITY
  return existing.reduce(
    (best, value) => Math.min(best, Math.abs(value - timestamp)),
    Number.POSITIVE_INFINITY,
  )
}

function selectCoverageGapTimestamps(candidates = [], existing = [], limit = 0, durationSeconds = 0) {
  if (candidates.length <= limit) return candidates
  const scored = candidates.map((timestamp) => ({
    timestamp,
    gap: nearestTimestampGap(timestamp, existing),
  }))
  const byGapThenTime = (left, right) =>
    right.gap - left.gap || left.timestamp - right.timestamp
  const earlyWindowSeconds = Math.min(8, Math.max(2, durationSeconds * 0.25))
  const earlyBudget = Math.min(Math.max(2, Math.ceil(limit / 3)), limit)
  const early = scored
    .filter((item) => item.timestamp <= earlyWindowSeconds)
    .sort(byGapThenTime)
    .slice(0, earlyBudget)
  const earlySet = new Set(early.map((item) => item.timestamp))
  const remainingBudget = Math.max(0, limit - early.length)
  const remaining = scored
    .filter((item) => !earlySet.has(item.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp)
  const lastNormalTimestamp = existing.length ? Math.max(...existing) : null
  const uncoveredTail = lastNormalTimestamp === null
    ? []
    : remaining.filter((item) => item.timestamp > lastNormalTimestamp)
  const coveragePool = uncoveredTail.length >= remainingBudget
    ? uncoveredTail
    : remaining
  const distributed = evenlySelect(coveragePool, remainingBudget)
  return [...early, ...distributed]
    .map((item) => item.timestamp)
    .sort((left, right) => left - right)
}

export function buildShortsTrack2V3AdaptiveSampleTimestamps(
  context = {},
  config = {},
  existingTimestamps = [],
) {
  const normalized = normalizeConfig(config)
  const durationSeconds = durationSecondsFromContext(context, config)
  const intervalSeconds = normalized.sampleIntervalMs / 1000
  const minimumGapSeconds = Math.min(0.35, Math.max(0.1, intervalSeconds / 3))
  const existing = (Array.isArray(existingTimestamps) ? existingTimestamps : [])
    .map((value) => finiteNumber(value, null))
    .filter((value) => value !== null && value >= 0)
  const candidates = []

  for (
    let timestamp = intervalSeconds / 2;
    timestamp < durationSeconds;
    timestamp += intervalSeconds
  ) {
    const bounded = Number(Math.min(timestamp, Math.max(0, durationSeconds - 0.1)).toFixed(3))
    if (existing.some((value) => Math.abs(value - bounded) < minimumGapSeconds)) continue
    candidates.push(bounded)
  }

  if (!candidates.length) {
    const midpoint = Number(Math.max(0, durationSeconds / 2).toFixed(3))
    if (!existing.some((value) => Math.abs(value - midpoint) < minimumGapSeconds)) {
      candidates.push(midpoint)
    }
  }

  return [...new Set(selectCoverageGapTimestamps(
    candidates,
    existing,
    normalized.maxAdditionalFrames,
    durationSeconds,
  ))]
}

export function decideShortsTrack2V3AdaptiveFrameSampling({
  config = {},
  metadataCandidateCount = 0,
  normalCandidateCount = 0,
  selectorResult = {},
  localOcrResult = {},
  localOcrTextBlocks = [],
  lateRescueSufficiency = null,
} = {}) {
  const normalized = normalizeConfig(config)
  if (!normalized.enabled) {
    return { shouldRun: false, reason: 'ADAPTIVE_FRAME_SAMPLING_DISABLED' }
  }
  const sufficiencyKnown = lateRescueSufficiency && typeof lateRescueSufficiency === 'object'
  if (sufficiencyKnown && lateRescueSufficiency.lateRescueSufficient === true) {
    return { shouldRun: false, reason: 'NORMAL_CANDIDATE_EXISTS' }
  }
  if (!sufficiencyKnown && (
    Number(metadataCandidateCount || 0) > 0 || Number(normalCandidateCount || 0) > 0
  )) {
    return { shouldRun: false, reason: 'NORMAL_CANDIDATE_EXISTS' }
  }
  const providerStatus = String(localOcrResult.status || '').trim().toUpperCase()
  if (
    localOcrResult.called !== true ||
    ['DISABLED', 'ERROR', 'NOT_RUN', 'UNAVAILABLE'].includes(providerStatus)
  ) {
    return { shouldRun: false, reason: 'LOCAL_OCR_PROVIDER_UNAVAILABLE' }
  }
  const generatedVisuals = Math.max(
    Number(selectorResult.generatedCropCount || 0),
    Number(selectorResult.selectedImageCount || 0),
    Array.isArray(selectorResult.selectedImages) ? selectorResult.selectedImages.length : 0,
  )
  if (generatedVisuals <= 0) {
    return { shouldRun: false, reason: 'NO_GENERATED_FRAMES_OR_CROPS' }
  }
  if (!Array.isArray(localOcrTextBlocks) || localOcrTextBlocks.length === 0) {
    return { shouldRun: true, reason: 'NORMAL_OCR_NO_TEXT_RESCUE' }
  }
  return {
    shouldRun: true,
    reason: 'SELECTED_CROPS_NO_ADDRESS_ANCHOR',
  }
}

function emptyResult(config = {}, reason = 'ADAPTIVE_FRAME_SAMPLING_NOT_NEEDED') {
  return {
    enabled: config.adaptiveFrameSamplingEnabled === true,
    ran: false,
    reason,
    sampledTimestamps: [],
    frameCount: 0,
    cropCount: 0,
    selectedCropIds: [],
    selectedImages: [],
    allCrops: [],
    providerErrors: [],
    selectorResult: null,
  }
}

function adaptiveCropId(value, index) {
  const clean = String(value || `crop-${String(index).padStart(3, '0')}`)
    .replace(/[^a-z0-9_-]+/giu, '-')
  return clean.startsWith('adaptive-') ? clean : `adaptive-${clean}`
}

function absoluteArtifactPath(value, outputDir) {
  if (!value) return null
  return path.isAbsolute(value) ? value : path.resolve(outputDir, value)
}

function adaptiveAllCrops(selectorResult = {}, outputDir = '') {
  const crops = Array.isArray(selectorResult?.selectorDiagnostics?.crops)
    ? selectorResult.selectorDiagnostics.crops
    : []
  return crops.map((crop, index) => ({
    ...crop,
    cropId: adaptiveCropId(crop.cropId, index),
    frameId: `adaptive-${String(crop.frameId || `frame-${index}`)}`,
    path: absoluteArtifactPath(crop.path, outputDir),
    cropPath: absoluteArtifactPath(crop.cropPath || crop.path, outputDir),
    unselectedPath: absoluteArtifactPath(crop.unselectedPath, outputDir),
  }))
}

function selectedIds(selectorResult = {}, allCrops = [], maxSelectedImages = 0) {
  const selected = new Set(
    (Array.isArray(selectorResult.selectedCropIds) ? selectorResult.selectedCropIds : [])
      .map((cropId, index) => adaptiveCropId(cropId, index)),
  )
  const fromDiagnostics = allCrops.filter((crop) => crop.selected).map((crop) => crop.cropId)
  return [...new Set([...selected, ...fromDiagnostics])].slice(0, maxSelectedImages)
}

function providerError(code, message) {
  return {
    provider: 'track2_v3_adaptive_frame_sampling',
    code,
    message,
    recoverable: true,
  }
}

export async function runShortsTrack2V3AdaptiveFrameSampling({
  context = {},
  config = {},
  metadataCandidateCount = 0,
  normalCandidateCount = 0,
  selectorResult = {},
  localOcrResult = {},
  localOcrTextBlocks = [],
  lateRescueSufficiency = null,
  deps = {},
} = {}) {
  const normalized = normalizeConfig(config)
  const decision = decideShortsTrack2V3AdaptiveFrameSampling({
    config,
    metadataCandidateCount,
    normalCandidateCount,
    selectorResult,
    localOcrResult,
    localOcrTextBlocks,
    lateRescueSufficiency,
  })
  if (!decision.shouldRun) return emptyResult(config, decision.reason)

  const sampledTimestamps = buildShortsTrack2V3AdaptiveSampleTimestamps(
    context,
    config,
    selectorResult.sampledTimestamps,
  )
  if (!sampledTimestamps.length) {
    return emptyResult(config, 'NO_ADDITIONAL_TIMESTAMPS_AVAILABLE')
  }

  const injectedSampler = typeof deps.adaptiveFrameSampler === 'function'
    ? deps.adaptiveFrameSampler
    : null
  const frameExtractor = typeof deps.track2FrameExtractor === 'function'
    ? deps.track2FrameExtractor
    : null
  if (!injectedSampler && !frameExtractor) {
    return emptyResult(config, 'ADAPTIVE_FRAME_PROVIDER_UNAVAILABLE')
  }

  const adaptiveOutputDir = deps.outputDir
    ? path.join(deps.outputDir, 'adaptive-frame-sampling')
    : ''
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort(new Error('Adaptive frame sampling timed out'))
  }, normalized.timeoutMs)

  try {
    let adaptiveSelectorResult
    if (injectedSampler) {
      adaptiveSelectorResult = await injectedSampler({
        context,
        config: {
          ...config,
          maxSmartOverlayFrames: normalized.maxAdditionalFrames,
          maxSmartOverlaySelectedImages: normalized.maxSelectedImages,
          smartOverlayTimeoutMs: normalized.timeoutMs,
        },
        sampledTimestamps,
        maxAdditionalFrames: normalized.maxAdditionalFrames,
        maxSelectedImages: normalized.maxSelectedImages,
        signal: deps.signal || controller.signal,
      })
    } else {
      const frameResult = await frameExtractor({
        sourceUrl: context.sourceUrl || context.url || context.metadata?.url || '',
        videoId: context.videoId || context.metadata?.videoId || null,
        metadata: context.metadata || {},
        limits: {
          maxVideoDurationSeconds: Math.min(
            Number(config.maxDurationSeconds || MAX_DURATION_SECONDS),
            MAX_DURATION_SECONDS,
          ),
          maxFrames: normalized.maxAdditionalFrames,
          maxFrameHardLimit: normalized.maxAdditionalFrames,
          maxExtractionBudgetMs: normalized.timeoutMs,
          sampleStrategy: 'ADAPTIVE_COVERAGE_GAPS',
          sampledTimestamps,
        },
        budgetMs: normalized.timeoutMs,
        signal: deps.signal || controller.signal,
        tmpDir: deps.tmpDir || null,
        mediaSession: deps.mediaSession || null,
        mediaConsumer: 'visual_adaptive',
      })
      const frameStatus = String(frameResult?.status || 'OK').trim().toUpperCase()
      if (frameStatus !== 'OK') {
        return {
          ...emptyResult(config, frameResult?.reason || 'ADAPTIVE_FRAME_EXTRACTION_FAILED'),
          ran: true,
          sampledTimestamps,
          providerErrors: [providerError(
            frameResult?.reason || 'ADAPTIVE_FRAME_EXTRACTION_FAILED',
            'Adaptive frame extraction failed safely.',
          )],
        }
      }
      const frames = (Array.isArray(frameResult.frames) ? frameResult.frames : [])
        .slice(0, normalized.maxAdditionalFrames)
      adaptiveSelectorResult = await selectShortsTrack2V3SmartOverlayCrops({
        frames,
        config: {
          ...config,
          maxSmartOverlayFrames: normalized.maxAdditionalFrames,
          maxSmartOverlaySelectedImages: normalized.maxSelectedImages,
          smartOverlayTimeoutMs: normalized.timeoutMs,
        },
        outputDir: adaptiveOutputDir,
        deps: {
          ...deps,
          selectorDiagnosticsEnabled: true,
        },
        durationSeconds: durationSecondsFromContext(context, config),
        videoId: context.videoId || context.metadata?.videoId || null,
      })
    }

    const safeSelectorResult = adaptiveSelectorResult && typeof adaptiveSelectorResult === 'object'
      ? adaptiveSelectorResult
      : {}
    const allCrops = adaptiveAllCrops(safeSelectorResult, adaptiveOutputDir)
    const selectedImages = (Array.isArray(safeSelectorResult.selectedImages)
      ? safeSelectorResult.selectedImages
      : []).slice(0, normalized.maxSelectedImages)
    const adaptiveSelectedCropIds = selectedIds(
      safeSelectorResult,
      allCrops,
      normalized.maxSelectedImages,
    )
    return {
      enabled: true,
      ran: true,
      reason: decision.reason,
      sampledTimestamps,
      frameCount: Math.min(
        normalized.maxAdditionalFrames,
        Number(safeSelectorResult.sampledFrameCount || sampledTimestamps.length),
      ),
      cropCount: Number(safeSelectorResult.generatedCropCount || allCrops.length || 0),
      selectedCropIds: adaptiveSelectedCropIds,
      selectedImages,
      allCrops,
      providerErrors: Array.isArray(safeSelectorResult.providerErrors)
        ? safeSelectorResult.providerErrors
        : [],
      selectorResult: safeSelectorResult,
    }
  } catch (error) {
    return {
      ...emptyResult(config, 'ADAPTIVE_FRAME_SAMPLING_ERROR'),
      enabled: true,
      ran: true,
      sampledTimestamps,
      providerErrors: [providerError(
        error?.name === 'AbortError'
          ? 'ADAPTIVE_FRAME_SAMPLING_TIMEOUT'
          : 'ADAPTIVE_FRAME_SAMPLING_ERROR',
        'Adaptive frame sampling failed safely.',
      )],
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

export default {
  buildShortsTrack2V3AdaptiveSampleTimestamps,
  decideShortsTrack2V3AdaptiveFrameSampling,
  runShortsTrack2V3AdaptiveFrameSampling,
}
