import dotenv from 'dotenv'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getShortsTrack2V3Config } from '../../src/services/shorts/track2-v3/shortsTrack2V3Config.js'
import { runShortsTrack2V3Pipeline } from '../../src/services/shorts/track2-v3/shortsTrack2V3PipelineService.js'

const scriptPath = fileURLToPath(import.meta.url)
const envPath = fileURLToPath(new URL('../../.env', import.meta.url))
const defaultOutputRoot = fileURLToPath(new URL('../../tmp/track2-v3-live/', import.meta.url))

dotenv.config({ path: envPath })

function timestampSlug(now = new Date()) {
  return now.toISOString().replace(/[:.]/gu, '-')
}

function candidateAddress(result = {}) {
  const bestCandidate = Array.isArray(result.candidates) ? result.candidates[0] : null
  return result.address ||
    result.bestResult?.formattedAddress ||
    bestCandidate?.addressFragment ||
    bestCandidate?.displayText ||
    null
}

export function summarizeTrack2V3LiveResult(result = {}, { wallMs = 0, outputDir = '' } = {}) {
  const metrics = result.metrics || {}
  const debug = result.debug || {}
  return {
    wallMs,
    status: result.status || result.resolution || 'UNKNOWN',
    track: result.track || null,
    resolution: result.resolution || null,
    reason: result.reason || null,
    durationSource: metrics.hydratedDurationSource || result.hydratedDurationSource ||
      result.mediaDurationSource || null,
    durationSeconds: metrics.timelineDurationSeconds ?? metrics.hydratedDurationSeconds ??
      result.timelineDurationSeconds ?? result.mediaDurationSeconds ?? null,
    frameCount: Number(metrics.frameCount || 0),
    normalFrameCount: Number(metrics.normalFrameCount || 0),
    normalTimestampRange: {
      minSeconds: metrics.normalTimestampMinSeconds ?? result.normalTimestampMinSeconds ?? null,
      maxSeconds: metrics.normalTimestampMaxSeconds ?? result.normalTimestampMaxSeconds ?? null,
      tailCoverageReached: metrics.normalTailCoverageReached ?? result.normalTailCoverageReached ?? null,
    },
    canonicalMediaPathUsed: Boolean(metrics.canonicalMediaPathUsed ?? result.canonicalMediaPathUsed),
    legacyFrameExtractorUsed: Boolean(metrics.legacyFrameExtractorUsed ?? result.legacyFrameExtractorUsed),
    mediaSessionReused: Boolean(metrics.mediaSessionReused ?? result.mediaSessionReused),
    mediaMetadataCalled: Boolean(metrics.mediaMetadataCalled ?? result.mediaMetadataCalled),
    mediaMetadataStatus: metrics.mediaMetadataStatus || result.mediaMetadataStatus || 'NOT_RUN',
    mediaAcquisitionAttemptCount: Number(
      metrics.mediaAcquisitionAttemptCount ?? result.mediaAcquisitionAttemptCount ?? 0,
    ),
    candidateEvidenceCount: Number(metrics.candidateEvidenceCount || 0),
    composableAddressSignalCount: Number(metrics.composableAddressSignalCount || 0),
    fusedAddressEvidenceCount: Number(metrics.fusedAddressEvidenceCount || 0),
    candidateCount: Number(metrics.candidateCount ?? result.candidates?.length ?? 0),
    candidateCountFromAdaptiveFrames: Number(metrics.candidateCountFromAdaptiveFrames || 0),
    candidateCountFromTailOverlay: Number(metrics.candidateCountFromTailOverlay || 0),
    candidateCountFromGeminiSelectedCrops: Number(metrics.candidateCountFromGeminiSelectedCrops || 0),
    geminiCalled: Boolean(metrics.geminiCalled ?? result.geminiCalled),
    geminiCropJudgeCalled: Boolean(metrics.geminiCropJudgeCalled ?? result.geminiCropJudgeCalled),
    asrCalled: Boolean(metrics.asrCalled ?? result.asrCalled),
    asrFallbackReason: result.asrFallbackReason || debug.asrFallbackReason || null,
    bestResult: result.bestResult || null,
    address: candidateAddress(result),
    outputDir,
    providerErrors: Array.isArray(result.providerErrors) ? result.providerErrors : [],
  }
}

export async function runTrack2V3Live(url, options = {}) {
  const sourceUrl = String(url || '').trim()
  if (!sourceUrl) throw new Error('A YouTube Shorts URL is required.')

  const env = options.env || process.env
  const outputDir = options.outputDir || path.join(
    options.outputRoot || defaultOutputRoot,
    timestampSlug(options.now || new Date()),
  )
  await fs.mkdir(outputDir, { recursive: true })

  const configured = getShortsTrack2V3Config(env)
  const track2V3Config = {
    ...configured,
    enabled: true,
    track2V3CanonicalOrchestratorEnabled: true,
    track2V3SmartOverlayEnabled: true,
    track2V3LocalOcrEnabled: true,
    ...(options.track2V3Config || {}),
  }
  const pipeline = options.pipeline || runShortsTrack2V3Pipeline
  const startedAt = Date.now()
  const result = await pipeline(
    { url: sourceUrl, sourceUrl },
    {
      ...(options.deps || {}),
      env,
      outputDir,
      track2V3Config,
      track2V3LiveDiagnosticsEnabled: options.track2V3LiveDiagnosticsEnabled !== false,
    },
  )
  const summary = summarizeTrack2V3LiveResult(result, {
    wallMs: Date.now() - startedAt,
    outputDir,
  })

  await Promise.all([
    fs.writeFile(path.join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8'),
    fs.writeFile(path.join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8'),
  ])
  return { result, summary, outputDir }
}

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error('Usage: node scripts/track2/runTrack2V3Live.js <youtube-shorts-url>')
    process.exitCode = 1
    return
  }

  try {
    const { summary } = await runTrack2V3Live(url)
    console.log(JSON.stringify(summary, null, 2))
  } catch (error) {
    console.error(JSON.stringify({
      status: 'ERROR',
      code: error?.code || 'TRACK2_V3_LIVE_RUNNER_ERROR',
      message: error?.message || String(error),
    }, null, 2))
    process.exitCode = 1
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath)
if (isMain) await main()
