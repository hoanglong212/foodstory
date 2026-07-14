import '../config/env.js'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { track2V3TesseractCommandCandidates } from '../src/services/shorts/track2-v3/shortsTrack2V3BinaryResolverService.js'
import { getShortsTrack2V3Config } from '../src/services/shorts/track2-v3/shortsTrack2V3Config.js'
import { getVisionAutoConfig } from '../services/visionAuto/visionAutoConfig.js'

const backendRoot = fileURLToPath(new URL('../', import.meta.url))
const repositoryRoot = path.resolve(backendRoot, '..')
const liveProviders = process.argv.includes('--live-providers')

function safeText(value, maxLength = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function execCheck(command, args = [], timeoutMs = 15_000) {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: timeoutMs }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        command: safeText(command, 500),
        code: safeText(error?.code || error?.name || '', 120) || null,
        message: error ? safeText(error.message, 300) : null,
        stdout: String(stdout || '').slice(0, 4_000),
        stderr: String(stderr || '').slice(0, 1_000),
      })
    })
  })
}

function isWindowsAbsolutePath(value = '') {
  return /^[A-Za-z]:[\\/]/u.test(String(value || '').trim())
}

async function firstExisting(candidates = []) {
  const usable = candidates.filter(Boolean)
  for (const rawCandidate of usable) {
    const candidate = String(rawCandidate).trim()
    const windowsAbsolute = isWindowsAbsolutePath(candidate)
    const nativeAbsolute = path.isAbsolute(candidate)

    if (windowsAbsolute && process.platform !== 'win32') continue
    if (!windowsAbsolute && !nativeAbsolute) return candidate

    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // Try the next configured path or PATH command.
    }
  }
  return null
}

async function httpCheck(url, { headers = {}, timeoutMs = 15_000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    return {
      ok: response.ok,
      status: response.status,
      code: response.ok ? null : `HTTP_${response.status}`,
      message: response.ok
        ? null
        : safeText(payload?.error?.message || `HTTP ${response.status}`, 300),
      payload,
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      code: safeText(error?.name || error?.code || 'NETWORK_ERROR', 120),
      message: safeText(error?.message || 'Provider probe failed.', 300),
      payload: null,
    }
  } finally {
    clearTimeout(timer)
  }
}

function languageList(stdout = '') {
  const text = String(stdout || '')
  if (!/List of available languages/iu.test(text)) return []
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /^[a-z0-9_+-]{2,40}$/iu.test(line))
}

function checkRecord(name, required, run, details = {}) {
  return {
    name,
    required,
    ok: run.ok === true,
    details,
    errorCode: run.ok ? null : run.code,
    errorMessage: run.ok ? null : run.message,
  }
}

const track2 = getShortsTrack2V3Config(process.env)
const vision = getVisionAutoConfig(process.env)
const checks = []

const nodeMajor = Number(process.versions.node.split('.')[0])
checks.push({
  name: 'node_runtime',
  required: true,
  ok: Number.isFinite(nodeMajor) && nodeMajor >= 18,
  details: { version: process.versions.node, minimumMajor: 18 },
  errorCode: nodeMajor >= 18 ? null : 'NODE_VERSION_UNSUPPORTED',
  errorMessage: nodeMajor >= 18 ? null : 'Node.js 18 or newer is required.',
})

const mediaRequired = track2.enabled && track2.track2V3CanonicalOrchestratorEnabled && track2.track2V3SmartOverlayEnabled
const ytDlp = await firstExisting([
  process.env.TRACK2_YTDLP_BIN,
  process.env.YOUTUBE_YT_DLP_PATH,
  'yt-dlp',
])
const ffmpeg = await firstExisting([
  process.env.TRACK2_FFMPEG_BIN,
  process.env.YOUTUBE_FFMPEG_PATH,
  'ffmpeg',
])
const ffprobe = await firstExisting([
  process.env.TRACK2_FFPROBE_BIN,
  process.env.YOUTUBE_FFPROBE_PATH,
  'ffprobe',
])

