import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { analyzeShortsTrack2V3AddressSignal } from './shortsTrack2V3AddressSignalService.js'
import { track2V3TesseractCommandCandidates } from './shortsTrack2V3BinaryResolverService.js'
import { DEFAULT_SHORTS_TRACK2_V3_CONFIG } from './shortsTrack2V3Config.js'
import { normalizeShortsTrack2V3Text } from './shortsTrack2V3EvidenceStoreService.js'
import { generateShortsTrack2V3TesseractPreprocessVariants } from './shortsTrack2V3TesseractPreprocessService.js'
import {
  scoreShortsTrack2V3AddressLikelihood,
  scoreShortsTrack2V3TesseractOutput,
  selectBestShortsTrack2V3TesseractAttempt,
} from './shortsTrack2V3TesseractOcrScoringService.js'

const backendRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const projectRoot = path.dirname(backendRoot)
const easyOcrScriptPath = path.join(
  backendRoot,
  'scripts',
  'track2',
  'localOcr',
  'easyocrTrack2V3.py',
)
const paddleOcrScriptPath = path.join(
  backendRoot,
  'scripts',
  'track2',
  'localOcr',
  'paddleocrTrack2V3.py',
)

function safeString(value, maxLength = 1000) {
  return String(value || '').trim().slice(0, maxLength)
}

function finiteNumber(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function boundedInteger(value, fallback, { min = 1, max = 120000 } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function safeEasyOcrDiagnostics(value = {}, fallback = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const diagnostics = {
    pythonExecutable: safeString(source.pythonExecutable || fallback.pythonExecutable, 1000),
    easyocrImportOk: Boolean(source.easyocrImportOk ?? fallback.easyocrImportOk),
    readerLoadedOk: Boolean(source.readerLoadedOk ?? fallback.readerLoadedOk),
    imageCountReceived: boundedInteger(
      source.imageCountReceived ?? fallback.imageCountReceived ?? 0,
      0,
      { min: 0, max: 60 },
    ),
    firstImagePathExists: Boolean(
      source.firstImagePathExists ?? fallback.firstImagePathExists,
    ),
  }
  const exceptionClass = safeString(source.exceptionClass || fallback.exceptionClass, 200)
  const exceptionMessage = safeString(source.exceptionMessage || fallback.exceptionMessage, 1000)
  const exitCode = finiteNumber(source.exitCode ?? fallback.exitCode, null)
  if (exceptionClass) diagnostics.exceptionClass = exceptionClass
  if (exceptionMessage) diagnostics.exceptionMessage = exceptionMessage
  if (exitCode != null) diagnostics.exitCode = exitCode
  return diagnostics
}

function safePaddleOcrDiagnostics(value = {}, fallback = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const diagnostics = {
    pythonExecutable: safeString(source.pythonExecutable || fallback.pythonExecutable, 1000),
    paddleocrImportOk: Boolean(source.paddleocrImportOk ?? fallback.paddleocrImportOk),
    readerLoadedOk: Boolean(source.readerLoadedOk ?? fallback.readerLoadedOk),
    imageCountReceived: boundedInteger(
      source.imageCountReceived ?? fallback.imageCountReceived ?? 0,
      0,
      { min: 0, max: 60 },
    ),
    firstImagePathExists: Boolean(
      source.firstImagePathExists ?? fallback.firstImagePathExists,
    ),
  }
  const exceptionClass = safeString(source.exceptionClass || fallback.exceptionClass, 200)
  const exceptionMessage = safeString(source.exceptionMessage || fallback.exceptionMessage, 1000)
  const exitCode = finiteNumber(source.exitCode ?? fallback.exitCode, null)
  if (exceptionClass) diagnostics.exceptionClass = exceptionClass
  if (exceptionMessage) diagnostics.exceptionMessage = exceptionMessage
  if (exitCode != null) diagnostics.exitCode = exitCode
  return diagnostics
}

function safeOcrRuntimeDetails(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const details = {}
  const device = safeString(value.device, 40)
  if (device) details.device = device

  for (const [key, max] of [
    ['batchSize', 32],
    ['workers', 16],
    ['batchedGroupCount', 60],
    ['batchImageCount', 60],
    ['individualImageCount', 60],
  ]) {
    if (value[key] == null) continue
    details[key] = boundedInteger(value[key], 0, { min: 0, max })
  }

  for (const key of ['batchApiAvailable', 'batchApiUsed']) {
    if (value[key] == null) continue
    details[key] = Boolean(value[key])
  }

  return details
}

function providerError(code, message, provider = 'local_ocr', details = null) {
  const error = {
    code: safeString(code, 120),
    message: safeString(message, 300),
    provider: safeString(provider, 80),
  }
  if (details && typeof details === 'object') error.details = details
  return error
}

function normalizeProvider(value) {
  const provider = safeString(value || 'auto', 40).toLowerCase()
  return ['auto', 'paddleocr', 'easyocr', 'tesseract', 'ensemble'].includes(provider)
    ? provider
    : 'auto'
}

function languageTokens(value) {
  const tokens = safeString(value || 'vi,en', 40)
    .toLowerCase()
    .split(/[,+]/u)
    .map((token) => token.trim())
    .filter(Boolean)
  return [...new Set(tokens.length ? tokens : ['vi', 'en'])]
}

function easyOcrLanguages(value) {
  return languageTokens(value).map((token) => {
    if (token === 'vie') return 'vi'
    if (token === 'eng') return 'en'
    return token
  })
}

function tesseractLanguages(value) {
  return languageTokens(value).map((token) => {
    if (token === 'vi') return 'vie'
    if (token === 'en') return 'eng'
    return token
  }).join('+')
}

export function normalizeShortsTrack2V3LocalOcrConfig(config = {}) {
  return {
    track2V3LocalOcrEnabled: config.track2V3LocalOcrEnabled ??
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3LocalOcrEnabled,
    track2V3LocalOcrProvider: normalizeProvider(
      config.track2V3LocalOcrProvider ??
        DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3LocalOcrProvider,
    ),
    track2V3PaddleOcrEnabled: config.track2V3PaddleOcrEnabled ??
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3PaddleOcrEnabled,
    track2V3EasyOcrEnabled: config.track2V3EasyOcrEnabled ??
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3EasyOcrEnabled,
    track2V3TesseractEnabled: config.track2V3TesseractEnabled ??
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3TesseractEnabled,
    paddleOcrAllowModelDownload: config.paddleOcrAllowModelDownload ??
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.paddleOcrAllowModelDownload,
    localOcrTimeoutMs: boundedInteger(
      config.localOcrTimeoutMs,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.localOcrTimeoutMs,
      { min: 1000, max: 300000 },
    ),
    maxLocalOcrImages: boundedInteger(
      config.maxLocalOcrImages,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxLocalOcrImages,
      { min: 1, max: 60 },
    ),
    maxPaddleOcrImages: boundedInteger(
      config.maxPaddleOcrImages,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxPaddleOcrImages,
      { min: 1, max: 60 },
    ),
    maxEasyOcrImages: boundedInteger(
      config.maxEasyOcrImages,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxEasyOcrImages,
      { min: 1, max: 60 },
    ),
    maxTesseractDeepPassImages: boundedInteger(
      config.maxTesseractDeepPassImages,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxTesseractDeepPassImages,
      { min: 0, max: 24 },
    ),
    localOcrDevice: ['auto', 'cpu', 'gpu'].includes(String(
      config.localOcrDevice ?? DEFAULT_SHORTS_TRACK2_V3_CONFIG.localOcrDevice,
    ).trim().toLowerCase())
      ? String(config.localOcrDevice ?? DEFAULT_SHORTS_TRACK2_V3_CONFIG.localOcrDevice).trim().toLowerCase()
      : DEFAULT_SHORTS_TRACK2_V3_CONFIG.localOcrDevice,
    easyOcrBatchSize: boundedInteger(
      config.easyOcrBatchSize,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.easyOcrBatchSize,
      { min: 1, max: 32 },
    ),
    easyOcrWorkers: boundedInteger(
      config.easyOcrWorkers,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.easyOcrWorkers,
      { min: 0, max: 16 },
    ),
    localOcrLanguages: safeString(
      config.localOcrLanguages || DEFAULT_SHORTS_TRACK2_V3_CONFIG.localOcrLanguages,
      40,
    ),
    localOcrDebugEnabled: config.localOcrDebugEnabled ??
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.localOcrDebugEnabled,
  }
}

function normalizeEpisodeNeighbor(image = {}, index = 0) {
  const imagePath = safeString(image?.cropPath || image?.imagePath || image?.path, 2000)
  if (!imagePath) return null
  return {
    id: safeString(image.id || `episode-neighbor:${index}`, 120),
    imagePath,
    frameIndex: finiteNumber(image.frameIndex, null),
    timestampSeconds: finiteNumber(image.timestampSeconds, null),
    cropVariant: safeString(image.variant || image.cropVariant || 'smart_overlay_crop', 120),
    preprocessingVariant: safeString(
      image.preprocessingVariant || image.preprocessVariant,
      120,
    ) || null,
    sourceType: safeString(image.sourceType || 'smart_overlay_crop', 120),
    selectorScore: finiteNumber(image.score ?? image.selectorScore, 0),
    selectionRank: index,
    episodeId: safeString(image.episodeId, 120) || null,
    segmentId: safeString(image.segmentId, 120) || null,
    startSeconds: finiteNumber(image.startSeconds, null),
    endSeconds: finiteNumber(image.endSeconds, null),
    episodeSupportCount: finiteNumber(image.episodeSupportCount, 1),
    episodeNeighbors: [],
  }
}

function normalizeSelectedImages(selectedImages = [], maxImages = 24) {
  return (Array.isArray(selectedImages) ? selectedImages : [])
    .map((image, index) => {
      const normalized = normalizeEpisodeNeighbor(image, index)
      if (!normalized) return null
      return {
        ...normalized,
        id: safeString(image.id || `smart-overlay:${index}`, 120),
        selectionRank: index,
        episodeNeighbors: (Array.isArray(image.episodeNeighbors) ? image.episodeNeighbors : [])
          .map(normalizeEpisodeNeighbor)
          .filter(Boolean)
          .slice(0, 4),
      }
    })
    .filter(Boolean)
    .slice(0, maxImages)
}

function defaultCommandRunner({ command, args = [], input = '', timeoutMs = 30000, cwd = backendRoot } = {}) {
  return new Promise((resolve) => {
    let settled = false
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let child

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    try {
      child = spawn(command, args, {
        cwd,
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch {
      resolve({ ok: false, exitCode: null, timedOut: false, stdout: '', stderr: '' })
      return
    }

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        // Best-effort timeout termination.
      }
      // Do not wait indefinitely for close/stdio teardown after a timed-out native
      // OCR process. Late close/error events are ignored by finish() once settled.
      finish({
        ok: false,
        exitCode: null,
        timedOut: true,
        stdout,
        stderr,
      })
    }, timeoutMs)

    child.stdout?.on('data', (chunk) => {
      stdout = `${stdout}${chunk}`.slice(0, 2_000_000)
    })
    child.stderr?.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(0, 20_000)
    })
    child.on('error', () => {
      finish({ ok: false, exitCode: null, timedOut: false, stdout: '', stderr: '' })
    })
    child.on('close', (exitCode) => {
      finish({
        ok: exitCode === 0 && !timedOut,
        exitCode,
        timedOut,
        stdout,
        stderr,
      })
    })

    if (input) child.stdin?.end(input)
    else child.stdin?.end()
  })
}

