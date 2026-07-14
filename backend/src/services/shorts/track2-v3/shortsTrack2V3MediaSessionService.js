import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const backendRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const repositoryRoot = path.resolve(backendRoot, '..')

const PRIMARY_FORMAT = 'best[height<=720][ext=mp4]/best[height<=720]/best'
const FALLBACK_FORMAT = 'bv*[height<=720]+ba/b[height<=720]/best'
const STRATEGIES = Object.freeze([
  Object.freeze({ name: 'PRIMARY_FORMAT', format: PRIMARY_FORMAT }),
  Object.freeze({ name: 'FALLBACK_FORMAT', format: FALLBACK_FORMAT }),
])
const DETERMINISTIC_UNAVAILABLE_PATTERN =
  /(?:private video|video unavailable|has been removed|members-only|not available in your country|unsupported url|sign in to confirm your age|account associated with this video has been terminated)/iu

function safeString(value, maxLength = 1000) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function trustedYoutubeMediaUrl(value) {
  try {
    const parsed = new URL(safeString(value, 2000))
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    if (parsed.username || parsed.password) return false
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./u, '').replace(/\.$/u, '')
    const youtubeHost = hostname === 'youtube.com' || hostname.endsWith('.youtube.com')
    const shortHost = hostname === 'youtu.be' || hostname.endsWith('.youtu.be')
    if (!youtubeHost && !shortHost) return false
    const parts = parsed.pathname.split('/').filter(Boolean)
    const id = shortHost
      ? parts[0]
      : parts[0] === 'shorts'
        ? parts[1]
        : parsed.pathname === '/watch'
          ? parsed.searchParams.get('v')
          : null
    return /^[A-Za-z0-9_-]{6,32}$/u.test(String(id || ''))
  } catch {
    return false
  }
}

function finiteNumber(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function boundedInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed < min) return fallback
  return Math.min(parsed, max)
}

function sanitizeProviderError(error = {}, fallbackCode = 'MEDIA_ACQUISITION_FAILED') {
  return {
    provider: 'track2_v3_media',
    code: safeString(error.code || fallbackCode, 120),
    message: safeString(error.message || 'Track2 V3 media operation failed safely.', 500),
    strategy: safeString(error.strategy, 80) || null,
    attempt: Number.isFinite(Number(error.attempt)) ? Number(error.attempt) : null,
  }
}

function parseIsoDurationSeconds(value) {
  const text = safeString(value, 80)
  if (!text) return null
  const match = /^P(?:(\d+(?:\.\d+)?)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/iu.exec(text)
  if (!match) return null
  return Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 +
    Number(match[3] || 0) * 60 + Number(match[4] || 0)
}

function durationFromContext(context = {}) {
  const metadata = context.metadata || {}
  const seconds = finiteNumber(context.durationSeconds ?? metadata.durationSeconds, null)
  if (seconds !== null && seconds > 0) return seconds
  const milliseconds = finiteNumber(metadata.durationMs, null)
  if (milliseconds !== null && milliseconds > 0) return milliseconds / 1000
  return parseIsoDurationSeconds(metadata.duration)
}

async function existingFile(candidates = []) {
  for (const candidate of candidates.map((value) => safeString(value, 2000)).filter(Boolean)) {
    if (!path.isAbsolute(candidate)) return candidate
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // Try the next configured/local executable.
    }
  }
  return null
}

async function existingFiles(candidates = []) {
  const results = await Promise.all(candidates.map((candidate) => existingFile([candidate])))
  return [...new Set(results.filter(Boolean))]
}

async function resolveBinaries(env = process.env) {
  const ytDlpExecutables = await existingFiles([
    env.TRACK2_YTDLP_BIN,
    path.join(repositoryRoot, 'ai-service', '.venv', 'Scripts', 'yt-dlp.exe'),
    'yt-dlp',
  ])
  return {
    ytDlpExecutable: ytDlpExecutables[0] || null,
    ytDlpExecutables,
    ffmpegExecutable: await existingFile([
      env.TRACK2_FFMPEG_BIN,
      'C:\\tool\\ffmpeg.exe',
      'ffmpeg',
    ]),
    ffprobeExecutable: await existingFile([
      env.TRACK2_FFPROBE_BIN,
      'C:\\tool\\ffprobe.exe',
      'ffprobe',
    ]),
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
      // Fall through to direct termination.
    }
  }
  try {
    child.kill('SIGKILL')
  } catch {
    // Best-effort process termination.
  }
}

