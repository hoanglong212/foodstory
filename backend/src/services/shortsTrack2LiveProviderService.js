import { spawn } from 'node:child_process'
import { createSign } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_MAX_FRAMES = 8
const DEFAULT_MAX_DURATION_SECONDS = 60
const HARD_MAX_DURATION_SECONDS = 180
const UNIFORM_SAMPLE_STRATEGY = 'UNIFORM'
const HEAD_MID_TAIL_SAMPLE_STRATEGY = 'HEAD_MID_TAIL'
const DEFAULT_BUDGET_MS = 30000
const DEFAULT_COMMAND_TIMEOUT_MS = 5000
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 22000
const DEFAULT_FRAME_TIMEOUT_MS = 7000
const MAX_SAFE_DIAGNOSTIC_TEXT = 600
const VIDEO_FORMAT =
  'bv*[ext=mp4][height<=720]/bv*[height<=720]/bestvideo[height<=720]/best[height<=720]/best'

function safeString(value, maxLength = MAX_SAFE_DIAGNOSTIC_TEXT) {
  return String(value || '').trim().slice(0, maxLength)
}

function safeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function safeDiagnostic(code, message, details = {}) {
  const diagnostic = {
    code: safeString(code, 120),
    message: safeString(message, 240),
  }

  for (const [key, value] of Object.entries(details)) {
    if (/key|secret|token|credential|password/iu.test(key)) continue
    if (value === undefined) continue
    if (typeof value === 'string') diagnostic[key] = safeString(value)
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) diagnostic[key] = value
    else if (Array.isArray(value)) diagnostic[key] = value.map((item) => safeString(item, 120)).slice(0, 8)
  }

  return diagnostic
}

function safeErrorDiagnostic(code, error, details = {}) {
  return safeDiagnostic(code, error?.message || 'provider error', {
    ...details,
    name: safeString(error?.name || 'Error', 80),
    errorCode: safeString(error?.code, 120) || null,
    httpStatus: Number.isFinite(Number(error?.httpStatus)) ? Number(error.httpStatus) : null,
  })
}

function parseIsoDurationSeconds(value) {
  const text = safeString(value, 80)
  if (!text) return 0
  const match = text.match(/^P(?:T)?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/iu)
  if (!match) return 0
  return safeNumber(match[1]) * 3600 + safeNumber(match[2]) * 60 + safeNumber(match[3])
}

function getDurationSeconds(metadata = {}) {
  const direct = safeNumber(metadata.durationSeconds || metadata.lengthSeconds || metadata.videoDurationSeconds, 0)
  if (direct > 0) return direct
  return parseIsoDurationSeconds(metadata.duration)
}

function boundedMaxDurationSeconds(value) {
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > HARD_MAX_DURATION_SECONDS) {
    return DEFAULT_MAX_DURATION_SECONDS
  }
  return numeric
}

function normalizedSampleStrategy(value) {
  return String(value || '').trim().toUpperCase() === HEAD_MID_TAIL_SAMPLE_STRATEGY
    ? HEAD_MID_TAIL_SAMPLE_STRATEGY
    : UNIFORM_SAMPLE_STRATEGY
}

function headMidTailTimestamps(usableDuration, count) {
  if (count <= 1) return [Math.round(usableDuration * 0.5 * 10) / 10]

  const anchors = [0.08, 0.16, 0.28, 0.45, 0.55, 0.72, 0.84, 0.92]
  return Array.from({ length: count }, (_, index) => {
    const anchorIndex = Math.round(index * (anchors.length - 1) / (count - 1))
    return Math.round(usableDuration * anchors[anchorIndex] * 10) / 10
  })
}

function buildSampleTimestamps(metadata = {}, limits = {}) {
  const maxFrames = Math.floor(Math.max(1, Math.min(
    safeNumber(limits.maxFrames, DEFAULT_MAX_FRAMES),
    DEFAULT_MAX_FRAMES,
  )))
  const durationSeconds = getDurationSeconds(metadata)
  const maxDurationSeconds = boundedMaxDurationSeconds(limits.maxVideoDurationSeconds)
  const sampleStrategy = normalizedSampleStrategy(limits.sampleStrategy)

  if (durationSeconds > 0) {
    const usableDuration = Math.min(durationSeconds, maxDurationSeconds)
    const count = Math.min(maxFrames, Math.max(1, Math.floor(usableDuration)))
    if (sampleStrategy === HEAD_MID_TAIL_SAMPLE_STRATEGY) {
      return headMidTailTimestamps(usableDuration, count)
    }
    const step = usableDuration / (count + 1)
    return Array.from({ length: count }, (_, index) =>
      Math.round(step * (index + 1) * 10) / 10)
  }

  return [1, 3, 5, 8, 12, 18, 24, 32].slice(0, maxFrames)
}