async function safeRunCommand(commandRunner, request) {
  try {
    const result = await commandRunner(request)
    return result && typeof result === 'object'
      ? result
      : { ok: false, exitCode: null, timedOut: false, stdout: '', stderr: '' }
  } catch {
    return { ok: false, exitCode: null, timedOut: false, stdout: '', stderr: '' }
  }
}

function parseJson(value) {
  try {
    return JSON.parse(String(value || '').trim())
  } catch {
    return null
  }
}

function normalizeBbox(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).map((point) => {
    if (!Array.isArray(point) || point.length < 2) return null
    const x = finiteNumber(point[0], null)
    const y = finiteNumber(point[1], null)
    return x == null || y == null ? null : [Math.trunc(x), Math.trunc(y)]
  }).filter(Boolean)
}

function textBlockFromResult({
  result = {},
  image = {},
  index = 0,
  source,
  adapter,
  languages,
  providerMetadata = {},
} = {}) {
  const rawText = normalizeShortsTrack2V3Text(result.rawText || result.text || '')
  if (!rawText) return null
  const confidence = Math.max(0, Math.min(1, finiteNumber(result.confidence, 0)))
  const metadata = {
    adapter,
    languages,
    localOnly: true,
    preprocessVariant: safeString(
      result.preprocessingVariant || image.preprocessingVariant,
      120,
    ) || null,
    ...providerMetadata,
  }
  if (['local_easyocr', 'local_paddleocr'].includes(source) && confidence < 0.75) {
    metadata.lowConfidence = true
    metadata.qualityFlags = [...new Set([
      ...(Array.isArray(metadata.qualityFlags) ? metadata.qualityFlags : []),
      'LOW_PROVIDER_CONFIDENCE',
    ])]
  }

  return {
    id: `local-ocr:${source}:${index}`,
    provider: source,
    source,
    sourceType: image.sourceType || 'smart_overlay_crop',
    rawText,
    normalizedText: normalizeShortsTrack2V3Text(result.normalizedText || rawText),
    confidence,
    bbox: normalizeBbox(result.bbox),
    imagePath: safeString(result.imagePath || image.imagePath, 2000) || null,
    frameIndex: image.frameIndex,
    timestampSeconds: finiteNumber(result.timestampSeconds, image.timestampSeconds),
    episodeId: safeString(image.episodeId, 120) || null,
    segmentId: safeString(image.segmentId, 120) || null,
    startSeconds: finiteNumber(image.startSeconds, null),
    endSeconds: finiteNumber(image.endSeconds, null),
    episodeSupportCount: finiteNumber(image.episodeSupportCount, 1),
    imageVariant: safeString(result.cropVariant || image.cropVariant, 120) || null,
    cropVariant: safeString(result.cropVariant || image.cropVariant, 120) || null,
    preprocessingVariant: safeString(
      result.preprocessingVariant || image.preprocessingVariant,
      120,
    ) || null,
    forceReviewOnly: true,
    providerMetadata: metadata,
  }
}

function pythonCommands(deps = {}, engine = 'easyocr') {
  if (engine === 'paddleocr' && Array.isArray(deps.paddleOcrCommands) && deps.paddleOcrCommands.length) {
    return deps.paddleOcrCommands
  }
  if (engine === 'easyocr' && Array.isArray(deps.easyOcrCommands) && deps.easyOcrCommands.length) {
    return deps.easyOcrCommands
  }
  const projectVenvPython = process.platform === 'win32'
    ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(projectRoot, '.venv', 'bin', 'python')
  return [
    ...(existsSync(projectVenvPython)
      ? [{ command: projectVenvPython, prefixArgs: [] }]
      : []),
    { command: 'python', prefixArgs: [] },
    { command: 'python3', prefixArgs: [] },
    { command: 'py', prefixArgs: ['-3'] },
  ]
}

function tesseractCommands(deps = {}) {
  return track2V3TesseractCommandCandidates({ deps, env: process.env })
}

function parseTesseractAvailableLanguages(stdout = '') {
  const text = String(stdout || '')
  if (!/List of available languages/iu.test(text)) return []
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /^[a-z0-9_+-]{2,40}$/iu.test(line))
}

