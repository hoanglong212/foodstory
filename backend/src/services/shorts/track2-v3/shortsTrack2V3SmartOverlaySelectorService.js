import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import { DEFAULT_SHORTS_TRACK2_V3_CONFIG } from './shortsTrack2V3Config.js'

export const SMART_OVERLAY_CROP_VARIANTS = Object.freeze([
  {
    variant: 'top_overlay_crop_raw',
    sourceType: 'smart_overlay_crop_top',
    yStart: 0.08,
    yEnd: 0.32,
    scoreBoost: 0.01,
  },
  {
    variant: 'upper_middle_crop_raw',
    sourceType: 'smart_overlay_crop_upper_middle',
    yStart: 0.15,
    yEnd: 0.45,
    scoreBoost: 0.05,
  },
  {
    variant: 'middle_crop_raw',
    sourceType: 'smart_overlay_crop_middle',
    yStart: 0.30,
    yEnd: 0.65,
    scoreBoost: 0.03,
  },
  {
    variant: 'lower_middle_crop_raw',
    sourceType: 'smart_overlay_crop_lower_middle',
    yStart: 0.45,
    yEnd: 0.75,
    scoreBoost: 0.02,
  },
  {
    variant: 'bottom_overlay_crop_raw',
    sourceType: 'smart_overlay_crop_bottom',
    yStart: 0.60,
    yEnd: 0.92,
    scoreBoost: 0.01,
  },
])

const FULL_RAW_VARIANT = Object.freeze({
  variant: 'full_raw',
  sourceType: 'smart_overlay_frame_full',
  yStart: 0,
  yEnd: 1,
  scoreBoost: 0,
})

const DEFAULT_DURATION_SECONDS = 60
const MAX_SAFE_DURATION_SECONDS = 180
const DEFAULT_COMMAND_TIMEOUT_MS = 5000
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 22000
const DEFAULT_FRAME_TIMEOUT_MS = 7000
const VIDEO_FORMAT =
  'bv*[ext=mp4][height<=720]/bv*[height<=720]/bestvideo[height<=720]/best[height<=720]/best'

function safeString(value, maxLength = 1000) {
  return String(value || '').trim().slice(0, maxLength)
}

function finiteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clamp(value, min = 0, max = 1) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return min
  return Math.min(max, Math.max(min, parsed))
}

function boundedInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed < min) return fallback
  return Math.min(parsed, max)
}