for (const [name, command, args] of [
  ['yt_dlp', ytDlp, ['--version']],
  ['ffmpeg', ffmpeg, ['-version']],
  ['ffprobe', ffprobe, ['-version']],
]) {
  const run = command ? await execCheck(command, args) : { ok: false, code: 'BINARY_NOT_CONFIGURED', message: `${name} is not configured.` }
  checks.push(checkRecord(name, mediaRequired, run, {
    configured: Boolean(command),
    command: command ? safeText(command, 500) : null,
    versionLine: safeText(run.stdout?.split(/\r?\n/u)[0], 220) || null,
  }))
}

const tesseractRequired = Boolean(
  track2.enabled &&
  track2.track2V3LocalOcrEnabled &&
  track2.track2V3TesseractEnabled &&
  ['auto', 'ensemble', 'tesseract'].includes(track2.track2V3LocalOcrProvider),
)
const tesseract = await firstExisting(
  track2V3TesseractCommandCandidates({ env: process.env }),
)
const tesseractVersion = tesseract
  ? await execCheck(tesseract, ['--version'])
  : { ok: false, code: 'BINARY_NOT_CONFIGURED', message: 'Tesseract is not configured.' }
const tesseractLanguages = tesseractVersion.ok
  ? await execCheck(tesseract, ['--list-langs'])
  : { ok: false, stdout: '' }
const availableLanguages = languageList(tesseractLanguages.stdout)
checks.push(checkRecord('tesseract', tesseractRequired, tesseractVersion, {
  configured: Boolean(tesseract),
  command: tesseract ? safeText(tesseract, 500) : null,
  versionLine: safeText(tesseractVersion.stdout?.split(/\r?\n/u)[0], 220) || null,
  requestedLanguages: track2.localOcrLanguages,
  availableLanguages,
  vietnameseLanguageAvailable: availableLanguages.includes('vie'),
  englishLanguageAvailable: availableLanguages.includes('eng'),
  runtimeWillFallbackLanguage: availableLanguages.length > 0 && !availableLanguages.includes('vie'),
}))

const asrRequired = Boolean(track2.enabled && track2.asrFallbackEnabled)
const asrPython = await firstExisting([
  process.env.TRACK2_V3_ASR_PYTHON_BIN,
  path.join(repositoryRoot, '.venv', 'Scripts', 'python.exe'),
  path.join(repositoryRoot, '.venv', 'bin', 'python'),
  process.platform === 'win32' ? 'python' : 'python3',
  'python',
])
const asrProbe = asrPython
  ? await execCheck(asrPython, ['-c', 'import faster_whisper; print("faster_whisper_ok")'], 30_000)
  : { ok: false, code: 'PYTHON_NOT_CONFIGURED', message: 'ASR Python is not configured.' }
checks.push(checkRecord('faster_whisper', asrRequired, asrProbe, {
  python: asrPython ? safeText(asrPython, 500) : null,
  model: track2.asrModel,
  device: track2.asrDevice,
  computeType: track2.asrComputeType,
  windowedAsrEnabled: track2.windowedAsrEnabled,
}))

const geminiRequired = Boolean(track2.enabled && track2.track2V3GeminiCropJudgeEnabled)
const geminiConfigured = Boolean(String(process.env.GEMINI_API_KEY || '').trim())
checks.push({
  name: 'gemini_crop_judge',
  required: geminiRequired,
  ok: !geminiRequired || geminiConfigured,
  details: {
    enabled: track2.track2V3GeminiCropJudgeEnabled,
    apiKeyConfigured: geminiConfigured,
    model: track2.geminiCropJudgeModel,
  },
  errorCode: geminiRequired && !geminiConfigured ? 'GEMINI_API_KEY_MISSING' : null,
  errorMessage: geminiRequired && !geminiConfigured ? 'GEMINI_API_KEY is required because Gemini Crop Judge is enabled.' : null,
})