function selectTesseractLanguages(requested = '', available = []) {
  const requestedTokens = String(requested || '')
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean)
  const availableSet = new Set(Array.isArray(available) ? available : [])
  if (!availableSet.size) {
    return { languages: requested || 'eng', missing: [] }
  }
  const selected = requestedTokens.filter((token) => availableSet.has(token))
  if (selected.length) {
    return {
      languages: selected.join('+'),
      missing: requestedTokens.filter((token) => !availableSet.has(token)),
    }
  }
  const fallback = availableSet.has('eng') ? 'eng' : [...availableSet][0]
  return {
    languages: fallback || 'eng',
    missing: requestedTokens,
  }
}

async function runPaddleOcrAdapter(images, config, commandRunner, deps, deadline) {
  const paddleOcrImages = images.slice(0, Math.min(
    config.maxLocalOcrImages,
    config.maxPaddleOcrImages,
  ))
  let lastProbeDiagnostics = null

  for (const candidate of pythonCommands(deps, 'paddleocr')) {
    const remainingForProbe = Math.max(1, deadline - Date.now())
    if (remainingForProbe <= 1) break
    const command = safeString(candidate.command, 500)
    const prefixArgs = Array.isArray(candidate.prefixArgs) ? candidate.prefixArgs : []
    const probe = await safeRunCommand(commandRunner, {
      command,
      args: [...prefixArgs, paddleOcrScriptPath, '--probe'],
      timeoutMs: remainingForProbe,
      cwd: backendRoot,
    })
    const probePayload = parseJson(probe.stdout)
    if (config.localOcrDebugEnabled && probePayload?.diagnostics) {
      lastProbeDiagnostics = safePaddleOcrDiagnostics(probePayload.diagnostics, {
        pythonExecutable: command,
        paddleocrImportOk: false,
        readerLoadedOk: false,
        imageCountReceived: 0,
        firstImagePathExists: false,
        exitCode: probe.exitCode,
      })
    }
    if (probePayload?.status !== 'OK') continue

    const remaining = Math.max(1, deadline - Date.now())
    if (remaining <= 1) {
      return {
        available: true,
        status: 'ERROR',
        provider: 'local_paddleocr',
        textBlocks: [],
        imageCount: paddleOcrImages.length,
        providerErrors: [providerError(
          'LOCAL_OCR_TIMEOUT',
          'PaddleOCR exceeded the local OCR time budget.',
          'local_paddleocr',
        )],
      }
    }

    const run = await safeRunCommand(commandRunner, {
      command,
      args: [...prefixArgs, paddleOcrScriptPath],
      input: JSON.stringify({
        debug: config.localOcrDebugEnabled,
        allowModelDownload: config.paddleOcrAllowModelDownload,
        device: config.localOcrDevice,
        images: paddleOcrImages.map((image) => ({
          imagePath: image.imagePath,
          timestampSeconds: image.timestampSeconds,
          cropVariant: image.cropVariant,
          preprocessingVariant: image.preprocessingVariant,
        })),
      }),
      timeoutMs: remaining,
      cwd: backendRoot,
    })
    const payload = parseJson(run.stdout)
    const debugDiagnostics = config.localOcrDebugEnabled
      ? safePaddleOcrDiagnostics(payload?.diagnostics, {
          pythonExecutable: command,
          paddleocrImportOk: true,
          readerLoadedOk: false,
          imageCountReceived: paddleOcrImages.length,
          firstImagePathExists: existsSync(paddleOcrImages[0]?.imagePath || ''),
          exceptionClass: payload ? '' : 'InvalidJsonOutput',
          exceptionMessage: payload ? '' : 'PaddleOCR adapter returned invalid JSON.',
          exitCode: run.exitCode,
        })
      : null
    if (payload?.status === 'UNAVAILABLE') {
      return {
        available: false,
        status: 'UNAVAILABLE',
        provider: 'local_paddleocr',
        textBlocks: [],
        imageCount: paddleOcrImages.length,
        debugDiagnostics,
        providerErrors: [providerError(
          'LOCAL_PADDLEOCR_UNAVAILABLE',
          'PaddleOCR or its local models are unavailable.',
          'local_paddleocr',
          debugDiagnostics,
        )],
      }
    }
    if (!run.ok || !payload || payload.status !== 'OK') {
      return {
        available: true,
        status: 'ERROR',
        provider: 'local_paddleocr',
        textBlocks: [],
        imageCount: paddleOcrImages.length,
        debugDiagnostics,
        providerErrors: [providerError(
          run.timedOut ? 'LOCAL_OCR_TIMEOUT' : 'LOCAL_PADDLEOCR_ERROR',
          run.timedOut
            ? 'PaddleOCR exceeded the local OCR time budget.'
            : 'PaddleOCR failed safely.',
          'local_paddleocr',
          debugDiagnostics,
        )],
      }
    }

    const results = Array.isArray(payload.results) ? payload.results : []
    const textBlocks = results.map((result, index) => textBlockFromResult({
      result,
      image: paddleOcrImages[index] || {},
      index,
      source: 'local_paddleocr',
      adapter: 'paddleocr_python',
      languages: ['vi'],
    })).filter(Boolean)

    return {
      available: true,
      status: 'OK',
      provider: 'local_paddleocr',
      textBlocks,
      imageCount: paddleOcrImages.length,
      debugDiagnostics,
      runtimeDetails: safeOcrRuntimeDetails(payload.runtime),
      providerErrors: [],
    }
  }

  return {
    available: false,
    status: 'UNAVAILABLE',
    provider: 'local_paddleocr',
    textBlocks: [],
    imageCount: paddleOcrImages.length,
    debugDiagnostics: lastProbeDiagnostics,
    providerErrors: [providerError(
      'LOCAL_PADDLEOCR_UNAVAILABLE',
      'PaddleOCR is unavailable.',
      'local_paddleocr',
      lastProbeDiagnostics,
    )],
  }
}