function createCommandFailureResult(command, { timedOut = false, aborted = false } = {}) {
  return {
    ok: false,
    exitCode: timedOut || aborted ? null : 1,
    timedOut,
    aborted,
    stdout: '',
    stderr: timedOut ? `${command} timed out` : aborted ? `${command} aborted` : '',
  }
}

function terminateChildProcess(child) {
  if (!child || child.exitCode !== null) return

  if (process.platform === 'win32' && Number.isInteger(child.pid)) {
    try {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.unref()
    } catch {
      // Fall through to the direct child kill.
    }
  }

  try {
    child.kill('SIGKILL')
  } catch {
    // Best-effort process termination.
  }
}

function runCommand(
  command,
  args = [],
  { cwd, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, signal } = {},
) {
  return new Promise((resolve) => {
    let settled = false
    let timedOut = false
    let aborted = false
    let stdout = ''
    let stderr = ''
    let child
    let timer
    let killFallbackTimer

    const abortHandler = () => {
      if (settled) return
      aborted = true
      clearTimeout(timer)
      terminateChildProcess(child)
      killFallbackTimer = setTimeout(() => {
        finish(createCommandFailureResult(command, { aborted: true }))
      }, 500)
    }

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(killFallbackTimer)
      signal?.removeEventListener?.('abort', abortHandler)
      resolve({
        ...result,
        timedOut: Boolean(result.timedOut ?? timedOut),
        aborted: Boolean(result.aborted ?? aborted),
        stdout: safeString(result.stdout || stdout),
        stderr: safeString(result.stderr || stderr),
      })
    }

    if (signal?.aborted) {
      aborted = true
      finish(createCommandFailureResult(command, { aborted: true }))
      return
    }

    try {
      child = spawn(command, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (error) {
      finish({
        ok: false,
        exitCode: null,
        timedOut: false,
        aborted: false,
        error,
      })
      return
    }

    signal?.addEventListener?.('abort', abortHandler, { once: true })
    if (signal?.aborted) {
      abortHandler()
      return
    }

    timer = setTimeout(() => {
      if (settled) return
      timedOut = true
      terminateChildProcess(child)
      killFallbackTimer = setTimeout(() => {
        finish(createCommandFailureResult(command, { timedOut: true }))
      }, 500)
    }, Math.max(100, timeoutMs))

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
      if (stdout.length > MAX_SAFE_DIAGNOSTIC_TEXT * 2) stdout = stdout.slice(0, MAX_SAFE_DIAGNOSTIC_TEXT * 2)
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      if (stderr.length > MAX_SAFE_DIAGNOSTIC_TEXT * 2) stderr = stderr.slice(0, MAX_SAFE_DIAGNOSTIC_TEXT * 2)
    })

    child.on('error', (error) => {
      finish({
        ok: false,
        exitCode: null,
        timedOut,
        aborted,
        error,
      })
    })

    child.on('close', (exitCode) => {
      finish({
        ok: !timedOut && !aborted && Number(exitCode) === 0,
        exitCode: Number.isFinite(Number(exitCode)) ? Number(exitCode) : null,
        timedOut,
        aborted,
      })
    })
  })
}

async function checkBinary(binary, args, unavailableCode, timeoutMs, signal) {
  const result = await runCommand(binary, args, { timeoutMs, signal })
  if (result.ok) return { available: true, diagnostics: [] }

  return {
    available: false,
    aborted: result.aborted,
    diagnostics: [
      safeDiagnostic(unavailableCode, `${binary} is unavailable`, {
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        errorCode: safeString(result.error?.code, 120) || null,
        stderr: result.stderr,
      }),
    ],
  }
}

async function cleanupDirectory(directory) {
  if (!directory) return
  await fs.rm(directory, { recursive: true, force: true })
}

