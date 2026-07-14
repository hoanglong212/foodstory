import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { createShortsTrack2V3MediaSession } from './shortsTrack2V3MediaSessionService.js'

const backendRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const repositoryRoot = path.resolve(backendRoot, '..')
const workerPath = path.join(backendRoot, 'scripts', 'track2', 'track2V3FasterWhisperWorker.py')
const workers = new Map()
let requestSequence = 0

function safeString(value, maxLength = 1000) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function finiteNumber(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function sanitizeProviderError(error = {}, fallbackCode = 'ASR_TRANSCRIPTION_FAILED') {
  return {
    provider: safeString(error.provider || 'faster-whisper', 80),
    code: safeString(error.code || fallbackCode, 120),
    message: safeString(error.message || 'ASR provider failed safely.', 500),
  }
}

function sanitizeSegments(segments = []) {
  return (Array.isArray(segments) ? segments : []).slice(0, 500).map((segment) => {
    const text = safeString(segment?.text, 1200)
    if (!text) return null
    return {
      start: finiteNumber(segment?.start ?? segment?.startSeconds),
      end: finiteNumber(segment?.end ?? segment?.endSeconds),
      text,
    }
  }).filter(Boolean)
}

function sanitizeProviderResult(result = {}, config = {}) {
  const status = safeString(result.status || 'OK', 40).toUpperCase()
  const segments = sanitizeSegments(result.segments || result.transcript?.segments)
  const transcriptText = safeString(
    result.transcriptText || result.text || result.transcript?.text ||
      segments.map((segment) => segment.text).join(' '),
    20000,
  )
  return {
    status: ['OK', 'UNAVAILABLE', 'ERROR'].includes(status) ? status : 'ERROR',
    reason: safeString(result.reason || (status === 'OK' ? 'ASR_TRANSCRIPT_COLLECTED' : 'ASR_TRANSCRIPTION_FAILED'), 120),
    called: result.called !== false,
    provider: safeString(result.provider || 'faster-whisper', 80),
    model: safeString(result.model || config.asrModel || 'small', 120),
    device: safeString(result.device || config.asrDevice || 'cpu', 40),
    computeType: safeString(result.computeType || config.asrComputeType || 'int8', 40),
    requestedLanguage: safeString(result.requestedLanguage || config.asrLanguage || 'vi', 20),
    detectedLanguage: safeString(result.detectedLanguage, 20) || null,
    languageProbability: finiteNumber(result.languageProbability),
    transcriptText,
    segments,
    audioDurationSeconds: finiteNumber(result.audioDurationSeconds),
    runtimeMs: Math.max(0, finiteNumber(result.runtimeMs ?? result.transcriptionRuntimeMs, 0)),
    modelLoadCount: Math.max(0, Math.trunc(finiteNumber(result.modelLoadCount, 0))),
    modelReused: Boolean(result.modelReused),
    usedSharedVideo: Boolean(result.usedSharedVideo),
    independentDownloadCount: Math.max(0, Math.trunc(finiteNumber(
      result.independentDownloadCount,
      0,
    ))),
    windowed: Boolean(result.windowed),
    opportunityWindow: result.opportunityWindow && typeof result.opportunityWindow === 'object'
      ? {
          windowId: safeString(result.opportunityWindow.windowId, 120) || null,
          startSeconds: finiteNumber(result.opportunityWindow.startSeconds),
          endSeconds: finiteNumber(result.opportunityWindow.endSeconds),
          segmentId: safeString(result.opportunityWindow.segmentId, 120) || null,
          episodeIds: Array.isArray(result.opportunityWindow.episodeIds)
            ? result.opportunityWindow.episodeIds.map((value) => safeString(value, 120)).filter(Boolean).slice(0, 12)
            : [],
        }
      : null,
    providerErrors: (Array.isArray(result.providerErrors) ? result.providerErrors : [])
      .slice(0, 12).map((error) => sanitizeProviderError(error)),
  }
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

async function resolveBinaries(env = process.env) {
  const pythonExecutable = await existingFile([
    env.TRACK2_V3_ASR_PYTHON_BIN,
    path.join(repositoryRoot, '.venv', 'Scripts', 'python.exe'),
    path.join(repositoryRoot, '.venv', 'bin', 'python'),
    'python',
  ])
  return { pythonExecutable }
}

class FasterWhisperWorker {
  constructor({ pythonExecutable, key }) {
    this.pythonExecutable = pythonExecutable
    this.key = key
    this.pending = new Map()
    this.stdoutBuffer = ''
    this.stderr = ''
    this.child = null
  }

  start() {
    if (this.child) return
    this.child = spawn(this.pythonExecutable, ['-u', workerPath], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child.stdout.setEncoding('utf8')
    this.child.stderr.setEncoding('utf8')
    this.child.stdout.on('data', (chunk) => this.consumeStdout(chunk))
    this.child.stderr.on('data', (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-8000)
    })
    this.child.on('error', (error) => this.failAll(error))
    this.child.on('close', () => this.failAll(Object.assign(new Error('ASR worker exited'), {
      code: 'ASR_PROVIDER_UNAVAILABLE',
    })))
  }

  consumeStdout(chunk) {
    this.stdoutBuffer += chunk
    let newline = this.stdoutBuffer.indexOf('\n')
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1)
      if (line) {
        try {
          const result = JSON.parse(line)
          const pending = this.pending.get(String(result.id))
          if (pending) {
            this.pending.delete(String(result.id))
            clearTimeout(pending.timeoutId)
            pending.resolve(result)
          }
        } catch {
          // Only valid JSON responses participate in the provider contract.
        }
      }
      newline = this.stdoutBuffer.indexOf('\n')
    }
  }

  failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId)
      pending.reject(error)
    }
    this.pending.clear()
    this.child = null
    workers.delete(this.key)
  }

  request(payload, timeoutMs) {
    this.start()
    return new Promise((resolve, reject) => {
      const id = String(++requestSequence)
      const timeoutId = setTimeout(() => {
        this.pending.delete(id)
        const error = Object.assign(new Error('ASR transcription timed out'), { code: 'ASR_TIMEOUT' })
        reject(error)
        this.stop()
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeoutId })
      this.child.stdin.write(`${JSON.stringify({ id, ...payload })}\n`, 'utf8', (error) => {
        if (!error) return
        clearTimeout(timeoutId)
        this.pending.delete(id)
        reject(error)
      })
    })
  }

  stop() {
    if (!this.child) return
    this.child.kill('SIGTERM')
    this.child = null
    workers.delete(this.key)
  }
}

