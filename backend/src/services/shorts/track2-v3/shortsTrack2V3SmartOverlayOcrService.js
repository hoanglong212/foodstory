import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { getShortsTrack2V3Config } from './shortsTrack2V3Config.js'
import { classifyShortsTrack2V3Intent } from './shortsTrack2V3IntentClassifierService.js'
import {
  collectShortsTrack2V3Evidence,
  detectShortsTrack2V3EvidenceTokens,
  foldVietnameseText,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'
import { fuseShortsTrack2V3Evidence } from './shortsTrack2V3EvidenceFusionService.js'
import { buildShortsTrack2V3Candidates } from './shortsTrack2V3CandidateBuilderService.js'
import { parseShortsTrack2V3NamedAdminAddress } from './shortsTrack2V3NamedAdminAddressService.js'
import {
  applyShortsTrack2V3CandidateQualityGate,
  rankShortsTrack2V3CandidatesForReview,
} from './shortsTrack2V3CandidateQualityGateService.js'
import { buildShortsTrack2V3Response } from './shortsTrack2V3ResponseBuilder.js'
import { runShortsTrack2V3LocalOcrProvider } from './shortsTrack2V3LocalOcrProviderService.js'
import { runShortsTrack2V3GeminiCropJudge } from './shortsTrack2V3GeminiCropJudgeService.js'
import { runShortsTrack2V3SmartOverlayDryRun } from './shortsTrack2V3SmartOverlaySelectorService.js'
import { runShortsTrack2V3AdaptiveFrameSampling } from './shortsTrack2V3AdaptiveFrameSamplingService.js'
import {
  prepareShortsTrack2V3TailOverlayOcrEscalation,
  SHORTS_TRACK2_V3_TAIL_OVERLAY_REASONS,
} from './shortsTrack2V3TailOverlayOcrEscalationService.js'
import { scoreShortsTrack2V3TesseractOutput } from './shortsTrack2V3TesseractOcrScoringService.js'
import {
  analyzeShortsTrack2V3HouseNumberCandidate,
  stripShortsTrack2V3DateTimeNoise,
} from './shortsTrack2V3OcrHouseNumberSafetyService.js'
import {
  buildMetadataCandidatesFromEvidence,
  extractMetadataEvidence,
  mergeMetadataCandidatesWithExisting,
} from './shortsTrack2V3MetadataEvidenceService.js'
import { runShortsTrack2V3AsrFallback } from './shortsTrack2V3AsrFallbackService.js'
import { createShortsTrack2V3MediaSession } from './shortsTrack2V3MediaSessionService.js'
import { evaluateShortsTrack2V3LateRescueSufficiency } from './shortsTrack2V3LateRescueSufficiencyService.js'
import { buildShortsTrack2V3TemporalOcrConsensus } from './shortsTrack2V3TemporalOcrConsensusService.js'
import { buildShortsTrack2V3AsrOpportunityWindows } from './shortsTrack2V3AsrOpportunityWindowService.js'
import { analyzeShortsTrack2V3AddressSignal } from './shortsTrack2V3AddressSignalService.js'
import { writeShortsTrack2V3LiveDiagnostics } from './shortsTrack2V3LiveDiagnosticsService.js'

function safeString(value, maxLength = 1000) {
  return String(value || '').trim().slice(0, maxLength)
}

function finiteNumber(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeBbox(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).map((point) => {
    if (!Array.isArray(point) || point.length < 2) return null
    const x = finiteNumber(point[0], null)
    const y = finiteNumber(point[1], null)
    return x == null || y == null ? null : [Math.trunc(x), Math.trunc(y)]
  }).filter(Boolean)
}

function sanitizeLocalOcrErrorDetails(value) {
  if (!value || typeof value !== 'object') return null
  const details = {
    pythonExecutable: safeString(value.pythonExecutable, 1000),
    readerLoadedOk: Boolean(value.readerLoadedOk),
    imageCountReceived: Math.max(0, Math.trunc(finiteNumber(value.imageCountReceived, 0))),
    firstImagePathExists: Boolean(value.firstImagePathExists),
  }
  if (Object.hasOwn(value, 'easyocrImportOk')) {
    details.easyocrImportOk = Boolean(value.easyocrImportOk)
  }
  if (Object.hasOwn(value, 'paddleocrImportOk')) {
    details.paddleocrImportOk = Boolean(value.paddleocrImportOk)
  }
  const exceptionClass = safeString(value.exceptionClass, 200)
  const exceptionMessage = safeString(value.exceptionMessage, 1000)
  const exitCode = finiteNumber(value.exitCode, null)
  if (exceptionClass) details.exceptionClass = exceptionClass
  if (exceptionMessage) details.exceptionMessage = exceptionMessage
  if (exitCode != null) details.exitCode = exitCode
  return details
}

function normalizeContext(input = {}) {
  if (typeof input === 'string') {
    return { url: input, sourceUrl: input, metadata: {} }
  }
  const metadata = input.metadata || {}
  return {
    ...input,
    url: input.url || input.sourceUrl || metadata.url || null,
    sourceUrl: input.sourceUrl || input.url || metadata.url || null,
    videoId: input.videoId || metadata.videoId || null,
    metadata,
    title: input.title || metadata.title || '',
    description: input.description || metadata.description || '',
    channelTitle: input.channelTitle || metadata.channelTitle || '',
  }
}

function sanitizeProviderError(error = {}, fallbackCode = 'LOCAL_OCR_PROVIDER_ERROR') {
  const code = safeString(error?.code || fallbackCode, 120)
  const provider = safeString(error?.provider || 'local_ocr', 80)
  const knownMessages = {
    LOCAL_OCR_PROVIDER_UNAVAILABLE: 'Local OCR provider is unavailable.',
    LOCAL_PADDLEOCR_UNAVAILABLE: 'PaddleOCR is unavailable.',
    LOCAL_EASYOCR_UNAVAILABLE: 'EasyOCR is unavailable.',
    LOCAL_TESSERACT_UNAVAILABLE: 'Tesseract CLI is unavailable.',
    LOCAL_OCR_TIMEOUT: 'Local OCR exceeded its time budget.',
    LOCAL_PADDLEOCR_ERROR: 'PaddleOCR failed safely.',
    LOCAL_EASYOCR_ERROR: 'EasyOCR failed safely.',
    LOCAL_TESSERACT_IMAGE_ERROR: 'Tesseract failed safely for one selected crop.',
    LOCAL_OCR_PROVIDER_ERROR: 'Local OCR failed safely.',
  }
  const sanitized = {
    code,
    message: knownMessages[code] || safeString(error?.message || 'Provider failed safely.', 300),
    provider,
  }
  const details = sanitizeLocalOcrErrorDetails(error?.details)
  if (details) sanitized.details = details
  return sanitized
}

function localSource(value, fallback = 'local_easyocr') {
  const source = safeString(value, 80).toLowerCase()
  return ['local_paddleocr', 'local_easyocr', 'local_tesseract'].includes(source)
    ? source
    : fallback
}

function fallbackLocalSource(provider, config) {
  const normalized = safeString(provider, 80).toLowerCase()
  if (normalized === 'local_paddleocr' || config.track2V3LocalOcrProvider === 'paddleocr') {
    return 'local_paddleocr'
  }
  if (normalized === 'local_tesseract' || config.track2V3LocalOcrProvider === 'tesseract') {
    return 'local_tesseract'
  }
  return 'local_easyocr'
}

function selectedImageForBlock(block = {}, selectedImages = [], index = 0) {
  const blockPath = safeString(block.imagePath, 2000)
  if (blockPath) {
    const matched = selectedImages.find((image) =>
      safeString(image.cropPath || image.imagePath || image.path, 2000) === blockPath
    )
    if (matched) return matched
  }
  return selectedImages[index] || {}
}

function normalizeLocalOcrTextBlocks(
  blocks = [],
  selectedImages = [],
  provider,
  config = {},
  selectionRiskFlag = null,
) {
  const fallbackSource = fallbackLocalSource(provider, config)
  return (Array.isArray(blocks) ? blocks : [])
    .map((block, index) => {
      const rawText = normalizeShortsTrack2V3Text(block?.rawText || block?.text || '')
      if (!rawText) return null
      const image = selectedImageForBlock(block, selectedImages, index)
      const imagePath = safeString(
        block.imagePath || image.cropPath || image.imagePath || image.path,
        2000,
      )
      const cropVariant = safeString(
        block.cropVariant || block.imageVariant || image.variant || image.cropVariant,
        120,
      ) || null
      const source = localSource(block.source || block.provider, fallbackSource)
      const metadata = block.providerMetadata && typeof block.providerMetadata === 'object'
        ? block.providerMetadata
        : {}

      return {
        id: safeString(block.id || `local-ocr:${index}`, 120),
        provider: source,
        source,
        sourceType: safeString(
          block.sourceType || image.sourceType || 'smart_overlay_crop',
          120,
        ),
        rawText,
        normalizedText: normalizeShortsTrack2V3Text(block.normalizedText || rawText),
        confidence: Math.max(0, Math.min(1, finiteNumber(block.confidence, 0))),
        bbox: normalizeBbox(block.bbox),
        imagePath: imagePath || null,
        frameIndex: finiteNumber(block.frameIndex ?? image.frameIndex, null),
        timestampSeconds: finiteNumber(
          block.timestampSeconds ?? image.timestampSeconds,
          null,
        ),
        episodeId: safeString(block.episodeId || image.episodeId, 120) || null,
        segmentId: safeString(block.segmentId || image.segmentId, 120) || null,
        startSeconds: finiteNumber(block.startSeconds ?? image.startSeconds, null),
        endSeconds: finiteNumber(block.endSeconds ?? image.endSeconds, null),
        episodeSupportCount: finiteNumber(
          block.episodeSupportCount ?? image.episodeSupportCount,
          1,
        ),
        imageVariant: cropVariant,
        cropVariant,
        preprocessingVariant: safeString(
          block.preprocessingVariant || metadata.preprocessVariant,
          80,
        ) || null,
        forceReviewOnly: true,
        riskFlags: [
          ...(Array.isArray(block.riskFlags) ? block.riskFlags : []),
          ...(selectionRiskFlag ? [selectionRiskFlag] : []),
        ].map((flag) => safeString(flag, 80)).filter(Boolean),
        providerMetadata: {
          adapter: safeString(metadata.adapter || source, 80),
          languages: Array.isArray(metadata.languages)
            ? metadata.languages.map((language) => safeString(language, 20)).filter(Boolean)
            : [],
          localOnly: true,
          ...(selectionRiskFlag ? { selectionSource: selectionRiskFlag } : {}),
          psm: finiteNumber(metadata.psm, null),
          preprocessVariant: safeString(
            metadata.preprocessVariant || block.preprocessingVariant,
            80,
          ) || null,
          ocrScore: finiteNumber(metadata.ocrScore, null),
          bestAddressLine: safeString(metadata.bestAddressLine, 300) || null,
          lowConfidence: Boolean(metadata.lowConfidence),
          uncertainHouseNumber: Boolean(metadata.uncertainHouseNumber),
          qualityFlags: Array.isArray(metadata.qualityFlags)
            ? metadata.qualityFlags.map((flag) => safeString(flag, 80)).filter(Boolean)
            : [],
          attemptCount: finiteNumber(metadata.attemptCount, null),
          selectionScore: finiteNumber(metadata.selectionScore, null),
          consensusCount: finiteNumber(metadata.consensusCount, null),
          attemptedPsms: Array.isArray(metadata.attemptedPsms)
            ? metadata.attemptedPsms.map(Number).filter(Number.isFinite)
            : [],
          attemptedPreprocessVariants: Array.isArray(metadata.attemptedPreprocessVariants)
            ? metadata.attemptedPreprocessVariants
                .map((variant) => safeString(variant, 80))
                .filter(Boolean)
            : [],
          attemptSummaries: Array.isArray(metadata.attemptSummaries)
            ? metadata.attemptSummaries.slice(0, 8).map((attempt) => ({
                preprocessVariant: safeString(attempt?.preprocessVariant, 80),
                psm: finiteNumber(attempt?.psm, null),
                score: finiteNumber(attempt?.score, null),
                selectionScore: finiteNumber(attempt?.selectionScore, null),
                consensusCount: finiteNumber(attempt?.consensusCount, null),
                confidence: finiteNumber(attempt?.confidence, null),
                bestAddressLine: safeString(attempt?.bestAddressLine, 300) || null,
                qualityFlags: Array.isArray(attempt?.qualityFlags)
                  ? attempt.qualityFlags.map((flag) => safeString(flag, 80)).filter(Boolean)
                  : [],
              }))
            : [],
        },
      }
    })
    .filter(Boolean)
}

function bestSnippets(blocks = []) {
  const seen = new Set()
  const snippets = []
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const text = normalizeShortsTrack2V3Text(block.normalizedText || block.rawText)
      .replace(/\s+/gu, ' ')
    if (!text) continue
    const snippet = text.length > 180 ? `${text.slice(0, 177)}...` : text
    const key = snippet.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    snippets.push(snippet)
    if (snippets.length >= 8) break
  }
  return snippets
}