async function findDownloadedVideo(workDir) {
  const entries = await fs.readdir(workDir, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(workDir, entry.name))
    .filter((filePath) => !/frame-\d+\.jpe?g$/iu.test(filePath))

  for (const filePath of files) {
    const stat = await fs.stat(filePath)
    if (stat.size > 0) return filePath
  }
  return null
}

function remainingBudget(startedAt, limits = {}, fallbackMs = DEFAULT_BUDGET_MS) {
  const budgetMs = safeNumber(limits.maxExtractionBudgetMs, fallbackMs) || fallbackMs
  return Math.max(0, budgetMs - (Date.now() - startedAt))
}

function liveFrameTimeoutResult({
  diagnostics = [],
  durationSeconds = 0,
  maxDurationSeconds = DEFAULT_MAX_DURATION_SECONDS,
  budgetMs = DEFAULT_BUDGET_MS,
  sampleStrategy = UNIFORM_SAMPLE_STRATEGY,
  maxFrames = DEFAULT_MAX_FRAMES,
  sampledTimestamps = [],
} = {}) {
  return {
    status: 'ERROR',
    reason: 'FRAME_EXTRACTION_TIMEOUT',
    durationSeconds: durationSeconds || null,
    maxDurationSeconds,
    budgetMs,
    sampleStrategy,
    maxFrames,
    sampledTimestamps,
    frames: [],
    diagnostics: [
      ...diagnostics,
      safeDiagnostic('LIVE_FRAME_EXTRACTOR_TIMEOUT', 'Track 2 live frame extraction was aborted', {
        durationSeconds: durationSeconds || null,
        maxDurationSeconds,
        budgetMs,
        sampleStrategy,
        maxFrames,
        frameCount: 0,
        sampledTimestamps,
      }),
    ],
  }
}