function workerFor({ pythonExecutable, config }) {
  const key = [pythonExecutable, config.asrModel, config.asrDevice, config.asrComputeType].join('|')
  if (!workers.has(key)) workers.set(key, new FasterWhisperWorker({ pythonExecutable, key }))
  return workers.get(key)
}

export async function runShortsTrack2V3LocalAsrProvider({
  context = {},
  config = {},
  env = process.env,
  deps = {},
  mediaSession = null,
  opportunityWindow = null,
} = {}) {
  const startedAt = Date.now()
  const binaries = await resolveBinaries(env)
  if (!binaries.pythonExecutable) {
    return sanitizeProviderResult({
      status: 'UNAVAILABLE',
      reason: 'ASR_PROVIDER_UNAVAILABLE',
      called: false,
      providerErrors: [sanitizeProviderError({
        code: 'ASR_PROVIDER_UNAVAILABLE',
        message: 'A required local ASR executable is unavailable.',
      })],
    }, config)
  }

  const ownsMediaSession = !mediaSession
  const activeMediaSession = mediaSession || createShortsTrack2V3MediaSession({
    context,
    config,
    deps: { ...deps, env },
    tmpRoot: deps.tmpDir || '',
  })
  try {
    const audio = opportunityWindow && config.windowedAsrEnabled !== false && typeof activeMediaSession.ensureAudioWindow === 'function'
      ? await activeMediaSession.ensureAudioWindow(opportunityWindow)
      : await activeMediaSession.ensureAudio()
    if (audio.status !== 'OK' || !audio.audioPath) {
      return sanitizeProviderResult({
        status: audio.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'ERROR',
        reason: audio.reason,
        called: true,
        providerErrors: audio.providerErrors,
        runtimeMs: Date.now() - startedAt,
        usedSharedVideo: Boolean(audio.usedSharedVideo),
        independentDownloadCount: 0,
      }, config)
    }

    const worker = workerFor({ pythonExecutable: binaries.pythonExecutable, config })
    let result
    try {
      const remainingTimeoutMs = Math.max(0, config.asrTimeoutMs - (Date.now() - startedAt))
      if (remainingTimeoutMs < 1000) {
        const timeoutError = Object.assign(new Error('ASR provider timed out'), {
          code: 'ASR_TIMEOUT',
        })
        throw timeoutError
      }
      result = await worker.request({
        audioPath: audio.audioPath,
        model: config.asrModel,
        device: config.asrDevice,
        computeType: config.asrComputeType,
        requestedLanguage: config.asrLanguage,
      }, remainingTimeoutMs)
    } catch (error) {
      const code = safeString(error.code, 120) === 'ASR_TIMEOUT'
        ? 'ASR_TIMEOUT'
        : 'ASR_TRANSCRIPTION_FAILED'
      return sanitizeProviderResult({
        status: 'ERROR',
        reason: code,
        called: true,
        providerErrors: [sanitizeProviderError({ code, message: error.message })],
        runtimeMs: Date.now() - startedAt,
      }, config)
    }
    return sanitizeProviderResult({
      ...result,
      called: true,
      segments: sanitizeSegments(result.segments || result.transcript?.segments).map((segment) => ({
        ...segment,
        start: opportunityWindow && Number.isFinite(Number(opportunityWindow.startSeconds)) && segment.start != null
          ? Number(segment.start) + Number(opportunityWindow.startSeconds)
          : segment.start,
        end: opportunityWindow && Number.isFinite(Number(opportunityWindow.startSeconds)) && segment.end != null
          ? Number(segment.end) + Number(opportunityWindow.startSeconds)
          : segment.end,
      })),
      audioDurationSeconds: audio.audioDurationSeconds ?? result.audioDurationSeconds,
      windowed: Boolean(opportunityWindow),
      opportunityWindow: opportunityWindow || null,
      runtimeMs: Date.now() - startedAt,
      providerErrors: result.status === 'ERROR'
        ? [sanitizeProviderError({
            code: 'ASR_TRANSCRIPTION_FAILED',
            message: 'ASR transcription failed safely.',
          })]
        : [],
      usedSharedVideo: true,
      independentDownloadCount: 0,
    }, config)
  } finally {
    if (ownsMediaSession) await activeMediaSession.cleanup()
  }
}

