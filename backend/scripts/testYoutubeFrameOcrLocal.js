import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractOcrEvidenceWithProvider } from '../services/ocrProviders/index.js'
import { analyzeVisionAutoV2 } from '../services/visionAuto/visionAutoResolverService.js'
import { getVisionAutoConfig } from '../services/visionAuto/visionAutoConfig.js'
import { collectVisionEvidence } from '../services/visionAuto/visionEvidenceCollectorService.js'
import {
  checkYouTubeFrameScanBinaries,
  extractYouTubeFrames,
} from '../services/visionAuto/youtubeFrameExtractionService.js'
import {
  inspectYoutubeFrameOcrEvidence,
} from '../services/visionAuto/youtubeFrameOcrVariantService.js'
import {
  parseYouTubeVideoId,
} from '../services/socialUrlProviders/youtubeUrlProvider.js'

const SCRIPT_FILE = fileURLToPath(import.meta.url)
const BACKEND_ROOT = path.resolve(path.dirname(SCRIPT_FILE), '..')
const REPOSITORY_ROOT = path.resolve(BACKEND_ROOT, '..')
const DEFAULT_DEBUG_FRAME_ROOT = path.join(
  BACKEND_ROOT,
  'tmp',
  'vision-frame-debug',
)
const MAX_FRAME_DIAGNOSTICS = 8
const MAX_OCR_ATTEMPT_DIAGNOSTICS = 40
const OCR_PROVIDERS = new Set(['google_vision', 'tesseract', 'hybrid'])
const OCR_PROVIDER_RESULTS = new Set(['google_vision', 'tesseract', 'none'])
const PROVIDER_FAILURE_STATUSES = new Set([
  'error',
  'failed',
  'missing_credentials',
  'provider_unavailable',
  'timeout',
  'unavailable',
])

function enabled(value) {
  return String(value || '').trim().toLowerCase() === 'true'
}

function safeCode(value, fallback = 'provider_warning') {
  const code = String(value || '').trim().toLowerCase()
  if (/^[a-z0-9_]{2,80}$/.test(code)) return code
  if (/timeout/i.test(code)) return 'provider_timeout'
  return fallback
}

function uniqueCodes(values, maximum = 16) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => safeCode(value))
        .filter(Boolean),
    ),
  ].slice(0, maximum)
}

function providerMode(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return OCR_PROVIDERS.has(normalized) ? normalized : 'google_vision'
}

function providerUsed(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return OCR_PROVIDER_RESULTS.has(normalized) ? normalized : 'none'
}

function providerStatus(value) {
  const normalized = safeCode(value, 'unknown')
  return normalized === 'provider_warning' ? 'unknown' : normalized
}

function evidenceLineCount(evidence) {
  const tieredLines = [
    ...(Array.isArray(evidence?.strongLines) ? evidence.strongLines : []),
    ...(Array.isArray(evidence?.weakLines) ? evidence.weakLines : []),
  ]
  const lines = tieredLines.length
    ? tieredLines
    : Array.isArray(evidence?.lines)
      ? evidence.lines
      : []
  return lines.filter((line) => String(line?.text || '').trim()).length
}

function fallbackProviderWarning(mode, reason) {
  const normalizedReason = providerStatus(reason)
  if (!PROVIDER_FAILURE_STATUSES.has(normalizedReason)) return null
  const prefix = mode === 'tesseract' ? 'tesseract' : 'google_vision'
  if (normalizedReason === 'timeout') return `${prefix}_timeout`
  if (normalizedReason === 'missing_credentials') {
    return `${prefix}_missing_credentials`
  }
  return `${prefix}_failed`
}