async function runEasyOcrAdapter(images, config, commandRunner, deps, deadline) {
  const languages = easyOcrLanguages(config.localOcrLanguages)
  const easyOcrImages = images.slice(0, Math.min(
    config.maxLocalOcrImages,
    config.maxEasyOcrImages,
  ))
  let lastProbeDiagnostics = null

  for (const candidate of pythonCommands(deps, 'easyocr')) {
    const remainingForProbe = Math.max(1, deadline - Date.now())
    if (remainingForProbe <= 1) break
    const command = safeString(candidate.command, 200)
    const prefixArgs = Array.isArray(candidate.prefixArgs) ? candidate.prefixArgs : []
    const probe = await safeRunCommand(commandRunner, {
      command,
      args: [...prefixArgs, easyOcrScriptPath, '--probe'],
      timeoutMs: remainingForProbe,
      cwd: backendRoot,
    })
    const probePayload = parseJson(probe.stdout)
    if (config.localOcrDebugEnabled && probePayload?.diagnostics) {
      lastProbeDiagnostics = safeEasyOcrDiagnostics(probePayload.diagnostics, {
        pythonExecutable: command,
        easyocrImportOk: false,
        readerLoadedOk: false,
        imageCountReceived: 0,
        firstImagePathExists: false,
        exitCode: probe.exitCode,
      })
    }
    if (probePayload?.status !== 'OK') continue

    const remaining = Math.max(1, deadline - Date.now())
    if (remaining <= 1) {
      return {
        available: true,
        status: 'ERROR',
        provider: 'local_easyocr',
        textBlocks: [],
        imageCount: easyOcrImages.length,
        providerErrors: [providerError(
          'LOCAL_OCR_TIMEOUT',
          'EasyOCR exceeded the local OCR time budget.',
          'local_easyocr',
        )],
      }
    }

    const run = await safeRunCommand(commandRunner, {
      command,
      args: [...prefixArgs, easyOcrScriptPath],
      input: JSON.stringify({
        languages,
        debug: config.localOcrDebugEnabled,
        device: config.localOcrDevice,
        batchSize: config.easyOcrBatchSize,
        workers: config.easyOcrWorkers,
        images: easyOcrImages.map((image) => ({
          imagePath: image.imagePath,
          timestampSeconds: image.timestampSeconds,
          cropVariant: image.cropVariant,
          preprocessingVariant: image.preprocessingVariant,
        })),
      }),
      timeoutMs: remaining,
      cwd: backendRoot,
    })
    const payload = parseJson(run.stdout)
    const debugDiagnostics = config.localOcrDebugEnabled
      ? safeEasyOcrDiagnostics(payload?.diagnostics, {
          pythonExecutable: command,
          easyocrImportOk: true,
          readerLoadedOk: false,
          imageCountReceived: easyOcrImages.length,
          firstImagePathExists: existsSync(easyOcrImages[0]?.imagePath || ''),
          exceptionClass: payload ? '' : 'InvalidJsonOutput',
          exceptionMessage: payload ? '' : 'EasyOCR adapter returned invalid JSON.',
          exitCode: run.exitCode,
        })
      : null
    if (payload?.status === 'UNAVAILABLE') {
      return {
        available: false,
        status: 'UNAVAILABLE',
        provider: 'local_easyocr',
        textBlocks: [],
        imageCount: easyOcrImages.length,
        debugDiagnostics,
        providerErrors: [providerError(
          'LOCAL_EASYOCR_UNAVAILABLE',
          'EasyOCR or its local models are unavailable.',
          'local_easyocr',
          debugDiagnostics,
        )],
      }
    }
    if (!run.ok || !payload || payload.status !== 'OK') {
      return {
        available: true,
        status: 'ERROR',
        provider: 'local_easyocr',
        textBlocks: [],
        imageCount: easyOcrImages.length,
        debugDiagnostics,
        providerErrors: [providerError(
          run.timedOut ? 'LOCAL_OCR_TIMEOUT' : 'LOCAL_EASYOCR_ERROR',
          run.timedOut
            ? 'EasyOCR exceeded the local OCR time budget.'
            : 'EasyOCR failed safely.',
          'local_easyocr',
          debugDiagnostics,
        )],
      }
    }

    const results = Array.isArray(payload.results) ? payload.results : []
    const textBlocks = results.map((result, index) => textBlockFromResult({
      result,
      image: easyOcrImages[index] || {},
      index,
      source: 'local_easyocr',
      adapter: 'easyocr_python',
      languages,
    })).filter(Boolean)

    return {
      available: true,
      status: 'OK',
      provider: 'local_easyocr',
      textBlocks,
      imageCount: easyOcrImages.length,
      debugDiagnostics,
      runtimeDetails: safeOcrRuntimeDetails(payload.runtime),
      providerErrors: [],
    }
  }

  return {
    available: false,
    status: 'UNAVAILABLE',
    provider: 'local_easyocr',
    textBlocks: [],
    imageCount: easyOcrImages.length,
    debugDiagnostics: lastProbeDiagnostics,
    providerErrors: [providerError(
      'LOCAL_EASYOCR_UNAVAILABLE',
      'EasyOCR is unavailable.',
      'local_easyocr',
      lastProbeDiagnostics,
    )],
  }
}

function parseTesseractTsv(tsv = '') {
  const lines = String(tsv || '').split(/\r?\n/u)
  if (lines.length < 2) return { rawText: '', confidence: 0 }
  const grouped = new Map()
  const confidences = []

  for (const row of lines.slice(1)) {
    const columns = row.split('\t')
    if (columns.length < 12) continue
    const text = columns.slice(11).join('\t').trim()
    if (!text) continue
    const key = columns.slice(0, 5).join(':')
    const words = grouped.get(key) || []
    words.push(text)
    grouped.set(key, words)
    const confidence = Number(columns[10])
    if (Number.isFinite(confidence) && confidence >= 0) confidences.push(confidence)
  }

  return {
    rawText: [...grouped.values()].map((words) => words.join(' ')).join('\n'),
    confidence: confidences.length
      ? confidences.reduce((total, value) => total + value, 0) / confidences.length / 100
      : 0,
  }
}

async function runTasksWithConcurrency(tasks = [], concurrency = 4) {
  const results = new Array(tasks.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (nextIndex < tasks.length) {
      const current = nextIndex
      nextIndex += 1
      results[current] = await tasks[current]()
    }
  })
  await Promise.all(workers)
  return results
}

const TESSERACT_FAST_VARIANTS = Object.freeze([
  'original',
  'upscale_3x_gray',
])
const TESSERACT_FAST_PSMS = Object.freeze([11, 6])
const TESSERACT_LINE_BAND_VARIANTS = Object.freeze([
  'overlay_line_band_01',
  'overlay_line_band_02',
  'overlay_line_band_03',
  'overlay_line_band_04',
])
const TESSERACT_DEEP_VARIANTS = Object.freeze([
  'upscale_4x_gray',
  'sharpen_contrast',
  'tight_address_line',
])
const TESSERACT_DEEP_PSMS = Object.freeze([11, 6])
const TESSERACT_LINE_BAND_PSMS = Object.freeze([7, 11])
const TESSERACT_LINE_BAND_MAX_IMAGES = 4
const TESSERACT_ATTEMPT_TIMEOUT_MS = 12000
const TESSERACT_PROCESS_CONCURRENCY = 1
const TESSERACT_IMAGE_CONCURRENCY = 2

function tesseractStrongAddress(result = {}) {
  const likelihood = result.addressLikelihood || scoreShortsTrack2V3AddressLikelihood(
    result.best?.scoring?.bestAddressLine || result.best?.rawText || '',
  )
  const features = likelihood.features || {}
  return Boolean(
    features.isAddressLike &&
    likelihood.score >= 80 &&
    Number(result.best?.scoring?.score || 0) >= 65 &&
    result.best?.scoring?.uncertainHouseNumber !== true,
  )
}

function progressiveTesseractImageRank(result = {}) {
  const rawText = result.best?.rawText || result.best?.scoring?.bestAddressLine || ''
  const signal = analyzeShortsTrack2V3AddressSignal(rawText)
  const signalBonus = {
    STRONG_ADDRESS_ANCHOR: 320,
    HOUSE_STREET_PARTIAL: 260,
    HOUSE_ADMIN_PARTIAL: 240,
    ADMIN_PARTIAL: 220,
    HOUSE_ONLY: 20,
  }[signal.signalClass] || 0
  const mainOverlayBonus = result.image?.cropVariant === 'dynamic_text_region_01' ? 80 : 0
  const likelihood = result.addressLikelihood || { score: 0, features: {} }
  const slashNumberBonus = likelihood.features?.hasSlashNumber ? 20 : 0
  return signalBonus + mainOverlayBonus + slashNumberBonus +
    Number(likelihood.score || 0) + Number(result.image?.selectorScore || 0) * 20
}

function rankTesseractDeepPassResults(results = []) {
  return [...results].sort((left, right) => {
    const leftStrong = tesseractStrongAddress(left) ? 1 : 0
    const rightStrong = tesseractStrongAddress(right) ? 1 : 0
    if (leftStrong !== rightStrong) return leftStrong - rightStrong
    const leftScore = progressiveTesseractImageRank(left)
    const rightScore = progressiveTesseractImageRank(right)
    return rightScore - leftScore ||
      Number(left.image?.selectionRank || 0) - Number(right.image?.selectionRank || 0)
  })
}

function tesseractFastAddressSignal(result = {}) {
  return analyzeShortsTrack2V3AddressSignal(
    result.best?.rawText || result.best?.scoring?.bestAddressLine || '',
  )
}

function shouldRunTesseractDeepPass(result = {}) {
  const signal = tesseractFastAddressSignal(result)
  return Boolean(
    signal.composableAddressSignal ||
    signal.strongAddressAnchor ||
    Number(result.addressLikelihood?.score || 0) >= 35
  )
}

