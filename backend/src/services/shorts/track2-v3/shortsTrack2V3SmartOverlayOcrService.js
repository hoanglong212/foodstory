import { getShortsTrack2V3Config } from './shortsTrack2V3Config.js'
import { classifyShortsTrack2V3Intent } from './shortsTrack2V3IntentClassifierService.js'
import {
  collectShortsTrack2V3Evidence,
  detectShortsTrack2V3EvidenceTokens,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'
import { fuseShortsTrack2V3Evidence } from './shortsTrack2V3EvidenceFusionService.js'
import { buildShortsTrack2V3Candidates } from './shortsTrack2V3CandidateBuilderService.js'
import { parseShortsTrack2V3NamedAdminAddress } from './shortsTrack2V3NamedAdminAddressService.js'
import { applyShortsTrack2V3CandidateQualityGate } from './shortsTrack2V3CandidateQualityGateService.js'
import { buildShortsTrack2V3Response } from './shortsTrack2V3ResponseBuilder.js'
import { runShortsTrack2V3LocalOcrProvider } from './shortsTrack2V3LocalOcrProviderService.js'
import { runShortsTrack2V3GeminiCropJudge } from './shortsTrack2V3GeminiCropJudgeService.js'
import { runShortsTrack2V3SmartOverlayDryRun } from './shortsTrack2V3SmartOverlaySelectorService.js'
import { runShortsTrack2V3AdaptiveFrameSampling } from './shortsTrack2V3AdaptiveFrameSamplingService.js'
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

function hasCandidateAddressLine(evidence = {}) {
  const text = normalizeShortsTrack2V3Text(evidence.rawText || evidence.normalizedText)
  if (parseShortsTrack2V3NamedAdminAddress(text)) return true
  return text
    .split('\n')
    .some((line) => {
      if (parseShortsTrack2V3NamedAdminAddress(line)) return true
      const tokens = detectShortsTrack2V3EvidenceTokens(line)
      return Boolean(
        tokens.hasHouseNumber &&
          (tokens.hasStreetLike || tokens.hasWard || tokens.hasDistrict),
      )
    })
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
      if (!sourceItems.length || sourceItems.some((source) =>
        !['local_paddleocr', 'local_tesseract', 'local_easyocr'].includes(source.source)
      )) {
        return true
      }

      const bestSourceScore = Math.max(...sourceItems.map((source) =>
        finiteNumber(source.providerMetadata?.ocrScore, 0)
      ))
      const longestSourceText = Math.max(...sourceItems.map((source) =>
        normalizeShortsTrack2V3Text(source.rawText).length
      ))
      const fusedScoring = scoreShortsTrack2V3TesseractOutput({
        rawText: item.rawText,
        confidence: item.confidence,
        preprocessVariant: 'evidence_fusion',
        psm: 6,
      })
      return Boolean(
        fusedScoring.score > bestSourceScore + 10 &&
          normalizeShortsTrack2V3Text(item.rawText).length <= longestSourceText * 1.5,
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
  const typeBonus = candidate.type === 'OCR_PLACE_PLUS_PARTIAL_ADDRESS' ? 5 : 0
  const noisyMenuPlacePenalty = candidate.placeName && /\b\d+\s*[kKoO]{1,2}\b/u.test(candidate.placeName)
    ? 20
    : 0
  return Math.max(providerScore, localScore) + typeBonus - noisyMenuPlacePenalty - displayText.length / 500
}

function cleanLocalOcrCandidates(candidates = [], evidence = [], context = {}) {
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
  const maxCandidates = context.fixtureCase?.category === 'multi_candidate' ? 5 : 2
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
      bestSnippets: (Array.isArray(run?.bestSnippets) ? run.bestSnippets : [])
        .slice(0, 8)
        .map((snippet) => safeString(snippet, 180))
        .filter(Boolean),
    }]
  }))
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

  const provider = typeof deps.localOcrProvider === 'function'
    ? deps.localOcrProvider
    : typeof deps.track2V3LocalOcrProvider === 'function'
      ? deps.track2V3LocalOcrProvider
      : runShortsTrack2V3LocalOcrProvider

  try {
    const result = await provider({ selectedImages, config, deps })
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
  }
}