export function summarizeFrameOcrAttempt(
  evidence,
  {
    frameIndex = 0,
    timestampSeconds = null,
    sourceCrop = 'full',
    configuredProvider = 'google_vision',
    error = null,
  } = {},
) {
  const mode = providerMode(
    evidence?.debug?.providerMode || configuredProvider,
  )
  const used = error
    ? 'none'
    : providerUsed(evidence?.debug?.providerUsed)
  const status = error
    ? 'exception'
    : providerStatus(
        evidence?.debug?.providerStatus ||
          evidence?.reason ||
          'unknown',
      )
  const fallbackReason = error
    ? null
    : providerStatus(evidence?.debug?.fallbackReason || '')
  const fallbackUsed =
    !error &&
    Boolean(evidence?.debug?.fallbackReason) &&
    used === 'tesseract' &&
    mode !== 'tesseract'
  const inspected = error
    ? {
        rawCandidateCount: 0,
        topRawCandidates: [],
        lines: [],
        recoveredEntities: {
          addressCandidates: [],
          phones: [],
        },
      }
    : inspectYoutubeFrameOcrEvidence(evidence, { sourceCrop })
  const lineCount = error
    ? 0
    : Math.max(evidenceLineCount(evidence), inspected.lines.length)
  const providerWarnings = uniqueCodes(evidence?.warnings || [], 8)
  const fallbackWarning = fallbackProviderWarning(mode, fallbackReason)
  if (fallbackWarning) providerWarnings.push(fallbackWarning)

  let outcome = 'no_usable_text'
  if (error) {
    outcome = 'frame_ocr_failed'
  } else if (lineCount > 0) {
    outcome = 'text_detected'
  } else if (
    PROVIDER_FAILURE_STATUSES.has(status) ||
    PROVIDER_FAILURE_STATUSES.has(fallbackReason)
  ) {
    outcome = 'provider_failed'
  } else if (
    status === 'empty' ||
    status === 'no_text' ||
    evidence?.reason === 'no_text'
  ) {
    outcome = 'provider_returned_empty'
  } else if (
    status === 'ok' ||
    status === 'success' ||
    evidence?.reason === 'low_confidence' ||
    Boolean(evidence?.debug?.rawText)
  ) {
    outcome = 'provider_text_filtered'
  }

  return {
    frameIndex: Math.max(1, Number(frameIndex) || 1),
    timestampSeconds: Number.isFinite(Number(timestampSeconds))
      ? Number(timestampSeconds)
      : null,
    sourceCrop: String(sourceCrop || 'full').slice(0, 40),
    outcome,
    providerMode: mode,
    providerUsed: used,
    fallbackUsed,
    providerStatus: status,
    lineCount,
    rawCandidateCount: inspected.rawCandidateCount,
    keptLineCount: inspected.lines.length,
    topRawCandidates: inspected.topRawCandidates,
    keptLines: inspected.lines.map((line) => line.text).slice(0, 8),
    recoveredEntities: inspected.recoveredEntities,
    providerWarnings: uniqueCodes(providerWarnings, 8),
  }
}

function debugSessionName(videoId, now) {
  const safeVideoId = /^[A-Za-z0-9_-]{6,32}$/.test(String(videoId || ''))
    ? String(videoId)
    : 'youtube-video'
  const timestamp = now()
    .toISOString()
    .replace(/[:.]/g, '-')
  return `${safeVideoId}-${timestamp}`
}

function displayLocalPath(value) {
  if (!value) return null
  const relative = path.relative(REPOSITORY_ROOT, value)
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/')
  }
  return value
}