function runCommand(command, args = [], {
  timeoutMs = 60000,
  signal,
  stdoutMaxBytes = 4000,
  stderrMaxBytes = 8000,
} = {}) {
  return new Promise((resolve) => {
    let child
    let settled = false
    let timedOut = false
    let aborted = false
    let stdout = ''
    let stderr = ''
    const stdoutLimit = boundedInteger(stdoutMaxBytes, 4000, { min: 1000, max: 1024 * 1024 })
    const stderrLimit = boundedInteger(stderrMaxBytes, 8000, { min: 1000, max: 256 * 1024 })
    let timer
    let killTimer

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(killTimer)
      signal?.removeEventListener?.('abort', onAbort)
      resolve({
        ...result,
        timedOut: Boolean(result.timedOut ?? timedOut),
        aborted: Boolean(result.aborted ?? aborted),
        stdout: safeString(result.stdout || stdout, stdoutLimit),
        stderr: safeString(result.stderr || stderr, stderrLimit),
      })
    }
    const onAbort = () => {
      if (settled) return
      aborted = true
      terminateChildProcess(child)
      killTimer = setTimeout(() => finish({ ok: false, exitCode: null }), 500)
    }

    if (!command) {
      finish({ ok: false, exitCode: null, errorCode: 'ENOENT' })
      return
    }
    if (signal?.aborted) {
      onAbort()
      return
    }
    try {
      child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      finish({ ok: false, exitCode: null, errorCode: error?.code || null })
      return
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
    timer = setTimeout(() => {
      if (settled) return
      timedOut = true
      terminateChildProcess(child)
      killTimer = setTimeout(() => finish({ ok: false, exitCode: null }), 500)
    }, Math.max(100, timeoutMs))
    child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-stdoutLimit) })
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-stderrLimit) })
    child.on('error', (error) => finish({
      ok: false,
      exitCode: null,
      errorCode: error?.code || null,
    }))
    child.on('close', (exitCode) => finish({
      ok: !timedOut && !aborted && Number(exitCode) === 0,
      exitCode: Number.isFinite(Number(exitCode)) ? Number(exitCode) : null,
    }))
  })
}

async function findAcquiredVideo(workDir, prefix) {
  const entries = await fs.readdir(workDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.startsWith(prefix) ||
      /\.(?:part|ytdl)$/iu.test(entry.name) ||
      /\.info\.json$/iu.test(entry.name)
    ) {
      continue
    }
    const filePath = path.join(workDir, entry.name)
    const stat = await fs.stat(filePath).catch(() => null)
    if (stat?.size > 0) return filePath
  }
  return null
}


function normalizedMediaMetadata(payload = {}, source = 'provider') {
  const durationSeconds = finiteNumber(payload?.durationSeconds ?? payload?.duration, null)
  const chapters = (Array.isArray(payload?.chapters) ? payload.chapters : [])
    .map((chapter) => ({
      title: safeString(chapter?.title, 500),
      startSeconds: finiteNumber(chapter?.startSeconds ?? chapter?.start_time, null),
      endSeconds: finiteNumber(chapter?.endSeconds ?? chapter?.end_time, null),
    }))
    .filter((chapter) => chapter.title)
    .slice(0, 40)
  return {
    status: 'OK',
    reason: 'MEDIA_METADATA_COLLECTED',
    source: safeString(source, 80) || 'provider',
    title: safeString(payload?.title, 1000),
    description: safeString(payload?.description, 12000),
    channelTitle: safeString(payload?.channelTitle || payload?.channel || payload?.uploader, 1000),
    chapters,
    durationSeconds: durationSeconds !== null && durationSeconds > 0 ? durationSeconds : null,
    providerErrors: [],
  }
}

async function readAcquiredInfoJson(workDir) {
  const entries = await fs.readdir(workDir, { withFileTypes: true }).catch(() => [])
  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.info.json'))
    .map((entry) => path.join(workDir, entry.name))
  for (const filePath of candidates) {
    const stat = await fs.stat(filePath).catch(() => null)
    if (!stat?.isFile() || stat.size <= 0 || stat.size > 2 * 1024 * 1024) continue
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8'))
    } catch {
      // Try another bounded info JSON file if present.
    }
  }
  return null
}

function acquisitionFailure(commandResult = {}, strategy, attempt) {
  const stderr = safeString(commandResult.stderr, 8000)
  if (commandResult.timedOut || commandResult.aborted) {
    return sanitizeProviderError({
      code: 'MEDIA_ACQUISITION_TIMEOUT',
      message: 'Track2 V3 media acquisition timed out.',
      strategy,
      attempt,
    })
  }
  if (commandResult.errorCode === 'ENOENT' || commandResult.exitCode == null) {
    return sanitizeProviderError({
      code: 'MEDIA_PROVIDER_UNAVAILABLE',
      message: 'The local media acquisition executable is unavailable.',
      strategy,
      attempt,
    })
  }
  if (DETERMINISTIC_UNAVAILABLE_PATTERN.test(stderr)) {
    return sanitizeProviderError({
      code: 'MEDIA_UNAVAILABLE',
      message: 'The source media is deterministically unavailable.',
      strategy,
      attempt,
    })
  }
  return sanitizeProviderError({
    code: 'MEDIA_ACQUISITION_FAILED',
    message: 'Track2 V3 media acquisition failed safely.',
    strategy,
    attempt,
  })
}

function isDeterministicFailure(error = {}) {
  return ['MEDIA_PROVIDER_UNAVAILABLE', 'MEDIA_UNAVAILABLE'].includes(error.code)
}

async function validateMediaPath(filePath) {
  const resolved = safeString(filePath, 2000)
  if (!resolved) return null
  const stat = await fs.stat(resolved).catch(() => null)
  return stat?.isFile() && stat.size > 0 ? resolved : null
}

