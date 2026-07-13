function safeString(value, maxLength = 20000) {
  if (value == null) return ''
  return String(value).slice(0, maxLength)
}

export function foldVietnameseText(value = '') {
  return safeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D')
    .toLowerCase()
}

export function normalizeShortsTrack2V3Text(value = '') {
  return safeString(value)
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function withoutDateTimeNoise(value = '') {
  return String(value || '')
    .replace(/\b(?:\d{1,2}[-/.]){2,4}\d{2,4}\b/gu, ' ')
    .replace(/\b\d{1,2}(?::|h)\d{2}\s*[-–—]\s*\d{1,2}(?::|h)\d{2}\b/giu, ' ')
    .replace(/\b\d{1,2}-\d{2}-\d{1,2}\/\d{2}\b/gu, ' ')
    .replace(/\b\d{1,2}h\d{2}\b/giu, ' ')
}

function safeBbox(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).map((point) => {
    if (!Array.isArray(point) || point.length < 2) return null
    const x = Number(point[0])
    const y = Number(point[1])
    return Number.isFinite(x) && Number.isFinite(y)
      ? [Math.trunc(x), Math.trunc(y)]
      : null
  }).filter(Boolean)
}

function safeProviderMetadata(value) {
  if (!value || typeof value !== 'object') return null
  const metadata = {}
  const adapter = safeString(value.adapter, 80)
  const engine = safeString(value.engine, 80)
  const version = safeString(value.version, 80)
  const selectionSource = safeString(value.selectionSource, 80)
  const languages = Array.isArray(value.languages)
    ? value.languages.map((language) => safeString(language, 20)).filter(Boolean).slice(0, 10)
    : []
  const qualityFlags = Array.isArray(value.qualityFlags)
    ? value.qualityFlags.map((flag) => safeString(flag, 80)).filter(Boolean).slice(0, 20)
    : []
  const attemptedPsms = Array.isArray(value.attemptedPsms)
    ? value.attemptedPsms.map(Number).filter(Number.isFinite).slice(0, 10)
    : []
  const attemptedPreprocessVariants = Array.isArray(value.attemptedPreprocessVariants)
    ? value.attemptedPreprocessVariants
        .map((variant) => safeString(variant, 80))
        .filter(Boolean)
        .slice(0, 20)
    : []
  const attemptSummaries = Array.isArray(value.attemptSummaries)
    ? value.attemptSummaries.slice(0, 8).map((attempt) => ({
        preprocessVariant: safeString(attempt?.preprocessVariant, 80),
        psm: Number.isFinite(Number(attempt?.psm)) ? Number(attempt.psm) : null,
        score: Number.isFinite(Number(attempt?.score)) ? Number(attempt.score) : null,
        selectionScore: Number.isFinite(Number(attempt?.selectionScore))
          ? Number(attempt.selectionScore)
          : null,
        consensusCount: Number.isFinite(Number(attempt?.consensusCount))
          ? Number(attempt.consensusCount)
          : null,
        confidence: Number.isFinite(Number(attempt?.confidence))
          ? Number(attempt.confidence)
          : null,
        bestAddressLine: safeString(attempt?.bestAddressLine, 300) || null,
        qualityFlags: Array.isArray(attempt?.qualityFlags)
          ? attempt.qualityFlags.map((flag) => safeString(flag, 80)).filter(Boolean).slice(0, 20)
          : [],
      }))
    : []
  if (adapter) metadata.adapter = adapter
  if (engine) metadata.engine = engine
  if (version) metadata.version = version
  if (selectionSource) metadata.selectionSource = selectionSource
  if (languages.length) metadata.languages = languages
  if (value.localOnly === true) metadata.localOnly = true
  if (value.psm != null && value.psm !== '' && Number.isFinite(Number(value.psm))) {
    metadata.psm = Number(value.psm)
  }
  if (value.ocrScore != null && value.ocrScore !== '' && Number.isFinite(Number(value.ocrScore))) {
    metadata.ocrScore = Number(value.ocrScore)
  }
  if (value.attemptCount != null && value.attemptCount !== '' && Number.isFinite(Number(value.attemptCount))) {
    metadata.attemptCount = Number(value.attemptCount)
  }
  if (value.selectionScore != null && value.selectionScore !== '' && Number.isFinite(Number(value.selectionScore))) {
    metadata.selectionScore = Number(value.selectionScore)
  }
  if (value.consensusCount != null && value.consensusCount !== '' && Number.isFinite(Number(value.consensusCount))) {
    metadata.consensusCount = Number(value.consensusCount)
  }
  if (safeString(value.preprocessVariant, 80)) {
    metadata.preprocessVariant = safeString(value.preprocessVariant, 80)
  }
  if (safeString(value.bestAddressLine, 300)) {
    metadata.bestAddressLine = safeString(value.bestAddressLine, 300)
  }
  if (value.lowConfidence === true) metadata.lowConfidence = true
  if (value.uncertainHouseNumber === true) metadata.uncertainHouseNumber = true
  if (qualityFlags.length) metadata.qualityFlags = qualityFlags
  if (attemptedPsms.length) metadata.attemptedPsms = attemptedPsms
  if (attemptedPreprocessVariants.length) {
    metadata.attemptedPreprocessVariants = attemptedPreprocessVariants
  }
  if (attemptSummaries.length) metadata.attemptSummaries = attemptSummaries
  for (const key of [
    'supportCount',
    'observationCount',
    'rawObservationCount',
    'addressLikelihoodScore',
    'fastAttemptCount',
    'deepAttemptCount',
  ]) {
    if (value[key] != null && value[key] !== '' && Number.isFinite(Number(value[key]))) {
      metadata[key] = Number(value[key])
    }
  }
  if (value.deepPassRan === true) metadata.deepPassRan = true
  if (safeString(value.consensusPolicy, 80)) {
    metadata.consensusPolicy = safeString(value.consensusPolicy, 80)
  }
  if (Array.isArray(value.selectedConsensusTokens)) {
    metadata.selectedConsensusTokens = value.selectedConsensusTokens
      .map((token) => safeString(token, 100))
      .filter(Boolean)
      .slice(0, 30)
  }
  if (value.addressLikelihoodFeatures && typeof value.addressLikelihoodFeatures === 'object') {
    const safeFeatures = {}
    for (const [key, featureValue] of Object.entries(value.addressLikelihoodFeatures).slice(0, 30)) {
      if (typeof featureValue === 'boolean') safeFeatures[safeString(key, 60)] = featureValue
      else if (Number.isFinite(Number(featureValue))) safeFeatures[safeString(key, 60)] = Number(featureValue)
    }
    if (Object.keys(safeFeatures).length) metadata.addressLikelihoodFeatures = safeFeatures
  }
  return Object.keys(metadata).length ? metadata : null
}

