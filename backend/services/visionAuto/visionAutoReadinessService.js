import { execFile } from 'node:child_process'

import { getVisionAutoRuntimeConfig } from './visionAutoConfig.js'

const FALSE_VALUES = new Set(['false', '0', 'no', 'off'])
let cached = null

function enabled(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback
  return !FALSE_VALUES.has(String(value).trim().toLowerCase())
}

function run(command, args, timeoutMs = 5_000) {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: timeoutMs }, (error, stdout = '') => {
      resolve({
        ok: !error,
        code: error?.code ? String(error.code).slice(0, 80) : null,
        version: !error ? String(stdout).split(/\r?\n/u)[0].trim().slice(0, 120) : null,
      })
    })
  })
}

async function binaryCheck(name, command, args, required = true) {
  const result = await run(command, args)
  return {
    name,
    required,
    ok: result.ok,
    code: result.ok ? null : (result.code || 'UNAVAILABLE'),
    ...(result.version ? { version: result.version } : {}),
  }
}

export function resetVisionAutoReadinessCache() {
  cached = null
}

export async function getVisionAutoReadiness({
  env = process.env,
  config = getVisionAutoRuntimeConfig(env),
  now = () => Date.now(),
  ttlMs = 60_000,
} = {}) {
  const current = now()
  if (cached && cached.expiresAt > current) return cached.value

  if (!config.visionAutoEnabled) {
    const value = {
      ready: true,
      state: 'disabled',
      checkedAt: new Date(current).toISOString(),
      checks: [],
    }
    cached = { expiresAt: current + ttlMs, value }
    return value
  }

  const checks = []
  if (config.track2Enabled) {
    checks.push(await binaryCheck(
      'yt_dlp',
      env.TRACK2_YTDLP_BIN || env.YOUTUBE_YT_DLP_PATH || 'yt-dlp',
      ['--version'],
    ))
    checks.push(await binaryCheck(
      'ffmpeg',
      env.TRACK2_FFMPEG_BIN || env.YOUTUBE_FFMPEG_PATH || 'ffmpeg',
      ['-version'],
    ))
    checks.push(await binaryCheck(
      'ffprobe',
      env.TRACK2_FFPROBE_BIN || env.YOUTUBE_FFPROBE_PATH || 'ffprobe',
      ['-version'],
    ))

    const localOcrEnabled = enabled(env.TRACK2_V3_LOCAL_OCR_ENABLED, true)
      && enabled(env.TRACK2_V3_TESSERACT_ENABLED, true)
    if (localOcrEnabled) {
      checks.push(await binaryCheck(
        'tesseract',
        env.TRACK2_V3_TESSERACT_BIN || env.TRACK2_TESSERACT_BIN || 'tesseract',
        ['--version'],
      ))
    }

    if (config.asrEffectiveEnabled) {
      checks.push(await binaryCheck(
        'faster_whisper',
        env.TRACK2_V3_ASR_PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3'),
        ['-c', 'import faster_whisper; print("faster_whisper_ok")'],
      ))
    }

    if (config.geminiEffectiveEnabled) {
      checks.push({
        name: 'gemini_key',
        required: true,
        ok: Boolean(String(env.GEMINI_API_KEY || '').trim()),
        code: String(env.GEMINI_API_KEY || '').trim() ? null : 'GEMINI_API_KEY_MISSING',
      })
    }
  }

  if (config.externalResolverEnabled) {
    checks.push({
      name: 'external_place_provider',
      required: false,
      ok: config.externalProviderConfigured === true,
      code: config.externalProviderConfigured ? null : 'EXTERNAL_PROVIDER_NOT_CONFIGURED',
    })
  }

  const ready = checks.every((check) => !check.required || check.ok)
  const value = {
    ready,
    state: ready ? 'ready' : 'not_ready',
    checkedAt: new Date(current).toISOString(),
    checks,
  }
  cached = { expiresAt: current + ttlMs, value }
  return value
}

export default getVisionAutoReadiness
