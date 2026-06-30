import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { createTrack2LiveOcrProviderBundle } from '../../src/services/shortsTrack2LiveProviderService.js'
import { runShortsTrack2V3Pipeline } from '../../src/services/shorts/track2-v3/shortsTrack2V3PipelineService.js'

const envPath = fileURLToPath(new URL('../../.env', import.meta.url))
dotenv.config({ path: envPath })

const url = process.argv[2]

if (!url) {
  console.error('Usage: node scripts/track2/runTrack2V3Live.js <youtube-shorts-url>')
  process.exitCode = 1
} else {
  const liveProviders = createTrack2LiveOcrProviderBundle({
    fetchImpl: globalThis.fetch,
  })

  try {
    const result = await runShortsTrack2V3Pipeline(
      { url, sourceUrl: url },
      liveProviders,
    )
    console.log(JSON.stringify({
      track: result.track,
      resolution: result.resolution,
      reason: result.reason,
      intent: result.intent,
      mustNotResolve: result.mustNotResolve,
      metrics: result.metrics,
      ocrBoostRan: Boolean(result.metrics?.ocrBoostRan || result.debug?.ocrBoostRan),
      ocrBoostReason: result.debug?.ocrBoostReason || null,
      framePlan: result.debug?.framePlan || null,
      ocrVariants: result.debug?.ocrVariants || null,
      cheapBestOcrSnippets: result.debug?.cheapBestOcrSnippets || [],
      boostBestOcrSnippets: result.debug?.boostBestOcrSnippets || [],
      bestOcrSnippets: result.debug?.bestOcrSnippets || [],
      candidateCountBeforeBoost: result.debug?.candidateCountBeforeBoost ?? null,
      candidateCountAfterBoost: result.debug?.candidateCountAfterBoost ?? null,
      candidateQualityGateRan: Boolean(result.debug?.candidateQualityGateRan || result.metrics?.candidateQualityGateRan),
      rawCandidateCount: result.metrics?.rawCandidateCount ?? result.debug?.rawCandidateCount ?? null,
      droppedCandidateCount: result.metrics?.droppedCandidateCount ?? result.debug?.droppedCandidateCount ?? null,
      droppedCandidateReasons: result.debug?.droppedCandidateReasons || {},
      finalCandidateCount: result.metrics?.candidateCount ?? (result.candidates || []).length,
      candidates: result.candidates || [],
      providerErrors: result.providerErrors || [],
      liveCheapOcrAdapterRan: Boolean(result.debug?.liveCheapOcrAdapterRan),
      geminiCalled: Boolean(result.metrics?.geminiCalled),
      placesCalled: Boolean(result.metrics?.placesCalled),
    }, null, 2))
  } finally {
    await liveProviders.cleanupTrack2LiveProviders?.()
  }
}