export function createLiveTrack2FrameExtractor(options = {}) {
  const ytDlpBin = safeString(options.ytDlpBin ?? process.env.TRACK2_YTDLP_BIN ?? 'yt-dlp', 260)
  const ffmpegBin = safeString(options.ffmpegBin ?? process.env.TRACK2_FFMPEG_BIN ?? 'ffmpeg', 260)
  const tmpRoot = options.tmpRoot || os.tmpdir()
  const registerCleanup = typeof options.registerCleanup === 'function' ? options.registerCleanup : null
  const commandTimeoutMs = safeNumber(options.commandTimeoutMs, DEFAULT_COMMAND_TIMEOUT_MS)

  return async function track2FrameExtractor(context = {}) {
    const startedAt = Date.now()
    const sourceUrl = safeString(context.sourceUrl, 1000)
    const metadata = context.metadata || {}
    const limits = context.limits || {}
    const signal = context.signal
    const diagnostics = []
    const durationSeconds = getDurationSeconds(metadata)
    const maxDurationSeconds = boundedMaxDurationSeconds(limits.maxVideoDurationSeconds)
    const budgetMs = safeNumber(limits.maxExtractionBudgetMs, DEFAULT_BUDGET_MS) || DEFAULT_BUDGET_MS
    const sampleStrategy = normalizedSampleStrategy(limits.sampleStrategy)
    const maxFrames = Math.floor(Math.max(1, Math.min(
      safeNumber(limits.maxFrames, DEFAULT_MAX_FRAMES),
      DEFAULT_MAX_FRAMES,
    )))
    const timeoutResult = (details = {}) => liveFrameTimeoutResult({
      durationSeconds,
      maxDurationSeconds,
      budgetMs,
      sampleStrategy,
      maxFrames,
      ...details,
    })

    if (signal?.aborted) {
      return timeoutResult()
    }

    if (!sourceUrl) {
      return {
        status: 'UNAVAILABLE',
        reason: 'FRAME_PROVIDER_UNAVAILABLE',
        sampledTimestamps: [],
        frames: [],
        diagnostics: [safeDiagnostic('MISSING_SOURCE_URL', 'Track 2 frame provider needs a source URL')],
      }
    }

    const ytDlpCheck = await checkBinary(
      ytDlpBin,
      ['--version'],
      'YTDLP_UNAVAILABLE',
      commandTimeoutMs,
      signal,
    )
    diagnostics.push(...ytDlpCheck.diagnostics)
    if (ytDlpCheck.aborted || signal?.aborted) {
      return timeoutResult({ diagnostics })
    }
    if (!ytDlpCheck.available) {
      return {
        status: 'UNAVAILABLE',
        reason: 'FRAME_PROVIDER_UNAVAILABLE',
        sampledTimestamps: [],
        frames: [],
        diagnostics,
      }
    }

    const ffmpegCheck = await checkBinary(
      ffmpegBin,
      ['-version'],
      'FFMPEG_UNAVAILABLE',
      commandTimeoutMs,
      signal,
    )
    diagnostics.push(...ffmpegCheck.diagnostics)
    if (ffmpegCheck.aborted || signal?.aborted) {
      return timeoutResult({ diagnostics })
    }
    if (!ffmpegCheck.available) {
      return {
        status: 'UNAVAILABLE',
        reason: 'FRAME_PROVIDER_UNAVAILABLE',
        sampledTimestamps: [],
        frames: [],
        diagnostics,
      }
    }

    let workDir = ''
    let keepForOcr = false

    try {
      workDir = await fs.mkdtemp(path.join(tmpRoot, 'shorts-track2-ocr-'))
      registerCleanup?.(workDir)

      const downloadTimeoutMs = Math.min(
        safeNumber(options.downloadTimeoutMs, DEFAULT_DOWNLOAD_TIMEOUT_MS),
        Math.max(1000, remainingBudget(startedAt, limits) - 1000),
      )
      const outputTemplate = path.join(workDir, 'input.%(ext)s')
      const download = await runCommand(ytDlpBin, [
        '--no-playlist',
        '--quiet',
        '--no-warnings',
        '--socket-timeout',
        '10',
        '--retries',
        '1',
        '--fragment-retries',
        '1',
        '-f',
        VIDEO_FORMAT,
        '-o',
        outputTemplate,
        sourceUrl,
      ], { timeoutMs: downloadTimeoutMs, signal })

      if (!download.ok) {
        await cleanupDirectory(workDir)
        if (download.aborted || download.timedOut || signal?.aborted) {
          return timeoutResult({
            diagnostics,
          })
        }
        return {
          status: 'ERROR',
          reason: 'FRAME_PROVIDER_ERROR',
          sampledTimestamps: [],
          frames: [],
          diagnostics: [
            ...diagnostics,
            safeDiagnostic('YTDLP_DOWNLOAD_FAILED', 'yt-dlp could not download the Shorts video', {
              exitCode: download.exitCode,
              timedOut: download.timedOut,
              aborted: download.aborted,
              durationSeconds: durationSeconds || null,
              maxDurationSeconds,
              budgetMs,
              sampleStrategy,
              maxFrames,
              stderr: download.stderr,
              errorCode: safeString(download.error?.code, 120) || null,
            }),
          ],
        }
      }

      const videoPath = await findDownloadedVideo(workDir)
      if (!videoPath) {
        await cleanupDirectory(workDir)
        return {
          status: 'ERROR',
          reason: 'FRAME_PROVIDER_ERROR',
          sampledTimestamps: [],
          frames: [],
          diagnostics: [
            ...diagnostics,
            safeDiagnostic('YTDLP_NO_VIDEO_FILE', 'yt-dlp completed without a readable video file'),
          ],
        }
      }

      const sampledTimestamps = buildSampleTimestamps(metadata, limits)
      const frames = []

      for (const [index, timestampSeconds] of sampledTimestamps.entries()) {
        if (signal?.aborted) {
          return timeoutResult({
            diagnostics,
            sampledTimestamps,
          })
        }
        const budgetLeft = remainingBudget(startedAt, limits)
        if (budgetLeft <= 500) {
          return timeoutResult({
            diagnostics,
            sampledTimestamps,
          })
        }

        const framePath = path.join(workDir, `frame-${String(index).padStart(2, '0')}.jpg`)
        const ffmpeg = await runCommand(ffmpegBin, [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-ss',
          String(timestampSeconds),
          '-i',
          videoPath,
          '-frames:v',
          '1',
          '-q:v',
          '3',
          framePath,
        ], {
          timeoutMs: Math.min(safeNumber(options.frameTimeoutMs, DEFAULT_FRAME_TIMEOUT_MS), budgetLeft),
          signal,
        })

        if (!ffmpeg.ok) {
          if (ffmpeg.aborted || signal?.aborted) {
            return timeoutResult({
              diagnostics,
              sampledTimestamps,
            })
          }
          diagnostics.push(safeDiagnostic('FFMPEG_FRAME_EXTRACT_FAILED', 'ffmpeg could not extract a frame', {
            timestampSeconds,
            exitCode: ffmpeg.exitCode,
            timedOut: ffmpeg.timedOut,
            aborted: ffmpeg.aborted,
            stderr: ffmpeg.stderr,
          }))
          continue
        }

        const stat = await fs.stat(framePath)
        if (stat.size <= 0) {
          diagnostics.push(safeDiagnostic('FFMPEG_EMPTY_FRAME', 'ffmpeg produced an empty frame', {
            timestampSeconds,
          }))
          continue
        }

        frames.push({
          frameIndex: frames.length,
          timestampSeconds,
          imagePath: framePath,
          mimeType: 'image/jpeg',
          sizeBytes: stat.size,
        })
      }

      if (frames.length === 0) {
        await cleanupDirectory(workDir)
        return {
          status: 'ERROR',
          reason: 'FRAME_PROVIDER_ERROR',
          sampledTimestamps,
          frames: [],
          diagnostics: [
            ...diagnostics,
            safeDiagnostic('NO_FRAMES_EXTRACTED', 'No readable OCR frames were extracted'),
          ],
        }
      }

      keepForOcr = true
      return {
        status: 'OK',
        reason: 'LIVE_FRAMES_EXTRACTED',
        sampledTimestamps,
        frames,
        diagnostics: [
          ...diagnostics,
          safeDiagnostic('LIVE_FRAME_EXTRACTOR_OK', 'Track 2 live frame extractor produced frames', {
            durationSeconds: durationSeconds || null,
            maxDurationSeconds,
            budgetMs,
            sampleStrategy,
            maxFrames,
            frameCount: frames.length,
            sampledTimestamps,
          }),
        ],
      }
    } catch (error) {
      if (workDir) await cleanupDirectory(workDir)
      if (signal?.aborted) {
        return timeoutResult({
          diagnostics,
        })
      }
      return {
        status: 'ERROR',
        reason: 'FRAME_PROVIDER_ERROR',
        sampledTimestamps: [],
        frames: [],
        diagnostics: [
          ...diagnostics,
          safeErrorDiagnostic('FRAME_PROVIDER_ERROR', error),
        ],
      }
    } finally {
      if (workDir && !keepForOcr) {
        try {
          await cleanupDirectory(workDir)
        } catch {
          // Best-effort temp cleanup.
        }
      }
    }
  }
}