function parseIsoDurationSeconds(value) {
  const text = safeString(value, 80)
  if (!text) return null
  const match = /^P(?:(\d+(?:\.\d+)?)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/iu.exec(text)
  if (!match) return null

  const days = Number(match[1] || 0)
  const hours = Number(match[2] || 0)
  const minutes = Number(match[3] || 0)
  const seconds = Number(match[4] || 0)
  const total = days * 86400 + hours * 3600 + minutes * 60 + seconds
  return Number.isFinite(total) && total > 0 ? total : null
}

function durationSecondsFromContext(context = {}) {
  const metadata = context.metadata || {}
  const direct = finiteNumber(
    context.durationSeconds ??
      context.duration ??
      metadata.durationSeconds ??
      metadata.lengthSeconds ??
      metadata.videoDurationSeconds,
    null,
  )
  if (direct !== null && direct > 0) return direct
  return parseIsoDurationSeconds(context.duration || metadata.duration)
}

export function normalizeShortsTrack2V3SmartOverlayConfig(config = {}) {
  return {
    track2V3SmartOverlayEnabled: config.track2V3SmartOverlayEnabled ??
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3SmartOverlayEnabled,
    track2V3SmartOverlayDryRun: config.track2V3SmartOverlayDryRun ??
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.track2V3SmartOverlayDryRun,
    smartOverlaySampleIntervalMs: boundedInteger(
      config.smartOverlaySampleIntervalMs,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.smartOverlaySampleIntervalMs,
      { min: 250, max: 5000 },
    ),
    maxSmartOverlayFrames: boundedInteger(
      config.maxSmartOverlayFrames,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxSmartOverlayFrames,
      { min: 1, max: 120 },
    ),
    maxSmartOverlaySelectedImages: boundedInteger(
      config.maxSmartOverlaySelectedImages,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxSmartOverlaySelectedImages,
      { min: 1, max: 60 },
    ),
    smartOverlayTimeoutMs: boundedInteger(
      config.smartOverlayTimeoutMs,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.smartOverlayTimeoutMs,
      { min: 1000, max: 120000 },
    ),
    maxDurationSeconds: boundedInteger(
      config.maxDurationSeconds,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxDurationSeconds,
      { min: 1, max: MAX_SAFE_DURATION_SECONDS },
    ),
  }
}

export function buildShortsTrack2V3SmartOverlaySampleTimestamps(context = {}, config = {}) {
  const normalized = normalizeShortsTrack2V3SmartOverlayConfig(config)
  const knownDuration = durationSecondsFromContext(context)
  const durationSeconds = Math.min(
    MAX_SAFE_DURATION_SECONDS,
    knownDuration || Math.min(DEFAULT_DURATION_SECONDS, normalized.maxDurationSeconds),
  )
  const intervalSeconds = normalized.smartOverlaySampleIntervalMs / 1000
  const maxFrames = normalized.maxSmartOverlayFrames
  const rawTimestamps = []
  const firstTimestamp = Math.min(Math.max(0.2, intervalSeconds / 2), Math.max(0.2, durationSeconds / 2))

  for (let timestamp = firstTimestamp; timestamp < durationSeconds; timestamp += intervalSeconds) {
    rawTimestamps.push(Number(Math.min(timestamp, Math.max(0, durationSeconds - 0.1)).toFixed(3)))
  }

  if (!rawTimestamps.length) {
    rawTimestamps.push(Number(Math.max(0, durationSeconds * 0.5).toFixed(3)))
  }

  const uniqueTimestamps = Array.from(new Set(rawTimestamps))
  if (uniqueTimestamps.length <= maxFrames) return uniqueTimestamps

  return Array.from({ length: maxFrames }, (_, index) => {
    const rawIndex = Math.round(index * (uniqueTimestamps.length - 1) / Math.max(1, maxFrames - 1))
    return uniqueTimestamps[rawIndex]
  })
}

function cropBoundsForVariant(definition, width, height) {
  const yStart = clamp(definition.yStart, 0, 1)
  const yEnd = clamp(definition.yEnd, yStart, 1)
  const top = Math.max(0, Math.floor(height * yStart))
  const bottom = Math.min(height, Math.ceil(height * yEnd))
  const cropHeight = Math.max(1, bottom - top)

  return {
    left: 0,
    top: Math.min(top, Math.max(0, height - cropHeight)),
    width,
    height: cropHeight,
  }
}

function scoreLuminanceBuffer(buffer, width, height, scoreBoost = 0) {
  const pixelCount = Math.max(1, width * height)
  let sum = 0
  let sumSquares = 0

  for (const value of buffer) {
    sum += value
    sumSquares += value * value
  }

  const mean = sum / pixelCount
  const variance = Math.max(0, sumSquares / pixelCount - mean * mean)
  const contrast = Math.sqrt(variance)
  const contrastScore = clamp(contrast / 64)
  let edgeCount = 0
  let edgeTotal = 0
  let rowTextLikeCount = 0

  for (let y = 0; y < height; y += 1) {
    let rowEdges = 0
    for (let x = 1; x < width; x += 1) {
      const diff = Math.abs(buffer[y * width + x] - buffer[y * width + x - 1])
      edgeTotal += 1
      if (diff >= 24) {
        edgeCount += 1
        rowEdges += 1
      }
    }
    const rowDensity = rowEdges / Math.max(1, width - 1)
    if (rowDensity >= 0.035 && rowDensity <= 0.55) rowTextLikeCount += 1
  }

  for (let y = 1; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const diff = Math.abs(buffer[y * width + x] - buffer[(y - 1) * width + x])
      edgeTotal += 1
      if (diff >= 24) edgeCount += 1
    }
  }

  const edgeDensity = edgeCount / Math.max(1, edgeTotal)
  const edgeDensityScore = clamp(edgeDensity / 0.18)
  const textBandScore = clamp(rowTextLikeCount / Math.max(1, height * 0.22))
  const blurPenalty = edgeDensity < 0.012 ? clamp((0.012 - edgeDensity) / 0.012) * 0.18 : 0
  const score = clamp(
    contrastScore * 0.43 +
      edgeDensityScore * 0.37 +
      textBandScore * 0.20 +
      scoreBoost -
      blurPenalty,
  )

  return {
    score,
    scoreBreakdown: {
      contrastScore: Number(contrastScore.toFixed(4)),
      edgeDensityScore: Number(edgeDensityScore.toFixed(4)),
      textBandScore: Number(textBandScore.toFixed(4)),
      blurPenalty: Number(blurPenalty.toFixed(4)),
      variantBoost: Number(scoreBoost.toFixed(4)),
      luminanceVariance: Number(variance.toFixed(2)),
      edgeDensity: Number(edgeDensity.toFixed(4)),
    },
  }
}

