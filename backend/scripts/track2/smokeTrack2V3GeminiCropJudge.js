import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'

import { getShortsTrack2V3Config } from '../../src/services/shorts/track2-v3/shortsTrack2V3Config.js'
import { runShortsTrack2V3GeminiCropJudge } from '../../src/services/shorts/track2-v3/shortsTrack2V3GeminiCropJudgeService.js'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(scriptDir, '../../.env') })

function argumentValue(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : ''
}

const imageArgument = argumentValue('--image')
if (!imageArgument) {
  console.error('Usage: npm run track2:v3:gemini-crop-judge:smoke -- --image <path>')
  process.exitCode = 1
} else if (!String(process.env.GEMINI_API_KEY || '').trim()) {
  console.error('GEMINI_API_KEY is required for the Gemini Crop Judge smoke command.')
  process.exitCode = 1
} else {
  const imagePath = path.resolve(imageArgument)
  try {
    await fs.access(imagePath)
    const outputDir = path.resolve(
      'tmp',
      'track2-v3-gemini-crop-judge-smoke',
      new Date().toISOString().replace(/[:.]/gu, '-'),
    )
    const config = {
      ...getShortsTrack2V3Config(process.env),
      track2V3GeminiCropJudgeEnabled: true,
    }
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: [{
        cropId: 'smoke-crop-001',
        cropPath: imagePath,
        frameId: 'smoke-frame-001',
        frameIndex: 0,
        timestampSeconds: 0,
        regionType: 'smoke_input',
      }],
      outputDir,
      config,
      env: process.env,
    })
    console.log(JSON.stringify({
      status: result.status,
      reason: result.reason,
      model: result.model,
      endpointType: result.endpointType,
      aggregateStatus: result.geminiCropJudgeAggregateStatus,
      requestedPageCount: result.geminiCropJudgeRequestedPageCount,
      successfulPageCount: result.geminiCropJudgeSuccessfulPageCount,
      failedPageCount: result.geminiCropJudgeFailedPageCount,
      partialSuccess: result.geminiCropJudgePartialSuccess,
      totalAttemptCount: result.geminiCropJudgeTotalAttemptCount,
      retryCount: result.geminiCropJudgeRetryCount,
      rateLimitCount: result.geminiCropJudgeRateLimitCount,
      timeoutCount: result.geminiCropJudgeTimeoutCount,
      serverErrorCount: result.geminiCropJudgeServerErrorCount,
      queueWaitMs: result.geminiCropJudgeQueueWaitMs,
      providerRuntimeMs: result.geminiCropJudgeProviderRuntimeMs,
      backoffMs: result.geminiCropJudgeBackoffMs,
      maxObservedConcurrency: result.geminiCropJudgeMaxObservedConcurrency,
      dedupHitCount: result.geminiCropJudgeDedupHitCount,
      selectedCropIds: result.selectedCropIds,
      rejectedCropIds: result.rejectedCropIds,
      pageResults: result.pageResults,
      pageArtifacts: result.pageArtifacts,
      errors: result.errors,
      resultPath: result.resultPath,
    }, null, 2))
    if (result.status === 'ERROR' || result.status === 'UNAVAILABLE') process.exitCode = 1
  } catch (error) {
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim()
    const safeMessage = String(error?.message || 'Smoke command failed.')
      .split(apiKey)
      .join('[REDACTED]')
      .slice(0, 300)
    console.error(JSON.stringify({
      status: 'ERROR',
      code: 'GEMINI_CROP_JUDGE_SMOKE_FAILED',
      message: safeMessage,
    }))
    process.exitCode = 1
  }
}