function aggregateOcrDiagnostics(attempts, configuredProvider) {
  const boundedAttempts = attempts.slice(0, MAX_OCR_ATTEMPT_DIAGNOSTICS)
  const used =
    boundedAttempts.find((attempt) => attempt.providerUsed !== 'none')
      ?.providerUsed || 'none'
  const outcomes = {
    textDetected: 0,
    providerReturnedEmpty: 0,
    providerTextFiltered: 0,
    providerFailed: 0,
    frameOcrFailed: 0,
    noUsableText: 0,
  }

  for (const attempt of boundedAttempts) {
    if (attempt.outcome === 'text_detected') outcomes.textDetected += 1
    else if (attempt.outcome === 'provider_returned_empty') {
      outcomes.providerReturnedEmpty += 1
    } else if (attempt.outcome === 'provider_text_filtered') {
      outcomes.providerTextFiltered += 1
    } else if (attempt.outcome === 'provider_failed') {
      outcomes.providerFailed += 1
    } else if (attempt.outcome === 'frame_ocr_failed') {
      outcomes.frameOcrFailed += 1
    } else {
      outcomes.noUsableText += 1
    }
  }

  const frameGroups = new Map()
  for (const attempt of boundedAttempts) {
    const key = `${attempt.frameIndex}:${attempt.timestampSeconds ?? 'unknown'}`
    const existing = frameGroups.get(key) || {
      frameIndex: attempt.frameIndex,
      timestampSeconds: attempt.timestampSeconds,
      outcomes: [],
      sourceCrops: [],
      rawCandidateCount: 0,
      topRawCandidates: [],
      keptLines: [],
      recoveredEntities: {
        addressCandidates: [],
        phones: [],
      },
      providerUsed: 'none',
      providerStatus: 'unknown',
    }
    existing.outcomes.push(attempt.outcome)
    if (!existing.sourceCrops.includes(attempt.sourceCrop)) {
      existing.sourceCrops.push(attempt.sourceCrop)
    }
    existing.rawCandidateCount = Math.min(
      64,
      existing.rawCandidateCount + Number(attempt.rawCandidateCount || 0),
    )
    for (const candidate of attempt.topRawCandidates || []) {
      const keyText = String(candidate?.text || '').toLocaleLowerCase('vi')
      if (
        keyText &&
        !existing.topRawCandidates.some(
          (item) =>
            String(item?.text || '').toLocaleLowerCase('vi') === keyText,
        )
      ) {
        existing.topRawCandidates.push(candidate)
      }
    }
    for (const line of attempt.keptLines || []) {
      if (
        line &&
        !existing.keptLines.some(
          (item) =>
            String(item).toLocaleLowerCase('vi') ===
            String(line).toLocaleLowerCase('vi'),
        )
      ) {
        existing.keptLines.push(line)
      }
    }
    for (const address of attempt.recoveredEntities?.addressCandidates || []) {
      if (
        address &&
        !existing.recoveredEntities.addressCandidates.some(
          (item) =>
            String(item).toLocaleLowerCase('vi') ===
            String(address).toLocaleLowerCase('vi'),
        )
      ) {
        existing.recoveredEntities.addressCandidates.push(address)
      }
    }
    for (const phone of attempt.recoveredEntities?.phones || []) {
      if (
        phone &&
        !existing.recoveredEntities.phones.includes(phone)
      ) {
        existing.recoveredEntities.phones.push(phone)
      }
    }
    if (attempt.providerUsed !== 'none') {
      existing.providerUsed = attempt.providerUsed
    }
    existing.providerStatus = attempt.providerStatus
    frameGroups.set(key, existing)
  }
  const frames = [...frameGroups.values()]
    .sort((left, right) => left.frameIndex - right.frameIndex)
    .slice(0, MAX_FRAME_DIAGNOSTICS)
    .map((frame) => {
      const outcome = frame.keptLines.length
        ? 'text_detected'
        : frame.outcomes.includes('provider_failed')
          ? 'provider_failed'
          : frame.outcomes.includes('frame_ocr_failed')
            ? 'frame_ocr_failed'
            : frame.outcomes.includes('provider_text_filtered')
              ? 'provider_text_filtered'
              : frame.outcomes.includes('provider_returned_empty')
                ? 'provider_returned_empty'
                : 'no_usable_text'
      return {
        frameIndex: frame.frameIndex,
        timestampSeconds: frame.timestampSeconds,
        outcome,
        sourceCrops: frame.sourceCrops.slice(0, 5),
        rawCandidateCount: frame.rawCandidateCount,
        keptLineCount: frame.keptLines.length,
        topRawCandidates: frame.topRawCandidates.slice(0, 8),
        keptLines: frame.keptLines.slice(0, 8),
        recoveredEntities: {
          addressCandidates:
            frame.recoveredEntities.addressCandidates.slice(0, 3),
          phones: frame.recoveredEntities.phones.slice(0, 4),
        },
        providerUsed: frame.providerUsed,
        providerStatus: frame.providerStatus,
      }
    })

  return {
    providerMode: providerMode(configuredProvider),
    providerUsed: used,
    fallbackUsed: boundedAttempts.some((attempt) => attempt.fallbackUsed),
    frameAttempts: frames.length,
    ocrAttempts: boundedAttempts.length,
    frameSuccesses: frames.filter((frame) => frame.keptLineCount > 0).length,
    providerWarnings: uniqueCodes(
      boundedAttempts.flatMap((attempt) => attempt.providerWarnings),
      12,
    ),
    outcomes,
    frames,
  }
}