function luminanceSignature(buffer, width, height) {
  const gridSize = 8
  const values = []

  for (let gy = 0; gy < gridSize; gy += 1) {
    for (let gx = 0; gx < gridSize; gx += 1) {
      const xStart = Math.floor(gx * width / gridSize)
      const xEnd = Math.max(xStart + 1, Math.floor((gx + 1) * width / gridSize))
      const yStart = Math.floor(gy * height / gridSize)
      const yEnd = Math.max(yStart + 1, Math.floor((gy + 1) * height / gridSize))
      let sum = 0
      let count = 0

      for (let y = yStart; y < Math.min(height, yEnd); y += 1) {
        for (let x = xStart; x < Math.min(width, xEnd); x += 1) {
          sum += buffer[y * width + x]
          count += 1
        }
      }

      values.push(sum / Math.max(1, count))
    }
  }

  const mean = values.reduce((total, value) => total + value, 0) / Math.max(1, values.length)
  return values.map((value) => (value >= mean ? '1' : '0')).join('')
}

function hammingDistance(left = '', right = '') {
  if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY
  let distance = 0
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1
  }
  return distance
}

function frameImagePath(frame = {}) {
  return safeString(frame.path || frame.imagePath, 1000)
}

async function scoreFrameCrop(frame = {}, definition = {}, deps = {}) {
  const imageTool = deps.sharp || sharp
  const sourcePath = frameImagePath(frame)
  if (!sourcePath) return null

  const metadata = await imageTool(sourcePath).metadata()
  const sourceWidth = finiteNumber(metadata.width, null)
  const sourceHeight = finiteNumber(metadata.height, null)
  if (!sourceWidth || !sourceHeight) return null

  const bounds = cropBoundsForVariant(definition, sourceWidth, sourceHeight)
  const resized = await imageTool(sourcePath)
    .extract(bounds)
    .resize({ width: 240, withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const width = finiteNumber(resized.info.width, bounds.width)
  const height = finiteNumber(resized.info.height, bounds.height)
  const scored = scoreLuminanceBuffer(resized.data, width, height, definition.scoreBoost || 0)

  return {
    frameIndex: finiteNumber(frame.frameIndex, 0),
    timestampSeconds: finiteNumber(frame.timestampSeconds, null),
    variant: definition.variant,
    sourceType: definition.sourceType,
    score: Number(scored.score.toFixed(6)),
    scoreBreakdown: scored.scoreBreakdown,
    framePath: sourcePath,
    cropPath: null,
    width: bounds.width,
    height: bounds.height,
    cropBounds: bounds,
    sourceFrameWidth: sourceWidth,
    sourceFrameHeight: sourceHeight,
    signature: luminanceSignature(resized.data, width, height),
  }
}

function timelineBucket(timestampSeconds, durationSeconds, bucketCount) {
  if (!Number.isFinite(Number(timestampSeconds)) || !durationSeconds) return 0
  const ratio = clamp(Number(timestampSeconds) / Math.max(1, durationSeconds))
  return Math.min(bucketCount - 1, Math.floor(ratio * bucketCount))
}

function roundedTimestampKey(timestampSeconds) {
  const numeric = finiteNumber(timestampSeconds, 0)
  return String(Math.round(numeric * 2) / 2)
}

function canSelectCandidate(candidate, selected, state, maxSelected) {
  if (!candidate || selected.length >= maxSelected) return false
  const timestampKey = roundedTimestampKey(candidate.timestampSeconds)
  if ((state.perTimestamp.get(timestampKey) || 0) >= state.maxPerTimestamp) return false

  for (const existing of selected) {
    if (
      existing.variant === candidate.variant &&
      hammingDistance(existing.signature, candidate.signature) <= 6
    ) {
      return false
    }
  }

  return true
}

function addSelectedCandidate(candidate, selected, state) {
  selected.push(candidate)
  const timestampKey = roundedTimestampKey(candidate.timestampSeconds)
  state.perTimestamp.set(timestampKey, (state.perTimestamp.get(timestampKey) || 0) + 1)
  state.perVariant.set(candidate.variant, (state.perVariant.get(candidate.variant) || 0) + 1)
}

function selectScoredOverlayCrops(scoredCrops = [], config = {}, durationSeconds = null) {
  const normalized = normalizeShortsTrack2V3SmartOverlayConfig(config)
  const maxSelected = normalized.maxSmartOverlaySelectedImages
  const sorted = [...scoredCrops]
    .filter((candidate) => candidate && Number.isFinite(Number(candidate.score)))
    .sort((left, right) => right.score - left.score)
  const selected = []
  const uniqueTimestampCount = new Set(sorted.map((candidate) =>
    roundedTimestampKey(candidate.timestampSeconds)
  )).size || 1
  const state = {
    perTimestamp: new Map(),
    perVariant: new Map(),
    maxPerTimestamp: Math.max(2, Math.ceil(maxSelected / uniqueTimestampCount)),
  }
  const bucketCount = Math.min(6, Math.max(1, Math.floor(maxSelected / 3)))
  const perBucket = new Map()

  for (const candidate of sorted) {
    const bucket = timelineBucket(candidate.timestampSeconds, durationSeconds, bucketCount)
    if (!perBucket.has(bucket)) perBucket.set(bucket, [])
    perBucket.get(bucket).push(candidate)
  }

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const bucketCandidates = perBucket.get(bucket) || []
    const usedVariants = new Set()
    for (const candidate of bucketCandidates) {
      if (usedVariants.has(candidate.variant)) continue
      if (!canSelectCandidate(candidate, selected, state, maxSelected)) continue
      addSelectedCandidate(candidate, selected, state)
      usedVariants.add(candidate.variant)
      if (usedVariants.size >= 2) break
    }
  }

  for (const candidate of sorted) {
    if (selected.includes(candidate)) continue
    if (!canSelectCandidate(candidate, selected, state, maxSelected)) continue
    addSelectedCandidate(candidate, selected, state)
  }

  return selected
    .sort((left, right) => right.score - left.score)
    .slice(0, maxSelected)
}

function safeFileSegment(value, fallback = 'item') {
  const clean = safeString(value, 120)
    .replace(/[^a-z0-9._-]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
  return clean || fallback
}

function timestampSegment(timestampSeconds) {
  const numeric = finiteNumber(timestampSeconds, 0)
  return numeric.toFixed(3).replace(/\./gu, 'p')
}

async function saveSelectedCrop(candidate, index, outputDir, deps = {}) {
  const imageTool = deps.sharp || sharp
  const cropDir = path.join(outputDir, 'selected-crops')
  await fs.mkdir(cropDir, { recursive: true })
  const fileName = [
    String(index).padStart(2, '0'),
    `t${timestampSegment(candidate.timestampSeconds)}`,
    safeFileSegment(candidate.variant, 'crop'),
  ].join('-')
  const cropPath = path.join(cropDir, `${fileName}.jpg`)

  if (candidate.variant === 'full_raw') {
    await imageTool(candidate.framePath)
      .jpeg({ quality: 92 })
      .toFile(cropPath)
  } else {
    await imageTool(candidate.framePath)
      .extract(candidate.cropBounds)
      .jpeg({ quality: 92 })
      .toFile(cropPath)
  }

  const stat = await fs.stat(cropPath)
  return {
    ...candidate,
    cropPath,
    sizeBytes: stat.size,
  }
}

async function saveSampledFrameThumbnails(frames = [], outputDir, deps = {}) {
  if (!outputDir || deps.keepSampledFrames !== true) return []

  const imageTool = deps.sharp || sharp
  const frameDir = path.join(outputDir, 'sampled-frames')
  await fs.mkdir(frameDir, { recursive: true })
  const saved = []

  for (const [index, frame] of frames.entries()) {
    const sourcePath = frameImagePath(frame)
    if (!sourcePath) continue
    const frameIndex = finiteNumber(frame.frameIndex, index)
    const targetPath = path.join(
      frameDir,
      `${String(index).padStart(2, '0')}-t${timestampSegment(frame.timestampSeconds)}.jpg`,
    )
    try {
      await imageTool(sourcePath)
        .resize({ width: 360, withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toFile(targetPath)
      const stat = await fs.stat(targetPath)
      saved.push({
        frameIndex,
        timestampSeconds: finiteNumber(frame.timestampSeconds, null),
        framePath: targetPath,
        originalFramePath: sourcePath,
        sizeBytes: stat.size,
      })
    } catch {
      // Frame thumbnails are helpful diagnostics, not required for selector success.
    }
  }

  return saved
}

function thumbnailPathForFrame(sampledFrames = [], frameIndex) {
  return sampledFrames.find((frame) => frame.frameIndex === frameIndex)?.framePath || null
}

async function saveSelectedCrops(selected = [], outputDir, sampledFrames = [], deps = {}) {
  if (!outputDir) {
    return selected.map((candidate) => ({
      ...candidate,
      framePath: thumbnailPathForFrame(sampledFrames, candidate.frameIndex) || candidate.framePath,
    }))
  }

  const saved = []
  for (const [index, candidate] of selected.entries()) {
    const savedCandidate = await saveSelectedCrop(candidate, index, outputDir, deps)
    saved.push({
      ...savedCandidate,
      framePath: thumbnailPathForFrame(sampledFrames, candidate.frameIndex) || candidate.framePath,
    })
  }
  return saved
}

function selectedImageReport(image = {}) {
  return {
    timestampSeconds: finiteNumber(image.timestampSeconds, null),
    variant: image.variant,
    score: finiteNumber(image.score, 0),
    scoreBreakdown: image.scoreBreakdown || {},
    framePath: image.framePath || null,
    cropPath: image.cropPath || null,
    width: finiteNumber(image.width, null),
    height: finiteNumber(image.height, null),
    frameIndex: finiteNumber(image.frameIndex, null),
    sourceType: image.sourceType || null,
  }
}

function providerCalls() {
  return {
    googleVisionCalled: false,
    placesCalled: false,
    geminiCalled: false,
    localOcrCalled: false,
    asrCalled: false,
  }
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
      // Fall through to direct process termination.
    }
  }

  try {
    child.kill('SIGKILL')
  } catch {
    // Best-effort process termination.
  }
}

function runCommand(command, args = [], { cwd, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, signal } = {}) {
  return new Promise((resolve) => {
    let settled = false
    let timedOut = false
    let aborted = false
    let stdout = ''
    let stderr = ''
    let child
    let timer
    let killFallbackTimer

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
        stdout: safeString(result.stdout || stdout, 1200),
        stderr: safeString(result.stderr || stderr, 1200),
      })
    }
    const abortHandler = () => {
      if (settled) return
      aborted = true
      clearTimeout(timer)
      terminateChildProcess(child)
      killFallbackTimer = setTimeout(() => {
        finish(createCommandFailureResult(command, { aborted: true }))
      }, 500)
    }

    if (signal?.aborted) {
      abortHandler()
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
      if (stdout.length > 2400) stdout = stdout.slice(0, 2400)
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      if (stderr.length > 2400) stderr = stderr.slice(0, 2400)
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

function diagnostic(code, message, details = {}) {
  return sanitizeProviderError({
    code,
    message,
    ...details,
  })
}

async function checkBinary(binary, args, unavailableCode, timeoutMs, signal) {
  const result = await runCommand(binary, args, { timeoutMs, signal })
  if (result.ok) return []
  return [
    diagnostic(unavailableCode, `${binary} is unavailable`, {
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      aborted: result.aborted,
      errorCode: safeString(result.error?.code, 120) || null,
      stderr: result.stderr,
    }),
  ]
}

function remainingBudget(startedAt, budgetMs) {
  return Math.max(0, budgetMs - (Date.now() - startedAt))
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

async function cleanupDirectory(directory) {
  if (!directory) return
  await fs.rm(directory, { recursive: true, force: true })
}

export function createShortsTrack2V3SmartOverlayFrameExtractor(options = {}) {
  const ytDlpBin = safeString(options.ytDlpBin ?? process.env.TRACK2_YTDLP_BIN ?? 'yt-dlp', 260)
  const ffmpegBin = safeString(options.ffmpegBin ?? process.env.TRACK2_FFMPEG_BIN ?? 'ffmpeg', 260)
  const optionTmpRoot = options.tmpRoot || os.tmpdir()
  const registerCleanup = typeof options.registerCleanup === 'function' ? options.registerCleanup : null
  const commandTimeoutMs = boundedInteger(options.commandTimeoutMs, DEFAULT_COMMAND_TIMEOUT_MS, {
    min: 100,
    max: 30000,
  })

  return async function smartOverlayFrameExtractor(context = {}) {
    const startedAt = Date.now()
    const sourceUrl = safeString(context.sourceUrl, 2000)
    const limits = context.limits || {}
    const signal = context.signal
    const diagnostics = []
    const budgetMs = boundedInteger(
      context.budgetMs || limits.maxExtractionBudgetMs,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.smartOverlayTimeoutMs,
      { min: 1000, max: 120000 },
    )
    const maxFrames = boundedInteger(
      limits.maxFrames,
      DEFAULT_SHORTS_TRACK2_V3_CONFIG.maxSmartOverlayFrames,
      { min: 1, max: 120 },
    )
    const sampledTimestamps = (Array.isArray(limits.sampledTimestamps) ? limits.sampledTimestamps : [])
      .map((timestamp) => finiteNumber(timestamp, null))
      .filter((timestamp) => timestamp !== null && timestamp >= 0)
      .slice(0, maxFrames)
    let workDir = ''
    let keepFrames = false

    if (!sourceUrl) {
      return {
        status: 'UNAVAILABLE',
        reason: 'FRAME_PROVIDER_UNAVAILABLE',
        frames: [],
        sampledTimestamps: [],
        diagnostics: [diagnostic('MISSING_SOURCE_URL', 'Smart overlay frame provider needs a source URL')],
      }
    }

    diagnostics.push(...await checkBinary(
      ytDlpBin,
      ['--version'],
      'YTDLP_UNAVAILABLE',
      commandTimeoutMs,
      signal,
    ))
    diagnostics.push(...await checkBinary(
      ffmpegBin,
      ['-version'],
      'FFMPEG_UNAVAILABLE',
      commandTimeoutMs,
      signal,
    ))
    if (diagnostics.length) {
      return {
        status: 'UNAVAILABLE',
        reason: 'FRAME_PROVIDER_UNAVAILABLE',
        frames: [],
        sampledTimestamps,
        diagnostics,
      }
    }

    try {
      const tmpRoot = context.tmpDir || optionTmpRoot
      workDir = await fs.mkdtemp(path.join(tmpRoot, 'shorts-track2-v3-overlay-'))
      registerCleanup?.(workDir)
      const downloadTimeoutMs = Math.min(
        boundedInteger(options.downloadTimeoutMs, DEFAULT_DOWNLOAD_TIMEOUT_MS, {
          min: 1000,
          max: 60000,
        }),
        Math.max(1000, remainingBudget(startedAt, budgetMs) - 1000),
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
      ], {
        timeoutMs: downloadTimeoutMs,
        signal,
      })

      if (!download.ok) {
        return {
          status: download.aborted || download.timedOut ? 'ERROR' : 'ERROR',
          reason: download.aborted || download.timedOut
            ? 'FRAME_EXTRACTION_TIMEOUT'
            : 'FRAME_PROVIDER_ERROR',
          frames: [],
          sampledTimestamps,
          diagnostics: [
            ...diagnostics,
            diagnostic('YTDLP_DOWNLOAD_FAILED', 'yt-dlp could not download the Shorts video', {
              exitCode: download.exitCode,
              timedOut: download.timedOut,
              aborted: download.aborted,
              stderr: download.stderr,
              errorCode: safeString(download.error?.code, 120) || null,
            }),
          ],
        }
      }

      const videoPath = await findDownloadedVideo(workDir)
      if (!videoPath) {
        return {
          status: 'ERROR',
          reason: 'FRAME_PROVIDER_ERROR',
          frames: [],
          sampledTimestamps,
          diagnostics: [
            ...diagnostics,
            diagnostic('YTDLP_NO_VIDEO_FILE', 'yt-dlp completed without a readable video file'),
          ],
        }
      }

      const timestamps = sampledTimestamps.length
        ? sampledTimestamps
        : buildShortsTrack2V3SmartOverlaySampleTimestamps(context, {
            maxSmartOverlayFrames: maxFrames,
          })
      const frames = []

      for (const [index, timestampSeconds] of timestamps.entries()) {
        const budgetLeft = remainingBudget(startedAt, budgetMs)
        if (budgetLeft <= 500 || signal?.aborted) {
          return {
            status: 'ERROR',
            reason: 'FRAME_EXTRACTION_TIMEOUT',
            frames,
            sampledTimestamps: timestamps,
            diagnostics: [
              ...diagnostics,
              diagnostic('SMART_OVERLAY_FRAME_TIMEOUT', 'Smart overlay frame extraction timed out', {
                frameCount: frames.length,
                maxFrames,
              }),
            ],
          }
        }

        const framePath = path.join(workDir, `frame-${String(index).padStart(3, '0')}.jpg`)
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
          timeoutMs: Math.min(
            boundedInteger(options.frameTimeoutMs, DEFAULT_FRAME_TIMEOUT_MS, {
              min: 500,
              max: 30000,
            }),
            budgetLeft,
          ),
          signal,
        })

        if (!ffmpeg.ok) {
          diagnostics.push(diagnostic('FFMPEG_FRAME_EXTRACT_FAILED', 'ffmpeg could not extract a frame', {
            timestampSeconds,
            exitCode: ffmpeg.exitCode,
            timedOut: ffmpeg.timedOut,
            aborted: ffmpeg.aborted,
            stderr: ffmpeg.stderr,
          }))
          continue
        }

        const stat = await fs.stat(framePath)
        if (stat.size <= 0) continue
        frames.push({
          frameIndex: frames.length,
          timestampSeconds,
          imagePath: framePath,
          path: framePath,
          mimeType: 'image/jpeg',
          sizeBytes: stat.size,
        })
      }

      if (!frames.length) {
        return {
          status: 'ERROR',
          reason: 'FRAME_PROVIDER_ERROR',
          frames: [],
          sampledTimestamps: timestamps,
          diagnostics: [
            ...diagnostics,
            diagnostic('NO_FRAMES_EXTRACTED', 'No readable smart overlay frames were extracted'),
          ],
        }
      }

      keepFrames = true
      return {
        status: 'OK',
        reason: 'SMART_OVERLAY_FRAMES_EXTRACTED',
        frames,
        sampledTimestamps: timestamps,
        diagnostics,
      }
    } catch (error) {
      return {
        status: 'ERROR',
        reason: 'FRAME_PROVIDER_ERROR',
        frames: [],
        sampledTimestamps,
        diagnostics: [
          ...diagnostics,
          diagnostic('SMART_OVERLAY_FRAME_PROVIDER_ERROR', error?.message || 'Frame extraction failed', {
            errorCode: safeString(error?.code, 120) || null,
          }),
        ],
      }
    } finally {
      if (workDir && !keepFrames) {
        await cleanupDirectory(workDir).catch(() => {})
      }
    }
  }
}

function configCaps(config = {}) {
  const normalized = normalizeShortsTrack2V3SmartOverlayConfig(config)
  return {
    smartOverlaySampleIntervalMs: normalized.smartOverlaySampleIntervalMs,
    maxSmartOverlayFrames: normalized.maxSmartOverlayFrames,
    maxSmartOverlaySelectedImages: normalized.maxSmartOverlaySelectedImages,
    smartOverlayTimeoutMs: normalized.smartOverlayTimeoutMs,
    maxDurationSeconds: normalized.maxDurationSeconds,
  }
}

function sanitizeProviderError(error = {}) {
  if (!error || typeof error !== 'object') return null
  const sanitized = {}
  for (const [key, value] of Object.entries(error)) {
    if (/key|secret|token|credential|password/iu.test(key)) continue
    if (value === undefined) continue
    if (typeof value === 'string') sanitized[key] = safeString(value, 600)
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      sanitized[key] = value
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) => safeString(item, 160)).slice(0, 12)
    }
  }
  return sanitized
}