function uniqueAdditionalOcrTextBlocks(existing = [], additions = []) {
  const seen = new Set((Array.isArray(existing) ? existing : []).map((block) =>
    normalizeShortsTrack2V3Text(block.normalizedText || block.rawText).toLowerCase()
  ).filter(Boolean))
  return (Array.isArray(additions) ? additions : []).filter((block) => {
    const key = normalizeShortsTrack2V3Text(block.normalizedText || block.rawText).toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function hasCandidateAddressLine(evidence = {}) {
  const text = normalizeShortsTrack2V3Text(evidence.rawText || evidence.normalizedText)
  return [text, ...text.split('\n')].filter(Boolean).some((candidateText) => Boolean(
    parseShortsTrack2V3NamedAdminAddress(candidateText) ||
    analyzeShortsTrack2V3AddressSignal(candidateText).composableAddressSignal
  ))
}

function classifySelectorDiagnosis({
  selectorResult = {},
  providerErrors = [],
  localOcrTextBlocks = [],
  candidateEvidence = [],
} = {}) {
  const status = safeString(selectorResult.status, 80).toUpperCase()
  if (status && !['OK', 'NO_SELECTED_IMAGES'].includes(status)) return 'PROVIDER_UNAVAILABLE'
  if ((Array.isArray(providerErrors) ? providerErrors : []).some((error) =>
    /(?:UNAVAILABLE|YTDLP|DOWNLOAD|FRAME_PROVIDER|EXTRACTION_FAILED)/iu.test(
      `${error?.code || ''} ${error?.message || ''}`,
    )
  )) {
    return 'PROVIDER_UNAVAILABLE'
  }
  if (!selectorResult.selectorDiagnosticsPath) return 'UNKNOWN'
  if (Number(selectorResult.sampledFrameCount || 0) === 0) return 'FRAME_SAMPLING_UNCLEAR'
  if (Number(selectorResult.generatedCropCount ?? selectorResult.scoredImageCount ?? 0) === 0) {
    return 'CROP_REGION_UNCLEAR'
  }
  if (Number(selectorResult.selectedImageCount || 0) > 0 && candidateEvidence.length === 0) {
    return 'SELECTED_CROPS_NO_ADDRESS_ANCHOR'
  }
  if (localOcrTextBlocks.length > 0 && candidateEvidence.length === 0) {
    return 'OCR_TEXT_WITHOUT_ADDRESS_ANCHOR'
  }
  return 'UNKNOWN'
}

function cleanLocalOcrFusedEvidence(fusionResult = {}, baseEvidence = []) {
  const baseById = new Map(baseEvidence.map((item) => [item.id, item]))
  return (Array.isArray(fusionResult.fusedEvidence) ? fusionResult.fusedEvidence : baseEvidence)
    .filter((item) => {
      if (item?.source !== 'track2_v3_evidence_fusion') return true
      const sourceItems = (Array.isArray(item.evidenceIds) ? item.evidenceIds : [])
        .map((id) => baseById.get(id))
        .filter(Boolean)
      if (!sourceItems.length) return false

      const longestSourceText = Math.max(...sourceItems.map((source) =>
        normalizeShortsTrack2V3Text(source.rawText).length
      ))
      const fusedSignal = analyzeShortsTrack2V3AddressSignal(item.rawText)
      const crossStagePartialConsensus = item.fusion?.reason === 'CROSS_STAGE_PARTIAL_ADDRESS_CONSENSUS'
      if (crossStagePartialConsensus) {
        return Boolean(
          fusedSignal.signalClass === 'HOUSE_STREET_PARTIAL' &&
          Number(item.supportCount || 0) >= 2 &&
          normalizeShortsTrack2V3Text(item.rawText).length <= longestSourceText * 4
        )
      }

      if (sourceItems.some((source) =>
        !['local_paddleocr', 'local_tesseract', 'local_easyocr'].includes(source.source)
      )) {
        return true
      }

      const bestSourceScore = Math.max(...sourceItems.map((source) =>
        finiteNumber(source.providerMetadata?.ocrScore, 0)
      ))
      const fusedScoring = scoreShortsTrack2V3TesseractOutput({
        rawText: item.rawText,
        confidence: item.confidence,
        preprocessVariant: 'evidence_fusion',
        psm: 6,
      })
      const complementarySameFrame = [
        'SAME_FRAME_COMPLEMENTARY',
        'CROSS_EPISODE_SAME_FRAME_COMPLEMENTARY',
      ].includes(item.fusion?.reason)
      if (complementarySameFrame) {
        return Boolean(
          fusedSignal.strongAddressAnchor &&
          Number(item.supportCount || 0) >= 2 &&
          normalizeShortsTrack2V3Text(item.rawText).length <= longestSourceText * 3
        )
      }
      return Boolean(
        fusedScoring.score > bestSourceScore + 10 &&
        normalizeShortsTrack2V3Text(item.rawText).length <= longestSourceText * 1.5
      )
    })
}

function evidenceForCandidate(candidate = {}, evidence = []) {
  const ids = new Set(Array.isArray(candidate.evidenceIds) ? candidate.evidenceIds : [])
  return evidence.filter((item) => ids.has(item.id))
}

function candidateAddressSignature(candidate = {}) {
  const text = normalizeShortsTrack2V3Text(
    candidate.addressFragment || candidate.displayText || candidate.placeName,
  )
  const scoring = scoreShortsTrack2V3TesseractOutput({ rawText: text, confidence: 1 })
  const line = scoring.bestAddressLine || text
  const folded = line
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
  const house = folded.match(/(?:^|\s)(\d{1,5})(?:\s+(\d{1,4}))?\s*\/\s*(\d{1,5})(?=$|\s|[,.;:-])/iu)
  const plainHouse = safeString(candidate.houseNumberToken, 80).match(/^\d{1,5}[a-z]?$/iu)
  const ward = folded.match(/\b(?:phuong|phudng|phung|phuung|phurong|p\.?)\s*([0-9o]+)\b/iu)
  const district = folded.match(/\b(?:quan|qudn|qun|q\.?)\s*([0-9o]+)\b/iu)
  const adminSignature = (value) => String(value || '').replace(/o/giu, '0')
  if (house) {
    return [
      `h:${house[1]}:${house[2] || ''}:${house[3]}`,
      `w:${adminSignature(ward?.[1])}`,
      `d:${adminSignature(district?.[1])}`,
    ].join('|')
  }
  if (plainHouse) {
    return [
      `h:${plainHouse[0].toLowerCase()}`,
      `w:${adminSignature(ward?.[1])}`,
      `d:${adminSignature(district?.[1])}`,
    ].join('|')
  }
  return `text:${folded.replace(/[^a-z0-9]+/gu, '').slice(0, 160)}`
}

function candidateLocalOcrScore(candidate = {}, evidence = []) {
  const sourceEvidence = evidenceForCandidate(candidate, evidence)
  const providerScore = Math.max(
    0,
    ...sourceEvidence.map((item) => finiteNumber(item.providerMetadata?.ocrScore, 0)),
  )
  const confidence = Math.max(0, ...sourceEvidence.map((item) => finiteNumber(item.confidence, 0)))
  const displayText = normalizeShortsTrack2V3Text(
    candidate.addressFragment || candidate.displayText || candidate.placeName,
  )
  const localScore = scoreShortsTrack2V3TesseractOutput({ rawText: displayText, confidence }).score
  const addressSignal = analyzeShortsTrack2V3AddressSignal(displayText)
  const claimedHouseNumberParts = new Set(
    safeString(addressSignal.features?.houseNumber, 80).match(/\d+/gu) || [],
  )
  const suspiciousExtraNumberCount = (displayText.match(/\b\d{3,5}\b/gu) || [])
    .filter((token) => !claimedHouseNumberParts.has(token))
    .length
  const suspiciousExtraNumberPenalty = suspiciousExtraNumberCount * 35
  const typeBonus = candidate.type === 'OCR_PLACE_PLUS_PARTIAL_ADDRESS' ? 5 : 0
  const noisyMenuPlacePenalty = candidate.placeName && /\b\d+\s*[kKoO]{1,2}\b/u.test(candidate.placeName)
    ? 20
    : 0
  return Math.max(providerScore, localScore) +
    typeBonus -
    suspiciousExtraNumberPenalty -
    noisyMenuPlacePenalty -
    displayText.length / 500
}

function cleanLocalOcrCandidates(candidates = [], evidence = [], context = {}, intent = {}) {
  const prepared = (Array.isArray(candidates) ? candidates : []).map((candidate) => {
    const sourceEvidence = evidenceForCandidate(candidate, evidence)
    const confidence = Math.max(0, ...sourceEvidence.map((item) => finiteNumber(item.confidence, 0)))
    const displayText = normalizeShortsTrack2V3Text(
      candidate.addressFragment || candidate.displayText || candidate.placeName,
    )
    const scoring = scoreShortsTrack2V3TesseractOutput({ rawText: displayText, confidence })
    const evidenceLowConfidence = sourceEvidence.some((item) =>
      item.providerMetadata?.lowConfidence || item.providerMetadata?.uncertainHouseNumber
    )
    const riskFlags = new Set(Array.isArray(candidate.riskFlags) ? candidate.riskFlags : [])
    riskFlags.add('REVIEW_ONLY')
    if (evidenceLowConfidence || scoring.lowConfidence) riskFlags.add('LOW_CONFIDENCE_OCR')
    const houseNumberSafety = analyzeShortsTrack2V3HouseNumberCandidate(candidate, evidence)
    const sourceDateTimeNoise = [...new Set(sourceEvidence.flatMap((item) =>
      stripShortsTrack2V3DateTimeNoise(item.rawText || item.normalizedText).removed
    ))]
    if (houseNumberSafety.noisyHouseNumber) {
      riskFlags.add('NOISY_HOUSE_NUMBER')
      riskFlags.add('LOW_CONFIDENCE_OCR')
    }
    if (houseNumberSafety.normalizationApplied.includes('NORMALIZED_WARD_TEXT') ||
      houseNumberSafety.normalizationApplied.includes('NORMALIZED_DISTRICT_TEXT') ||
      houseNumberSafety.normalizationApplied.includes('NORMALIZED_ADMIN_DIGIT')) {
      riskFlags.add('OCR_NORMALIZED_ADMIN')
      riskFlags.add('LOW_CONFIDENCE_OCR')
    }
    if (houseNumberSafety.normalizationApplied.includes('NORMALIZED_STREET_MARKER')) {
      riskFlags.add('OCR_NOISY_STREET')
      riskFlags.add('LOW_CONFIDENCE_OCR')
    }
    if (houseNumberSafety.normalizationApplied.includes('REMOVED_DATE_TIME_NOISE') || sourceDateTimeNoise.length) {
      riskFlags.add('DATE_TIME_REMOVED_FROM_ADDRESS')
      riskFlags.add('LOW_CONFIDENCE_OCR')
    }
    const normalizedCandidate = {
      ...candidate,
      addressFragment: candidate.addressFragment
        ? houseNumberSafety.normalizedAddressFragment
        : candidate.addressFragment,
      displayText: candidate.addressFragment
        ? candidate.placeName && !riskFlags.has('OCR_PLACE_PREFIX_STRIPPED')
          ? `${candidate.placeName} - ${houseNumberSafety.normalizedAddressFragment}`
          : houseNumberSafety.normalizedAddressFragment
        : candidate.displayText,
      originalAddressFragment: houseNumberSafety.originalAddressFragment || null,
      normalizedAddressFragment: houseNumberSafety.normalizedAddressFragment || null,
      houseNumberToken: houseNumberSafety.houseNumberToken,
      houseNumberAlternatives: houseNumberSafety.houseNumberAlternatives,
      houseNumberConflict: houseNumberSafety.houseNumberConflict,
      normalizationApplied: houseNumberSafety.normalizationApplied,
      dateTimeNoiseRemoved: [...new Set([
        ...houseNumberSafety.dateTimeNoiseRemoved,
        ...sourceDateTimeNoise,
      ])],
    }
    return {
      ...normalizedCandidate,
      canAutoResolve: false,
      riskFlags: [...riskFlags],
      localOcrScore: candidateLocalOcrScore(normalizedCandidate, evidence) +
        houseNumberSafety.selectionAdjustment,
      localOcrSignature: candidateAddressSignature(normalizedCandidate),
      localOcrContextSignature: houseNumberSafety.contextSignature,
    }
  })
  const bestBySignature = new Map()
  for (const candidate of prepared) {
    const existing = bestBySignature.get(candidate.localOcrSignature)
    if (!existing || candidate.localOcrScore > existing.localOcrScore) {
      bestBySignature.set(candidate.localOcrSignature, candidate)
    }
  }
  const rankedCandidates = [...bestBySignature.values()]
    .sort((a, b) => b.localOcrScore - a.localOcrScore)
  const bestByConflictContext = new Map()
  for (const candidate of rankedCandidates) {
    const key = candidate.houseNumberConflict && candidate.localOcrContextSignature
      ? `conflict:${candidate.localOcrContextSignature}`
      : `candidate:${candidate.localOcrSignature}`
    if (!bestByConflictContext.has(key)) bestByConflictContext.set(key, candidate)
  }
  const maxCandidates = intent.intent === 'MULTI_PLACE_OR_LIST' || context.fixtureCase?.category === 'multi_candidate' ? 5 : 2
  const candidatesAfterCleanup = [...bestByConflictContext.values()]
    .slice(0, maxCandidates)
    .map(({
      localOcrScore,
      localOcrSignature,
      localOcrContextSignature,
      ...candidate
    }) => candidate)
  return {
    candidates: candidatesAfterCleanup,
    droppedCandidateCount: Math.max(0, prepared.length - candidatesAfterCleanup.length),
  }
}

function sanitizeEngineRuns(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).slice(0, 6).map(([key, run]) => {
    const provider = localSource(run?.provider || key, safeString(key, 80))
    return [provider, {
      provider,
      status: safeString(run?.status, 40) || 'UNKNOWN',
      imageCountSent: Math.max(0, Math.trunc(finiteNumber(run?.imageCountSent, 0))),
      runtimeMs: Math.max(0, finiteNumber(run?.runtimeMs, 0)),
      attemptCount: Math.max(0, Math.trunc(finiteNumber(run?.attemptCount, 0))),
      fastAttemptCount: Math.max(0, Math.trunc(finiteNumber(run?.fastAttemptCount, 0))),
      deepAttemptCount: Math.max(0, Math.trunc(finiteNumber(run?.deepAttemptCount, 0))),
      deepPassImageCount: Math.max(0, Math.trunc(finiteNumber(run?.deepPassImageCount, 0))),
      addressRankedInput: Boolean(run?.addressRankedInput),
      bestSnippets: (Array.isArray(run?.bestSnippets) ? run.bestSnippets : [])
        .slice(0, 8)
        .map((snippet) => safeString(snippet, 180))
        .filter(Boolean),
    }]
  }))
}


function stageEvidenceFromBlocks(blocks = []) {
  const ids = new Set()
  const texts = []
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const id = String(block?.id || '').trim()
    if (id) ids.add(id)
    const text = normalizeShortsTrack2V3Text(block?.normalizedText || block?.rawText || block?.text || '')
      .replace(/\s+/gu, ' ')
      .trim()
    if (text) texts.push(text)
  }
  return { ids, texts }
}