function outcomeWarningCodes(attempts) {
  const warnings = []
  for (const attempt of attempts) {
    if (attempt.outcome === 'provider_returned_empty') {
      warnings.push('frame_ocr_provider_returned_empty')
    } else if (attempt.outcome === 'provider_text_filtered') {
      warnings.push('frame_ocr_text_filtered')
    } else if (attempt.outcome === 'provider_failed') {
      warnings.push('frame_ocr_provider_failed', 'frame_ocr_failed')
    } else if (attempt.outcome === 'frame_ocr_failed') {
      warnings.push('frame_ocr_failed')
    } else if (attempt.outcome === 'no_usable_text') {
      warnings.push('frame_ocr_no_usable_text')
    }
  }
  return uniqueCodes(warnings)
}

export function createManualFrameOcrDiagnostics({
  keepDebugFrames = false,
  videoId = null,
  configuredProvider = 'google_vision',
  frameScanner = extractYouTubeFrames,
  extractOcr = extractOcrEvidenceWithProvider,
  debugFrameRoot = DEFAULT_DEBUG_FRAME_ROOT,
  makeDirectory = mkdir,
  writeFrame = writeFile,
  now = () => new Date(),
} = {}) {
  const attempts = []
  const manualWarnings = []
  let extractedFrames = []
  let debugFrameDirectory = null

  const diagnosticFrameScanner = async (options) => {
    const frameResult = await frameScanner(options)
    extractedFrames = (Array.isArray(frameResult?.frames)
      ? frameResult.frames
      : []
    )
      .filter((frame) => Buffer.isBuffer(frame?.buffer))
      .slice(0, MAX_FRAME_DIAGNOSTICS)

    if (keepDebugFrames && extractedFrames.length) {
      try {
        const directory = path.join(
          debugFrameRoot,
          debugSessionName(frameResult?.videoId || videoId, now),
        )
        await makeDirectory(directory, { recursive: true })
        debugFrameDirectory = directory
        for (let index = 0; index < extractedFrames.length; index += 1) {
          const frame = extractedFrames[index]
          const timestampMs = Number.isFinite(Number(frame.timestampSeconds))
            ? Math.max(0, Math.round(Number(frame.timestampSeconds) * 1_000))
            : 0
          await writeFrame(
            path.join(
              directory,
              `frame-${String(index + 1).padStart(3, '0')}-${timestampMs}ms.jpg`,
            ),
            frame.buffer,
          )
        }
      } catch {
        manualWarnings.push('debug_frame_export_failed')
      }
    }

    return frameResult
  }

  const diagnosticExtractOcr = async (request, options) => {
    const isFrameOcr =
      request?.image?.originalname === 'vision-auto-youtube-frame.jpg'
    if (!isFrameOcr) return extractOcr(request, options)

    const attemptIndex = attempts.length
    const requestedFrameIndex = Math.max(
      1,
      Number(request?.image?.frameIndex) || 1,
    )
    const frame = extractedFrames[requestedFrameIndex - 1] || null
    const timestampSeconds = Number.isFinite(
      Number(request?.image?.timestampSeconds),
    )
      ? Number(request.image.timestampSeconds)
      : frame?.timestampSeconds
    const sourceCrop = String(
      request?.image?.sourceCrop || 'full',
    ).slice(0, 40)
    attempts.push(
      summarizeFrameOcrAttempt(null, {
        frameIndex: requestedFrameIndex,
        timestampSeconds,
        sourceCrop,
        configuredProvider,
        error: new Error('frame_ocr_incomplete'),
      }),
    )
    try {
      const evidence = await extractOcr(request, options)
      attempts[attemptIndex] = summarizeFrameOcrAttempt(evidence, {
        frameIndex: requestedFrameIndex,
        timestampSeconds,
        sourceCrop,
        configuredProvider,
      })
      return evidence
    } catch (error) {
      attempts[attemptIndex] = summarizeFrameOcrAttempt(null, {
        frameIndex: requestedFrameIndex,
        timestampSeconds,
        sourceCrop,
        configuredProvider,
        error,
      })
      throw error
    }
  }

  return {
    collectorOptions: {
      frameScanner: diagnosticFrameScanner,
      extractOcr: diagnosticExtractOcr,
    },
    snapshot() {
      return {
        debugFrameDir: displayLocalPath(debugFrameDirectory),
        ocr: aggregateOcrDiagnostics(attempts, configuredProvider),
        warningCodes: uniqueCodes([
          ...manualWarnings,
          ...outcomeWarningCodes(attempts),
        ]),
      }
    },
  }
}

