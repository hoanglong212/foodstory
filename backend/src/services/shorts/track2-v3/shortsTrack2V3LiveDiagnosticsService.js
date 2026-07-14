import { promises as fs } from 'node:fs'
import path from 'node:path'
import { normalizeShortsTrack2V3Text } from './shortsTrack2V3EvidenceStoreService.js'
import { analyzeShortsTrack2V3AddressSignal } from './shortsTrack2V3AddressSignalService.js'

function safeString(value, maxLength = 2000) {
  return String(value ?? '').slice(0, maxLength)
}

function finiteNumber(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function observation(block = {}, index = 0) {
  const rawText = normalizeShortsTrack2V3Text(block.rawText || block.normalizedText || block.text || '')
  const providerMetadata = block.providerMetadata || {}
  const signal = analyzeShortsTrack2V3AddressSignal(rawText)
  return {
    observationId: safeString(block.id || block.evidenceId || `ocr-observation-${index + 1}`, 160),
    rawText,
    bestAddressLine: safeString(providerMetadata.bestAddressLine, 1000) || null,
    confidence: finiteNumber(block.confidence, null),
    provider: safeString(block.source || block.provider, 80) || null,
    sourceType: safeString(block.sourceType, 100) || null,
    timestampSeconds: finiteNumber(block.timestampSeconds, null),
    frameIndex: finiteNumber(block.frameIndex, null),
    frameId: safeString(block.frameId, 120) || null,
    cropId: safeString(block.cropId, 160) || null,
    cropVariant: safeString(block.cropVariant || block.variant, 120) || null,
    episodeId: safeString(block.episodeId, 120) || null,
    segmentId: safeString(block.segmentId, 120) || null,
    startSeconds: finiteNumber(block.startSeconds, null),
    endSeconds: finiteNumber(block.endSeconds, null),
    psm: finiteNumber(providerMetadata.psm, null),
    preprocessVariant: safeString(
      providerMetadata.preprocessVariant || block.preprocessingVariant,
      120,
    ) || null,
    addressSignal: {
      signalClass: signal.signalClass,
      score: signal.score,
      strongAddressAnchor: signal.strongAddressAnchor,
      composableAddressSignal: signal.composableAddressSignal,
      features: signal.features,
      reasons: signal.reasons,
    },
  }
}

async function writeJson(outputDir, filename, value) {
  const filePath = path.join(outputDir, filename)
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')
  return filePath
}

export async function writeShortsTrack2V3LiveDiagnostics({
  enabled = false,
  outputDir = '',
  textBlocks = [],
  candidateResult = {},
  temporalConsensus = {},
  asrOpportunityWindows = [],
  asrFallbackResult = {},
  geminiCropJudgeResult = {},
  fusionResult = {},
} = {}) {
  if (!enabled || !outputDir) return { written: false, files: {} }
  await fs.mkdir(outputDir, { recursive: true })

  const observations = (Array.isArray(textBlocks) ? textBlocks : [])
    .slice(0, 200)
    .map(observation)
  const files = {}
  files.ocrObservations = await writeJson(outputDir, 'track2-v3-ocr-observations.json', {
    observationCount: observations.length,
    strongAddressSignalCount: observations.filter((item) => item.addressSignal.strongAddressAnchor).length,
    composableAddressSignalCount: observations.filter((item) => item.addressSignal.composableAddressSignal).length,
    observations,
  })
  files.candidateDiagnostics = await writeJson(outputDir, 'track2-v3-candidate-diagnostics.json', {
    candidateCount: Number(candidateResult.candidateCount || 0),
    rejectionSummary: candidateResult.rejectionSummary || {},
    rejectionReasonSummary: candidateResult.rejectionReasonSummary || {},
    diagnostics: Array.isArray(candidateResult.diagnostics)
      ? candidateResult.diagnostics.slice(0, 160)
      : [],
  })
  files.temporalConsensus = await writeJson(outputDir, 'track2-v3-temporal-consensus.json', {
    status: temporalConsensus.status || null,
    consensusBlockCount: Number(temporalConsensus.consensusBlockCount || temporalConsensus.consensusBlocks?.length || 0),
    consensusBlocks: Array.isArray(temporalConsensus.consensusBlocks)
      ? temporalConsensus.consensusBlocks.slice(0, 100)
      : [],
    fusionStatus: fusionResult.status || null,
    fusedEvidenceCount: Number(fusionResult.fusedEvidenceCount || 0),
    fusionClusters: Array.isArray(fusionResult.fusionClusters)
      ? fusionResult.fusionClusters.slice(0, 100)
      : [],
  })
  files.asrWindows = await writeJson(outputDir, 'track2-v3-asr-windows.json', {
    opportunityWindowCount: Array.isArray(asrOpportunityWindows) ? asrOpportunityWindows.length : 0,
    opportunityWindows: Array.isArray(asrOpportunityWindows) ? asrOpportunityWindows.slice(0, 20) : [],
    asrFallbackReason: asrFallbackResult.asrFallbackReason || null,
    asrWindowed: Boolean(asrFallbackResult.asrWindowed),
    asrWindowCountProcessed: Number(asrFallbackResult.asrWindowCountProcessed || 0),
    asrWindowSecondsProcessed: Number(asrFallbackResult.asrWindowSecondsProcessed || 0),
    asrFullAudioFallbackRan: Boolean(asrFallbackResult.asrFullAudioFallbackRan),
    candidateCountFromAsr: Number(asrFallbackResult.candidateCountFromAsr || 0),
  })
  files.geminiCropJudge = await writeJson(outputDir, 'track2-v3-gemini-crop-judge.json', {
    enabled: Boolean(geminiCropJudgeResult.enabled),
    called: Boolean(geminiCropJudgeResult.called),
    status: geminiCropJudgeResult.status || null,
    reason: geminiCropJudgeResult.reason || null,
    aggregateStatus: geminiCropJudgeResult.geminiCropJudgeAggregateStatus || null,
    selectedCropIds: Array.isArray(geminiCropJudgeResult.selectedCropIds)
      ? geminiCropJudgeResult.selectedCropIds.slice(0, 20)
      : [],
    rejectedCropIds: Array.isArray(geminiCropJudgeResult.rejectedCropIds)
      ? geminiCropJudgeResult.rejectedCropIds.slice(0, 40)
      : [],
    errors: Array.isArray(geminiCropJudgeResult.errors)
      ? geminiCropJudgeResult.errors.slice(0, 20).map((error) => ({
          code: safeString(error?.code, 120) || null,
          message: safeString(error?.message, 500) || null,
          httpStatus: finiteNumber(error?.httpStatus, null),
        }))
      : [],
  })

  return { written: true, files }
}

export default { writeShortsTrack2V3LiveDiagnostics }