export const __shortsTrack2LiveProviderTestUtils = {
  buildSampleTimestamps,
  boundedMaxDurationSeconds,
  getDurationSeconds,
  headMidTailTimestamps,
  normalizedSampleStrategy,
  runCommand,
}

function getOptionOrEnv(options, optionName, envNames) {
  if (Object.prototype.hasOwnProperty.call(options, optionName)) return options[optionName]
  for (const envName of envNames) {
    if (process.env[envName]) return process.env[envName]
  }
  return ''
}

function extractVisionText(response = {}) {
  return (
    response.fullTextAnnotation?.text ||
    response.textAnnotations?.[0]?.description ||
    ''
  )
}

function base64UrlJson(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

async function readServiceAccountCredentials(credentialsPath) {
  let rawCredentials
  try {
    rawCredentials = await fs.readFile(credentialsPath, 'utf8')
  } catch {
    const error = new Error('Google service account credentials could not be read')
    error.code = 'GOOGLE_CREDENTIALS_READ_FAILED'
    throw error
  }

  try {
    return JSON.parse(rawCredentials)
  } catch {
    const error = new Error('Google service account credentials JSON is invalid')
    error.code = 'GOOGLE_CREDENTIALS_INVALID_JSON'
    throw error
  }
}

async function requestServiceAccountAccessToken({ credentialsPath, fetchImpl, cachedToken }) {
  if (cachedToken?.accessToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken

  const credentials = await readServiceAccountCredentials(credentialsPath)
  const clientEmail = safeString(credentials.client_email, 320)
  const privateKey = String(credentials.private_key || '')
  if (!clientEmail || !privateKey) {
    const error = new Error('Google service account credentials are incomplete')
    error.code = 'GOOGLE_CREDENTIALS_INCOMPLETE'
    throw error
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  const unsignedJwt = [
    base64UrlJson({ alg: 'RS256', typ: 'JWT' }),
    base64UrlJson({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  ].join('.')

  let signature
  try {
    signature = createSign('RSA-SHA256').update(unsignedJwt).sign(privateKey, 'base64url')
  } catch {
    const error = new Error('Google service account credentials could not sign an auth request')
    error.code = 'GOOGLE_CREDENTIALS_SIGN_FAILED'
    throw error
  }

  const tokenResponse = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsignedJwt}.${signature}`,
    }).toString(),
  })

  const bodyText = await tokenResponse.text()
  if (!tokenResponse.ok) {
    const error = new Error('Google service account token request failed')
    error.code = 'GOOGLE_TOKEN_REQUEST_FAILED'
    error.httpStatus = tokenResponse.status
    throw error
  }

  let tokenPayload
  try {
    tokenPayload = JSON.parse(bodyText)
  } catch {
    const error = new Error('Google service account token response JSON is invalid')
    error.code = 'GOOGLE_TOKEN_INVALID_JSON'
    throw error
  }

  const accessToken = safeString(tokenPayload.access_token, 5000)
  if (!accessToken) {
    const error = new Error('Google service account token response did not include an access token')
    error.code = 'GOOGLE_TOKEN_MISSING'
    throw error
  }

  return {
    accessToken,
    expiresAt: Date.now() + Math.max(60, safeNumber(tokenPayload.expires_in, 3600) - 30) * 1000,
  }
}

export function createLiveTrack2OcrProvider(options = {}) {
  const fetchImpl = options.fetchImpl || options.fetch || globalThis.fetch
  const apiKey = safeString(getOptionOrEnv(options, 'googleVisionApiKey', [
    'GOOGLE_CLOUD_VISION_API_KEY',
    'GOOGLE_VISION_API_KEY',
  ]), 500)
  const credentialsPath = safeString(getOptionOrEnv(options, 'googleApplicationCredentials', [
    'GOOGLE_APPLICATION_CREDENTIALS',
  ]), 1000)
  const serviceAccountEnvPresent = Boolean(credentialsPath)
  const cleanupFrameDirectories =
    typeof options.cleanupFrameDirectories === 'function' ? options.cleanupFrameDirectories : null
  let cachedToken = null

  return async function track2OcrProvider(context = {}) {
    const frames = Array.isArray(context.frames) ? context.frames : []
    try {
      if (!apiKey && !credentialsPath) {
        return {
          status: 'UNAVAILABLE',
          reason: 'OCR_PROVIDER_UNAVAILABLE',
          textBlocks: [],
          diagnostics: [
            safeDiagnostic('OCR_PROVIDER_UNAVAILABLE', 'Google Vision OCR API key is not configured', {
              visionApiKeyEnvPresent: false,
              serviceAccountEnvPresent,
            }),
          ],
        }
      }

      if (typeof fetchImpl !== 'function') {
        return {
          status: 'UNAVAILABLE',
          reason: 'OCR_PROVIDER_UNAVAILABLE',
          textBlocks: [],
          diagnostics: [
            safeDiagnostic('OCR_FETCH_UNAVAILABLE', 'Fetch is unavailable for Google Vision OCR'),
          ],
        }
      }

      if (frames.length === 0) {
        return {
          status: 'OK',
          reason: 'OCR_NO_FRAMES',
          textBlocks: [],
          diagnostics: [],
        }
      }

      const requests = []
      const readableFrames = []
      const diagnostics = []

      for (const frame of frames.slice(0, DEFAULT_MAX_FRAMES)) {
        try {
          const bytes = await fs.readFile(frame.imagePath)
          requests.push({
            image: { content: bytes.toString('base64') },
            features: [{ type: 'TEXT_DETECTION' }],
          })
          readableFrames.push(frame)
        } catch (error) {
          diagnostics.push(safeErrorDiagnostic('OCR_FRAME_READ_FAILED', error, {
            frameIndex: safeNumber(frame.frameIndex, readableFrames.length),
          }))
        }
      }

      if (requests.length === 0) {
        return {
          status: 'ERROR',
          reason: 'OCR_PROVIDER_ERROR',
          textBlocks: [],
          diagnostics: [
            ...diagnostics,
            safeDiagnostic('OCR_NO_READABLE_FRAMES', 'No OCR frame files were readable'),
          ],
        }
      }

      let url = 'https://vision.googleapis.com/v1/images:annotate'
      const headers = { 'Content-Type': 'application/json' }
      if (apiKey) {
        url += `?key=${encodeURIComponent(apiKey)}`
      } else {
        cachedToken = await requestServiceAccountAccessToken({
          credentialsPath,
          fetchImpl,
          cachedToken,
        })
        headers.Authorization = `Bearer ${cachedToken.accessToken}`
      }

      const response = await fetchImpl(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ requests }),
        },
      )
      const bodyText = await response.text()

      if (!response.ok) {
        return {
          status: 'ERROR',
          reason: 'OCR_PROVIDER_ERROR',
          textBlocks: [],
          diagnostics: [
            ...diagnostics,
            safeDiagnostic('OCR_PROVIDER_HTTP_ERROR', 'Google Vision OCR returned an error', {
              httpStatus: response.status,
            }),
          ],
        }
      }

      let payload
      try {
        payload = JSON.parse(bodyText)
      } catch (error) {
        return {
          status: 'ERROR',
          reason: 'OCR_PROVIDER_ERROR',
          textBlocks: [],
          diagnostics: [
            ...diagnostics,
            safeErrorDiagnostic('OCR_PROVIDER_INVALID_JSON', error),
          ],
        }
      }

      const textBlocks = []
      const responses = Array.isArray(payload.responses) ? payload.responses : []
      responses.forEach((ocrResponse, index) => {
        const frame = readableFrames[index] || {}
        if (ocrResponse?.error) {
          diagnostics.push(safeDiagnostic('OCR_PROVIDER_FRAME_ERROR', 'Google Vision OCR rejected one frame', {
            frameIndex: safeNumber(frame.frameIndex, index),
          }))
          return
        }

        const text = safeString(extractVisionText(ocrResponse), 20000)
        if (!text) return
        textBlocks.push({
          frameIndex: safeNumber(frame.frameIndex, index),
          timestampSeconds: safeNumber(frame.timestampSeconds, 0),
          text,
          confidence: null,
        })
      })

      return {
        status: 'OK',
        reason: textBlocks.length ? 'OCR_TEXT_COLLECTED' : 'OCR_NO_TEXT',
        textBlocks,
        diagnostics: [
          ...diagnostics,
          safeDiagnostic('LIVE_OCR_PROVIDER_OK', 'Track 2 live OCR provider completed', {
            frameCount: readableFrames.length,
            textBlockCount: textBlocks.length,
          }),
        ],
      }
    } catch (error) {
      return {
        status: 'ERROR',
        reason: 'OCR_PROVIDER_ERROR',
        textBlocks: [],
        diagnostics: [safeErrorDiagnostic('OCR_PROVIDER_ERROR', error)],
      }
    } finally {
      if (cleanupFrameDirectories) {
        try {
          await cleanupFrameDirectories(frames)
        } catch {
          // Best-effort temp cleanup.
        }
      }
    }
  }
}

export function createTrack2LiveOcrProviderBundle(options = {}) {
  const cleanupDirs = new Set()
  const registerCleanup = (directory) => {
    if (directory) cleanupDirs.add(directory)
  }
  const cleanupTrack2LiveProviders = async () => {
    const directories = Array.from(cleanupDirs)
    cleanupDirs.clear()
    await Promise.all(directories.map((directory) => cleanupDirectory(directory).catch(() => {})))
  }
  const cleanupFrameDirectories = async (frames = []) => {
    const directories = new Set()
    for (const frame of frames) {
      const directory = frame?.imagePath ? path.dirname(frame.imagePath) : ''
      if (cleanupDirs.has(directory)) directories.add(directory)
    }
    for (const directory of directories) {
      cleanupDirs.delete(directory)
      await cleanupDirectory(directory)
    }
  }

  return {
    track2FrameExtractor: createLiveTrack2FrameExtractor({
      ...options,
      registerCleanup,
    }),
    track2OcrProvider: createLiveTrack2OcrProvider({
      ...options,
      cleanupFrameDirectories,
    }),
    cleanupTrack2LiveProviders,
  }
}

export default {
  createLiveTrack2FrameExtractor,
  createLiveTrack2OcrProvider,
  createTrack2LiveOcrProviderBundle,
}