export function createShortsTrack2V3MediaSession({
  context = {},
  config = {},
  deps = {},
  tmpRoot = '',
} = {}) {
  const sourceUrl = safeString(context.sourceUrl || context.url || context.metadata?.url, 2000)
  const videoId = safeString(context.videoId || context.metadata?.videoId, 160) || null
  const maxAttempts = boundedInteger(config.mediaAcquisitionMaxAttempts, 2, { min: 1, max: 2 })
  const acquisitionTimeoutMs = boundedInteger(
    config.mediaAcquisitionTimeoutMs,
    60000,
    { min: 1000, max: 120000 },
  )
  const env = deps.env || process.env
  const requestSignal = deps.signal || null
  const commandRunner = typeof deps.track2V3MediaCommandRunner === 'function'
    ? deps.track2V3MediaCommandRunner
    : runCommand
  const acquisitionProvider = typeof deps.track2V3MediaAcquisitionProvider === 'function'
    ? deps.track2V3MediaAcquisitionProvider
    : null
  const durationProvider = typeof deps.track2V3MediaDurationProvider === 'function'
    ? deps.track2V3MediaDurationProvider
    : null
  const audioProvider = typeof deps.track2V3MediaAudioExtractor === 'function'
    ? deps.track2V3MediaAudioExtractor
    : null
  const metadataProvider = typeof deps.track2V3MediaMetadataProvider === 'function'
    ? deps.track2V3MediaMetadataProvider
    : null
  const frameProvider = typeof deps.track2V3MediaFrameExtractor === 'function'
    ? deps.track2V3MediaFrameExtractor
    : null

  let workDir = ''
  let videoPromise = null
  let videoResult = null
  let metadataPromise = null
  let metadataResult = null
  let durationPromise = null
  let durationResult = null
  let audioPromise = null
  let audioResult = null
  const audioWindowPromises = new Map()
  const audioWindowResults = new Map()
  const framePromises = new Map()
  const frameResults = new Map()
  let binariesPromise = null
  let acquisitionStartedAt = null
  let acquisitionRuntimeMs = 0
  let reuseCount = 0
  let metadataCalled = false
  let frameExtractionCalled = false
  let frameExtractionRuntimeMs = 0
  let frameBatchCounter = 0
  let audioCalled = false
  let audioWindowCalled = false
  let audioWindowSecondsProcessed = 0
  let cleaned = false
  const consumers = new Set()
  const attempts = []
  const providerErrors = []

  const ensureWorkDir = async () => {
    if (workDir) return workDir
    const root = safeString(tmpRoot || deps.tmpDir, 2000) || os.tmpdir()
    await fs.mkdir(root, { recursive: true })
    workDir = await fs.mkdtemp(path.join(root, 'shorts-track2-v3-media-'))
    return workDir
  }
  const binaries = () => {
    if (!binariesPromise) binariesPromise = resolveBinaries(env)
    return binariesPromise
  }

  const acquire = async () => {
    acquisitionStartedAt = Date.now()
    if (!sourceUrl) {
      const error = sanitizeProviderError({
        code: 'MEDIA_SOURCE_URL_MISSING',
        message: 'Track2 V3 media acquisition needs a source URL.',
      })
      providerErrors.push(error)
      acquisitionRuntimeMs = Date.now() - acquisitionStartedAt
      return { status: 'UNAVAILABLE', reason: error.code, localVideoPath: null }
    }
    if (!acquisitionProvider && !trustedYoutubeMediaUrl(sourceUrl)) {
      const error = sanitizeProviderError({
        code: 'MEDIA_SOURCE_URL_REJECTED',
        message: 'Track2 V3 only invokes the media downloader for trusted YouTube URLs.',
      })
      providerErrors.push(error)
      acquisitionRuntimeMs = Date.now() - acquisitionStartedAt
      return { status: 'UNAVAILABLE', reason: error.code, localVideoPath: null }
    }

    const directory = await ensureWorkDir()
    const resolvedBinaries = await binaries()
    const deadline = acquisitionStartedAt + acquisitionTimeoutMs
    for (let index = 0; index < Math.min(maxAttempts, STRATEGIES.length); index += 1) {
      const strategy = STRATEGIES[index]
      const attempt = index + 1
      const attemptStartedAt = Date.now()
      const remainingMs = Math.max(0, deadline - attemptStartedAt)
      if (remainingMs < 1000) {
        const error = sanitizeProviderError({
          code: 'MEDIA_ACQUISITION_TIMEOUT',
          message: 'Track2 V3 media acquisition exhausted its total budget.',
          strategy: strategy.name,
          attempt,
        })
        attempts.push({
          attempt,
          strategy: strategy.name,
          startedAt: new Date(attemptStartedAt).toISOString(),
          runtimeMs: 0,
          status: 'ERROR',
          errorCode: error.code,
        })
        providerErrors.push(error)
        break
      }

      let providerResult
      if (acquisitionProvider) {
        try {
          providerResult = await acquisitionProvider({
            sourceUrl,
            videoId,
            strategy: strategy.name,
            format: strategy.format,
            attempt,
            workDir: directory,
            timeoutMs: remainingMs,
          })
        } catch (error) {
          providerResult = {
            status: 'ERROR',
            reason: safeString(error?.code || 'MEDIA_ACQUISITION_FAILED', 120),
          }
        }
      } else if (!resolvedBinaries.ytDlpExecutable) {
        providerResult = { status: 'UNAVAILABLE', reason: 'MEDIA_PROVIDER_UNAVAILABLE' }
      } else {
        const prefix = `video-${attempt}`
        const ffmpegLocation = path.isAbsolute(resolvedBinaries.ffmpegExecutable || '')
          ? ['--ffmpeg-location', path.dirname(resolvedBinaries.ffmpegExecutable)]
          : []
        const downloadArgs = [
          '--no-playlist',
          '--no-progress',
          '--no-warnings',
          '--socket-timeout', '10',
          '--retries', '1',
          '--fragment-retries', '1',
          '--write-info-json',
          '-f', strategy.format,
          ...ffmpegLocation,
          '--output', path.join(directory, `${prefix}.%(ext)s`),
          sourceUrl,
        ]
        let commandResult = null
        for (const executable of resolvedBinaries.ytDlpExecutables || [resolvedBinaries.ytDlpExecutable]) {
          commandResult = await commandRunner(executable, downloadArgs, {
            timeoutMs: remainingMs,
            signal: requestSignal,
          })
          if (!['EACCES', 'EPERM', 'ENOENT'].includes(commandResult?.errorCode)) break
        }
        commandResult ||= { ok: false, exitCode: null, errorCode: 'ENOENT' }
        const localVideoPath = commandResult.ok
          ? await findAcquiredVideo(directory, prefix)
          : null
        providerResult = commandResult.ok && localVideoPath
          ? { status: 'OK', reason: 'MEDIA_ACQUIRED', localVideoPath }
          : {
              status: 'ERROR',
              reason: 'MEDIA_ACQUISITION_FAILED',
              error: acquisitionFailure(commandResult, strategy.name, attempt),
            }
      }

      const localVideoPath = await validateMediaPath(
        providerResult?.localVideoPath || providerResult?.videoPath,
      )
      if (String(providerResult?.status || '').toUpperCase() === 'OK' && localVideoPath) {
        if (!metadataResult) {
          const acquiredMetadata = providerResult?.metadata || await readAcquiredInfoJson(directory)
          if (acquiredMetadata && typeof acquiredMetadata === 'object') {
            metadataResult = normalizedMediaMetadata(
              acquiredMetadata,
              providerResult?.metadata ? 'acquisition_provider' : 'yt_dlp_info_json',
            )
          }
        }
        attempts.push({
          attempt,
          strategy: strategy.name,
          startedAt: new Date(attemptStartedAt).toISOString(),
          runtimeMs: Date.now() - attemptStartedAt,
          status: 'OK',
          errorCode: null,
        })
        acquisitionRuntimeMs = Date.now() - acquisitionStartedAt
        return {
          status: 'OK',
          reason: 'MEDIA_ACQUIRED',
          localVideoPath,
          successfulStrategy: strategy.name,
        }
      }

      const error = providerResult?.error
        ? sanitizeProviderError({
            ...providerResult.error,
            strategy: strategy.name,
            attempt,
          })
        : sanitizeProviderError({
            code: providerResult?.reason || 'MEDIA_ACQUISITION_FAILED',
            message: providerResult?.reason === 'MEDIA_PROVIDER_UNAVAILABLE'
              ? 'The local media acquisition executable is unavailable.'
              : 'Track2 V3 media acquisition failed safely.',
            strategy: strategy.name,
            attempt,
          })
      attempts.push({
        attempt,
        strategy: strategy.name,
        startedAt: new Date(attemptStartedAt).toISOString(),
        runtimeMs: Date.now() - attemptStartedAt,
        status: 'ERROR',
        errorCode: error.code,
      })
      providerErrors.push(error)
      if (isDeterministicFailure(error)) break
    }

    acquisitionRuntimeMs = Date.now() - acquisitionStartedAt
    const finalError = providerErrors.at(-1) || sanitizeProviderError()
    return {
      status: finalError.code === 'MEDIA_PROVIDER_UNAVAILABLE' ? 'UNAVAILABLE' : 'ERROR',
      reason: finalError.code,
      localVideoPath: null,
    }
  }

  const ensureMetadata = async () => {
    metadataCalled = true
    if (metadataResult) return metadataResult
    if (metadataPromise) return metadataPromise
    metadataPromise = (async () => {
      const contextMetadata = context.metadata || {}
      const existing = {
        title: safeString(context.title || contextMetadata.title, 1000),
        description: safeString(
          context.description || contextMetadata.description || contextMetadata.descriptionRawFromYoutube,
          12000,
        ),
        channelTitle: safeString(context.channelTitle || contextMetadata.channelTitle, 1000),
        durationSeconds: durationFromContext(context),
      }
      if (existing.title || existing.description || existing.durationSeconds !== null) {
        metadataResult = {
          status: 'OK',
          reason: 'MEDIA_METADATA_FROM_CONTEXT',
          source: 'context',
          ...existing,
          providerErrors: [],
        }
        return metadataResult
      }

      if (videoPromise) {
        await videoPromise
        if (metadataResult) return metadataResult
      }

      let provided
      if (metadataProvider) {
        try {
          provided = await metadataProvider({ sourceUrl, videoId })
        } catch {
          provided = { status: 'ERROR', reason: 'MEDIA_METADATA_PROVIDER_ERROR' }
        }
      } else {
        if (!trustedYoutubeMediaUrl(sourceUrl)) {
          provided = { status: 'UNAVAILABLE', reason: 'MEDIA_SOURCE_URL_REJECTED' }
        } else {
          const resolvedBinaries = await binaries()
          if (!resolvedBinaries.ytDlpExecutable) {
          provided = { status: 'UNAVAILABLE', reason: 'MEDIA_PROVIDER_UNAVAILABLE' }
        } else {
          const result = await commandRunner(resolvedBinaries.ytDlpExecutable, [
            '--no-playlist',
            '--no-warnings',
            '--skip-download',
            '--dump-single-json',
            sourceUrl,
          ], {
            timeoutMs: Math.min(8000, acquisitionTimeoutMs),
            stdoutMaxBytes: 512 * 1024,
            stderrMaxBytes: 32 * 1024,
          })
          if (!result.ok) {
            provided = {
              status: result.errorCode === 'ENOENT' ? 'UNAVAILABLE' : 'ERROR',
              reason: result.errorCode === 'ENOENT'
                ? 'MEDIA_PROVIDER_UNAVAILABLE'
                : result.timedOut
                  ? 'MEDIA_METADATA_TIMEOUT'
                  : 'MEDIA_METADATA_PROVIDER_ERROR',
            }
          } else {
            try {
              const payload = JSON.parse(result.stdout)
              provided = {
                status: 'OK',
                reason: 'MEDIA_METADATA_COLLECTED',
                source: 'yt_dlp',
                title: payload.title,
                description: payload.description,
                channelTitle: payload.channel || payload.uploader,
                durationSeconds: payload.duration,
              }
            } catch {
              provided = { status: 'ERROR', reason: 'MEDIA_METADATA_INVALID_JSON' }
            }
          }
        }
        }
      }

      const status = String(provided?.status || '').toUpperCase()
      if (status !== 'OK') {
        const reason = safeString(provided?.reason || 'MEDIA_METADATA_PROVIDER_ERROR', 120)
        const error = sanitizeProviderError({
          code: reason,
          message: 'Track2 V3 metadata bootstrap failed safely.',
        })
        metadataResult = {
          status: status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'ERROR',
          reason,
          source: null,
          title: '',
          description: '',
          channelTitle: '',
          durationSeconds: null,
          providerErrors: [error],
        }
        return metadataResult
      }

      metadataResult = {
        ...normalizedMediaMetadata(provided, provided?.source || 'provider'),
        reason: safeString(provided?.reason || 'MEDIA_METADATA_COLLECTED', 120),
      }
      return metadataResult
    })()
    return metadataPromise
  }

  const normalizeFrameTimestamps = (values = [], maxFrames = 60, durationSeconds = null) => {
    const limit = boundedInteger(maxFrames, 60, { min: 1, max: 120 })
    const seen = new Set()
    const result = []
    for (const value of Array.isArray(values) ? values : []) {
      let timestamp = finiteNumber(value, null)
      if (timestamp === null || timestamp < 0) continue
      if (durationSeconds !== null && durationSeconds > 0) {
        timestamp = Math.min(timestamp, Math.max(0, durationSeconds - 0.05))
      }
      timestamp = Math.round(timestamp * 1000) / 1000
      const key = timestamp.toFixed(3)
      if (seen.has(key)) continue
      seen.add(key)
      result.push(timestamp)
      if (result.length >= limit) break
    }
    return result
  }

  const ensureFrames = async ({
    sampledTimestamps = [],
    maxFrames = 60,
    timeoutMs = 30000,
    consumer = 'visual_normal',
    signal,
  } = {}) => {
    const duration = await ensureDuration()
    const timestamps = normalizeFrameTimestamps(
      sampledTimestamps,
      maxFrames,
      duration?.status === 'OK' ? duration.durationSeconds : null,
    )
    const key = timestamps.map((value) => value.toFixed(3)).join(',') || 'none'
    if (framePromises.has(key)) {
      reuseCount += 1
      return framePromises.get(key)
    }
    frameExtractionCalled = true
    const promise = (async () => {
      const startedAt = Date.now()
      const video = await ensureVideo({ consumer, signal: signal || requestSignal })
      if (video.status !== 'OK') {
        const reason = safeString(video.reason || 'FRAME_MEDIA_ACQUISITION_FAILED', 120)
        const result = {
          status: video.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'ERROR',
          reason,
          sampledTimestamps: timestamps,
          frames: [],
          diagnostics: [{ code: reason, message: 'Shared media video is unavailable for frame extraction.' }],
        }
        frameResults.set(key, result)
        frameExtractionRuntimeMs += Date.now() - startedAt
        return result
      }
      if (!timestamps.length) {
        const result = {
          status: 'OK',
          reason: 'FRAME_EXTRACTION_NO_TIMESTAMPS',
          sampledTimestamps: [],
          frames: [],
          diagnostics: [],
        }
        frameResults.set(key, result)
        frameExtractionRuntimeMs += Date.now() - startedAt
        return result
      }

      const directory = await ensureWorkDir()
      const batchId = frameBatchCounter++
      let provided
      if (frameProvider) {
        try {
          provided = await frameProvider({
            localVideoPath: video.localVideoPath,
            sampledTimestamps: timestamps,
            maxFrames: timestamps.length,
            timeoutMs,
            workDir: directory,
            consumer,
            signal,
          })
        } catch {
          provided = { status: 'ERROR', reason: 'FRAME_EXTRACTION_PROVIDER_ERROR', frames: [] }
        }
      } else {
        const resolvedBinaries = await binaries()
        if (!resolvedBinaries.ffmpegExecutable) {
          provided = { status: 'UNAVAILABLE', reason: 'FRAME_PROVIDER_UNAVAILABLE', frames: [] }
        } else {
          const deadline = startedAt + Math.max(1000, Number(timeoutMs) || 30000)
          const frames = new Array(timestamps.length)
          let nextIndex = 0
          const worker = async () => {
            while (true) {
              const index = nextIndex
              nextIndex += 1
              if (index >= timestamps.length) return
              if (signal?.aborted) return
              const remainingMs = Math.max(0, deadline - Date.now())
              if (remainingMs < 250) return
              const timestampSeconds = timestamps[index]
              const framePath = path.join(
                directory,
                `visual-${String(batchId).padStart(3, '0')}-${String(index).padStart(3, '0')}.jpg`,
              )
              const extracted = await commandRunner(resolvedBinaries.ffmpegExecutable, [
                '-hide_banner', '-loglevel', 'error', '-y',
                '-ss', String(timestampSeconds),
                '-i', video.localVideoPath,
                '-frames:v', '1',
                '-q:v', '3',
                framePath,
              ], {
                timeoutMs: Math.min(8000, remainingMs),
                signal,
              })
              if (!extracted.ok) continue
              const stat = await fs.stat(framePath).catch(() => null)
              if (!stat?.isFile() || stat.size <= 0) continue
              frames[index] = {
                frameIndex: index,
                timestampSeconds,
                imagePath: framePath,
                mimeType: 'image/jpeg',
                sizeBytes: stat.size,
              }
            }
          }
          const workerCount = Math.min(4, timestamps.length)
          await Promise.all(Array.from({ length: workerCount }, () => worker()))
          const materialized = frames.filter(Boolean)
          provided = {
            status: materialized.length ? 'OK' : 'ERROR',
            reason: materialized.length ? 'SHARED_MEDIA_FRAMES_EXTRACTED' : 'NO_FRAMES_EXTRACTED',
            frames: materialized,
            sampledTimestamps: timestamps,
          }
        }
      }

      const normalizedFrames = []
      for (const [index, frame] of (Array.isArray(provided?.frames) ? provided.frames : []).entries()) {
        const imagePath = await validateMediaPath(frame?.imagePath || frame?.path)
        if (!imagePath) continue
        const stat = await fs.stat(imagePath).catch(() => null)
        normalizedFrames.push({
          frameIndex: Number.isFinite(Number(frame?.frameIndex)) ? Number(frame.frameIndex) : index,
          timestampSeconds: finiteNumber(frame?.timestampSeconds, timestamps[index] ?? 0),
          imagePath,
          mimeType: safeString(frame?.mimeType || 'image/jpeg', 80),
          sizeBytes: stat?.size || finiteNumber(frame?.sizeBytes, 0),
        })
      }
      const status = String(provided?.status || '').toUpperCase()
      const result = {
        status: status === 'UNAVAILABLE' ? 'UNAVAILABLE' : normalizedFrames.length ? 'OK' : 'ERROR',
        reason: safeString(
          provided?.reason || (normalizedFrames.length ? 'SHARED_MEDIA_FRAMES_EXTRACTED' : 'NO_FRAMES_EXTRACTED'),
          120,
        ),
        sampledTimestamps: timestamps,
        frames: normalizedFrames,
        diagnostics: Array.isArray(provided?.diagnostics) ? provided.diagnostics : [],
      }
      frameResults.set(key, result)
      frameExtractionRuntimeMs += Date.now() - startedAt
      return result
    })()
    framePromises.set(key, promise)
    return promise
  }

  const ensureVideo = async ({ consumer = 'unknown', signal = requestSignal } = {}) => {
    const normalizedConsumer = safeString(consumer, 80) || 'unknown'
    consumers.add(normalizedConsumer)
    if (videoPromise) {
      reuseCount += 1
      return videoPromise
    }
    if (signal?.aborted) return { status: 'ERROR', reason: 'MEDIA_ACQUISITION_ABORTED', localVideoPath: null }
    videoPromise = acquire().then((result) => {
      videoResult = result
      return result
    })
    return videoPromise
  }

  const ensureDuration = async () => {
    if (durationPromise) return durationPromise
    durationPromise = (async () => {
      const knownDuration = durationFromContext(context)
      if (knownDuration !== null) {
        durationResult = { status: 'OK', durationSeconds: knownDuration, source: 'metadata' }
        return durationResult
      }
      const video = videoResult || await ensureVideo({ consumer: 'duration_probe' })
      if (metadataResult?.status === 'OK' && Number(metadataResult.durationSeconds) > 0) {
        durationResult = {
          status: 'OK',
          durationSeconds: Number(metadataResult.durationSeconds),
          source: metadataResult.source || 'media_metadata',
        }
        return durationResult
      }
      if (video.status !== 'OK') {
        durationResult = { status: 'UNAVAILABLE', durationSeconds: null, source: null }
        return durationResult
      }
      if (durationProvider) {
        const provided = await durationProvider({ localVideoPath: video.localVideoPath })
        const durationSeconds = finiteNumber(provided?.durationSeconds, null)
        durationResult = durationSeconds !== null && durationSeconds > 0
          ? { status: 'OK', durationSeconds, source: 'provider' }
          : { status: 'ERROR', durationSeconds: null, source: 'provider' }
        return durationResult
      }
      const resolvedBinaries = await binaries()
      if (!resolvedBinaries.ffprobeExecutable) {
        durationResult = { status: 'UNAVAILABLE', durationSeconds: null, source: null }
        return durationResult
      }
      const probe = await commandRunner(resolvedBinaries.ffprobeExecutable, [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        video.localVideoPath,
      ], { timeoutMs: Math.min(10000, acquisitionTimeoutMs) })
      const durationSeconds = probe.ok ? finiteNumber(probe.stdout, null) : null
      durationResult = durationSeconds !== null && durationSeconds > 0
        ? { status: 'OK', durationSeconds, source: 'ffprobe' }
        : { status: 'ERROR', durationSeconds: null, source: 'ffprobe' }
      return durationResult
    })()
    return durationPromise
  }

  const ensureAudio = async () => {
    if (audioPromise) return audioPromise
    audioCalled = true
    audioPromise = (async () => {
      const video = await ensureVideo({ consumer: 'asr' })
      if (video.status !== 'OK') {
        audioResult = {
          status: 'ERROR',
          reason: 'ASR_MEDIA_ACQUISITION_FAILED',
          audioPath: null,
          usedSharedVideo: false,
          providerErrors: [sanitizeProviderError({
            code: 'ASR_MEDIA_ACQUISITION_FAILED',
            message: 'ASR could not access the shared Track2 V3 video.',
          })],
        }
        return audioResult
      }
      const directory = await ensureWorkDir()
      const outputPath = path.join(directory, 'audio.wav')
      let provided
      if (audioProvider) {
        try {
          provided = await audioProvider({
            localVideoPath: video.localVideoPath,
            outputPath,
            timeoutMs: Math.min(120000, Number(config.asrTimeoutMs || 300000)),
          })
        } catch {
          provided = { status: 'ERROR', reason: 'ASR_AUDIO_EXTRACTION_FAILED' }
        }
      } else {
        const resolvedBinaries = await binaries()
        if (!resolvedBinaries.ffmpegExecutable) {
          provided = { status: 'UNAVAILABLE', reason: 'ASR_PROVIDER_UNAVAILABLE' }
        } else {
          const extracted = await commandRunner(resolvedBinaries.ffmpegExecutable, [
            '-hide_banner', '-loglevel', 'error', '-y',
            '-i', video.localVideoPath,
            '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
            outputPath,
          ], { timeoutMs: Math.min(120000, Number(config.asrTimeoutMs || 300000)) })
          provided = extracted.ok
            ? { status: 'OK', reason: 'ASR_AUDIO_EXTRACTED', audioPath: outputPath }
            : {
                status: 'ERROR',
                reason: extracted.timedOut ? 'ASR_TIMEOUT' : 'ASR_AUDIO_EXTRACTION_FAILED',
              }
        }
      }
      const audioPath = await validateMediaPath(provided?.audioPath || outputPath)
      const status = String(provided?.status || '').toUpperCase()
      if (status !== 'OK' || !audioPath) {
        const reason = safeString(provided?.reason || 'ASR_AUDIO_EXTRACTION_FAILED', 120)
        audioResult = {
          status: status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'ERROR',
          reason,
          audioPath: null,
          usedSharedVideo: true,
          providerErrors: [sanitizeProviderError({
            code: reason,
            message: reason === 'ASR_PROVIDER_UNAVAILABLE'
              ? 'The local audio extraction executable is unavailable.'
              : 'Audio extraction from the shared video failed safely.',
          })],
        }
        return audioResult
      }
      audioResult = {
        status: 'OK',
        reason: 'ASR_AUDIO_EXTRACTED',
        audioPath,
        usedSharedVideo: true,
        providerErrors: [],
      }
      return audioResult
    })()
    return audioPromise
  }


  const ensureAudioWindow = async ({ startSeconds, endSeconds, windowId = '' } = {}) => {
    const start = Math.max(0, finiteNumber(startSeconds, 0))
    const end = Math.max(start, finiteNumber(endSeconds, start))
    const durationSeconds = end - start
    const key = safeString(windowId, 120) || `${start.toFixed(3)}-${end.toFixed(3)}`
    if (durationSeconds < 0.25) {
      return {
        status: 'ERROR',
        reason: 'ASR_AUDIO_WINDOW_INVALID',
        audioPath: null,
        windowId: key,
        windowStartSeconds: start,
        windowEndSeconds: end,
        audioDurationSeconds: durationSeconds,
        windowed: true,
        usedSharedVideo: false,
        providerErrors: [sanitizeProviderError({
          code: 'ASR_AUDIO_WINDOW_INVALID',
          message: 'ASR audio opportunity window is too short.',
        })],
      }
    }
    if (audioWindowPromises.has(key)) return audioWindowPromises.get(key)
    audioWindowCalled = true
    const promise = (async () => {
      const video = await ensureVideo({ consumer: 'asr_window' })
      if (video.status !== 'OK') {
        const result = {
          status: 'ERROR', reason: 'ASR_MEDIA_ACQUISITION_FAILED', audioPath: null,
          windowId: key, windowStartSeconds: start, windowEndSeconds: end,
          audioDurationSeconds: durationSeconds, windowed: true, usedSharedVideo: false,
          providerErrors: [sanitizeProviderError({
            code: 'ASR_MEDIA_ACQUISITION_FAILED',
            message: 'ASR window could not access the shared Track2 V3 video.',
          })],
        }
        audioWindowResults.set(key, result)
        return result
      }
      const directory = await ensureWorkDir()
      const safeKey = key.replace(/[^a-z0-9_-]+/giu, '-').slice(0, 80) || 'window'
      const outputPath = path.join(directory, `audio-${safeKey}.wav`)
      let provided
      if (audioProvider) {
        try {
          provided = await audioProvider({
            localVideoPath: video.localVideoPath,
            outputPath,
            timeoutMs: Math.min(120000, Number(config.asrTimeoutMs || 300000)),
            startSeconds: start,
            endSeconds: end,
            windowId: key,
            windowed: true,
          })
        } catch {
          provided = { status: 'ERROR', reason: 'ASR_AUDIO_EXTRACTION_FAILED' }
        }
      } else {
        const resolvedBinaries = await binaries()
        if (!resolvedBinaries.ffmpegExecutable) {
          provided = { status: 'UNAVAILABLE', reason: 'ASR_PROVIDER_UNAVAILABLE' }
        } else {
          const extracted = await commandRunner(resolvedBinaries.ffmpegExecutable, [
            '-hide_banner', '-loglevel', 'error', '-y',
            '-ss', String(start),
            '-i', video.localVideoPath,
            '-t', String(durationSeconds),
            '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
            outputPath,
          ], { timeoutMs: Math.min(120000, Number(config.asrTimeoutMs || 300000)) })
          provided = extracted.ok
            ? { status: 'OK', reason: 'ASR_AUDIO_WINDOW_EXTRACTED', audioPath: outputPath }
            : { status: 'ERROR', reason: extracted.timedOut ? 'ASR_TIMEOUT' : 'ASR_AUDIO_EXTRACTION_FAILED' }
        }
      }
      const audioPath = await validateMediaPath(provided?.audioPath || outputPath)
      const status = String(provided?.status || '').toUpperCase()
      let result
      if (status !== 'OK' || !audioPath) {
        const reason = safeString(provided?.reason || 'ASR_AUDIO_EXTRACTION_FAILED', 120)
        result = {
          status: status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'ERROR', reason, audioPath: null,
          windowId: key, windowStartSeconds: start, windowEndSeconds: end,
          audioDurationSeconds: durationSeconds, windowed: true, usedSharedVideo: true,
          providerErrors: [sanitizeProviderError({ code: reason, message: 'ASR window extraction failed safely.' })],
        }
      } else {
        audioWindowSecondsProcessed += durationSeconds
        result = {
          status: 'OK', reason: 'ASR_AUDIO_WINDOW_EXTRACTED', audioPath,
          windowId: key, windowStartSeconds: start, windowEndSeconds: end,
          audioDurationSeconds: durationSeconds, windowed: true, usedSharedVideo: true,
          providerErrors: [],
        }
      }
      audioWindowResults.set(key, result)
      return result
    })()
    audioWindowPromises.set(key, promise)
    return promise
  }

  const diagnostics = () => ({
    mediaMetadataCalled: metadataCalled,
    mediaMetadataStatus: metadataResult?.status || (metadataPromise ? 'RUNNING' : 'NOT_RUN'),
    mediaMetadataSource: metadataResult?.source || null,
    mediaMetadataAvailable: Boolean(metadataResult?.status === 'OK'),
    mediaAcquisitionCalled: acquisitionStartedAt !== null,
    mediaAcquisitionStatus: videoResult?.status || (videoPromise ? 'RUNNING' : 'NOT_RUN'),
    mediaAcquisitionAttemptCount: attempts.length,
    mediaAcquisitionAttempts: attempts.map((attempt) => ({ ...attempt })),
    mediaAcquisitionStrategies: attempts.map((attempt) => attempt.strategy),
    mediaAcquisitionSuccessfulStrategy: videoResult?.successfulStrategy || null,
    mediaAcquisitionRuntimeMs: acquisitionRuntimeMs,
    mediaReuseCount: reuseCount,
    mediaVideoAvailable: Boolean(videoResult?.status === 'OK' && videoResult.localVideoPath),
    mediaDurationAvailable: Boolean(durationResult?.status === 'OK'),
    mediaDurationSeconds: durationResult?.durationSeconds ?? null,
    mediaDurationSource: durationResult?.source || null,
    mediaFrameExtractionCalled: frameExtractionCalled,
    mediaFrameExtractionBatchCount: frameResults.size,
    mediaFrameExtractionRuntimeMs: frameExtractionRuntimeMs,
    mediaFrameCount: [...frameResults.values()].reduce((total, result) => total + (result.frames?.length || 0), 0),
    mediaAudioExtractionCalled: audioCalled,
    mediaAudioExtractionStatus: audioResult?.status || (audioPromise ? 'RUNNING' : 'NOT_RUN'),
    mediaAudioWindowExtractionCalled: audioWindowCalled,
    mediaAudioWindowExtractionCount: audioWindowResults.size,
    mediaAudioWindowSecondsProcessed: Math.round(audioWindowSecondsProcessed * 1000) / 1000,
    mediaAudioWindows: [...audioWindowResults.values()].slice(0, 12).map((result) => ({
      windowId: result.windowId || null,
      startSeconds: result.windowStartSeconds ?? null,
      endSeconds: result.windowEndSeconds ?? null,
      durationSeconds: result.audioDurationSeconds ?? null,
      status: result.status || null,
    })),
    mediaProviderErrors: providerErrors.map((error) => ({ ...error })),
    mediaConsumers: [...consumers],
    mediaVisualUsedSharedVideo: Boolean(
      videoResult?.status === 'OK' && [...consumers].some((value) => value.startsWith('visual')),
    ),
    mediaAsrUsedSharedVideo: Boolean(audioResult?.usedSharedVideo || [...audioWindowResults.values()].some((result) => result.usedSharedVideo)),
    mediaAsrIndependentDownloadCount: 0,
    mediaSecondDownloadCount: 0,
    mediaCleanupCalled: cleaned,
  })

  const cleanup = async () => {
    if (cleaned) return
    cleaned = true
    if (workDir) await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }

  return {
    sourceUrl,
    videoId,
    ensureMetadata,
    ensureVideo,
    ensureDuration,
    ensureFrames,
    ensureAudio,
    ensureAudioWindow,
    diagnostics,
    cleanup,
  }
}

export const SHORTS_TRACK2_V3_MEDIA_FORMAT_STRATEGIES = Object.freeze({
  PRIMARY_FORMAT,
  FALLBACK_FORMAT,
})

export default {
  createShortsTrack2V3MediaSession,
  SHORTS_TRACK2_V3_MEDIA_FORMAT_STRATEGIES,
}