export function detectShortsTrack2V3EvidenceTokens(value = '') {
  const rawText = normalizeShortsTrack2V3Text(value)
  const folded = foldVietnameseText(rawText)
  const addressFolded = withoutDateTimeNoise(folded)
  const houseNumberText = addressFolded.replace(
    /\b(?:phuong|phudng|phung|phuung|phurong|p\.?|ward|quan|qun|q\.?|district)\s*\d+\b/giu,
    ' ',
  )
  const hasHouseNumber = /(?:^|[\s,.:;])(?:so\s*)?\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)?(?=$|[\s,.:;/-])/iu
    .test(houseNumberText)
  const hasStreetLike = Boolean(
    /(?:^|[\s,;])(?:duong|d\.|street|st\.?|road|rd\.|avenue|ave\.?|hem|ngo|ngach|alley)(?=$|[\s,;])/iu
      .test(folded) ||
    /(?:^|[\s,;])\d{1,5}(?:\/\d{1,5})?\s+u\.\s+[a-z]{2,}/iu.test(folded)
  )
  const hasWard = /\b(?:phuong|phudng|phung|phuung|phurong|p\.?)\s*\d+\b|\bward\s*\d+\b/iu
    .test(folded)
  const hasDistrict = /\b(?:quan|qun|q\.?)\s*\d+\b|\bdistrict\s*\d+\b/iu.test(folded)
  const hasPhone = /(?:\+?84|0)(?:\s|\.)?(?:3|5|7|8|9)\d(?:[\s.-]?\d){7}\b/iu.test(folded)
  const hasPlaceNameLike = /\b(?:quan|tiem|cafe|ca phe|nha hang|bun|pho|com|banh|xoi|che|lau|nuong|oc|hu tieu|mi|tra sua)\b/iu
    .test(folded)

  return {
    hasHouseNumber,
    hasStreetLike,
    hasWard,
    hasDistrict,
    hasPlaceNameLike,
    hasPhone,
  }
}