async function main() {
  const url = String(process.argv[2] || '').trim()
  const runtimeConfig = getVisionAutoConfig()
  const videoId = parseYouTubeVideoId(url)
  const diagnostics = createManualFrameOcrDiagnostics({
    keepDebugFrames: enabled(
      process.env.YOUTUBE_FRAME_SCAN_KEEP_DEBUG_FRAMES,
    ),
    videoId,
    configuredProvider: runtimeConfig.ocrProvider,
  })
  const binaries = await checkYouTubeFrameScanBinaries({
    timeoutMs: Math.min(2_000, runtimeConfig.frameScanTimeoutMs),
  })
  let capturedCollection = null
  let result = null

  if (url) {
    result = await analyzeVisionAutoV2(
      { url },
      {
        config: {
          ...runtimeConfig,
          enabled: true,
        },
        collectEvidence: async (input, options) => {
          capturedCollection = await collectVisionEvidence(input, {
            ...options,
            ...diagnostics.collectorOptions,
          })
          return capturedCollection
        },
      },
    )
  }

  const manualDiagnostics = diagnostics.snapshot()
  console.log(
    JSON.stringify(
      {
        frameScanEnabled: runtimeConfig.frameScanEnabled === true,
        ytDlpAvailable: binaries.ytDlpAvailable === true,
        ffmpegAvailable: binaries.ffmpegAvailable === true,
        ffprobeAvailable: binaries.ffprobeAvailable === true,
        videoId,
        metadataDurationSeconds: Number.isFinite(
          Number(capturedCollection?.debug?.frameMetadataDurationSeconds),
        ) && Number(capturedCollection?.debug?.frameMetadataDurationSeconds) > 0
          ? Number(capturedCollection.debug.frameMetadataDurationSeconds)
          : null,
        durationSeconds: Number.isFinite(
          Number(capturedCollection?.debug?.frameDurationSeconds),
        ) && Number(capturedCollection?.debug?.frameDurationSeconds) > 0
          ? Number(capturedCollection.debug.frameDurationSeconds)
          : null,
        durationSource: [
          'metadata',
          'ffprobe',
        ].includes(capturedCollection?.debug?.frameDurationSource)
          ? capturedCollection.debug.frameDurationSource
          : 'unavailable',
        frameScanSkippedReason:
          capturedCollection?.debug?.frameScanSkippedReason || null,
        frameCount: Number(capturedCollection?.debug?.frameCount || 0),
        ocrLineCount: Array.isArray(result?.evidenceSummary?.frameTexts)
          ? result.evidenceSummary.frameTexts.length
          : 0,
        debugFrameDir: manualDiagnostics.debugFrameDir,
        ocr: manualDiagnostics.ocr,
        finalStatus: result?.status || 'unresolved_best_effort',
        warningCodes: uniqueCodes([
          ...(Array.isArray(result?.debug?.warnings)
            ? result.debug.warnings
            : []),
          ...manualDiagnostics.warningCodes,
          ...(!url ? ['manual_url_required'] : []),
        ]),
      },
      null,
      2,
    ),
  )

  if (!url) process.exitCode = 1
}

function printFatalDiagnostics() {
  const runtimeConfig = getVisionAutoConfig()
  console.log(
    JSON.stringify(
      {
        frameScanEnabled: runtimeConfig.frameScanEnabled === true,
        ytDlpAvailable: false,
        ffmpegAvailable: false,
        ffprobeAvailable: false,
        videoId: null,
        metadataDurationSeconds: null,
        durationSeconds: null,
        durationSource: 'unavailable',
        frameScanSkippedReason: null,
        frameCount: 0,
        ocrLineCount: 0,
        debugFrameDir: null,
        ocr: aggregateOcrDiagnostics([], runtimeConfig.ocrProvider),
        finalStatus: 'unresolved_best_effort',
        warningCodes: ['youtube_frame_scan_extract_failed'],
      },
      null,
      2,
    ),
  )
  process.exitCode = 1
}

const invokedAsScript =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).toLowerCase() === SCRIPT_FILE.toLowerCase()

if (invokedAsScript) {
  main().catch(printFatalDiagnostics)
}