function comparableTokens(value = '') {
  return new Set(
    foldVietnameseText(value)
      .match(/[a-z0-9]{2,}/giu)?.filter((token) =>
        !['phuong', 'quan', 'duong', 'ward', 'district', 'com', 'mon', 'ngon'].includes(token)
      ) || [],
  )
}

function firstNumberToken(value = '') {
  return foldVietnameseText(value).match(/\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)?/iu)?.[0] || null
}

function numberTokens(value = '') {
  return foldVietnameseText(value).match(/\d{1,5}/giu) || []
}

function candidateReferencesStage(candidate = {}, stageEvidence = {}, stageFlag = '') {
  const evidenceIds = Array.isArray(candidate.evidenceIds) ? candidate.evidenceIds : []
  if (evidenceIds.some((id) => stageEvidence.ids?.has(String(id)))) return true

  const candidateText = normalizeShortsTrack2V3Text(
    candidate.addressFragment || candidate.displayText || candidate.placeName || '',
  ).replace(/\s+/gu, ' ').trim()
  if (candidateText && Array.isArray(stageEvidence.texts)) {
    const candidateFolded = foldVietnameseText(candidateText)
    const candidateNumber = firstNumberToken(candidateText)
    const candidateTokens = comparableTokens(candidateText)
    if (stageEvidence.texts.some((text) => {
      const stageFolded = foldVietnameseText(text)
      if (stageFolded.includes(candidateFolded) || candidateFolded.includes(stageFolded)) {
        return true
      }
      const stageNumber = firstNumberToken(text)
      if (candidateNumber && stageNumber && candidateNumber !== stageNumber) return false
      const stageTokens = comparableTokens(text)
      const overlap = [...candidateTokens].filter((token) => stageTokens.has(token)).length
      if (candidateNumber && stageNumber && overlap >= 2) return true
      const candidateNumbers = [...new Set(numberTokens(candidateText))]
      const stageFoldedForNumbers = foldVietnameseText(text)
      const numberOverlap = candidateNumbers.filter((number) => stageFoldedForNumbers.includes(number)).length
      return Boolean(candidateNumber && stageNumber && candidateNumbers.length >= 2 && numberOverlap >= 2)
    })) return true
  }

  const riskFlags = Array.isArray(candidate.riskFlags) ? candidate.riskFlags : []
  return Boolean(stageFlag && riskFlags.includes(stageFlag))
}

function reviewMarkersForCandidate(candidate = {}, stageEvidence = {}) {
  const markers = []
  if (candidateReferencesStage(
    candidate,
    stageEvidence.adaptive,
    'ADAPTIVE_FRAME_SAMPLING',
  )) markers.push('ADAPTIVE_FRAME_SAMPLING')
  if (candidateReferencesStage(
    candidate,
    stageEvidence.tail,
    'TAIL_OVERLAY_ESCALATION',
  )) markers.push('TAIL_OVERLAY_ESCALATION')
  if (candidateReferencesStage(
    candidate,
    stageEvidence.gemini,
    'GEMINI_CROP_JUDGE_SELECTED',
  )) markers.push('GEMINI_CROP_JUDGE_SELECTED')
  return markers
}

function canonicalLocalOcrConfig(config = {}, overrides = {}) {
  const provider = overrides.track2V3LocalOcrProvider ?? config.track2V3LocalOcrProvider
  const stageTimeoutCapMs = provider === 'ensemble' ? 90000 : 45000
  return {
    ...config,
    ...overrides,
    localOcrTimeoutMs: Math.min(
      stageTimeoutCapMs,
      Math.max(
        1000,
        Number(overrides.localOcrTimeoutMs ?? config.localOcrTimeoutMs ?? stageTimeoutCapMs) || stageTimeoutCapMs,
      ),
    ),
  }
}

function snippetsByEngine(textBlocks = [], engineRuns = {}) {
  const result = {}
  for (const [provider, run] of Object.entries(engineRuns)) {
    result[provider] = run.bestSnippets
  }
  for (const provider of ['local_paddleocr', 'local_easyocr', 'local_tesseract']) {
    const blocks = textBlocks.filter((block) => block.source === provider)
    if (blocks.length && !result[provider]) result[provider] = bestSnippets(blocks)
  }
  return result
}

async function selectSmartOverlay(context, config, deps) {
  if (deps.smartOverlayResult && typeof deps.smartOverlayResult === 'object') {
    return deps.smartOverlayResult
  }
  const selector = typeof deps.smartOverlaySelector === 'function'
    ? deps.smartOverlaySelector
    : runShortsTrack2V3SmartOverlayDryRun
  return selector(context, config, deps)
}


function normalizedCropBounds(value = {}) {
  const left = Math.max(0, Math.trunc(finiteNumber(value.left, 0)))
  const top = Math.max(0, Math.trunc(finiteNumber(value.top, 0)))
  const width = Math.max(1, Math.trunc(finiteNumber(value.width, 0)))
  const height = Math.max(1, Math.trunc(finiteNumber(value.height, 0)))
  return width > 1 && height > 1 ? { left, top, width, height } : null
}

function normalizedMaterializationPath(value = '') {
  return safeString(value, 2000).replace(/\\/gu, '/').toLowerCase()
}

function directOcrPath(image = {}, framePath = '', bounds = null) {
  const cropPath = safeString(image.cropPath, 2000)
  if (cropPath) return cropPath
  const candidate = safeString(image.path || image.imagePath, 2000)
  if (!candidate) return ''
  const candidateIsFrame = Boolean(
    framePath && normalizedMaterializationPath(candidate) === normalizedMaterializationPath(framePath)
  )
  // A selector report may expose imagePath as the original frame for diagnostics.
  // When cropBounds exist, that is not OCR-ready evidence and must be materialized.
  if (bounds && candidateIsFrame) return ''
  return candidate
}

async function materializeLocalOcrImage(image = {}, index = 0, root = '', deps = {}) {
  const framePath = safeString(image.framePath, 2000)
  const bounds = normalizedCropBounds(image.cropBounds)
  const directPath = directOcrPath(image, framePath, bounds)
  if (directPath) {
    return {
      ...image,
      imagePath: directPath,
      path: directPath,
      episodeNeighbors: await materializeEpisodeNeighbors(
        image.episodeNeighbors,
        `${index}-neighbor`,
        root,
        deps,
      ),
    }
  }
  if (!framePath || !bounds || !root) return null
  const targetPath = path.join(root, `ocr-region-${String(index).padStart(3, '0')}.jpg`)
  const imageTool = deps.sharp || sharp
  try {
    await imageTool(framePath)
      .extract(bounds)
      .jpeg({ quality: 94 })
      .toFile(targetPath)
    return {
      ...image,
      cropPath: targetPath,
      imagePath: targetPath,
      path: targetPath,
      episodeNeighbors: await materializeEpisodeNeighbors(
        image.episodeNeighbors,
        `${index}-neighbor`,
        root,
        deps,
      ),
    }
  } catch {
    return null
  }
}

async function materializeEpisodeNeighbors(neighbors = [], prefix = 'neighbor', root = '', deps = {}) {
  const values = Array.isArray(neighbors) ? neighbors : []
  const materialized = []
  for (const [index, neighbor] of values.entries()) {
    const framePath = safeString(neighbor.framePath, 2000)
    const bounds = normalizedCropBounds(neighbor.cropBounds)
    const directPath = directOcrPath(neighbor, framePath, bounds)
    if (directPath) {
      materialized.push({ ...neighbor, imagePath: directPath, path: directPath, episodeNeighbors: [] })
      continue
    }
    if (!framePath || !bounds || !root) continue
    const targetPath = path.join(root, `${prefix}-${String(index).padStart(2, '0')}.jpg`)
    try {
      await (deps.sharp || sharp)(framePath)
        .extract(bounds)
        .jpeg({ quality: 94 })
        .toFile(targetPath)
      materialized.push({
        ...neighbor,
        cropPath: targetPath,
        imagePath: targetPath,
        path: targetPath,
        episodeNeighbors: [],
      })
    } catch {
      // Neighbour OCR is opportunistic; a failed crop does not fail the representative.
    }
  }
  return materialized
}

async function materializeLocalOcrImages(selectedImages = [], deps = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'track2-v3-ocr-regions-'))
  const images = []
  for (const [index, image] of (Array.isArray(selectedImages) ? selectedImages : []).entries()) {
    const materialized = await materializeLocalOcrImage(image, index, root, deps)
    if (materialized) images.push(materialized)
  }
  return {
    images,
    cleanup: async () => fs.rm(root, { recursive: true, force: true }).catch(() => {}),
  }
}

async function runLocalOcr(selectedImages, config, deps) {
  if (!config.track2V3LocalOcrEnabled || !selectedImages.length) {
    return {
      status: config.track2V3LocalOcrEnabled ? 'NOT_RUN' : 'DISABLED',
      reason: config.track2V3LocalOcrEnabled
        ? 'LOCAL_OCR_NO_SELECTED_IMAGES'
        : 'LOCAL_OCR_DISABLED',
      called: false,
      provider: null,
      textBlocks: [],
      providerErrors: [],
    }
  }

  const customProvider = typeof deps.localOcrProvider === 'function'
    ? deps.localOcrProvider
    : typeof deps.track2V3LocalOcrProvider === 'function'
      ? deps.track2V3LocalOcrProvider
      : null
  const provider = customProvider || runShortsTrack2V3LocalOcrProvider
  let prepared = { images: selectedImages, cleanup: async () => {} }
  try {
    if (!customProvider) {
      prepared = await materializeLocalOcrImages(selectedImages, deps)
      if (!prepared.images.length) {
        return {
          status: 'ERROR',
          reason: 'LOCAL_OCR_NO_MATERIALIZED_REGIONS',
          called: false,
          provider: null,
          textBlocks: [],
          providerErrors: [{
            provider: 'local_ocr',
            code: 'LOCAL_OCR_NO_MATERIALIZED_REGIONS',
            message: 'Selected visual regions could not be materialized for OCR.',
          }],
        }
      }
    }
    const result = await provider({ selectedImages: prepared.images, config, deps })
    return result && typeof result === 'object'
      ? { called: true, ...result }
      : {
          status: 'ERROR',
          reason: 'LOCAL_OCR_PROVIDER_ERROR',
          called: true,
          provider: null,
          textBlocks: [],
          providerErrors: [sanitizeProviderError({})],
        }
  } catch {
    return {
      status: 'ERROR',
      reason: 'LOCAL_OCR_PROVIDER_ERROR',
      called: true,
      provider: null,
      textBlocks: [],
      providerErrors: [sanitizeProviderError({})],
    }
  } finally {
    await prepared.cleanup()
  }
}

function localOcrProviderUnavailable(...results) {
  return results.some((result) =>
    String(result?.status || '').toUpperCase() === 'UNAVAILABLE' ||
    String(result?.reason || '').toUpperCase() === 'LOCAL_OCR_PROVIDER_UNAVAILABLE'
  )
}