export async function runShortsTrack2V3AsrProvider({ context = {}, config = {}, deps = {}, opportunityWindow = null } = {}) {
  if (typeof deps.track2V3AsrProvider === 'function') {
    try {
      const startedAt = Date.now()
      let timeoutId
      const timeoutResult = new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve({
          status: 'ERROR',
          reason: 'ASR_TIMEOUT',
          providerErrors: [sanitizeProviderError({ code: 'ASR_TIMEOUT', message: 'ASR provider timed out.' })],
        }), config.asrTimeoutMs)
      })
      const result = await Promise.race([
        Promise.resolve(deps.track2V3AsrProvider({ context, config, opportunityWindow })),
        timeoutResult,
      ]).finally(() => clearTimeout(timeoutId))
      return sanitizeProviderResult({ ...result, runtimeMs: result?.runtimeMs ?? Date.now() - startedAt }, config)
    } catch (error) {
      return sanitizeProviderResult({
        status: 'ERROR',
        reason: safeString(error.code, 120) === 'ASR_TIMEOUT' ? 'ASR_TIMEOUT' : 'ASR_TRANSCRIPTION_FAILED',
        providerErrors: [sanitizeProviderError({ code: error.code, message: error.message })],
      }, config)
    }
  }
  return runShortsTrack2V3LocalAsrProvider({
    context,
    config,
    env: deps.env || process.env,
    deps,
    mediaSession: deps.mediaSession || null,
    opportunityWindow,
  })
}

export async function cleanupShortsTrack2V3LocalAsrProviders() {
  for (const worker of workers.values()) worker.stop()
  workers.clear()
}

export default {
  runShortsTrack2V3AsrProvider,
  runShortsTrack2V3LocalAsrProvider,
  cleanupShortsTrack2V3LocalAsrProviders,
}