function selectTesseractLineBandIndexes(results = [], maxImages = TESSERACT_LINE_BAND_MAX_IMAGES) {
  const selected = []
  const seen = new Set()
  const add = (result) => {
    if (!result || selected.length >= maxImages || seen.has(result.index)) return
    seen.add(result.index)
    selected.push(result)
  }

  // First rescue crops where fast OCR already exposed address semantics.
  for (const result of rankTesseractDeepPassResults(results)) {
    const signal = tesseractFastAddressSignal(result)
    if (signal.composableAddressSignal || signal.strongAddressAnchor) add(result)
  }
  // A clear main-overlay crop can expose the house number while fast OCR mangles
  // the street/admin text badly enough to classify it as HOUSE_ONLY. Those crops
  // are much more promising than generic early overlay regions and deserve a
  // bounded line-band pass before selector-order fallbacks. This specifically
  // keeps rescue evidence-directed without deep-OCRing every crop.
  for (const result of rankTesseractDeepPassResults(results)) {
    const signal = tesseractFastAddressSignal(result)
    if (
      signal.signalClass === 'HOUSE_ONLY' &&
      result.image?.cropVariant === 'dynamic_text_region_01'
    ) add(result)
  }
  // Then inspect bounded main overlay regions in selector order. This catches
  // multi-line address cards whose fast OCR is too noisy to expose a signal.
  for (const result of [...results].sort((left, right) =>
    Number(left.image?.selectionRank || 0) - Number(right.image?.selectionRank || 0)
  )) {
    if (result.image?.cropVariant === 'dynamic_text_region_01') add(result)
  }
  return new Set(selected.map((result) => result.index))
}


function shouldInspectEpisodeNeighbors(result = {}) {
  const likelihood = result.addressLikelihood || { score: 0, features: {} }
  const features = likelihood.features || {}
  return Boolean(
    Number(likelihood.score || 0) >= 45 ||
    (features.hasHouseNumber && (features.hasStreetLike || features.hasAdmin))
  )
}

function episodeNeighborImagesFromFastResults(results = []) {
  const seen = new Set()
  const neighbors = []
  for (const result of results) {
    if (!shouldInspectEpisodeNeighbors(result)) continue
    for (const neighbor of Array.isArray(result.image?.episodeNeighbors)
      ? result.image.episodeNeighbors
      : []) {
      const key = safeString(neighbor.imagePath, 2000).toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      neighbors.push({
        ...neighbor,
        selectionRank: Number(result.image?.selectionRank || 0),
        selectorScore: Math.max(
          finiteNumber(neighbor.selectorScore, 0),
          finiteNumber(result.image?.selectorScore, 0),
        ),
      })
    }
  }
  return neighbors
}

async function runTesseractImagePass({
  image,
  index,
  preprocessor,
  variantNames,
  psmModes,
  phase,
  tesseractCommand,
  languages,
  commandRunner,
  deadline,
  deps,
} = {}) {
  let preprocessResult
  try {
    preprocessResult = await preprocessor(image, {
      outputDir: deps.outputDir || '',
      index,
      variantNames,
    })
  } catch {
    preprocessResult = {
      variants: variantNames.includes('original')
        ? [{ preprocessVariant: 'original', imagePath: image.imagePath }]
        : [],
      providerErrors: [providerError(
        'LOCAL_TESSERACT_PREPROCESS_UNAVAILABLE',
        'Tesseract preprocessing is unavailable; requested variants were skipped safely.',
        'local_tesseract',
      )],
      cleanup: async () => {},
    }
  }

  const allowedVariants = new Set(variantNames)
  const variants = (Array.isArray(preprocessResult.variants) ? preprocessResult.variants : [])
    .filter((variant) => allowedVariants.has(variant?.preprocessVariant || 'original'))
  const tasks = variants.flatMap((variant) => {
    const variantPsmModes = TESSERACT_LINE_BAND_VARIANTS.includes(variant.preprocessVariant)
      ? TESSERACT_LINE_BAND_PSMS
      : psmModes
    return variantPsmModes.map((psm) => async () => {
    const taskRemaining = Math.max(1, deadline - Date.now())
    if (taskRemaining <= 1) {
      return {
        error: providerError(
          'LOCAL_OCR_TIMEOUT',
          'Tesseract exceeded the local OCR time budget.',
          'local_tesseract',
        ),
      }
    }
    const run = await safeRunCommand(commandRunner, {
      command: tesseractCommand,
      args: [variant.imagePath, 'stdout', '-l', languages, '--psm', String(psm), 'tsv'],
      timeoutMs: Math.min(taskRemaining, TESSERACT_ATTEMPT_TIMEOUT_MS),
      cwd: backendRoot,
    })
    if (!run.ok) {
      return {
        error: providerError(
          run.timedOut ? 'LOCAL_OCR_TIMEOUT' : 'LOCAL_TESSERACT_IMAGE_ERROR',
          run.timedOut
            ? 'Tesseract exceeded the local OCR time budget.'
            : 'Tesseract failed safely for one selected crop.',
          'local_tesseract',
        ),
      }
    }
    const parsed = parseTesseractTsv(run.stdout)
    return {
      ...parsed,
      preprocessVariant: variant.preprocessVariant || 'original',
      psm,
      phase,
      scoring: scoreShortsTrack2V3TesseractOutput({
        ...parsed,
        preprocessVariant: variant.preprocessVariant || 'original',
        psm,
      }),
    }
    })
  })

  let attemptResults = []
  try {
    attemptResults = await runTasksWithConcurrency(
      tasks,
      Math.min(TESSERACT_PROCESS_CONCURRENCY, 2),
    )
  } finally {
    await preprocessResult.cleanup?.()
  }
  const attempts = attemptResults.filter((attempt) => attempt && !attempt.error && attempt.rawText)
  const best = selectBestShortsTrack2V3TesseractAttempt(attempts)
  return {
    image,
    index,
    phase,
    attempts,
    best,
    addressLikelihood: scoreShortsTrack2V3AddressLikelihood(
      best?.scoring?.bestAddressLine || best?.rawText || '',
    ),
    providerErrors: [
      ...(Array.isArray(preprocessResult.providerErrors) ? preprocessResult.providerErrors : []),
      ...attemptResults.filter((attempt) => attempt?.error).map((attempt) => attempt.error),
    ],
    attemptedPsms: [...new Set(attempts.map((attempt) => attempt.psm))],
    attemptedPreprocessVariants: [...new Set(variants.map((variant) =>
      variant.preprocessVariant || 'original'
    ))],
  }
}

function lineBandSemanticRank(attempt = {}) {
  if (!attempt?.rawText) return null
  const signal = analyzeShortsTrack2V3AddressSignal(attempt.rawText)
  const semanticBonuses = {
    STRONG_ADDRESS_ANCHOR: 140,
    HOUSE_STREET_PARTIAL: 110,
    HOUSE_ADMIN_PARTIAL: 100,
    ADMIN_PARTIAL: 90,
  }
  const semanticBonus = Number(semanticBonuses[signal.signalClass] || 0)
  const likelihood = scoreShortsTrack2V3AddressLikelihood(attempt.rawText)
  return {
    attempt,
    signal,
    likelihood,
    semanticBonus,
    rank: semanticBonus + Number(likelihood.score || 0) + Number(attempt.selectionScore || 0) * 0.05,
  }
}