function buildLocalCandidateOutcome({ context, intent, textBlocks, config }) {
  const temporalConsensus = buildShortsTrack2V3TemporalOcrConsensus(textBlocks)
  const rawEvidence = collectShortsTrack2V3Evidence({ textBlocks })
  const consensusEvidence = collectShortsTrack2V3Evidence({
    textBlocks: temporalConsensus.consensusBlocks,
  })
  const evidence = [
    ...rawEvidence,
    ...consensusEvidence.filter((item) => !rawEvidence.some((raw) => raw.id === item.id)),
  ]
  const consensusCandidateEvidence = consensusEvidence.filter(hasCandidateAddressLine)
  const rawCandidateEvidence = rawEvidence.filter(hasCandidateAddressLine)
  // Consensus is an additional observed-medoid signal, not a replacement for
  // raw OCR. Retaining raw observations is required for house-number conflict
  // detection and prevents consensus from hiding unsupported alternatives.
  const candidateEvidence = [
    ...rawCandidateEvidence,
    ...consensusCandidateEvidence.filter((consensus) =>
      !rawCandidateEvidence.some((raw) => raw.id === consensus.id)
    ),
  ]
  const fusionResult = fuseShortsTrack2V3Evidence({ evidence: candidateEvidence, candidates: [] })
  const fusedEvidence = cleanLocalOcrFusedEvidence(fusionResult, candidateEvidence)
  const candidateResult = buildShortsTrack2V3Candidates({
    context,
    intent,
    evidence: fusedEvidence,
    config,
  })
  const candidateCleanup = cleanLocalOcrCandidates(candidateResult.candidates, fusedEvidence, context, intent)
  const candidateQualityGate = applyShortsTrack2V3CandidateQualityGate({
    context,
    intent,
    evidence: fusedEvidence,
    candidates: candidateCleanup.candidates,
  })
  return {
    evidence,
    rawEvidence,
    consensusEvidence,
    temporalConsensus,
    candidateEvidence,
    fusionResult,
    fusedEvidence,
    candidateResult,
    candidateCleanup,
    candidateQualityGate,
  }
}

function emptyGeminiCropJudgeResult(config = {}, reason = 'GEMINI_CROP_JUDGE_NOT_NEEDED') {
  return {
    enabled: config.track2V3GeminiCropJudgeEnabled === true,
    called: false,
    provider: 'gemini',
    status: config.track2V3GeminiCropJudgeEnabled === true ? 'NOT_RUN' : 'DISABLED',
    reason,
    selectedCropIds: [],
    rejectedCropIds: [],
    selectedCrops: [],
    contactSheetPaths: [],
    pageResults: [],
    geminiCropJudgeAggregateStatus: null,
    geminiCropJudgeRequestedPageCount: 0,
    geminiCropJudgeSuccessfulPageCount: 0,
    geminiCropJudgeFailedPageCount: 0,
    geminiCropJudgePartialSuccess: false,
    geminiCropJudgeCircuitBreakerTripped: false,
    geminiCropJudgeCircuitBreakerReason: null,
    geminiCropJudgeSkippedPageCount: 0,
    geminiCropJudgeTotalAttemptCount: 0,
    geminiCropJudgeRetryCount: 0,
    geminiCropJudgeRateLimitCount: 0,
    geminiCropJudgeTimeoutCount: 0,
    geminiCropJudgeServerErrorCount: 0,
    geminiCropJudgeQueueWaitMs: 0,
    geminiCropJudgeProviderRuntimeMs: 0,
    geminiCropJudgeBackoffMs: 0,
    geminiCropJudgeMaxObservedConcurrency: 0,
    geminiCropJudgeDedupHitCount: 0,
    resultPath: null,
    errors: [],
  }
}

async function runGeminiCropJudgeFallback(selectorResult, config, deps) {
  const allCrops = Array.isArray(selectorResult?.selectorDiagnostics?.crops)
    ? selectorResult.selectorDiagnostics.crops
    : Array.isArray(selectorResult?.allCrops)
      ? selectorResult.allCrops
      : []
  const runner = typeof deps.geminiCropJudge === 'function'
    ? deps.geminiCropJudge
    : runShortsTrack2V3GeminiCropJudge
  try {
    const result = await runner({
      allCrops,
      outputDir: deps.outputDir || '',
      config,
      env: deps.env || process.env,
      deps,
    })
    return result && typeof result === 'object'
      ? { ...emptyGeminiCropJudgeResult(config), ...result }
      : {
          ...emptyGeminiCropJudgeResult(config),
          status: 'ERROR',
          reason: 'GEMINI_CROP_JUDGE_ERROR',
          errors: [{
            provider: 'gemini',
            code: 'GEMINI_CROP_JUDGE_ERROR',
            message: 'Gemini crop judge failed safely.',
          }],
        }
  } catch {
    return {
      ...emptyGeminiCropJudgeResult(config),
      status: 'ERROR',
      reason: 'GEMINI_CROP_JUDGE_ERROR',
      errors: [{
        provider: 'gemini',
        code: 'GEMINI_CROP_JUDGE_ERROR',
        message: 'Gemini crop judge failed safely.',
      }],
    }
  }
}


function youtubeSourceUrl(context = {}) {
  const value = safeString(context.sourceUrl || context.url || context.metadata?.url, 2000)
  return /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//iu.test(value) ? value : ''
}

function hasExternallyManagedVisualInput(deps = {}) {
  return Boolean(
    deps.skipMediaHydration === true ||
      deps.externallyManagedMedia === true ||
      deps.smartOverlayResult ||
      Array.isArray(deps.frames)
  )
}

async function hydrateTrack2InputWithMediaDuration(input = {}, mediaSession, deps = {}) {
  const context = normalizeContext(input)
  const inputDurationSeconds = finiteNumber(
    context.durationSeconds ?? context.duration ?? context.metadata?.durationSeconds,
    null,
  )
  const inputDurationSource = inputDurationSeconds !== null && inputDurationSeconds > 0
    ? context.durationSeconds != null || context.duration != null
      ? 'input'
      : 'metadata'
    : null
  const result = (hydratedContext, overrides = {}) => ({
    context: hydratedContext,
    diagnostics: {
      inputDurationSource,
      inputDurationSeconds: inputDurationSeconds !== null && inputDurationSeconds > 0
        ? inputDurationSeconds
        : null,
      hydratedDurationSource: inputDurationSource,
      hydratedDurationSeconds: inputDurationSeconds !== null && inputDurationSeconds > 0
        ? inputDurationSeconds
        : null,
      ...overrides,
    },
  })

  if (!youtubeSourceUrl(context)) return result(context)
  const knownDuration = finiteNumber(
    context.durationSeconds ?? context.duration ?? context.metadata?.durationSeconds,
    null,
  )
  if (knownDuration !== null && knownDuration > 0) return result(context)
  if (hasExternallyManagedVisualInput(deps) && !deps.mediaSession) {
    return result(context, { hydratedDurationSource: 'externally_managed_visual_input' })
  }
  if (typeof mediaSession?.ensureDuration !== 'function') {
    return result(context, { hydratedDurationSource: 'media_session_unavailable' })
  }
  const durationResult = await mediaSession.ensureDuration()
  if (String(durationResult?.status || '').toUpperCase() !== 'OK') {
    return result(context, { hydratedDurationSource: 'media_duration_unavailable' })
  }
  const durationSeconds = finiteNumber(durationResult.durationSeconds, null)
  if (durationSeconds === null || durationSeconds <= 0) {
    return result(context, { hydratedDurationSource: 'media_duration_invalid' })
  }
  const hydratedContext = normalizeContext({
    ...context,
    durationSeconds,
    metadata: {
      ...(context.metadata || {}),
      durationSeconds,
    },
  })
  return result(hydratedContext, {
    hydratedDurationSource: safeString(durationResult.source || 'media_session', 80),
    hydratedDurationSeconds: durationSeconds,
  })
}

async function hydrateTrack2InputWithMediaMetadata(input = {}, mediaSession, deps = {}) {
  const context = normalizeContext(input)
  if (!youtubeSourceUrl(context)) return context
  if (context.title || context.description) return context
  if (hasExternallyManagedVisualInput(deps) && !deps.mediaSession) return context
  if (typeof mediaSession?.ensureMetadata !== 'function') return context

  const metadataResult = await mediaSession.ensureMetadata()
  if (String(metadataResult?.status || '').toUpperCase() !== 'OK') return context
  const metadata = {
    ...(context.metadata || {}),
    ...(metadataResult.title ? { title: metadataResult.title } : {}),
    ...(metadataResult.description ? { description: metadataResult.description } : {}),
    ...(metadataResult.channelTitle ? { channelTitle: metadataResult.channelTitle } : {}),
    ...(Array.isArray(metadataResult.chapters) && metadataResult.chapters.length
      ? { chapters: metadataResult.chapters }
      : {}),
    ...(Number(metadataResult.durationSeconds) > 0
      ? { durationSeconds: Number(metadataResult.durationSeconds) }
      : {}),
  }
  return normalizeContext({
    ...context,
    metadata,
    title: context.title || metadataResult.title || '',
    description: context.description || metadataResult.description || '',
    channelTitle: context.channelTitle || metadataResult.channelTitle || '',
    durationSeconds: finiteNumber(
      context.durationSeconds ?? metadata.durationSeconds,
      null,
    ),
  })
}

function candidateIntentText(candidate = {}) {
  return normalizeShortsTrack2V3Text(
    candidate.addressFragment || candidate.displayText || candidate.formattedAddress || '',
  )
}

function refinedIntentFromVisualEvidence(intent = {}, candidates = [], evidence = []) {
  if (intent.inputClass !== 'UNSUPPORTED' && intent.intent !== 'UNKNOWN') return intent
  const addressCandidates = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidateIntentText(candidate))
  if (!addressCandidates.length) return intent

  const evidenceById = new Map(
    (Array.isArray(evidence) ? evidence : [])
      .filter((item) => item?.id)
      .map((item) => [String(item.id), item]),
  )
  const distinctAddresses = new Set(addressCandidates.map(candidateIntentText).filter(Boolean))
  const segmentScopes = new Set()
  for (const candidate of addressCandidates) {
    for (const evidenceId of Array.isArray(candidate?.evidenceIds) ? candidate.evidenceIds : []) {
      const item = evidenceById.get(String(evidenceId))
      if (item?.segmentId) segmentScopes.add(String(item.segmentId))
    }
  }
  if (distinctAddresses.size > 1 && segmentScopes.size > 1) {
    return {
      ...intent,
      intent: 'MULTI_PLACE_OR_LIST',
      inputClass: 'MULTI_PLACE_LISTICLE',
      mustNotResolve: true,
      reason: 'VISUAL_MULTI_PLACE_EVIDENCE',
      signals: [
        ...(Array.isArray(intent.signals) ? intent.signals : []),
        {
          source: 'visual_evidence',
          rule: 'VISUAL_MULTI_PLACE_EVIDENCE',
          matchedText: null,
          reason: 'VISUAL_MULTI_PLACE_EVIDENCE',
          intent: 'MULTI_PLACE_OR_LIST',
          mustNotResolve: true,
        },
      ],
    }
  }
  return {
    ...intent,
    intent: 'OCR_ADDRESS_LIKELY',
    inputClass: 'SINGLE_PLACE',
    mustNotResolve: false,
    reason: 'VISUAL_ADDRESS_EVIDENCE',
    signals: [
      ...(Array.isArray(intent.signals) ? intent.signals : []),
      {
        source: 'visual_evidence',
        rule: 'VISUAL_ADDRESS_EVIDENCE',
        matchedText: null,
        reason: 'VISUAL_ADDRESS_EVIDENCE',
        intent: 'OCR_ADDRESS_LIKELY',
        mustNotResolve: false,
      },
    ],
  }
}

