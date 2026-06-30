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
    .toLowerCase()
}

export function normalizeShortsTrack2V3Text(value = '') {
  return safeString(value)
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

export function detectShortsTrack2V3EvidenceTokens(value = '') {
  const rawText = normalizeShortsTrack2V3Text(value)
  const folded = foldVietnameseText(rawText)
  const hasHouseNumber = /(?:^|[\s,.:;])(?:so\s*)?\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)?(?=$|[\s,.:;/-])/iu
    .test(folded)
  const hasStreetLike = /\b(?:duong|d\.|street|st\.|road|rd\.|avenue|ave\.|hem|ngo|ngach|alley)\b/iu
    .test(folded)
  const hasWard = /\b(?:phuong|p\.?)\s*\d+\b|\bward\s*\d+\b/iu.test(folded)
  const hasDistrict = /\b(?:quan|q\.?)\s*\d+\b|\bdistrict\s*\d+\b/iu.test(folded)
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
        rawText,
        normalizedText,
        confidence: Number.isFinite(Number(block.confidence)) ? Number(block.confidence) : 0,
        tokens: detectShortsTrack2V3EvidenceTokens(rawText),
      }
    })
    .filter(Boolean)
}

export function collectShortsTrack2V3Evidence(ocrResult = {}) {
  return buildShortsTrack2V3EvidenceFromOcrBlocks(ocrResult.textBlocks)
}