export function createShortsTrack2V3EvidenceStore(initialEvidence = []) {
  const evidence = []
  for (const item of Array.isArray(initialEvidence) ? initialEvidence : []) {
    if (item && typeof item === 'object') evidence.push(item)
  }

  return {
    add(item) {
      if (item && typeof item === 'object') evidence.push(item)
      return evidence.length
    },
    list() {
      return [...evidence]
    },
    count() {
      return evidence.length
    },
  }
}

export function buildShortsTrack2V3EvidenceFromOcrBlocks(textBlocks = []) {
  return (Array.isArray(textBlocks) ? textBlocks : [])
    .map((block, index) => {
      const rawText = normalizeShortsTrack2V3Text(block.rawText || block.text || '')
      if (!rawText) return null
      const normalizedText = normalizeShortsTrack2V3Text(block.normalizedText || rawText)

      return {
        id: safeString(block.evidenceId || `ev:ocr:${index}`, 120),
        source: safeString(block.provider || block.source || 'google_vision_text', 80),
        sourceType: safeString(block.sourceType || 'ocr_frame_full', 80),
        timestampSeconds: Number.isFinite(Number(block.timestampSeconds))
          ? Number(block.timestampSeconds)
          : null,
        frameIndex: Number.isFinite(Number(block.frameIndex)) ? Number(block.frameIndex) : null,
        episodeId: safeString(block.episodeId || '', 120) || null,
        segmentId: safeString(block.segmentId || '', 120) || null,
        startSeconds: Number.isFinite(Number(block.startSeconds)) ? Number(block.startSeconds) : null,
        endSeconds: Number.isFinite(Number(block.endSeconds)) ? Number(block.endSeconds) : null,
        supportCount: Number.isFinite(Number(block.supportCount ?? block.episodeSupportCount))
          ? Math.max(1, Number(block.supportCount ?? block.episodeSupportCount))
          : 1,
        rawObservations: Array.isArray(block.rawObservations)
          ? block.rawObservations.map((value) => safeString(value, 1000)).filter(Boolean).slice(0, 20)
          : [],
        selectedConsensusTokens: Array.isArray(block.selectedConsensusTokens)
          ? block.selectedConsensusTokens.map((value) => safeString(value, 100)).filter(Boolean).slice(0, 30)
          : [],
        evidenceIds: Array.isArray(block.evidenceIds)
          ? block.evidenceIds.map((value) => safeString(value, 120)).filter(Boolean).slice(0, 30)
          : [],
        rawText,
        normalizedText,
        confidence: Number.isFinite(Number(block.confidence)) ? Number(block.confidence) : 0,
        bbox: safeBbox(block.bbox),
        imagePath: safeString(block.imagePath || '', 2000) || null,
        imageVariant: safeString(block.imageVariant || block.cropVariant || '', 120) || null,
        cropVariant: safeString(block.cropVariant || block.imageVariant || '', 120) || null,
        preprocessingVariant: safeString(
          block.preprocessingVariant || block.providerMetadata?.preprocessVariant || '',
          80,
        ) || null,
        providerMetadata: safeProviderMetadata(block.providerMetadata),
        forceReviewOnly: Boolean(block.forceReviewOnly),
        riskFlags: Array.isArray(block.riskFlags)
          ? [...new Set(block.riskFlags.map((flag) => safeString(flag, 80)).filter(Boolean))].slice(0, 20)
          : [],
        tokens: detectShortsTrack2V3EvidenceTokens(rawText),
      }
    })
    .filter(Boolean)
}

export function collectShortsTrack2V3Evidence(ocrResult = {}) {
  return buildShortsTrack2V3EvidenceFromOcrBlocks(ocrResult.textBlocks)
}