if (liveProviders && geminiRequired && geminiConfigured) {
  const model = String(track2.geminiCropJudgeModel || '').trim()
  const safeModel = /^[a-z0-9._-]{1,120}$/iu.test(model) ? model : null
  const run = safeModel
    ? await httpCheck(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(safeModel)}`,
        { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }, timeoutMs: 20_000 },
      )
    : { ok: false, status: null, code: 'INVALID_MODEL_ID', message: 'Gemini model ID is invalid.' }
  checks.push({
    name: 'gemini_model_live',
    required: true,
    ok: run.ok === true,
    details: {
      model: safeModel,
      httpStatus: run.status,
      apiVersion: 'v1beta',
      keyValueExposed: false,
    },
    errorCode: run.ok ? null : run.code,
    errorMessage: run.ok ? null : run.message,
  })
}

const placesRequired = vision.locationProvider === 'google'
const placesConfigured = Boolean(String(
  process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '',
).trim())
checks.push({
  name: 'google_places',
  required: placesRequired,
  ok: !placesRequired || placesConfigured,
  details: {
    providerMode: vision.locationProviderMode,
    effectiveProvider: vision.locationProvider,
    apiKeyConfigured: placesConfigured,
    timeoutMs: vision.googlePlacesTimeoutMs,
  },
  errorCode: placesRequired && !placesConfigured ? 'GOOGLE_PLACES_API_KEY_MISSING' : null,
  errorMessage: placesRequired && !placesConfigured ? 'Google Places key is required because location resolution is enabled.' : null,
})

checks.push({
  name: 'external_place_resolution_capability',
  required: false,
  ok: vision.locationProvider === 'google',
  details: {
    providerMode: vision.locationProviderMode,
    effectiveProvider: vision.locationProvider,
    apiKeyConfigured: placesConfigured,
    localAddressDuplicateMatchingAvailable: true,
  },
  errorCode: vision.locationProvider === 'google' ? null : 'EXTERNAL_PLACE_PROVIDER_NOT_ACTIVE',
  errorMessage: vision.locationProvider === 'google'
    ? null
    : 'Google Places is not active. Strong local address matches can still focus existing Food Map markers; unmatched places remain review drafts.',
})

checks.push({
  name: 'canonical_route',
  required: true,
  ok: Boolean(
    vision.enabled &&
    vision.routeEnabled &&
    vision.youtubeTrack2V3Enabled &&
    track2.enabled &&
    track2.track2V3CanonicalOrchestratorEnabled &&
    track2.track2V3SmartOverlayEnabled &&
    track2.track2V3LocalOcrEnabled
  ),
  details: {
    visionAutoEnabled: vision.enabled,
    routeEnabled: vision.routeEnabled,
    youtubeTrack2V3Enabled: vision.youtubeTrack2V3Enabled,
    track2V3Enabled: track2.enabled,
    canonicalOrchestratorEnabled: track2.track2V3CanonicalOrchestratorEnabled,
    smartOverlayEnabled: track2.track2V3SmartOverlayEnabled,
    localOcrEnabled: track2.track2V3LocalOcrEnabled,
  },
  errorCode: null,
  errorMessage: null,
})

const requiredFailures = checks.filter((check) => check.required && !check.ok)
const optionalWarnings = checks.filter((check) => !check.required && !check.ok)
const report = {
  status: requiredFailures.length ? 'NOT_READY' : optionalWarnings.length ? 'READY_WITH_WARNINGS' : 'READY',
  cwd: process.cwd(),
  liveProviderChecksRequested: liveProviders,
  config: {
    inputContract: ['SINGLE_PLACE', 'MULTI_PLACE_LISTICLE', 'RELEVANT_NEGATIVE', 'UNSUPPORTED'],
    localOcrProvider: track2.track2V3LocalOcrProvider,
    temporalEpisodeEnabled: track2.temporalEpisodeEnabled,
    textRegionProposalEnabled: track2.textRegionProposalEnabled,
    windowedAsrEnabled: track2.windowedAsrEnabled,
    locationProviderMode: vision.locationProviderMode,
    locationProvider: vision.locationProvider,
  },
  checks,
  requiredFailureCount: requiredFailures.length,
  warningCount: optionalWarnings.length,
}

console.log(JSON.stringify(report, null, 2))
if (requiredFailures.length) process.exitCode = 1
