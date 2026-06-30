import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

import {
  createLiveTrack2FrameExtractor,
  createLiveTrack2OcrProvider,
} from '../../src/services/shortsTrack2LiveProviderService.js'
import {
  runTrack2V3CheapOcrLive,
  runTrack2V3OcrBoostLive,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3LiveCheapOcrAdapter.js'
import { runShortsTrack2V3Pipeline } from '../../src/services/shorts/track2-v3/shortsTrack2V3PipelineService.js'
import { buildShortsTrack2V3DebugFrameReport } from '../../src/services/shorts/track2-v3/shortsTrack2V3DebugFrameReportService.js'

const backendRoot = fileURLToPath(new URL('../../', import.meta.url))
const envPath = path.join(backendRoot, '.env')
dotenv.config({ path: envPath })

function safeSegment(value, fallback = 'run') {
  const clean = String(value || '')
    .trim()
    .replace(/[^a-z0-9_-]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80)
  return clean || fallback
}

function videoIdFromShortsUrl(url = '') {
  const match = String(url).match(/\/shorts\/([^/?#]+)/u)
  return match?.[1] || ''
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/gu, '-')
}

function relativeBackendPath(filePath = '') {
  if (!filePath) return null
  return path.relative(backendRoot, filePath).replace(/\\/gu, '/')
}

async function copyArtifact(sourcePath, targetDir, fileName) {
  if (!sourcePath) return null
  try {
    await fs.mkdir(targetDir, { recursive: true })
    const extension = path.extname(sourcePath) || '.jpg'
    const targetPath = path.join(targetDir, `${fileName}${extension}`)
    await fs.copyFile(sourcePath, targetPath)
    return relativeBackendPath(targetPath)
  } catch {
    return null
  }
}

async function copyFrames(frames = [], stage, outputDir) {
  const targetDir = path.join(outputDir, 'frames')
  const copied = []

  for (const [index, frame] of (Array.isArray(frames) ? frames : []).entries()) {
    const sourcePath = frame.path || frame.imagePath
    const savedPath = await copyArtifact(
      sourcePath,
      targetDir,
      `${stage}-frame-${String(index).padStart(2, '0')}`,
    )
    copied.push({
      ...frame,
      savedPath,
    })
  }

  return copied
}

async function copyVariants(variants = [], stage, outputDir) {
  const targetDir = path.join(outputDir, 'ocr-images')
  const copied = []

  for (const [index, variant] of (Array.isArray(variants) ? variants : []).entries()) {
    const sourcePath = variant.path || variant.imagePath
    const frameIndex = Number.isFinite(Number(variant.frameIndex)) ? Number(variant.frameIndex) : index
    const variantName = safeSegment(variant.variant || variant.sourceType || 'variant', 'variant')
    const savedPath = await copyArtifact(
      sourcePath,
      targetDir,
      `${stage}-frame-${String(frameIndex).padStart(2, '0')}-${variantName}-${String(index).padStart(2, '0')}`,
    )
    copied.push({
      ...variant,
      savedPath,
    })
  }

  return copied
}

async function copyLiveArtifacts(liveResult = {}, stage, outputDir) {
  return {
    ...liveResult,
    frames: await copyFrames(liveResult.frames, stage, outputDir),
    ocrImages: await copyVariants(liveResult.ocrImages, stage, outputDir),
  }
}

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error('Usage: node scripts/track2/debugTrack2V3Frames.js <youtube-shorts-url>')
    process.exitCode = 1
    return
  }

  const videoId = videoIdFromShortsUrl(url)
  const outputDir = path.join(
    backendRoot,
    'tmp',
    'track2-v3-debug',
    `${safeSegment(videoId, 'unknown-video')}-${timestampSlug()}`,
  )
  await fs.mkdir(outputDir, { recursive: true })

  const cleanupDirs = new Set()
  const cleanupTrack2LiveProviders = async () => {
    const directories = Array.from(cleanupDirs)
    cleanupDirs.clear()
    await Promise.all(directories.map((directory) =>
      fs.rm(directory, { recursive: true, force: true }).catch(() => {})
    ))
  }
  const liveProviders = {
    track2FrameExtractor: createLiveTrack2FrameExtractor({
      registerCleanup: (directory) => {
        if (directory) cleanupDirs.add(directory)
      },
    }),
    track2OcrProvider: createLiveTrack2OcrProvider({
      fetchImpl: globalThis.fetch,
    }),
    cleanupTrack2LiveProviders,
  }
  let cheapLiveResult = {}
  let boostLiveResult = {}

  try {
    const deps = {
      ...liveProviders,
      track2V3LiveCheapOcrAdapter: async (context, config, liveDeps) => {
        cheapLiveResult = await runTrack2V3CheapOcrLive(context, config, {
          ...liveDeps,
          cleanupTrack2LiveProviders: null,
        })
        return cheapLiveResult
      },
      track2V3OcrBoostLiveAdapter: async (context, config, liveDeps) => {
        boostLiveResult = await runTrack2V3OcrBoostLive(context, config, {
          ...liveDeps,
          cleanupTrack2LiveProviders: null,
        })
        return boostLiveResult
      },
    }

    const result = await runShortsTrack2V3Pipeline(
      {
        url,
        sourceUrl: url,
        videoId,
        metadata: {
          url,
          videoId,
        },
      },
      deps,
    )
    const copiedCheap = await copyLiveArtifacts(cheapLiveResult, 'cheap', outputDir)
    const copiedBoost = await copyLiveArtifacts(boostLiveResult, 'boost', outputDir)
    const report = buildShortsTrack2V3DebugFrameReport({
      url,
      videoId,
      duration: result.debug?.framePlan?.cheap?.durationSeconds ?? null,
      result,
      cheapLiveResult: copiedCheap,
      boostLiveResult: copiedBoost,
      outputDir: relativeBackendPath(outputDir),
    })
    const reportPath = path.join(outputDir, 'report.json')
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

    console.log(JSON.stringify({
      outputDir: relativeBackendPath(outputDir),
      reportPath: relativeBackendPath(reportPath),
      track: result.track,
      resolution: result.resolution,
      reason: result.reason,
      metrics: result.metrics,
      bestOcrSnippets: result.debug?.bestOcrSnippets || [],
      candidates: result.candidates || [],
      providerErrors: result.providerErrors || [],
      liveCheapOcrAdapterRan: Boolean(result.debug?.liveCheapOcrAdapterRan),
      ocrBoostRan: Boolean(result.debug?.ocrBoostRan || result.metrics?.ocrBoostRan),
      ocrBoostReason: result.debug?.ocrBoostReason || null,
      frameImagesSaved: report.extractedFrames.filter((frame) => frame.path).length,
      ocrImagesSaved: report.ocrImageVariants.filter((variant) => variant.path).length,
    }, null, 2))
  } finally {
    await cleanupTrack2LiveProviders()
  }
}

await main()
