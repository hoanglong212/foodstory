import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

import { getShortsTrack2V3Config } from '../../src/services/shorts/track2-v3/shortsTrack2V3Config.js'
import {
  createShortsTrack2V3SmartOverlayFrameExtractor,
  runShortsTrack2V3SmartOverlayDryRun,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3SmartOverlaySelectorService.js'

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

function videoIdFromUrl(url = '') {
  const text = String(url || '').trim()
  const shortsMatch = text.match(/\/shorts\/([^/?#]+)/u)
  if (shortsMatch?.[1]) return shortsMatch[1]

  try {
    const parsed = new URL(text)
    if (parsed.hostname === 'youtu.be') return parsed.pathname.replace(/^\/+/u, '').split('/')[0] || ''
    return parsed.searchParams.get('v') || ''
  } catch {
    return ''
  }
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/gu, '-')
}

async function writeReport(outputDir, report) {
  const reportPath = path.join(outputDir, 'report.json')
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return reportPath
}

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error('Usage: node scripts/track2/debugTrack2V3SmartOverlay.js <youtube-shorts-url>')
    process.exitCode = 1
    return
  }

  const videoId = videoIdFromUrl(url)
  const baseConfig = getShortsTrack2V3Config(process.env)
  const config = {
    ...baseConfig,
    track2V3SmartOverlayDryRun: true,
    track2V3GoogleVisionEnabled: false,
    track2V3PlacesEnabled: false,
    track2V3GeminiVisionEnabled: false,
    track2V3LocalOcrEnabled: false,
  }
  const outputDir = path.join(
    backendRoot,
    'tmp',
    'track2-v3-smart-overlay',
    `${safeSegment(videoId, 'unknown-video')}-${timestampSlug()}`,
  )
  const extractionTmpRoot = path.join(outputDir, 'tmp')
  await fs.mkdir(outputDir, { recursive: true })
  await fs.mkdir(extractionTmpRoot, { recursive: true })

  const cleanupDirs = new Set()
  const cleanupTrack2LiveProviders = async () => {
    const directories = Array.from(cleanupDirs)
    cleanupDirs.clear()
    await Promise.all(directories.map((directory) =>
      fs.rm(directory, { recursive: true, force: true }).catch(() => {})
    ))
  }
  const track2FrameExtractor = createShortsTrack2V3SmartOverlayFrameExtractor({
    tmpRoot: extractionTmpRoot,
    registerCleanup: (directory) => {
      if (directory) cleanupDirs.add(directory)
    },
  })

  try {
    const report = await runShortsTrack2V3SmartOverlayDryRun(
      {
        url,
        sourceUrl: url,
        videoId,
        metadata: {
          url,
          videoId,
        },
      },
      config,
      {
        outputDir,
        keepSampledFrames: true,
        track2FrameExtractor,
      },
    )
    const finalReport = {
      ...report,
      outputDir,
      providerCalls: {
        googleVisionCalled: false,
        placesCalled: false,
        geminiCalled: false,
        localOcrCalled: false,
        asrCalled: false,
      },
      providerErrors: report.providerErrors || [],
      notes: [
        ...(Array.isArray(report.notes) ? report.notes : []),
        'Debug script intentionally did not construct Google Vision, Places, Gemini, ASR, or local OCR providers.',
      ],
    }
    const reportPath = await writeReport(outputDir, finalReport)

    console.log(JSON.stringify({
      outputDir,
      reportPath,
      url,
      videoId: videoId || null,
      sampledFrameCount: finalReport.sampledFrameCount,
      selectedImageCount: finalReport.selectedImageCount,
      providerCalls: finalReport.providerCalls,
      providerErrors: finalReport.providerErrors,
      selectedImages: finalReport.selectedImages.map((image) => ({
        timestampSeconds: image.timestampSeconds,
        variant: image.variant,
        score: image.score,
        cropPath: image.cropPath,
      })),
    }, null, 2))
  } finally {
    await cleanupTrack2LiveProviders()
  }
}

await main()