function buildLocalCandidateOutcome({ context, intent, textBlocks, config }) {
  const evidence = collectShortsTrack2V3Evidence({ textBlocks })
  const candidateEvidence = evidence.filter(hasCandidateAddressLine)
  const fusionResult = fuseShortsTrack2V3Evidence({ evidence: candidateEvidence, candidates: [] })
  const fusedEvidence = cleanLocalOcrFusedEvidence(fusionResult, candidateEvidence)
  const candidateResult = buildShortsTrack2V3Candidates({
    context,
    intent,
    evidence: fusedEvidence,
    config,
  })
  const candidateCleanup = cleanLocalOcrCandidates(candidateResult.candidates, fusedEvidence, context)
  const candidateQualityGate = applyShortsTrack2V3CandidateQualityGate({
    context,
    intent,
    evidence: fusedEvidence,
    candidates: candidateCleanup.candidates,
  })
  return {
    evidence,
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

export async function runShortsTrack2V3SmartOverlayOcr(
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
  const selectorResult = await selectSmartOverlay(context, config, deps)
  const selectedImages = Array.isArray(selectorResult?.selectedImages)
    ? selectorResult.selectedImages
    : []
  const localOcrResult = await runLocalOcr(selectedImages, config, deps)
  const localOcrTextBlocks = normalizeLocalOcrTextBlocks(
    localOcrResult.textBlocks,
    selectedImages,
    localOcrResult.provider,
    config,
  )
  const normalOutcome = buildLocalCandidateOutcome({
    context,
    intent,
    textBlocks: localOcrTextBlocks,
    config,
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
    metadataCandidateCount: metadataCandidates.length,
    normalCandidateCount: normalOutcome.candidateQualityGate.candidates.length,
    selectorResult,
    localOcrResult,
    localOcrTextBlocks,
    deps,
  })
  const adaptiveSelectedImages = Array.isArray(adaptiveFrameSamplingResult.selectedImages)
    ? adaptiveFrameSamplingResult.selectedImages
    : []
  const adaptiveLocalOcrConfig = {
    ...config,
    track2V3LocalOcrProvider: 'ensemble',
  }
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
  const preGeminiOcrTextBlocks = [
    ...localOcrTextBlocks,
    ...adaptiveOcrTextBlocks,
  ]
  const preGeminiOutcome = buildLocalCandidateOutcome({
    context,
    intent,
    textBlocks: preGeminiOcrTextBlocks,
    config,
  })
  const normalDiagnosticCrops = Array.isArray(selectorResult?.selectorDiagnostics?.crops)
    ? selectorResult.selectorDiagnostics.crops
    : []
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
      metadataCandidates.length === 0 &&
      preGeminiOutcome.candidateQualityGate.candidates.length === 0,
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
  const geminiLocalOcrConfig = {
    ...config,
    track2V3LocalOcrProvider: 'ensemble',
  }
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
  const {
    evidence,
    candidateEvidence,
    fusionResult,
    fusedEvidence,
    candidateResult,
    candidateCleanup,
  } = outcome
  const candidateQualityGate = {
    ...outcome.candidateQualityGate,
    candidates: outcome.candidateQualityGate.candidates.map((candidate) => {
      const adaptiveCandidateContributed = Boolean(
        adaptiveOcrTextBlocks.length &&
          preGeminiOutcome.candidateQualityGate.candidates.length >
            normalOutcome.candidateQualityGate.candidates.length,
      )
      const reviewMarkers = [
        ...(adaptiveCandidateContributed ? ['ADAPTIVE_FRAME_SAMPLING'] : []),
        ...(geminiSelectedOcrTextBlocks.length ? ['GEMINI_CROP_JUDGE_SELECTED'] : []),
      ]
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
  const finalCandidates = mergeMetadataCandidatesWithExisting(
    metadataCandidates,
    candidateQualityGate.candidates,
  )
  const responseEvidence = [
    ...metadataEvidence,
    ...evidence,
    ...fusedEvidence.filter((item) => !evidence.some((base) => base.id === item.id)),
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
  const geminiSelectedLocalErrors = Array.isArray(geminiSelectedOcrResult.providerErrors)
    ? geminiSelectedOcrResult.providerErrors.map((error) => sanitizeProviderError(error))
    : []
  const providerErrors = [
    ...selectorErrors,
    ...localErrors,
    ...adaptiveFrameErrors,
    ...adaptiveLocalErrors,
    ...geminiSelectedLocalErrors,
  ]
  const selectorDiagnosis = classifySelectorDiagnosis({
    selectorResult,
    providerErrors,
    localOcrTextBlocks: combinedLocalOcrTextBlocks,
    candidateEvidence,
  })
  const localOcrCalled = Boolean(
    localOcrResult.called ||
      adaptiveLocalOcrResult.called ||
      geminiSelectedOcrResult.called,
  )
  const localOcrProvider = safeString(
    geminiSelectedOcrResult.provider ||
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
    ...sanitizeEngineRuns(geminiSelectedOcrResult.engineRuns),
  }
  const localOcrBestSnippetsByEngine = snippetsByEngine(
    combinedLocalOcrTextBlocks,
    localOcrEngineDiagnostics,
  )
  const localOcrImageCount = Math.max(0, Math.trunc(
    finiteNumber(localOcrResult.imageCount, selectedImages.length) +
      finiteNumber(adaptiveLocalOcrResult.imageCount, adaptiveSelectedImages.length) +
      finiteNumber(geminiSelectedOcrResult.imageCount, 0),
  ))
  const effectiveLocalOcrResult = geminiSelectedOcrResult.called
    ? geminiSelectedOcrResult
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

  const response = buildShortsTrack2V3Response({
    startedAt,
    context,
    config,
    intent,
    framePlan: {
      frameCount: (selectorResult?.sampledFrameCount || 0) + adaptiveFrameSamplingResult.frameCount,
      frames: [
        ...(selectorResult?.sampledFrames || []),
        ...(adaptiveFrameSamplingResult.selectorResult?.sampledFrames || []),
      ],
    },
    frameVariants: {
      variants: [...selectedImages, ...adaptiveSelectedImages, ...geminiSelectedCrops],
      variantCount: selectedImages.length + adaptiveSelectedImages.length + geminiSelectedCrops.length,
      cropImageCount: selectedImages.length + adaptiveSelectedImages.length + geminiSelectedCrops.length,
    },
    ocrResult: {
      status: effectiveLocalOcrResult.status || 'NOT_RUN',
      reason: effectiveLocalOcrResult.reason || 'LOCAL_OCR_NOT_RUN',
      textBlocks: combinedLocalOcrTextBlocks,
      imageCount: localOcrImageCount,
      metrics: {
        frameCount: (selectorResult?.sampledFrameCount || 0) + adaptiveFrameSamplingResult.frameCount,
        ocrImageCount: localOcrImageCount,
        cropImageCount: selectedImages.length + adaptiveSelectedImages.length + geminiSelectedCrops.length,
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
      keptCandidateCount: finalCandidates.length,
      droppedCandidateCount: candidateQualityGate.droppedCandidateCount,
      weakCandidateCount: candidateQualityGate.weakCandidateCount,
      addressAnchoredCandidateCount: candidateQualityGate.addressAnchoredCandidateCount + metadataCandidates.length,
      keptCandidateReasons: candidateQualityGate.keptCandidateReasons,
      droppedCandidateReasons: candidateQualityGate.droppedCandidateReasons,
      droppedCandidates: candidateQualityGate.droppedCandidates,
      candidateCountBeforeLocalCleanup: candidateResult.candidateCount,
      localCandidateCleanupDroppedCount: candidateCleanup.droppedCandidateCount,
      metadataEvidenceCount: metadataEvidence.length,
      metadataCandidateCount: metadataCandidates.length,
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
      geminiCropJudgeEnabled: geminiCropJudgeResult.enabled,
      geminiCropJudgeCalled: Boolean(geminiCropJudgeResult.called),
      geminiCropJudgeProvider: geminiCropJudgeResult.provider || null,
      geminiCropJudgeSelectedCropIds: geminiCropJudgeResult.selectedCropIds || [],
      geminiCropJudgeRejectedCropIds: geminiCropJudgeResult.rejectedCropIds || [],
      geminiCropJudgeContactSheetPaths: geminiCropJudgeResult.contactSheetPaths || [],
      geminiCropJudgeResultPath: geminiCropJudgeResult.resultPath || null,
      geminiCropJudgeErrors,
      ocrTextBlockCountFromGeminiSelectedCrops: geminiSelectedOcrTextBlocks.length,
      ocrSnippetsFromGeminiSelectedCrops,
      candidateCountFromGeminiSelectedCrops,
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
    asrCalled: false,
  }

  return {
    ...response,
    canAutoResolve: false,
    selectedImages: [...selectedImages, ...adaptiveSelectedImages],
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
    geminiCropJudgeEnabled: geminiCropJudgeResult.enabled,
    geminiCropJudgeCalled: Boolean(geminiCropJudgeResult.called),
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
    ocrTextBlockCountFromGeminiSelectedCrops: geminiSelectedOcrTextBlocks.length,
    ocrSnippetsFromGeminiSelectedCrops,
    candidateCountFromGeminiSelectedCrops,
    rawCandidateCount: candidateQualityGate.rawCandidateCount + metadataCandidates.length,
    keptCandidateCount: finalCandidates.length,
    droppedCandidateCount: candidateQualityGate.droppedCandidateCount,
    providerCalls,
    googleVisionCalled: false,
    placesCalled: false,
    geminiCalled: false,
    asrCalled: false,
    metrics: {
      ...response.metrics,
      localOcrCalled,
      adaptiveFrameSamplingRan: adaptiveFrameSamplingResult.ran,
      adaptiveFrameCount: adaptiveFrameSamplingResult.frameCount,
      adaptiveCropCount: adaptiveFrameSamplingResult.cropCount,
      ocrTextBlockCountFromAdaptiveFrames: adaptiveOcrTextBlocks.length,
      candidateCountFromAdaptiveFrames,
      geminiCropJudgeCalled: Boolean(geminiCropJudgeResult.called),
      googleVisionCalled: false,
      placesCalled: false,
      geminiCalled: false,
      asrCalled: false,
    },
    debug: {
      ...response.debug,
      smartOverlayStatus: selectorResult?.status || 'UNKNOWN',
      localOcrBestSnippets,
      localOcrBestSnippetsByEngine,
      localOcrEngineDiagnostics,
      localOcrDiagnostics: effectiveLocalOcrResult.debugDiagnostics || null,
    },
  }
}

export default {
  runShortsTrack2V3SmartOverlayOcr,
}