function frameDiagnosticsToProviderErrors(frameResult = {}) {
  const status = safeString(frameResult.status, 80).toUpperCase()
  if (status === 'OK') return []

  const diagnostics = Array.isArray(frameResult.diagnostics) ? frameResult.diagnostics : []
  if (!diagnostics.length) {
    return [{
      source: 'track2_v3_smart_overlay',
      code: safeString(frameResult.reason || 'FRAME_PROVIDER_ERROR', 120),
      message: 'Smart overlay frame extraction failed.',
      recoverable: true,
    }]
  }

  return diagnostics
    .map((diagnostic) => sanitizeProviderError({
      source: 'track2_v3_smart_overlay',
      code: diagnostic.code || diagnostic.reason || frameResult.reason || 'FRAME_PROVIDER_ERROR',
      message: diagnostic.message || diagnostic.code || frameResult.reason || 'Frame extraction failed.',
      recoverable: true,
      ...diagnostic,
    }))
    .filter(Boolean)
}

function normalizeFrames(frames = []) {
  return (Array.isArray(frames) ? frames : [])
    .map((frame, index) => ({
      ...frame,
      frameIndex: finiteNumber(frame.frameIndex, index),
      timestampSeconds: finiteNumber(frame.timestampSeconds, null),
      imagePath: frameImagePath(frame),
      path: frameImagePath(frame),
    }))
    .filter((frame) => frame.imagePath)
}

