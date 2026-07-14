import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

import { getShortsTrack2V3Config } from '../../src/services/shorts/track2-v3/shortsTrack2V3Config.js'
import { runShortsTrack2V3SmartOverlayOcr } from '../../src/services/shorts/track2-v3/shortsTrack2V3SmartOverlayOcrService.js'
import { createShortsTrack2V3SmartOverlayFrameExtractor } from '../../src/services/shorts/track2-v3/shortsTrack2V3SmartOverlaySelectorService.js'

const backendRoot = fileURLToPath(new URL('../../', import.meta.url))
dotenv.config({ path: path.join(backendRoot, '.env') })

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
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.replace(/^\/+/, '').split('/')[0] || ''
    }
    return parsed.searchParams.get('v') || ''
  } catch {
    return ''
  }
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/gu, '-')
}

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error('Usage: node scripts/track2/runTrack2V3SmartOverlayOcr.js <youtube-shorts-url>')
    process.exitCode = 1
    return
  }

  const videoId = videoIdFromUrl(url)
  const config = {
    ...getShortsTrack2V3Config(process.env),
    track2V3SmartOverlayEnabled: true,
    track2V3GoogleVisionEnabled: false,
    track2V3PlacesEnabled: false,
    track2V3GeminiVisionEnabled: false,
  }
  const outputDir = path.join(
    backendRoot,
    'tmp',
    'track2-v3-smart-overlay-ocr',
    `${safeSegment(videoId, 'unknown-video')}-${timestampSlug()}`,
  )
  const extractionTmpRoot = path.join(outputDir, 'tmp')
  await fs.mkdir(extractionTmpRoot, { recursive: true })

  const cleanupDirs = new Set()
  const cleanupTrack2LiveProviders = async () => {
    const directories = [...cleanupDirs]
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
    const report = await runShortsTrack2V3SmartOverlayOcr(
      {
        url,
        sourceUrl: url,
        videoId,
        metadata: { url, videoId },
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
      googleVisionCalled: false,
      placesCalled: false,
      geminiCalled: false,
      asrCalled: false,
    }
    const reportPath = path.join(outputDir, 'report.json')
    await fs.writeFile(reportPath, `${JSON.stringify(finalReport, null, 2)}\n`, 'utf8')

    console.log(JSON.stringify({
      outputDir,
      reportPath,
      url,
      videoId: videoId || null,
      resolution: finalReport.resolution,
      selectedImageCount: finalReport.selectedImages.length,
      localOcrCalled: finalReport.localOcrCalled,
      localOcrProvider: finalReport.localOcrProvider,
      localOcrBestSnippets: finalReport.localOcrBestSnippets,
      localOcrBestSnippetsByEngine: finalReport.localOcrBestSnippetsByEngine,
      localOcrEngineDiagnostics: finalReport.localOcrEngineDiagnostics,
      rawCandidateCount: finalReport.rawCandidateCount,
      keptCandidateCount: finalReport.keptCandidateCount,
      droppedCandidateCount: finalReport.droppedCandidateCount,
      candidates: finalReport.candidates,
      providerErrors: finalReport.providerErrors,
      googleVisionCalled: false,
      placesCalled: false,
      geminiCalled: false,
      asrCalled: false,
    }, null, 2))
  } finally {
    await cleanupTrack2LiveProviders()
  }
}

await main()