function tesseractSupplementalLineBandAttempts(attempts = []) {
  const selected = []
  const seenText = new Set()
  for (const variantName of TESSERACT_LINE_BAND_VARIANTS) {
    const ranked = attempts
      .filter((attempt) => attempt?.preprocessVariant === variantName)
      .map(lineBandSemanticRank)
      .filter(Boolean)
      .sort((left, right) => right.rank - left.rank)
    const winner = ranked[0]
    if (!winner?.attempt?.rawText) continue
    const semanticBandSignal = winner.semanticBonus > 0
    if (!semanticBandSignal && Number(winner.likelihood.score || 0) < 25) continue
    const normalized = normalizeShortsTrack2V3Text(winner.attempt.rawText).toLowerCase()
    if (!normalized || seenText.has(normalized)) continue
    seenText.add(normalized)
    selected.push({
      best: winner.attempt,
      likelihood: winner.likelihood,
      addressSignal: winner.signal,
    })
  }
  return selected.slice(0, 3)
}

async function runTesseractAdapter(images, config, commandRunner, deadline, deps = {}) {
  const startedAt = Date.now()
  let tesseractCommand = null
  for (const command of tesseractCommands(deps)) {
    const remaining = Math.max(1, deadline - Date.now())
    if (remaining <= 1) break
    const probe = await safeRunCommand(commandRunner, {
      command,
      args: ['--version'],
      timeoutMs: remaining,
      cwd: backendRoot,
    })
    if (probe.ok) {
      tesseractCommand = command
      break
    }
  }
  if (!tesseractCommand) {
    return {
      available: false,
      status: 'UNAVAILABLE',
      provider: 'local_tesseract',
      textBlocks: [],
      imageCount: images.length,
      attemptCount: 0,
      fastAttemptCount: 0,
      deepAttemptCount: 0,
      deepPassImageCount: 0,
      providerErrors: [providerError(
        'LOCAL_TESSERACT_UNAVAILABLE',
        'Tesseract CLI is unavailable.',
        'local_tesseract',
      )],
    }
  }

  const requestedLanguages = tesseractLanguages(config.localOcrLanguages)
  const languageProbe = await safeRunCommand(commandRunner, {
    command: tesseractCommand,
    args: ['--list-langs'],
    timeoutMs: Math.max(1, deadline - Date.now()),
    cwd: backendRoot,
  })
  const languageSelection = selectTesseractLanguages(
    requestedLanguages,
    languageProbe.ok ? parseTesseractAvailableLanguages(languageProbe.stdout) : [],
  )
  const languages = languageSelection.languages
  const textBlocks = []
  const providerErrors = []
  if (languageSelection.missing.length) {
    providerErrors.push(providerError(
      'LOCAL_TESSERACT_LANGUAGE_FALLBACK',
      `Tesseract language data is missing for ${languageSelection.missing.join(', ')}; available requested languages were used instead.`,
      'local_tesseract',
    ))
  }
  const seenErrorCodes = new Set()
  const addProviderError = (error) => {
    if (!error?.code || seenErrorCodes.has(error.code) || providerErrors.length >= 10) return
    seenErrorCodes.add(error.code)
    providerErrors.push(error)
  }
  const preprocessor = typeof deps.tesseractPreprocessor === 'function'
    ? deps.tesseractPreprocessor
    : generateShortsTrack2V3TesseractPreprocessVariants

  const fastTasks = images.map((image, index) => async () => runTesseractImagePass({
    image,
    index,
    preprocessor,
    variantNames: TESSERACT_FAST_VARIANTS,
    psmModes: TESSERACT_FAST_PSMS,
    phase: 'FAST',
    tesseractCommand,
    languages,
    commandRunner,
    deadline,
    deps,
  }))
  const representativeFastResults = await runTasksWithConcurrency(
    fastTasks,
    TESSERACT_IMAGE_CONCURRENCY,
  )
  for (const result of representativeFastResults) {
    for (const error of result.providerErrors) addProviderError(error)
  }

  const episodeNeighborImages = episodeNeighborImagesFromFastResults(representativeFastResults)
  const neighborFastTasks = episodeNeighborImages.map((image, offset) => async () =>
    runTesseractImagePass({
      image,
      index: images.length + offset,
      preprocessor,
      variantNames: TESSERACT_FAST_VARIANTS,
      psmModes: TESSERACT_FAST_PSMS,
      phase: 'TEMPORAL_NEIGHBOR_FAST',
      tesseractCommand,
      languages,
      commandRunner,
      deadline,
      deps,
    })
  )
  const neighborFastResults = await runTasksWithConcurrency(
    neighborFastTasks,
    TESSERACT_IMAGE_CONCURRENCY,
  )
  for (const result of neighborFastResults) {
    for (const error of result.providerErrors) addProviderError(error)
  }
  const fastResults = [...representativeFastResults, ...neighborFastResults]

  const deepPassIndexes = new Set(
    rankTesseractDeepPassResults(fastResults)
      .filter((result) => !tesseractStrongAddress(result))
      .filter(shouldRunTesseractDeepPass)
      .slice(0, config.maxTesseractDeepPassImages)
      .map((result) => result.index),
  )
  const deepTasks = fastResults
    .filter((result) => deepPassIndexes.has(result.index))
    .map((result) => async () => runTesseractImagePass({
      image: result.image,
      index: result.index,
      preprocessor,
      variantNames: TESSERACT_DEEP_VARIANTS,
      psmModes: TESSERACT_DEEP_PSMS,
      phase: 'DEEP',
      tesseractCommand,
      languages,
      commandRunner,
      deadline,
      deps,
    }))
  const deepResults = await runTasksWithConcurrency(deepTasks, TESSERACT_IMAGE_CONCURRENCY)
  const deepByIndex = new Map(deepResults.map((result) => [result.index, result]))
  for (const result of deepResults) {
    for (const error of result.providerErrors) addProviderError(error)
  }

  // Line-band OCR is deliberately narrower than the general deep pass. Running three
  // band variants × three sparse-text PSMs on every deep image made listicle OCR
  // latency scale into minutes. Rank from the fast pass and rescue only the strongest
  // bounded visual candidates.
  const lineBandIndexes = selectTesseractLineBandIndexes(
    fastResults.filter((result) => !tesseractStrongAddress(result)),
    TESSERACT_LINE_BAND_MAX_IMAGES,
  )
  const lineBandTasks = fastResults
    .filter((result) => lineBandIndexes.has(result.index))
    .map((result) => async () => runTesseractImagePass({
      image: result.image,
      index: result.index,
      preprocessor,
      variantNames: TESSERACT_LINE_BAND_VARIANTS,
      psmModes: TESSERACT_LINE_BAND_PSMS,
      phase: 'LINE_BAND',
      tesseractCommand,
      languages,
      commandRunner,
      deadline,
      deps,
    }))
  const lineBandResults = await runTasksWithConcurrency(
    lineBandTasks,
    TESSERACT_IMAGE_CONCURRENCY,
  )
  const lineBandByIndex = new Map(lineBandResults.map((result) => [result.index, result]))
  for (const result of lineBandResults) {
    for (const error of result.providerErrors) addProviderError(error)
  }

  let fastAttemptCount = 0
  let deepAttemptCount = 0
  let lineBandAttemptCount = 0
  for (const fastResult of fastResults) {
    fastAttemptCount += fastResult.attempts.length
    const deepResult = deepByIndex.get(fastResult.index)
    const lineBandResult = lineBandByIndex.get(fastResult.index)
    deepAttemptCount += deepResult?.attempts.length || 0
    lineBandAttemptCount += lineBandResult?.attempts.length || 0
    const attempts = [
      ...fastResult.attempts,
      ...(deepResult?.attempts || []),
      ...(lineBandResult?.attempts || []),
    ]
    const primaryAttempts = attempts.filter((attempt) =>
      !TESSERACT_LINE_BAND_VARIANTS.includes(attempt?.preprocessVariant)
    )
    const best = selectBestShortsTrack2V3TesseractAttempt(
      primaryAttempts.length ? primaryAttempts : attempts,
    )
    if (!best) continue
    const addressLikelihood = scoreShortsTrack2V3AddressLikelihood(
      best.scoring.bestAddressLine || best.rawText,
    )
    const block = textBlockFromResult({
      result: {
        ...best,
        // Preserve the full selected OCR observation. bestAddressLine remains
        // metadata for ranking; collapsing here used to discard ward/district
        // lines before temporal fusion and candidate extraction.
        rawText: best.rawText,
      },
      image: fastResult.image,
      index: fastResult.index,
      source: 'local_tesseract',
      adapter: 'tesseract_cli_multi_psm',
      languages: languages.split('+'),
      providerMetadata: {
        psm: best.psm,
        preprocessVariant: best.preprocessVariant,
        ocrScore: best.scoring.score,
        addressLikelihoodScore: addressLikelihood.score,
        addressLikelihoodFeatures: addressLikelihood.features,
        selectionScore: best.selectionScore,
        consensusCount: best.consensusCount,
        bestAddressLine: best.scoring.bestAddressLine,
        lowConfidence: best.scoring.lowConfidence,
        uncertainHouseNumber: best.scoring.uncertainHouseNumber,
        qualityFlags: best.scoring.qualityFlags,
        attemptCount: attempts.length,
        fastAttemptCount: fastResult.attempts.length,
        deepAttemptCount: deepResult?.attempts.length || 0,
        lineBandAttemptCount: lineBandResult?.attempts.length || 0,
        deepPassRan: Boolean(deepResult),
        lineBandPassRan: Boolean(lineBandResult),
        attemptedPsms: [...new Set([
          ...fastResult.attemptedPsms,
          ...(deepResult?.attemptedPsms || []),
        ])],
        attemptedPreprocessVariants: [...new Set([
          ...fastResult.attemptedPreprocessVariants,
          ...(deepResult?.attemptedPreprocessVariants || []),
        ])],
        attemptSummaries: best.attemptSummaries,
      },
    })
    if (block) textBlocks.push(block)

    const primaryText = normalizeShortsTrack2V3Text(block?.rawText || '').toLowerCase()
    const supplementalBands = tesseractSupplementalLineBandAttempts(attempts)
    for (let bandIndex = 0; bandIndex < supplementalBands.length; bandIndex += 1) {
      const { best: bandBest, likelihood: bandLikelihood } = supplementalBands[bandIndex]
      const bandText = normalizeShortsTrack2V3Text(bandBest.rawText).toLowerCase()
      if (!bandText || bandText === primaryText) continue
      const supplementalBlock = textBlockFromResult({
        result: {
          ...bandBest,
          rawText: bandBest.rawText,
          preprocessingVariant: bandBest.preprocessVariant,
        },
        image: fastResult.image,
        index: `${fastResult.index}:band:${bandIndex}`,
        source: 'local_tesseract',
        adapter: 'tesseract_cli_multi_psm_line_band',
        languages: languages.split('+'),
        providerMetadata: {
          psm: bandBest.psm,
          preprocessVariant: bandBest.preprocessVariant,
          ocrScore: bandBest.scoring.score,
          addressLikelihoodScore: bandLikelihood.score,
          addressLikelihoodFeatures: bandLikelihood.features,
          selectionScore: bandBest.selectionScore,
          consensusCount: bandBest.consensusCount,
          bestAddressLine: bandBest.scoring.bestAddressLine,
          lowConfidence: true,
          uncertainHouseNumber: bandBest.scoring.uncertainHouseNumber,
          qualityFlags: [...new Set([
            ...(Array.isArray(bandBest.scoring.qualityFlags) ? bandBest.scoring.qualityFlags : []),
            'LINE_BAND_RESCUE',
            'LOW_PROVIDER_CONFIDENCE',
          ])],
          attemptCount: attempts.length,
          deepPassRan: true,
          lineBandRescue: true,
          addressSignalClass: supplementalBands[bandIndex].addressSignal?.signalClass || null,
        },
      })
      if (supplementalBlock) textBlocks.push(supplementalBlock)
    }
  }

  if (Date.now() >= deadline) {
    addProviderError(providerError(
      'LOCAL_OCR_TIMEOUT',
      'Tesseract exceeded the local OCR time budget.',
      'local_tesseract',
    ))
  }

  return {
    available: true,
    status: textBlocks.length || !providerErrors.length ? 'OK' : 'ERROR',
    provider: 'local_tesseract',
    textBlocks,
    imageCount: images.length,
    attemptCount: fastAttemptCount + deepAttemptCount + lineBandAttemptCount,
    fastAttemptCount,
    deepAttemptCount,
    deepPassImageCount: deepResults.length,
    lineBandAttemptCount,
    lineBandImageCount: lineBandResults.length,
    temporalNeighborImageCount: episodeNeighborImages.length,
    runtimeMs: Date.now() - startedAt,
    providerErrors,
  }
}