async function scoreOverlayCrops(frames = [], deps = {}) {
  const scored = []

  for (const frame of frames) {
    for (const definition of SMART_OVERLAY_CROP_VARIANTS) {
      try {
        const descriptor = await scoreFrameCrop(frame, definition, deps)
        if (descriptor) scored.push(descriptor)
      } catch {
        // A single unreadable crop should not fail the dry-run report.
      }
    }
  }

  return scored
}

async function fallbackFullRawSelection(frames = [], outputDir, sampledFrames, deps = {}) {
  for (const frame of frames) {
    try {
      const descriptor = await scoreFrameCrop(frame, FULL_RAW_VARIANT, deps)
      if (!descriptor) continue
      return saveSelectedCrops([descriptor], outputDir, sampledFrames, deps)
    } catch {
      // Try the next frame.
    }
  }
  return []
}

export async function selectShortsTrack2V3SmartOverlayCrops({
  frames = [],
  config = {},
  outputDir = '',
  deps = {},
  durationSeconds = null,
} = {}) {
  const normalizedFrames = normalizeFrames(frames)
  const sampledFrames = await saveSampledFrameThumbnails(normalizedFrames, outputDir, deps)
  const scoredCrops = await scoreOverlayCrops(normalizedFrames, deps)
  const selected = selectScoredOverlayCrops(scoredCrops, config, durationSeconds)
  const selectedImages = selected.length
    ? await saveSelectedCrops(selected, outputDir, sampledFrames, deps)
    : await fallbackFullRawSelection(normalizedFrames, outputDir, sampledFrames, deps)

  return {
    status: selectedImages.length ? 'OK' : 'NO_SELECTED_IMAGES',
    sampledFrameCount: normalizedFrames.length,
    selectedImageCount: selectedImages.length,
    selectedImages: selectedImages.map(selectedImageReport),
    scoredImageCount: scoredCrops.length,
    sampledFrames,
    providerCalls: providerCalls(),
    providerErrors: [],
    notes: [
      'Smart overlay dry-run used local image heuristics only.',
      'No OCR, ASR, Places, Gemini, or Google Vision provider was called.',
    ],
  }
}

