import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_SHORTS_TRACK2_V3_CONFIG } from './shortsTrack2V3Config.js'
import { normalizeShortsTrack2V3Text } from './shortsTrack2V3EvidenceStoreService.js'
import { generateShortsTrack2V3TesseractPreprocessVariants } from './shortsTrack2V3TesseractPreprocessService.js'
import {
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
    localOcrLanguages: safeString(
      config.localOcrLanguages || DEFAULT_SHORTS_TRACK2_V3_CONFIG.localOcrLanguages,
      40,
    ),
    localOcrDebugEnabled: config.localOcrDebugEnabled ??
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.localOcrDebugEnabled,
  }
}

function normalizeSelectedImages(selectedImages = [], maxImages = 24) {
  return (Array.isArray(selectedImages) ? selectedImages : [])
    .map((image, index) => {
      const imagePath = safeString(image?.cropPath || image?.imagePath || image?.path, 2000)
      if (!imagePath) return null
      return {
        id: safeString(image.id || `smart-overlay:${index}`, 120),
        imagePath,
        frameIndex: finiteNumber(image.frameIndex, null),
        timestampSeconds: finiteNumber(image.timestampSeconds, null),
        cropVariant: safeString(image.variant || image.cropVariant || 'smart_overlay_crop', 120),
        preprocessingVariant: safeString(
          image.preprocessingVariant || image.preprocessVariant,
          120,
        ) || null,
        sourceType: safeString(image.sourceType || 'smart_overlay_crop', 120),
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
  if (Array.isArray(deps.tesseractCommands) && deps.tesseractCommands.length) {
    return deps.tesseractCommands.map((command) => safeString(command, 500)).filter(Boolean)
  }
  const commands = ['tesseract']
  if (process.platform === 'win32') {
    commands.push('C:\\Program Files\\Tesseract-OCR\\tesseract.exe')
  }
  return commands
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

async function runTesseractAdapter(images, config, commandRunner, deadline, deps = {}) {
  let tesseractCommand = null
  for (const command of tesseractCommands(deps)) {
    const probe = await safeRunCommand(commandRunner, {
      command,
      args: ['--version'],
      timeoutMs: Math.max(1, deadline - Date.now()),
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
      providerErrors: [providerError(
        'LOCAL_TESSERACT_UNAVAILABLE',
        'Tesseract CLI is unavailable.',
        'local_tesseract',
      )],
    }
  }

  const languages = tesseractLanguages(config.localOcrLanguages)
  const textBlocks = []
  const providerErrors = []
  const seenErrorCodes = new Set()
  const addProviderError = (error) => {
    if (!error?.code || seenErrorCodes.has(error.code) || providerErrors.length >= 10) return
    seenErrorCodes.add(error.code)
    providerErrors.push(error)
  }
  const preprocessor = typeof deps.tesseractPreprocessor === 'function'
    ? deps.tesseractPreprocessor
    : generateShortsTrack2V3TesseractPreprocessVariants
  const psmModes = [11, 12, 6]

  for (let index = 0; index < images.length; index += 1) {
    const remaining = Math.max(1, deadline - Date.now())
    if (remaining <= 1) {
      addProviderError(providerError(
        'LOCAL_OCR_TIMEOUT',
        'Tesseract exceeded the local OCR time budget.',
        'local_tesseract',
      ))
      break
    }
    const image = images[index]
    let preprocessResult
    try {
      preprocessResult = await preprocessor(image, {
        outputDir: deps.outputDir || '',
        index,
      })
    } catch {
      preprocessResult = {
        variants: [{ preprocessVariant: 'original', imagePath: image.imagePath }],
        providerErrors: [providerError(
          'LOCAL_TESSERACT_PREPROCESS_UNAVAILABLE',
          'Tesseract preprocessing is unavailable; original image retained.',
          'local_tesseract',
        )],
        cleanup: async () => {},
      }
    }

    for (const error of Array.isArray(preprocessResult.providerErrors)
      ? preprocessResult.providerErrors
      : []) {
      addProviderError(error)
    }

    const variants = Array.isArray(preprocessResult.variants) && preprocessResult.variants.length
      ? preprocessResult.variants
      : [{ preprocessVariant: 'original', imagePath: image.imagePath }]
    const tasks = variants.flatMap((variant) => psmModes.map((psm) => async () => {
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
        timeoutMs: taskRemaining,
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
        scoring: scoreShortsTrack2V3TesseractOutput({
          ...parsed,
          preprocessVariant: variant.preprocessVariant || 'original',
          psm,
        }),
      }
    }))

    let attemptResults = []
    try {
      attemptResults = await runTasksWithConcurrency(tasks, 4)
    } finally {
      await preprocessResult.cleanup?.()
    }
    for (const attempt of attemptResults) {
      if (attempt?.error) addProviderError(attempt.error)
    }
    const attempts = attemptResults.filter((attempt) => attempt && !attempt.error && attempt.rawText)
    const best = selectBestShortsTrack2V3TesseractAttempt(attempts)
    if (best) {
      const block = textBlockFromResult({
        result: {
          ...best,
          rawText: best.scoring.bestAddressLine || best.rawText,
        },
        image,
        index,
        source: 'local_tesseract',
        adapter: 'tesseract_cli_multi_psm',
        languages: languages.split('+'),
        providerMetadata: {
          psm: best.psm,
          preprocessVariant: best.preprocessVariant,
          ocrScore: best.scoring.score,
          selectionScore: best.selectionScore,
          consensusCount: best.consensusCount,
          bestAddressLine: best.scoring.bestAddressLine,
          lowConfidence: best.scoring.lowConfidence,
          uncertainHouseNumber: best.scoring.uncertainHouseNumber,
          qualityFlags: best.scoring.qualityFlags,
          attemptCount: attempts.length,
          attemptedPsms: psmModes,
          attemptedPreprocessVariants: [...new Set(variants.map((variant) =>
            variant.preprocessVariant || 'original'
          ))],
          attemptSummaries: best.attemptSummaries,
        },
      })
      if (block) textBlocks.push(block)
    }

    if (Date.now() >= deadline) {
      addProviderError(providerError(
        'LOCAL_OCR_TIMEOUT',
        'Tesseract exceeded the local OCR time budget.',
        'local_tesseract',
      ))
      break
    }
  }

  return {
    available: true,
    status: textBlocks.length || !providerErrors.length ? 'OK' : 'ERROR',
    provider: 'local_tesseract',
    textBlocks,
    imageCount: images.length,
    providerErrors,
  }
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

  for (const adapter of adapters) {
    const result = adapter === 'paddleocr'
      ? await runPaddleOcrAdapter(images, normalizedConfig, commandRunner, deps, deadline)
      : adapter === 'easyocr'
        ? await runEasyOcrAdapter(images, normalizedConfig, commandRunner, deps, deadline)
        : await runTesseractAdapter(images, normalizedConfig, commandRunner, deadline, deps)

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