function normalizedPathKey(value = '') {
  return safeString(value, 2000).replace(/\\/gu, '/').toLowerCase()
}

function ocrBlockMatchesImage(block = {}, image = {}) {
  const blockPath = normalizedPathKey(block.imagePath)
  const imagePath = normalizedPathKey(image.imagePath)
  if (blockPath && imagePath && blockPath === imagePath) return true
  const blockFrame = finiteNumber(block.frameIndex, null)
  const imageFrame = finiteNumber(image.frameIndex, null)
  const blockTimestamp = finiteNumber(block.timestampSeconds, null)
  const imageTimestamp = finiteNumber(image.timestampSeconds, null)
  return Boolean(
    blockFrame !== null && imageFrame !== null && blockFrame === imageFrame &&
    blockTimestamp !== null && imageTimestamp !== null &&
    Math.abs(blockTimestamp - imageTimestamp) <= 0.05,
  )
}

function rankImagesForAddressOcr(images = [], scoutBlocks = []) {
  return [...images]
    .map((image) => {
      const matchingBlocks = scoutBlocks.filter((block) => ocrBlockMatchesImage(block, image))
      const likelihoods = matchingBlocks.map((block) => scoreShortsTrack2V3AddressLikelihood(
        block.rawText || block.normalizedText,
      ))
      const bestLikelihood = likelihoods.sort((left, right) => right.score - left.score)[0] || {
        score: 0,
        features: {},
      }
      const providerConfidence = Math.max(
        0,
        ...matchingBlocks.map((block) => finiteNumber(block.confidence, 0)),
      )
      return {
        image,
        addressRankScore: Number(
          (
            bestLikelihood.score +
            Number(image.selectorScore || 0) * 25 +
            providerConfidence * 8
          ).toFixed(4),
        ),
        bestLikelihood,
      }
    })
    .sort((left, right) =>
      right.addressRankScore - left.addressRankScore ||
      Number(left.image.selectionRank || 0) - Number(right.image.selectionRank || 0)
    )
    .map((item, addressRank) => ({
      ...item.image,
      addressRank,
      addressRankScore: item.addressRankScore,
      scoutAddressLikelihoodScore: item.bestLikelihood.score,
    }))
}

function engineBestSnippets(blocks = []) {
  const seen = new Set()
  const snippets = []
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const text = normalizeShortsTrack2V3Text(block?.rawText || block?.normalizedText)
      .replace(/\s+/gu, ' ')
    if (!text) continue
    const snippet = text.length > 180 ? `${text.slice(0, 177)}...` : text
    const key = snippet.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    snippets.push(snippet)
    if (snippets.length >= 6) break
  }
  return snippets
}

function summarizeEngineRun(result = {}) {
  return {
    provider: safeString(result.provider, 80) || 'local_ocr',
    status: safeString(result.status, 40) || 'UNKNOWN',
    imageCountSent: Math.max(0, finiteNumber(result.imageCount, 0)),
    bestSnippets: engineBestSnippets(result.textBlocks),
    runtimeMs: Math.max(0, finiteNumber(result.runtimeMs, 0)),
    attemptCount: Math.max(0, finiteNumber(result.attemptCount, 0)),
    fastAttemptCount: Math.max(0, finiteNumber(result.fastAttemptCount, 0)),
    deepAttemptCount: Math.max(0, finiteNumber(result.deepAttemptCount, 0)),
    deepPassImageCount: Math.max(0, finiteNumber(result.deepPassImageCount, 0)),
    lineBandAttemptCount: Math.max(0, finiteNumber(result.lineBandAttemptCount, 0)),
    lineBandImageCount: Math.max(0, finiteNumber(result.lineBandImageCount, 0)),
    addressRankedInput: Boolean(result.addressRankedInput),
    runtimeDetails: safeOcrRuntimeDetails(result.runtimeDetails),
  }
}