async function extractFramesForSmartOverlay(context = {}, config = {}, deps = {}) {
  if (Array.isArray(deps.frames)) {
    return {
      status: 'OK',
      reason: 'INJECTED_FRAMES',
      frames: deps.frames,
      diagnostics: [],
      sampledTimestamps: deps.frames.map((frame) => finiteNumber(frame.timestampSeconds, null)).filter((value) => value !== null),
    }
  }

  if (typeof deps.track2FrameExtractor !== 'function') {
    return {
      status: 'UNAVAILABLE',
      reason: 'FRAME_PROVIDER_UNAVAILABLE',
      frames: [],
      diagnostics: [
        {
          code: 'MISSING_TRACK2_FRAME_EXTRACTOR',
          message: 'Smart overlay dry-run needs a frame extractor.',
        },
      ],
    }
  }

  const normalized = normalizeShortsTrack2V3SmartOverlayConfig(config)
  const sampledTimestamps = buildShortsTrack2V3SmartOverlaySampleTimestamps(context, normalized)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort(new Error('Smart overlay frame extraction timed out'))
  }, normalized.smartOverlayTimeoutMs)

  try {
    return await deps.track2FrameExtractor({
      sourceUrl: context.sourceUrl || context.url || context.metadata?.url || '',
      videoId: context.videoId || context.metadata?.videoId || null,
      metadata: {
        ...(context.metadata || {}),
        ...(durationSecondsFromContext(context)
          ? { durationSeconds: durationSecondsFromContext(context) }
          : {}),
      },
      limits: {
        maxVideoDurationSeconds: normalized.maxDurationSeconds,
        maxFrames: normalized.maxSmartOverlayFrames,
        maxFrameHardLimit: normalized.maxSmartOverlayFrames,
        maxExtractionBudgetMs: normalized.smartOverlayTimeoutMs,
        sampleStrategy: 'UNIFORM',
        sampledTimestamps,
      },
      budgetMs: normalized.smartOverlayTimeoutMs,
      signal: deps.signal || controller.signal,
      tmpDir: deps.tmpDir || null,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function runShortsTrack2V3SmartOverlayDryRun(context = {}, config = {}, deps = {}) {
  const normalized = normalizeShortsTrack2V3SmartOverlayConfig(config)
  const durationSeconds = durationSecondsFromContext(context)

  if (!normalized.track2V3SmartOverlayEnabled) {
    return {
      url: context.url || context.sourceUrl || context.metadata?.url || '',
      videoId: context.videoId || context.metadata?.videoId || null,
      duration: durationSeconds,
      status: 'DISABLED',
      sampledFrameCount: 0,
      selectedImageCount: 0,
      selectedImages: [],
      sampledFrames: [],
      configCaps: configCaps(normalized),
      providerCalls: providerCalls(),
      providerErrors: [],
      notes: ['Smart overlay selector is disabled by config.'],
    }
  }

  const frameResult = await extractFramesForSmartOverlay(context, normalized, deps)
  const frameStatus = safeString(frameResult.status || 'OK', 80).toUpperCase()
  const providerErrors = frameDiagnosticsToProviderErrors(frameResult)

  if (frameStatus !== 'OK') {
    return {
      url: context.url || context.sourceUrl || context.metadata?.url || '',
      videoId: context.videoId || context.metadata?.videoId || null,
      duration: durationSeconds,
      status: frameStatus,
      reason: frameResult.reason || 'FRAME_PROVIDER_UNAVAILABLE',
      sampledFrameCount: 0,
      selectedImageCount: 0,
      selectedImages: [],
      sampledFrames: [],
      configCaps: configCaps(normalized),
      providerCalls: providerCalls(),
      providerErrors,
      notes: [
        'Smart overlay dry-run did not call OCR or paid providers.',
        'Frame extraction was unavailable or failed.',
      ],
    }
  }

  const selectorResult = await selectShortsTrack2V3SmartOverlayCrops({
    frames: frameResult.frames,
    config: normalized,
    outputDir: deps.outputDir || '',
    deps,
    durationSeconds: durationSeconds || finiteNumber(frameResult.durationSeconds, null),
  })

  return {
    url: context.url || context.sourceUrl || context.metadata?.url || '',
    videoId: context.videoId || context.metadata?.videoId || null,
    duration: durationSeconds || finiteNumber(frameResult.durationSeconds, null),
    status: selectorResult.status,
    sampledFrameCount: selectorResult.sampledFrameCount,
    selectedImageCount: selectorResult.selectedImageCount,
    selectedImages: selectorResult.selectedImages,
    sampledFrames: selectorResult.sampledFrames,
    scoredImageCount: selectorResult.scoredImageCount,
    sampledTimestamps: Array.isArray(frameResult.sampledTimestamps) ? frameResult.sampledTimestamps : [],
    configCaps: configCaps(normalized),
    providerCalls: providerCalls(),
    providerErrors,
    notes: selectorResult.notes,
  }
}

export default {
  SMART_OVERLAY_CROP_VARIANTS,
  buildShortsTrack2V3SmartOverlaySampleTimestamps,
  createShortsTrack2V3SmartOverlayFrameExtractor,
  normalizeShortsTrack2V3SmartOverlayConfig,
  selectShortsTrack2V3SmartOverlayCrops,
  runShortsTrack2V3SmartOverlayDryRun,
}