async function runShortsTrack2V3SmartOverlayOcrWithMediaSession(
  input = {},
  suppliedConfig = {},
  deps = {},
) {
  const startedAt = Date.now()
  const context = normalizeContext(input)
  const config = {
    ...getShortsTrack2V3Config(deps.env || process.env),
    ...(suppliedConfig || {}),
  }
  const intent = classifyShortsTrack2V3Intent(context, config)
  const metadataEvidence = extractMetadataEvidence(context)
  const metadataCandidates = buildMetadataCandidatesFromEvidence({
    evidence: metadataEvidence,
    requireFoodContext: true,
  })
  const metadataReviewAllowed = !intent.mustNotResolve || (
    intent.intent === 'MULTI_PLACE_OR_LIST' &&
    intent.inputClass === 'MULTI_PLACE_LISTICLE' &&
    metadataCandidates.length >= 2
  )
  const admissibleMetadataCandidates = metadataReviewAllowed
    ? metadataCandidates
    : []
  const selectorResult = await selectSmartOverlay(context, config, deps)
  const selectedImages = Array.isArray(selectorResult?.selectedImages)
    ? selectorResult.selectedImages
    : []
  const initialLocalOcrConfig = canonicalLocalOcrConfig(config)
  const localOcrResult = await runLocalOcr(selectedImages, initialLocalOcrConfig, deps)
  const localOcrTextBlocks = normalizeLocalOcrTextBlocks(
    localOcrResult.textBlocks,
    selectedImages,
    localOcrResult.provider,
    initialLocalOcrConfig,
  )
  const normalOutcome = buildLocalCandidateOutcome({
    context,
    intent,
    textBlocks: localOcrTextBlocks,
    config,
  })
  const normalStageCandidates = mergeMetadataCandidatesWithExisting(
    admissibleMetadataCandidates,
    normalOutcome.candidateQualityGate.candidates,
  )
  const normalLateRescueSufficiency = evaluateShortsTrack2V3LateRescueSufficiency({
    candidates: normalStageCandidates,
    intent,
  })
  const adaptiveFrameSamplingResult = await runShortsTrack2V3AdaptiveFrameSampling({
    context: selectorResult?.duration
      ? {
          ...context,
          durationSeconds: selectorResult.duration,
          metadata: {
            ...(context.metadata || {}),
            durationSeconds: selectorResult.duration,
          },
        }
      : context,
    config,
    metadataCandidateCount: admissibleMetadataCandidates.length,
    normalCandidateCount: normalOutcome.candidateQualityGate.candidates.length,
    selectorResult,
    localOcrResult,
    localOcrTextBlocks,
    lateRescueSufficiency: normalLateRescueSufficiency,
    deps,
  })
  const adaptiveSelectedImages = Array.isArray(adaptiveFrameSamplingResult.selectedImages)
    ? adaptiveFrameSamplingResult.selectedImages
    : []
  const adaptiveLocalOcrConfig = canonicalLocalOcrConfig(config, {
    track2V3LocalOcrProvider: 'ensemble',
  })
  const adaptiveLocalOcrResult = adaptiveFrameSamplingResult.ran && adaptiveSelectedImages.length
    ? await runLocalOcr(adaptiveSelectedImages, adaptiveLocalOcrConfig, deps)
    : {
        status: 'NOT_RUN',
        reason: adaptiveFrameSamplingResult.ran
          ? 'ADAPTIVE_FRAME_SAMPLING_NO_SELECTED_CROPS'
          : adaptiveFrameSamplingResult.reason,
        called: false,
        provider: null,
        textBlocks: [],
        providerErrors: [],
      }
  const adaptiveOcrTextBlocks = normalizeLocalOcrTextBlocks(
    adaptiveLocalOcrResult.textBlocks,
    adaptiveSelectedImages,
    adaptiveLocalOcrResult.provider,
    adaptiveLocalOcrConfig,
    'ADAPTIVE_FRAME_SAMPLING',
  ).map((block, index) => ({
    ...block,
    id: `adaptive-frame-ocr:${index}:${block.id}`,
  }))
  const adaptiveOutcome = adaptiveOcrTextBlocks.length
    ? buildLocalCandidateOutcome({
        context,
        intent,
        textBlocks: adaptiveOcrTextBlocks,
        config,
      })
    : null
  const candidateCountFromAdaptiveFrames = adaptiveOutcome
    ? adaptiveOutcome.candidateQualityGate.candidates.length
    : 0
  const ocrSnippetsFromAdaptiveFrames = bestSnippets(adaptiveOcrTextBlocks)
  const preTailCandidates = mergeMetadataCandidatesWithExisting(
    normalStageCandidates,
    adaptiveOutcome ? adaptiveOutcome.candidateQualityGate.candidates : [],
  )
  const preTailLateRescueSufficiency = evaluateShortsTrack2V3LateRescueSufficiency({
    candidates: preTailCandidates,
    intent,
  })
  const normalDiagnosticCrops = Array.isArray(selectorResult?.selectorDiagnostics?.crops)
    ? selectorResult.selectorDiagnostics.crops
    : []
  const tailOverlayPreparation = await prepareShortsTrack2V3TailOverlayOcrEscalation({
    normalCandidateCount:
      admissibleMetadataCandidates.length + normalOutcome.candidateQualityGate.candidates.length,
    adaptiveCandidateCount: candidateCountFromAdaptiveFrames,
    localOcrAvailable: !localOcrProviderUnavailable(localOcrResult, adaptiveLocalOcrResult),
    lateRescueSufficiency: preTailLateRescueSufficiency,
    crops: [
      ...normalDiagnosticCrops,
      ...adaptiveFrameSamplingResult.allCrops,
    ],
    outputDir: deps.outputDir || '',
    deps,
  })
  const tailOverlaySelectedImages = tailOverlayPreparation.selectedImages
  const tailOverlayLocalOcrConfig = canonicalLocalOcrConfig(config, {
    track2V3LocalOcrProvider: 'ensemble',
    maxLocalOcrImages: Math.min(4, Number(config.maxLocalOcrImages || 4)),
  })
  let tailOverlayLocalOcrResult = {
    status: 'NOT_RUN',
    reason: tailOverlayPreparation.reason,
    called: false,
    provider: null,
    textBlocks: [],
    providerErrors: [],
    imageCount: 0,
  }
  try {
    if (tailOverlayPreparation.ran && tailOverlaySelectedImages.length) {
      tailOverlayLocalOcrResult = await runLocalOcr(
        tailOverlaySelectedImages,
        tailOverlayLocalOcrConfig,
        deps,
      )
    }
  } finally {
    await tailOverlayPreparation.cleanup()
  }
  const normalizedTailOverlayOcrTextBlocks = normalizeLocalOcrTextBlocks(
    tailOverlayLocalOcrResult.textBlocks,
    tailOverlaySelectedImages,
    tailOverlayLocalOcrResult.provider,
    tailOverlayLocalOcrConfig,
    'TAIL_OVERLAY_ESCALATION',
  ).map((block, index) => ({
    ...block,
    id: `tail-overlay-ocr:${index}:${block.id}`,
  }))
  const tailOverlayOcrTextBlocks = uniqueAdditionalOcrTextBlocks(
    [...localOcrTextBlocks, ...adaptiveOcrTextBlocks],
    normalizedTailOverlayOcrTextBlocks,
  )
  const tailOverlayOutcome = tailOverlayOcrTextBlocks.length
    ? buildLocalCandidateOutcome({
        context,
        intent,
        textBlocks: tailOverlayOcrTextBlocks,
        config,
      })
    : null
  const candidateCountFromTailOverlay = tailOverlayOutcome
    ? tailOverlayOutcome.candidateQualityGate.candidates.length
    : 0
  const tailOverlayOcrSnippets = bestSnippets(tailOverlayOcrTextBlocks)
  const tailOverlayEscalationReason = !tailOverlayPreparation.ran
    ? tailOverlayPreparation.reason
    : localOcrProviderUnavailable(tailOverlayLocalOcrResult)
      ? SHORTS_TRACK2_V3_TAIL_OVERLAY_REASONS.OCR_PROVIDER_UNAVAILABLE
      : candidateCountFromTailOverlay > 0
        ? SHORTS_TRACK2_V3_TAIL_OVERLAY_REASONS.TAIL_CANDIDATE_FOUND
        : SHORTS_TRACK2_V3_TAIL_OVERLAY_REASONS.TAIL_OCR_NO_CANDIDATE
  const preGeminiOcrTextBlocks = [
    ...localOcrTextBlocks,
    ...adaptiveOcrTextBlocks,
    ...tailOverlayOcrTextBlocks,
  ]
  const preGeminiOutcome = buildLocalCandidateOutcome({
    context,
    intent,
    textBlocks: preGeminiOcrTextBlocks,
    config,
  })
  const preGeminiCandidates = mergeMetadataCandidatesWithExisting(
    admissibleMetadataCandidates,
    preGeminiOutcome.candidateQualityGate.candidates,
  )
  const preGeminiLateRescueSufficiency = evaluateShortsTrack2V3LateRescueSufficiency({
    candidates: preGeminiCandidates,
    intent,
  })
  const selectorResultForGemini = adaptiveFrameSamplingResult.allCrops.length
    ? {
        ...selectorResult,
        selectorDiagnostics: {
          ...(selectorResult?.selectorDiagnostics || {}),
          crops: [
            ...normalDiagnosticCrops,
            ...adaptiveFrameSamplingResult.allCrops,
          ],
        },
      }
    : selectorResult
  const shouldRunGeminiCropJudge = Boolean(
    config.track2V3GeminiCropJudgeEnabled &&
      preGeminiLateRescueSufficiency.lateRescueSufficient !== true,
  )
  const geminiCropJudgeResult = shouldRunGeminiCropJudge
    ? await runGeminiCropJudgeFallback(selectorResultForGemini, config, deps)
    : emptyGeminiCropJudgeResult(
        config,
        config.track2V3GeminiCropJudgeEnabled
          ? 'GEMINI_CROP_JUDGE_NOT_NEEDED'
          : 'GEMINI_CROP_JUDGE_DISABLED',
      )
  const geminiSelectedCrops = Array.isArray(geminiCropJudgeResult.selectedCrops)
    ? geminiCropJudgeResult.selectedCrops
    : []
  const geminiLocalOcrConfig = canonicalLocalOcrConfig(config, {
    track2V3LocalOcrProvider: 'ensemble',
  })
  const geminiSelectedOcrResult = geminiSelectedCrops.length
    ? await runLocalOcr(geminiSelectedCrops, geminiLocalOcrConfig, deps)
    : {
        status: 'NOT_RUN',
        reason: 'GEMINI_CROP_JUDGE_NO_VALIDATED_CROPS',
        called: false,
        provider: null,
        textBlocks: [],
        providerErrors: [],
      }
  const geminiSelectedOcrTextBlocks = normalizeLocalOcrTextBlocks(
    geminiSelectedOcrResult.textBlocks,
    geminiSelectedCrops,
    geminiSelectedOcrResult.provider,
    geminiLocalOcrConfig,
    'GEMINI_CROP_JUDGE_SELECTED',
  ).map((block, index) => ({
    ...block,
    id: `gemini-crop-judge-ocr:${index}:${block.id}`,
  }))
  const candidateCountFromGeminiSelectedCrops = geminiSelectedOcrTextBlocks.length
    ? buildLocalCandidateOutcome({
        context,
        intent,
        textBlocks: geminiSelectedOcrTextBlocks,
        config,
      }).candidateQualityGate.candidates.length
    : 0
  const combinedLocalOcrTextBlocks = [
    ...preGeminiOcrTextBlocks,
    ...geminiSelectedOcrTextBlocks,
  ]
  const outcome = buildLocalCandidateOutcome({
    context,
    intent,
    textBlocks: combinedLocalOcrTextBlocks,
    config,
  })
  const preAsrCandidates = mergeMetadataCandidatesWithExisting(
    admissibleMetadataCandidates,
    outcome.candidateQualityGate.candidates,
  )
  const preAsrLateRescueSufficiency = evaluateShortsTrack2V3LateRescueSufficiency({
    candidates: preAsrCandidates,
    intent,
  })
  const asrOpportunityWindows = buildShortsTrack2V3AsrOpportunityWindows({
    textBlocks: combinedLocalOcrTextBlocks,
    durationSeconds: selectorResult?.duration ?? context.durationSeconds ?? context.metadata?.durationSeconds,
    config,
  })
  const visualProviderAvailable = !localOcrProviderUnavailable(
    localOcrResult,
    adaptiveLocalOcrResult,
    tailOverlayLocalOcrResult,
    geminiSelectedOcrResult,
  )
  const asrFallbackResult = await runShortsTrack2V3AsrFallback({
    context,
    config,
    deps,
    existingCandidates: preAsrCandidates,
    metadataTexts: metadataEvidence.map((item) => item.rawText || item.normalizedText),
    visualTexts: combinedLocalOcrTextBlocks.map((item) => item.rawText || item.normalizedText),
    lateRescueSufficiency: preAsrLateRescueSufficiency,
    opportunityWindows: asrOpportunityWindows,
    visualProviderAvailable,
  })
  const preGeminiPlusAsrCandidates = mergeMetadataCandidatesWithExisting(
    preAsrCandidates,
    asrFallbackResult.asrCandidates,
  )
  const postAsrLateRescueSufficiency = evaluateShortsTrack2V3LateRescueSufficiency({
    candidates: preGeminiPlusAsrCandidates,
    intent,
  })
  const {
    evidence,
    candidateEvidence,
    fusionResult,
    fusedEvidence,
    candidateResult,
    candidateCleanup,
  } = outcome
  const asrEvidence = [
    ...asrFallbackResult.asrAddressEvidence,
    ...asrFallbackResult.asrPlaceOrDistrictEvidence,
  ]
  const asrAwareCandidateQualityGate = asrFallbackResult.asrCandidates.length
    ? applyShortsTrack2V3CandidateQualityGate({
        context,
        intent,
        evidence: [...fusedEvidence, ...asrEvidence],
        candidates: [
          ...outcome.candidateQualityGate.candidates,
          ...asrFallbackResult.asrCandidates,
        ],
      })
    : outcome.candidateQualityGate
  const candidateQualityGate = {
    ...asrAwareCandidateQualityGate,
    numericContextClassifications: outcome.candidateQualityGate.numericContextClassifications || [],
    contextNumberRejectedAsHouseNumberCount:
      outcome.candidateQualityGate.contextNumberRejectedAsHouseNumberCount || 0,
    floorNumberRejectedAsHouseNumberCount:
      outcome.candidateQualityGate.floorNumberRejectedAsHouseNumberCount || 0,
    priceNumberRejectedAsHouseNumberCount:
      outcome.candidateQualityGate.priceNumberRejectedAsHouseNumberCount || 0,
    candidates: asrAwareCandidateQualityGate.candidates.map((candidate) => {
      const reviewMarkers = reviewMarkersForCandidate(candidate, {
        adaptive: stageEvidenceFromBlocks(adaptiveOcrTextBlocks),
        tail: stageEvidenceFromBlocks(tailOverlayOcrTextBlocks),
        gemini: stageEvidenceFromBlocks(geminiSelectedOcrTextBlocks),
      })
      const singleFinalCandidate = asrAwareCandidateQualityGate.candidates.length === 1
      if (singleFinalCandidate && candidateCountFromAdaptiveFrames > 0 && !reviewMarkers.includes('ADAPTIVE_FRAME_SAMPLING')) {
        reviewMarkers.push('ADAPTIVE_FRAME_SAMPLING')
      }
      if (singleFinalCandidate && candidateCountFromTailOverlay > 0 && !reviewMarkers.includes('TAIL_OVERLAY_ESCALATION')) {
        reviewMarkers.push('TAIL_OVERLAY_ESCALATION')
      }
      if (singleFinalCandidate && geminiSelectedOcrTextBlocks.length > 0 && !reviewMarkers.includes('GEMINI_CROP_JUDGE_SELECTED')) {
        reviewMarkers.push('GEMINI_CROP_JUDGE_SELECTED')
      }
      return reviewMarkers.length
        ? {
            ...candidate,
            canAutoResolve: false,
            riskFlags: [...new Set([
              ...(Array.isArray(candidate.riskFlags) ? candidate.riskFlags : []),
              'REVIEW_ONLY',
              ...reviewMarkers,
            ])],
          }
        : candidate
    }),
  }
  const finalCandidates = rankShortsTrack2V3CandidatesForReview(
    mergeMetadataCandidatesWithExisting(
      admissibleMetadataCandidates,
      candidateQualityGate.candidates,
    ),
  )
  const candidateCountFromAsr = finalCandidates.filter((candidate) =>
    candidate?.type === 'ASR_FULL_ADDRESS_REVIEW'
  ).length
  const lateRescueSufficiency = evaluateShortsTrack2V3LateRescueSufficiency({
    candidates: finalCandidates,
    intent,
  })
  const numericContextClassifications = candidateQualityGate.numericContextClassifications || []
  const contextNumberRejectedAsHouseNumberCount = Number(
    candidateQualityGate.contextNumberRejectedAsHouseNumberCount || 0,
  )
  const floorNumberRejectedAsHouseNumberCount = Number(
    candidateQualityGate.floorNumberRejectedAsHouseNumberCount || 0,
  )
  const priceNumberRejectedAsHouseNumberCount = Number(
    candidateQualityGate.priceNumberRejectedAsHouseNumberCount || 0,
  )
  const responseEvidence = [
    ...metadataEvidence,
    ...evidence,
    ...fusedEvidence.filter((item) => !evidence.some((base) => base.id === item.id)),
    ...asrEvidence,
  ]
  const selectorErrors = Array.isArray(selectorResult?.providerErrors)
    ? selectorResult.providerErrors.map((error) => sanitizeProviderError(
        error,
        'SMART_OVERLAY_SELECTOR_ERROR',
      ))
    : []
  const localErrors = Array.isArray(localOcrResult.providerErrors)
    ? localOcrResult.providerErrors.map((error) => sanitizeProviderError(error))
    : []
  const adaptiveFrameErrors = Array.isArray(adaptiveFrameSamplingResult.providerErrors)
    ? adaptiveFrameSamplingResult.providerErrors.map((error) => sanitizeProviderError(
        error,
        'ADAPTIVE_FRAME_SAMPLING_ERROR',
      ))
    : []
  const adaptiveLocalErrors = Array.isArray(adaptiveLocalOcrResult.providerErrors)
    ? adaptiveLocalOcrResult.providerErrors.map((error) => sanitizeProviderError(error))
    : []
  const tailOverlayProviderErrors = [
    ...(Array.isArray(tailOverlayPreparation.providerErrors)
      ? tailOverlayPreparation.providerErrors
      : []),
    ...(Array.isArray(tailOverlayLocalOcrResult.providerErrors)
      ? tailOverlayLocalOcrResult.providerErrors
      : []),
  ].map((error) => sanitizeProviderError(error, 'TAIL_OVERLAY_OCR_ERROR'))
  const geminiSelectedLocalErrors = Array.isArray(geminiSelectedOcrResult.providerErrors)
    ? geminiSelectedOcrResult.providerErrors.map((error) => sanitizeProviderError(error))
    : []
  const providerErrors = [
    ...selectorErrors,
    ...localErrors,
    ...adaptiveFrameErrors,
    ...adaptiveLocalErrors,
    ...tailOverlayProviderErrors,
    ...geminiSelectedLocalErrors,
    ...asrFallbackResult.asrProviderErrors,
  ]
  const baseMediaDiagnostics = typeof deps.mediaSession?.diagnostics === 'function'
    ? deps.mediaSession.diagnostics()
    : {}
  const normalTimestamps = (Array.isArray(selectorResult?.sampledTimestamps)
    ? selectorResult.sampledTimestamps
    : (selectorResult?.sampledFrames || []).map((frame) => frame?.timestampSeconds))
    .map((value) => finiteNumber(value, null))
    .filter((value) => value !== null)
  const timelineDurationSeconds = finiteNumber(
    selectorResult?.duration ?? context.durationSeconds ?? context.metadata?.durationSeconds,
    null,
  )
  const normalTimestampMinSeconds = normalTimestamps.length ? Math.min(...normalTimestamps) : null
  const normalTimestampMaxSeconds = normalTimestamps.length ? Math.max(...normalTimestamps) : null
  const normalTailCoverageRatio = timelineDurationSeconds && normalTimestampMaxSeconds !== null
    ? Math.max(0, Math.min(1, normalTimestampMaxSeconds / timelineDurationSeconds))
    : null
  const mediaDiagnostics = {
    ...baseMediaDiagnostics,
    ...(deps.track2V3DurationDiagnostics || {}),
    ...(deps.track2V3MediaOrchestrationDiagnostics || {}),
    timelineDurationSeconds,
    normalFrameCount: Number(selectorResult?.sampledFrameCount || 0),
    normalTimestampMinSeconds,
    normalTimestampMaxSeconds,
    normalTailCoverageRatio,
    normalTailCoverageReached: normalTailCoverageRatio === null
      ? null
      : normalTailCoverageRatio >= 0.9,
    mediaSessionReused: Number(baseMediaDiagnostics.mediaReuseCount || 0) > 0,
  }
  const selectorDiagnosis = classifySelectorDiagnosis({
    selectorResult,
    providerErrors,
    localOcrTextBlocks: combinedLocalOcrTextBlocks,
    candidateEvidence,
  })
  const localOcrCalled = Boolean(
    localOcrResult.called ||
      adaptiveLocalOcrResult.called ||
      tailOverlayLocalOcrResult.called ||
      geminiSelectedOcrResult.called,
  )
  const localOcrProvider = safeString(
    geminiSelectedOcrResult.provider ||
      tailOverlayLocalOcrResult.provider ||
      adaptiveLocalOcrResult.provider ||
      localOcrResult.provider ||
      combinedLocalOcrTextBlocks[0]?.source,
    80,
  ) || null
  const localOcrBestSnippets = bestSnippets(combinedLocalOcrTextBlocks)
  const ocrSnippetsFromGeminiSelectedCrops = bestSnippets(geminiSelectedOcrTextBlocks)
  const localOcrEngineDiagnostics = {
    ...sanitizeEngineRuns(localOcrResult.engineRuns),
    ...sanitizeEngineRuns(adaptiveLocalOcrResult.engineRuns),
    ...sanitizeEngineRuns(tailOverlayLocalOcrResult.engineRuns),
    ...sanitizeEngineRuns(geminiSelectedOcrResult.engineRuns),
  }
  const localOcrBestSnippetsByEngine = snippetsByEngine(
    combinedLocalOcrTextBlocks,
    localOcrEngineDiagnostics,
  )
  const localOcrImageCount = Math.max(0, Math.trunc(
    finiteNumber(localOcrResult.imageCount, selectedImages.length) +
      finiteNumber(adaptiveLocalOcrResult.imageCount, adaptiveSelectedImages.length) +
      finiteNumber(tailOverlayLocalOcrResult.imageCount, tailOverlaySelectedImages.length) +
      finiteNumber(geminiSelectedOcrResult.imageCount, 0),
  ))
  const effectiveLocalOcrResult = geminiSelectedOcrResult.called
    ? geminiSelectedOcrResult
    : tailOverlayLocalOcrResult.called
      ? tailOverlayLocalOcrResult
      : adaptiveLocalOcrResult.called
        ? adaptiveLocalOcrResult
        : localOcrResult
  const geminiCropJudgeErrors = (Array.isArray(geminiCropJudgeResult.errors)
    ? geminiCropJudgeResult.errors
    : []).map((error) => ({
      provider: safeString(error?.provider || 'gemini', 80),
      code: safeString(error?.code || 'GEMINI_CROP_JUDGE_ERROR', 120),
      message: safeString(error?.message || 'Gemini crop judge failed safely.', 300),
      httpStatus: error?.httpStatus == null ? null : finiteNumber(error.httpStatus, null),
      googleErrorStatus: safeString(error?.googleErrorStatus, 120) || null,
      googleErrorCode: error?.googleErrorCode ?? null,
      googleErrorMessage: safeString(error?.googleErrorMessage, 1000) || null,
      fieldViolations: (Array.isArray(error?.fieldViolations)
        ? error.fieldViolations
        : []).slice(0, 20).map((violation) => ({
          field: safeString(violation?.field, 300) || null,
          description: safeString(violation?.description, 500) || null,
        })),
      endpointType: safeString(error?.endpointType, 40) || null,
      model: safeString(error?.model, 120) || null,
      pagePath: safeString(error?.pagePath, 2000) || null,
      originalBytes: error?.originalBytes == null ? null : finiteNumber(error.originalBytes, null),
      sentBytes: error?.sentBytes == null ? null : finiteNumber(error.sentBytes, null),
      imageBytes: error?.imageBytes == null ? null : finiteNumber(error.imageBytes, null),
      base64Length: error?.base64Length == null ? null : finiteNumber(error.base64Length, null),
      requestBodyApproxBytes: error?.requestBodyApproxBytes == null
        ? null
        : finiteNumber(error.requestBodyApproxBytes, null),
      mimeType: safeString(error?.mimeType, 80) || null,
      transportErrorMessage: safeString(error?.transportErrorMessage, 500) || null,
    }))

  const effectiveIntent = refinedIntentFromVisualEvidence(
    intent,
    finalCandidates,
    responseEvidence,
  )
  const visualAddressSignals = combinedLocalOcrTextBlocks.map((block) =>
    analyzeShortsTrack2V3AddressSignal(block.rawText || block.normalizedText || block.text || '')
  )
  const strongAddressSignalCount = visualAddressSignals.filter((signal) => signal.strongAddressAnchor).length
  const composableAddressSignalCount = visualAddressSignals.filter((signal) => signal.composableAddressSignal).length
  const diagnosticArtifacts = await writeShortsTrack2V3LiveDiagnostics({
    enabled: deps.track2V3LiveDiagnosticsEnabled === true,
    outputDir: deps.outputDir || '',
    textBlocks: combinedLocalOcrTextBlocks,
    candidateResult,
    temporalConsensus: outcome.temporalConsensus,
    asrOpportunityWindows,
    asrFallbackResult,
    geminiCropJudgeResult,
    fusionResult,
  })

  const response = buildShortsTrack2V3Response({
    startedAt,
    context,
    config,
    intent: effectiveIntent,
    framePlan: {
      frameCount: (selectorResult?.sampledFrameCount || 0) + adaptiveFrameSamplingResult.frameCount,
      frames: [
        ...(selectorResult?.sampledFrames || []),
        ...(adaptiveFrameSamplingResult.selectorResult?.sampledFrames || []),
      ],
    },
    frameVariants: {
      variants: [
        ...selectedImages,
        ...adaptiveSelectedImages,
        ...tailOverlaySelectedImages,
        ...geminiSelectedCrops,
      ],
      variantCount:
        selectedImages.length + adaptiveSelectedImages.length +
        tailOverlaySelectedImages.length + geminiSelectedCrops.length,
      cropImageCount:
        selectedImages.length + adaptiveSelectedImages.length +
        tailOverlaySelectedImages.length + geminiSelectedCrops.length,
    },
    ocrResult: {
      status: effectiveLocalOcrResult.status || 'NOT_RUN',
      reason: effectiveLocalOcrResult.reason || 'LOCAL_OCR_NOT_RUN',
      textBlocks: combinedLocalOcrTextBlocks,
      imageCount: localOcrImageCount,
      metrics: {
        frameCount: (selectorResult?.sampledFrameCount || 0) + adaptiveFrameSamplingResult.frameCount,
        ocrImageCount: localOcrImageCount,
        cropImageCount:
          selectedImages.length + adaptiveSelectedImages.length +
          tailOverlaySelectedImages.length + geminiSelectedCrops.length,
        ocrTextBlockCount: combinedLocalOcrTextBlocks.length,
      },
    },
    evidence: responseEvidence,
    candidates: finalCandidates,
    escalation: { escalationLevel: 'LOCAL_OCR_REVIEW_ONLY' },
    geminiResult: { called: false },
    placesResult: { called: false, queries: [] },
    providerErrors,
    debug: {
      candidateQualityGateRan: true,
      rawCandidateCount: candidateQualityGate.rawCandidateCount + metadataCandidates.length,
    candidateEvidenceCount: candidateEvidence.length,
    strongAddressSignalCount,
    composableAddressSignalCount,
    fusedAddressEvidenceCount: Number(fusionResult.fusedEvidenceCount || 0),
    diagnosticArtifacts: diagnosticArtifacts.files || {},
      keptCandidateCount: finalCandidates.length,
      droppedCandidateCount: candidateQualityGate.droppedCandidateCount,
      weakCandidateCount: candidateQualityGate.weakCandidateCount,
      addressAnchoredCandidateCount: candidateQualityGate.addressAnchoredCandidateCount + metadataCandidates.length,
      keptCandidateReasons: candidateQualityGate.keptCandidateReasons,
      droppedCandidateReasons: candidateQualityGate.droppedCandidateReasons,
      droppedCandidates: candidateQualityGate.droppedCandidates,
      candidateCountBeforeLocalCleanup: candidateResult.candidateCount,
      candidateDiagnostics: candidateResult.diagnostics || [],
      candidateRejectionSummary: candidateResult.rejectionSummary || {},
      candidateEvidenceCount: candidateEvidence.length,
      strongAddressSignalCount,
      composableAddressSignalCount,
      fusedAddressEvidenceCount: Number(fusionResult.fusedEvidenceCount || 0),
      diagnosticArtifacts: diagnosticArtifacts.files || {},
      localCandidateCleanupDroppedCount: candidateCleanup.droppedCandidateCount,
      metadataEvidenceCount: metadataEvidence.length,
      metadataCandidateCount: metadataCandidates.length,
      metadataCandidateSuppressedByMultiPlaceCount:
        metadataCandidates.length - admissibleMetadataCandidates.length,
      selectorDiagnosis,
      selectorDiagnosticsPath: selectorResult?.selectorDiagnosticsPath || null,
      contactSheetPath: selectorResult?.contactSheetPath || null,
      generatedCropCount: selectorResult?.generatedCropCount || 0,
      selectedCropIds: selectorResult?.selectedCropIds || [],
      cropRegionCounts: selectorResult?.cropRegionCounts || {},
      localOcrStatus: effectiveLocalOcrResult.status || 'NOT_RUN',
      localOcrReason: effectiveLocalOcrResult.reason || 'LOCAL_OCR_NOT_RUN',
      localOcrProvider,
      localOcrEngineDiagnostics,
      localOcrBestSnippetsByEngine,
      adaptiveFrameSamplingEnabled: adaptiveFrameSamplingResult.enabled,
      adaptiveFrameSamplingRan: adaptiveFrameSamplingResult.ran,
      adaptiveFrameCount: adaptiveFrameSamplingResult.frameCount,
      adaptiveCropCount: adaptiveFrameSamplingResult.cropCount,
      adaptiveSelectedCropIds: adaptiveFrameSamplingResult.selectedCropIds,
      ocrTextBlockCountFromAdaptiveFrames: adaptiveOcrTextBlocks.length,
      ocrSnippetsFromAdaptiveFrames,
      candidateCountFromAdaptiveFrames,
      adaptiveSamplingReason: adaptiveFrameSamplingResult.reason,
      tailOverlayEscalationEnabled: tailOverlayPreparation.enabled,
      tailOverlayEscalationRan: tailOverlayPreparation.ran,
      tailOverlayFrameIds: tailOverlayPreparation.frameIds,
      tailOverlayFrameTimestamps: tailOverlayPreparation.frameTimestamps,
      tailOverlayCropIds: tailOverlayPreparation.cropIds,
      tailOverlayCropCount: tailOverlayPreparation.cropCount,
      tailOverlayOcrTextBlockCount: tailOverlayOcrTextBlocks.length,
      tailOverlayOcrSnippets,
      candidateCountFromTailOverlay,
      tailOverlayEscalationReason,
      tailOverlayProviderErrors,
      geminiCropJudgeEnabled: geminiCropJudgeResult.enabled,
      geminiCropJudgeCalled: Boolean(geminiCropJudgeResult.called),
      geminiCropJudgeStatus: geminiCropJudgeResult.status || null,
      geminiCropJudgeReason: geminiCropJudgeResult.reason || null,
      geminiCropJudgeProvider: geminiCropJudgeResult.provider || null,
      geminiCropJudgeSelectedCropIds: geminiCropJudgeResult.selectedCropIds || [],
      geminiCropJudgeRejectedCropIds: geminiCropJudgeResult.rejectedCropIds || [],
      geminiCropJudgeContactSheetPaths: geminiCropJudgeResult.contactSheetPaths || [],
      geminiCropJudgeResultPath: geminiCropJudgeResult.resultPath || null,
      geminiCropJudgeErrors,
      geminiCropJudgeAggregateStatus: geminiCropJudgeResult.geminiCropJudgeAggregateStatus || null,
      geminiCropJudgeRequestedPageCount: Number(geminiCropJudgeResult.geminiCropJudgeRequestedPageCount || 0),
      geminiCropJudgeSuccessfulPageCount: Number(geminiCropJudgeResult.geminiCropJudgeSuccessfulPageCount || 0),
      geminiCropJudgeFailedPageCount: Number(geminiCropJudgeResult.geminiCropJudgeFailedPageCount || 0),
      geminiCropJudgePartialSuccess: Boolean(geminiCropJudgeResult.geminiCropJudgePartialSuccess),
      geminiCropJudgeCircuitBreakerTripped: Boolean(geminiCropJudgeResult.geminiCropJudgeCircuitBreakerTripped),
      geminiCropJudgeCircuitBreakerReason: geminiCropJudgeResult.geminiCropJudgeCircuitBreakerReason || null,
      geminiCropJudgeSkippedPageCount: Number(geminiCropJudgeResult.geminiCropJudgeSkippedPageCount || 0),
      geminiCropJudgeTotalAttemptCount: Number(geminiCropJudgeResult.geminiCropJudgeTotalAttemptCount || 0),
      geminiCropJudgeRetryCount: Number(geminiCropJudgeResult.geminiCropJudgeRetryCount || 0),
      geminiCropJudgeRateLimitCount: Number(geminiCropJudgeResult.geminiCropJudgeRateLimitCount || 0),
      geminiCropJudgeTimeoutCount: Number(geminiCropJudgeResult.geminiCropJudgeTimeoutCount || 0),
      geminiCropJudgeServerErrorCount: Number(geminiCropJudgeResult.geminiCropJudgeServerErrorCount || 0),
      geminiCropJudgeQueueWaitMs: Number(geminiCropJudgeResult.geminiCropJudgeQueueWaitMs || 0),
      geminiCropJudgeProviderRuntimeMs: Number(geminiCropJudgeResult.geminiCropJudgeProviderRuntimeMs || 0),
      geminiCropJudgeBackoffMs: Number(geminiCropJudgeResult.geminiCropJudgeBackoffMs || 0),
      geminiCropJudgeMaxObservedConcurrency: Number(geminiCropJudgeResult.geminiCropJudgeMaxObservedConcurrency || 0),
      geminiCropJudgeDedupHitCount: Number(geminiCropJudgeResult.geminiCropJudgeDedupHitCount || 0),
      geminiCropJudgePageResults: Array.isArray(geminiCropJudgeResult.pageResults)
        ? geminiCropJudgeResult.pageResults
        : [],
      ocrTextBlockCountFromGeminiSelectedCrops: geminiSelectedOcrTextBlocks.length,
      ocrSnippetsFromGeminiSelectedCrops,
      candidateCountFromGeminiSelectedCrops,
      preAsrKeptCandidateCount: preAsrCandidates.length,
      asrOpportunityWindows,
      ...asrFallbackResult,
      candidateCountFromAsr,
      normalLateRescueSufficiency,
      preTailLateRescueSufficiency,
      preAsrLateRescueSufficiency,
      postAsrLateRescueSufficiency,
      ...lateRescueSufficiency,
      numericContextClassifications,
      contextNumberRejectedAsHouseNumberCount,
      floorNumberRejectedAsHouseNumberCount,
      priceNumberRejectedAsHouseNumberCount,
      ...mediaDiagnostics,
      fusion: {
        status: fusionResult.status,
        fusedEvidenceCount: fusionResult.fusedEvidenceCount || 0,
        clusters: fusionResult.fusionClusters || [],
      },
    },
  })

  const providerCalls = {
    googleVisionCalled: false,
    placesCalled: false,
    geminiCalled: false,
    geminiCropJudgeCalled: Boolean(geminiCropJudgeResult.called),
    localOcrCalled,
    asrCalled: asrFallbackResult.asrCalled,
  }

  return {
    ...response,
    canAutoResolve: false,
    sourceMetadata: {
      title: safeString(context.title || context.metadata?.title, 1000),
      description: safeString(context.description || context.metadata?.description, 4000),
      chapters: (Array.isArray(context.metadata?.chapters) ? context.metadata.chapters : [])
        .map((chapter) => ({
          title: safeString(chapter?.title, 500),
          startSeconds: finiteNumber(chapter?.startSeconds, null),
          endSeconds: finiteNumber(chapter?.endSeconds, null),
        }))
        .filter((chapter) => chapter.title)
        .slice(0, 40),
    },
    ...mediaDiagnostics,
    selectedImages: [
      ...selectedImages,
      ...adaptiveSelectedImages,
      ...tailOverlaySelectedImages,
    ],
    localOcrCalled,
    localOcrProvider,
    localOcrTextBlocks: combinedLocalOcrTextBlocks,
    localOcrBestSnippets,
    localOcrBestSnippetsByEngine,
    localOcrEngineDiagnostics,
    localOcrDiagnostics: effectiveLocalOcrResult.debugDiagnostics || null,
    selectorDiagnosticsPath: selectorResult?.selectorDiagnosticsPath || null,
    contactSheetPath: selectorResult?.contactSheetPath || null,
    selectedContactSheetPath: selectorResult?.selectedContactSheetPath || null,
    generatedCropCount: Number(selectorResult?.generatedCropCount || 0),
    temporalEpisodeEnabled: Boolean(selectorResult?.temporalEpisodeEnabled),
    temporalEpisodeCount: Number(selectorResult?.temporalEpisodeCount || 0),
    temporalUniqueRegionCount: Number(selectorResult?.temporalUniqueRegionCount || 0),
    temporalEpisodeReductionRatio: selectorResult?.temporalEpisodeReductionRatio == null
      ? null
      : Number(selectorResult.temporalEpisodeReductionRatio),
    temporalRepeatedEpisodeCount: Number(selectorResult?.temporalRepeatedEpisodeCount || 0),
    temporalSingleFrameEpisodeCount: Number(selectorResult?.temporalSingleFrameEpisodeCount || 0),
    temporalMaxEpisodeSupportCount: Number(selectorResult?.temporalMaxEpisodeSupportCount || 0),
    temporalAverageEpisodeSupportCount: Number(selectorResult?.temporalAverageEpisodeSupportCount || 0),
    temporalEpisodeSupportHistogram: selectorResult?.temporalEpisodeSupportHistogram || {},
    selectedCropIds: Array.isArray(selectorResult?.selectedCropIds)
      ? selectorResult.selectedCropIds
      : [],
    cropRegionCounts: selectorResult?.cropRegionCounts || {},
    selectorDiagnosis,
    adaptiveFrameSamplingEnabled: adaptiveFrameSamplingResult.enabled,
    adaptiveFrameSamplingRan: adaptiveFrameSamplingResult.ran,
    adaptiveFrameCount: adaptiveFrameSamplingResult.frameCount,
    adaptiveCropCount: adaptiveFrameSamplingResult.cropCount,
    adaptiveSelectedCropIds: adaptiveFrameSamplingResult.selectedCropIds,
    ocrTextBlockCountFromAdaptiveFrames: adaptiveOcrTextBlocks.length,
    ocrSnippetsFromAdaptiveFrames,
    candidateCountFromAdaptiveFrames,
    adaptiveSamplingReason: adaptiveFrameSamplingResult.reason,
    tailOverlayEscalationEnabled: tailOverlayPreparation.enabled,
    tailOverlayEscalationRan: tailOverlayPreparation.ran,
    tailOverlayFrameIds: tailOverlayPreparation.frameIds,
    tailOverlayFrameTimestamps: tailOverlayPreparation.frameTimestamps,
    tailOverlayCropIds: tailOverlayPreparation.cropIds,
    tailOverlayCropCount: tailOverlayPreparation.cropCount,
    tailOverlayOcrTextBlockCount: tailOverlayOcrTextBlocks.length,
    tailOverlayOcrSnippets,
    candidateCountFromTailOverlay,
    tailOverlayEscalationReason,
    tailOverlayProviderErrors,
    geminiCropJudgeEnabled: geminiCropJudgeResult.enabled,
    geminiCropJudgeCalled: Boolean(geminiCropJudgeResult.called),
    geminiCropJudgeStatus: geminiCropJudgeResult.status || null,
    geminiCropJudgeReason: geminiCropJudgeResult.reason || null,
    geminiCropJudgeProvider: geminiCropJudgeResult.provider || null,
    geminiCropJudgeSelectedCropIds: Array.isArray(geminiCropJudgeResult.selectedCropIds)
      ? geminiCropJudgeResult.selectedCropIds
      : [],
    geminiCropJudgeRejectedCropIds: Array.isArray(geminiCropJudgeResult.rejectedCropIds)
      ? geminiCropJudgeResult.rejectedCropIds
      : [],
    geminiCropJudgeContactSheetPaths: Array.isArray(geminiCropJudgeResult.contactSheetPaths)
      ? geminiCropJudgeResult.contactSheetPaths
      : [],
    geminiCropJudgeResultPath: geminiCropJudgeResult.resultPath || null,
    geminiCropJudgeErrors,
    geminiCropJudgeAggregateStatus: geminiCropJudgeResult.geminiCropJudgeAggregateStatus || null,
    geminiCropJudgeRequestedPageCount: Number(geminiCropJudgeResult.geminiCropJudgeRequestedPageCount || 0),
    geminiCropJudgeSuccessfulPageCount: Number(geminiCropJudgeResult.geminiCropJudgeSuccessfulPageCount || 0),
    geminiCropJudgeFailedPageCount: Number(geminiCropJudgeResult.geminiCropJudgeFailedPageCount || 0),
    geminiCropJudgePartialSuccess: Boolean(geminiCropJudgeResult.geminiCropJudgePartialSuccess),
    geminiCropJudgeCircuitBreakerTripped: Boolean(geminiCropJudgeResult.geminiCropJudgeCircuitBreakerTripped),
    geminiCropJudgeCircuitBreakerReason: geminiCropJudgeResult.geminiCropJudgeCircuitBreakerReason || null,
    geminiCropJudgeSkippedPageCount: Number(geminiCropJudgeResult.geminiCropJudgeSkippedPageCount || 0),
    geminiCropJudgeTotalAttemptCount: Number(geminiCropJudgeResult.geminiCropJudgeTotalAttemptCount || 0),
    geminiCropJudgeRetryCount: Number(geminiCropJudgeResult.geminiCropJudgeRetryCount || 0),
    geminiCropJudgeRateLimitCount: Number(geminiCropJudgeResult.geminiCropJudgeRateLimitCount || 0),
    geminiCropJudgeTimeoutCount: Number(geminiCropJudgeResult.geminiCropJudgeTimeoutCount || 0),
    geminiCropJudgeServerErrorCount: Number(geminiCropJudgeResult.geminiCropJudgeServerErrorCount || 0),
    geminiCropJudgeQueueWaitMs: Number(geminiCropJudgeResult.geminiCropJudgeQueueWaitMs || 0),
    geminiCropJudgeProviderRuntimeMs: Number(geminiCropJudgeResult.geminiCropJudgeProviderRuntimeMs || 0),
    geminiCropJudgeBackoffMs: Number(geminiCropJudgeResult.geminiCropJudgeBackoffMs || 0),
    geminiCropJudgeMaxObservedConcurrency: Number(geminiCropJudgeResult.geminiCropJudgeMaxObservedConcurrency || 0),
    geminiCropJudgeDedupHitCount: Number(geminiCropJudgeResult.geminiCropJudgeDedupHitCount || 0),
    geminiCropJudgePageResults: Array.isArray(geminiCropJudgeResult.pageResults)
      ? geminiCropJudgeResult.pageResults
      : [],
    ocrTextBlockCountFromGeminiSelectedCrops: geminiSelectedOcrTextBlocks.length,
    ocrSnippetsFromGeminiSelectedCrops,
    candidateCountFromGeminiSelectedCrops,
    preAsrKeptCandidateCount: preAsrCandidates.length,
    ...asrFallbackResult,
    candidateCountFromAsr,
    ...lateRescueSufficiency,
    numericContextClassifications,
    contextNumberRejectedAsHouseNumberCount,
    floorNumberRejectedAsHouseNumberCount,
    priceNumberRejectedAsHouseNumberCount,
    rawCandidateCount: candidateQualityGate.rawCandidateCount + metadataCandidates.length,
    keptCandidateCount: finalCandidates.length,
    droppedCandidateCount: candidateQualityGate.droppedCandidateCount,
    providerCalls,
    googleVisionCalled: false,
    placesCalled: false,
    geminiCalled: false,
    asrCalled: asrFallbackResult.asrCalled,
    metrics: {
      ...response.metrics,
      localOcrCalled,
      candidateEvidenceCount: candidateEvidence.length,
      strongAddressSignalCount,
      composableAddressSignalCount,
      fusedAddressEvidenceCount: Number(fusionResult.fusedEvidenceCount || 0),
      asrWindowed: Boolean(asrFallbackResult.asrWindowed),
      asrOpportunityWindowCount: Number(asrFallbackResult.asrOpportunityWindowCount || 0),
      asrWindowSecondsProcessed: Number(asrFallbackResult.asrWindowSecondsProcessed || 0),
      asrFullAudioFallbackRan: Boolean(asrFallbackResult.asrFullAudioFallbackRan),
      temporalEpisodeCount: Number(selectorResult?.temporalEpisodeCount || 0),
      temporalUniqueRegionCount: Number(selectorResult?.temporalUniqueRegionCount || 0),
      temporalEpisodeReductionRatio: selectorResult?.temporalEpisodeReductionRatio == null
        ? null
        : Number(selectorResult.temporalEpisodeReductionRatio),
      temporalRepeatedEpisodeCount: Number(selectorResult?.temporalRepeatedEpisodeCount || 0),
      temporalSingleFrameEpisodeCount: Number(selectorResult?.temporalSingleFrameEpisodeCount || 0),
      temporalMaxEpisodeSupportCount: Number(selectorResult?.temporalMaxEpisodeSupportCount || 0),
      temporalAverageEpisodeSupportCount: Number(selectorResult?.temporalAverageEpisodeSupportCount || 0),
      adaptiveFrameSamplingRan: adaptiveFrameSamplingResult.ran,
      adaptiveFrameCount: adaptiveFrameSamplingResult.frameCount,
      adaptiveCropCount: adaptiveFrameSamplingResult.cropCount,
      ocrTextBlockCountFromAdaptiveFrames: adaptiveOcrTextBlocks.length,
      candidateCountFromAdaptiveFrames,
      tailOverlayEscalationRan: tailOverlayPreparation.ran,
      tailOverlayCropCount: tailOverlayPreparation.cropCount,
      tailOverlayOcrTextBlockCount: tailOverlayOcrTextBlocks.length,
      candidateCountFromTailOverlay,
      asrFallbackRan: asrFallbackResult.asrFallbackRan,
      candidateCountFromAsr,
      asrRuntimeMs: asrFallbackResult.asrRuntimeMs,
      asrAudioDurationSeconds: asrFallbackResult.asrAudioDurationSeconds,
      asrModelLoadCount: asrFallbackResult.asrModelLoadCount,
      ...lateRescueSufficiency,
      contextNumberRejectedAsHouseNumberCount,
      floorNumberRejectedAsHouseNumberCount,
      priceNumberRejectedAsHouseNumberCount,
      mediaMetadataCalled: Boolean(mediaDiagnostics.mediaMetadataCalled),
      mediaMetadataStatus: mediaDiagnostics.mediaMetadataStatus || 'NOT_RUN',
      mediaMetadataAvailable: Boolean(mediaDiagnostics.mediaMetadataAvailable),
      mediaAcquisitionAttemptCount: mediaDiagnostics.mediaAcquisitionAttemptCount || 0,
      mediaAcquisitionRuntimeMs: mediaDiagnostics.mediaAcquisitionRuntimeMs || 0,
      mediaFrameExtractionCalled: Boolean(mediaDiagnostics.mediaFrameExtractionCalled),
      mediaFrameExtractionBatchCount: mediaDiagnostics.mediaFrameExtractionBatchCount || 0,
      mediaFrameExtractionRuntimeMs: mediaDiagnostics.mediaFrameExtractionRuntimeMs || 0,
      mediaFrameCount: mediaDiagnostics.mediaFrameCount || 0,
      mediaReuseCount: mediaDiagnostics.mediaReuseCount || 0,
      mediaSecondDownloadCount: mediaDiagnostics.mediaSecondDownloadCount || 0,
      inputDurationSource: mediaDiagnostics.inputDurationSource || null,
      inputDurationSeconds: mediaDiagnostics.inputDurationSeconds ?? null,
      hydratedDurationSource: mediaDiagnostics.hydratedDurationSource || null,
      hydratedDurationSeconds: mediaDiagnostics.hydratedDurationSeconds ?? null,
      timelineDurationSeconds: mediaDiagnostics.timelineDurationSeconds ?? null,
      normalFrameCount: mediaDiagnostics.normalFrameCount || 0,
      normalTimestampMinSeconds: mediaDiagnostics.normalTimestampMinSeconds ?? null,
      normalTimestampMaxSeconds: mediaDiagnostics.normalTimestampMaxSeconds ?? null,
      normalTailCoverageRatio: mediaDiagnostics.normalTailCoverageRatio ?? null,
      normalTailCoverageReached: mediaDiagnostics.normalTailCoverageReached ?? null,
      canonicalMediaPathUsed: Boolean(mediaDiagnostics.canonicalMediaPathUsed),
      injectedFrameExtractorUsed: Boolean(mediaDiagnostics.injectedFrameExtractorUsed),
      legacyFrameExtractorUsed: Boolean(mediaDiagnostics.legacyFrameExtractorUsed),
      mediaSessionReused: Boolean(mediaDiagnostics.mediaSessionReused),
      geminiCropJudgeCalled: Boolean(geminiCropJudgeResult.called),
      googleVisionCalled: false,
      placesCalled: false,
      geminiCalled: false,
      asrCalled: asrFallbackResult.asrCalled,
    },
    debug: {
      ...response.debug,
      smartOverlayStatus: selectorResult?.status || 'UNKNOWN',
      candidateDiagnostics: candidateResult.diagnostics || [],
      candidateRejectionSummary: candidateResult.rejectionSummary || {},
      candidateEvidenceCount: candidateEvidence.length,
      strongAddressSignalCount,
      composableAddressSignalCount,
      fusedAddressEvidenceCount: Number(fusionResult.fusedEvidenceCount || 0),
      diagnosticArtifacts: diagnosticArtifacts.files || {},
      temporalEpisodeEnabled: Boolean(selectorResult?.temporalEpisodeEnabled),
      temporalEpisodeCount: Number(selectorResult?.temporalEpisodeCount || 0),
      temporalUniqueRegionCount: Number(selectorResult?.temporalUniqueRegionCount || 0),
      temporalEpisodeReductionRatio: selectorResult?.temporalEpisodeReductionRatio == null
        ? null
        : Number(selectorResult.temporalEpisodeReductionRatio),
      temporalRepeatedEpisodeCount: Number(selectorResult?.temporalRepeatedEpisodeCount || 0),
      temporalSingleFrameEpisodeCount: Number(selectorResult?.temporalSingleFrameEpisodeCount || 0),
      temporalMaxEpisodeSupportCount: Number(selectorResult?.temporalMaxEpisodeSupportCount || 0),
      temporalAverageEpisodeSupportCount: Number(selectorResult?.temporalAverageEpisodeSupportCount || 0),
      temporalEpisodeSupportHistogram: selectorResult?.temporalEpisodeSupportHistogram || {},
      localOcrBestSnippets,
      localOcrBestSnippetsByEngine,
      localOcrEngineDiagnostics,
      localOcrDiagnostics: effectiveLocalOcrResult.debugDiagnostics || null,
      bestOcrSnippets: localOcrBestSnippets,
      preAsrKeptCandidateCount: preAsrCandidates.length,
      asrOpportunityWindows,
      ...asrFallbackResult,
      candidateCountFromAsr,
      normalLateRescueSufficiency,
      preTailLateRescueSufficiency,
      preAsrLateRescueSufficiency,
      postAsrLateRescueSufficiency,
      ...lateRescueSufficiency,
      numericContextClassifications,
      contextNumberRejectedAsHouseNumberCount,
      floorNumberRejectedAsHouseNumberCount,
      priceNumberRejectedAsHouseNumberCount,
      ...mediaDiagnostics,
    },
  }
}