function requestedAdapters(config) {
  const provider = config.track2V3LocalOcrProvider
  const adapters = []
  if ((provider === 'auto' || provider === 'paddleocr' || provider === 'ensemble') &&
    config.track2V3PaddleOcrEnabled) {
    adapters.push('paddleocr')
  }
  if ((provider === 'auto' || provider === 'easyocr' || provider === 'ensemble') &&
    config.track2V3EasyOcrEnabled) {
    adapters.push('easyocr')
  }
  if ((provider === 'auto' || provider === 'tesseract' || provider === 'ensemble') &&
    config.track2V3TesseractEnabled) {
    adapters.push('tesseract')
  }
  return adapters
}

export async function runShortsTrack2V3LocalOcrProvider({
  selectedImages = [],
  config = {},
  deps = {},
} = {}) {
  const normalizedConfig = normalizeShortsTrack2V3LocalOcrConfig(config)
  const images = normalizeSelectedImages(
    selectedImages,
    normalizedConfig.maxLocalOcrImages,
  )

  if (!normalizedConfig.track2V3LocalOcrEnabled) {
    return {
      status: 'DISABLED',
      reason: 'LOCAL_OCR_DISABLED',
      called: false,
      provider: null,
      textBlocks: [],
      providerErrors: [],
      diagnostics: [],
      imageCount: images.length,
    }
  }

  if (!images.length) {
    return {
      status: 'NOT_RUN',
      reason: 'LOCAL_OCR_NO_SELECTED_IMAGES',
      called: false,
      provider: null,
      textBlocks: [],
      providerErrors: [],
      diagnostics: [],
      imageCount: 0,
    }
  }

  const adapters = requestedAdapters(normalizedConfig)
  if (!adapters.length) {
    const errors = [providerError(
      'LOCAL_OCR_PROVIDER_UNAVAILABLE',
      'No enabled local OCR adapter is available.',
    )]
    return {
      status: 'UNAVAILABLE',
      reason: 'LOCAL_OCR_PROVIDER_UNAVAILABLE',
      called: true,
      provider: null,
      textBlocks: [],
      providerErrors: errors,
      diagnostics: errors,
      imageCount: images.length,
    }
  }

  const commandRunner = typeof deps.commandRunner === 'function'
    ? deps.commandRunner
    : defaultCommandRunner
  const deadline = Date.now() + normalizedConfig.localOcrTimeoutMs
  const adapterErrors = []
  const engineRuns = {}
  const successfulResults = []
  const ensembleMode = normalizedConfig.track2V3LocalOcrProvider === 'ensemble'
  let availableAdapterFailed = false
  let attemptedImageCount = images.length
  let debugDiagnostics = null

  const executionAdapters = ensembleMode && adapters.includes('tesseract')
    ? ['tesseract', ...adapters.filter((adapter) => adapter !== 'tesseract')]
    : adapters
  let addressRankedImages = images
  let tesseractScoutBlockCount = 0

  for (const adapter of executionAdapters) {
    const inputImages = ensembleMode && adapter !== 'tesseract'
      ? addressRankedImages
      : images
    const adapterStartedAt = Date.now()
    const rawResult = adapter === 'paddleocr'
      ? await runPaddleOcrAdapter(inputImages, normalizedConfig, commandRunner, deps, deadline)
      : adapter === 'easyocr'
        ? await runEasyOcrAdapter(inputImages, normalizedConfig, commandRunner, deps, deadline)
        : await runTesseractAdapter(inputImages, normalizedConfig, commandRunner, deadline, deps)
    const result = {
      ...rawResult,
      runtimeMs: Math.max(0, finiteNumber(rawResult.runtimeMs, Date.now() - adapterStartedAt)),
      addressRankedInput: ensembleMode && adapter !== 'tesseract',
    }

    if (ensembleMode && adapter === 'tesseract' && result.status === 'OK') {
      tesseractScoutBlockCount = result.textBlocks.length
      addressRankedImages = rankImagesForAddressOcr(images, result.textBlocks)
    }

    adapterErrors.push(...result.providerErrors)
    engineRuns[result.provider || `local_${adapter}`] = summarizeEngineRun(result)
    attemptedImageCount = finiteNumber(result.imageCount, images.length)
    debugDiagnostics = result.debugDiagnostics || debugDiagnostics
    if (!result.available) continue
    if (result.status === 'OK') {
      if (ensembleMode) {
        successfulResults.push(result)
        continue
      }
      return {
        status: 'OK',
        reason: result.textBlocks.length ? 'LOCAL_OCR_TEXT_COLLECTED' : 'LOCAL_OCR_NO_TEXT',
        called: true,
        provider: result.provider,
        textBlocks: result.textBlocks,
        providerErrors: result.providerErrors,
        diagnostics: result.providerErrors,
        debugDiagnostics,
        engineRuns,
        imageCount: attemptedImageCount,
        routingDiagnostics: {
          addressFirstRouting: false,
          tesseractScoutBlockCount: 0,
        },
      }
    }
    availableAdapterFailed = true
  }

  if (ensembleMode && successfulResults.length) {
    const textBlocks = successfulResults.flatMap((result) => result.textBlocks)
    return {
      status: 'OK',
      reason: textBlocks.length ? 'LOCAL_OCR_TEXT_COLLECTED' : 'LOCAL_OCR_NO_TEXT',
      called: true,
      provider: 'local_ocr_ensemble',
      textBlocks,
      providerErrors: adapterErrors,
      diagnostics: adapterErrors,
      debugDiagnostics,
      engineRuns,
      imageCount: successfulResults.reduce(
        (total, result) => total + Math.max(0, finiteNumber(result.imageCount, 0)),
        0,
      ),
      routingDiagnostics: {
        addressFirstRouting: executionAdapters[0] === 'tesseract',
        tesseractScoutBlockCount,
        heavyOcrImageOrder: addressRankedImages.slice(0, Math.max(
          normalizedConfig.maxPaddleOcrImages,
          normalizedConfig.maxEasyOcrImages,
        )).map((image) => ({
          id: image.id,
          addressRank: image.addressRank ?? null,
          addressRankScore: image.addressRankScore ?? null,
          scoutAddressLikelihoodScore: image.scoutAddressLikelihoodScore ?? null,
        })),
      },
    }
  }

  const finalError = providerError(
    availableAdapterFailed ? 'LOCAL_OCR_PROVIDER_ERROR' : 'LOCAL_OCR_PROVIDER_UNAVAILABLE',
    availableAdapterFailed
      ? 'All available local OCR adapters failed safely.'
      : 'PaddleOCR, EasyOCR, and Tesseract CLI are unavailable.',
  )
  const providerErrors = [...adapterErrors, finalError]

  return {
    status: availableAdapterFailed ? 'ERROR' : 'UNAVAILABLE',
    reason: availableAdapterFailed
      ? 'LOCAL_OCR_PROVIDER_ERROR'
      : 'LOCAL_OCR_PROVIDER_UNAVAILABLE',
    called: true,
    provider: null,
    textBlocks: [],
    providerErrors,
    diagnostics: providerErrors,
    debugDiagnostics,
    engineRuns,
    imageCount: attemptedImageCount,
  }
}

export default {
  normalizeShortsTrack2V3LocalOcrConfig,
  runShortsTrack2V3LocalOcrProvider,
}