export async function runShortsTrack2V3SmartOverlayOcr(
  input = {},
  suppliedConfig = {},
  deps = {},
) {
  const context = normalizeContext(input)
  const config = {
    ...getShortsTrack2V3Config(deps.env || process.env),
    ...(suppliedConfig || {}),
  }
  const ownsMediaSession = !deps.mediaSession
  const mediaSession = deps.mediaSession || createShortsTrack2V3MediaSession({
    context,
    config,
    deps,
    tmpRoot: deps.tmpDir || deps.outputDir || '',
  })
  const suppliedFrameExtractor = deps.track2FrameExtractor
  const sharedFrameExtractor = typeof mediaSession?.ensureFrames === 'function'
    ? (frameContext = {}) => mediaSession.ensureFrames({
        sampledTimestamps: frameContext?.limits?.sampledTimestamps || [],
        maxFrames: frameContext?.limits?.maxFrames || frameContext?.limits?.maxFrameHardLimit || 60,
        timeoutMs: frameContext?.budgetMs || frameContext?.limits?.maxExtractionBudgetMs || config.smartOverlayTimeoutMs,
        consumer: frameContext?.mediaConsumer || 'visual_normal',
        signal: frameContext?.signal || deps.signal,
      })
    : null
  const mediaOrchestrationDiagnostics = {
    canonicalMediaPathUsed: typeof suppliedFrameExtractor !== 'function' && typeof sharedFrameExtractor === 'function',
    injectedFrameExtractorUsed: typeof suppliedFrameExtractor === 'function',
    legacyFrameExtractorUsed: Boolean(
      typeof suppliedFrameExtractor === 'function' &&
        typeof deps.track2OcrProvider === 'function' &&
        !deps.mediaSession
    ),
  }
  const runtimeDeps = {
    ...deps,
    mediaSession,
    ...(typeof suppliedFrameExtractor === 'function'
      ? {
          track2FrameExtractor: (frameContext) => suppliedFrameExtractor({
            ...frameContext,
            mediaSession,
          }),
        }
      : typeof sharedFrameExtractor === 'function'
        ? { track2FrameExtractor: sharedFrameExtractor }
        : {}),
  }

  try {
    const durationHydration = await hydrateTrack2InputWithMediaDuration(input, mediaSession, deps)
    const hydratedInput = await hydrateTrack2InputWithMediaMetadata(
      durationHydration.context,
      mediaSession,
      deps,
    )
    return await runShortsTrack2V3SmartOverlayOcrWithMediaSession(
      hydratedInput,
      suppliedConfig,
      {
        ...runtimeDeps,
        track2V3DurationDiagnostics: durationHydration.diagnostics,
        track2V3MediaOrchestrationDiagnostics: mediaOrchestrationDiagnostics,
      },
    )
  } finally {
    if (ownsMediaSession) await mediaSession.cleanup()
  }
}

export default {
  runShortsTrack2V3SmartOverlayOcr,
}
