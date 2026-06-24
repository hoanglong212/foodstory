function capText(value, maximumLength = 700) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, maximumLength)
}

function roundScore(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 1000) / 1000
}

function uniqueSources(values, maximumItems = 24) {
  const result = []
  const seen = new Set()
  for (const value of Array.isArray(values) ? values : []) {
    const type = capText(value?.type, 40)
    const text = capText(value?.text)
    if (!type || !text) continue
    const key = `${type}:${text.toLocaleLowerCase('vi')}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      type,
      text,
      confidence: roundScore(value?.confidence),
      source: capText(value?.source || 'unknown', 160),
      usable: value?.usable !== false,
      ...(value?.lineType
        ? { lineType: capText(value.lineType, 30) }
        : {}),
      ...(value?.evidenceText
        ? { evidenceText: capText(value.evidenceText, 220) }
        : {}),
      ...(Number.isFinite(Number(value?.supportCount))
        ? {
            supportCount: Math.max(
              1,
              Math.min(8, Math.round(Number(value.supportCount))),
            ),
          }
        : {}),
    })
    if (result.length >= maximumItems) break
  }
  return result
}


function normalizedLoose(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isAddressLikeText(value) {
  const text = normalizedLoose(value)
  if (!text) return false

  const hasStreetNumber = /\b\d{1,5}\b/.test(text)
  const hasDistrict = /\b(?:q|quan)\s*\d{1,2}\b/.test(text)
  const hasWard = /\b(?:p|phuong)\s*\d{1,2}\b/.test(text)
  const hasAddressPrefix = /\b(?:dc|dia chi|address)\b\s*\d{1,5}/.test(text)
  const hasStreetWord = /\b(?:duong|street|road|st|rd|nghe|le|nguyen|tran|pham|vo|hoang|dinh)\b/.test(text)

  return hasAddressPrefix || (hasStreetNumber && (hasStreetWord || hasDistrict || hasWard))
}

function unsafeWeakSocialTextSource(source = {}) {
  const type = capText(source?.type, 40)
  const text = capText(source?.text, 700)
  const normalized = normalizedLoose(text)

  if (!['youtube_title', 'youtube_description', 'thumbnail_ocr'].includes(type)) {
    return false
  }
  if (isAddressLikeText(text)) return false

  // Promotional/cadence/location-only phrases must not be fed to the entity
  // extractor as address evidence. They can mention a city/district, but do not
  // contain a house number + street/address shape.
  return /\b(?:hon|hơn|\d+\s*mon|mon|món|ngon|re|rẻ|sieu|siêu|da dang|đa dạng|quan an vat|quán ăn vặt|checkin|review|tai|tại|sai gon|sài gòn|quan\s*\d{1,2})\b/.test(normalized)
}

function evidenceLines(evidence = null) {
  if (!evidence || evidence.usable !== true) return []
  const tiered = [
    ...(Array.isArray(evidence.strongLines) ? evidence.strongLines : []),
    ...(Array.isArray(evidence.weakLines) ? evidence.weakLines : []),
  ]
  const sourceLines = tiered.length
    ? tiered
    : Array.isArray(evidence.lines)
      ? evidence.lines
      : []
  const values = sourceLines.map((line) => ({
    text: capText(line?.text, 220),
    confidence: roundScore(line?.confidence),
    type: capText(line?.type || 'other', 30),
    tier: capText(line?.tier || '', 20),
  }))
  if (!values.length && evidence.text) {
    return String(evidence.text)
      .split('\n')
      .map((text) => ({
        text: capText(text, 220),
        confidence: roundScore(evidence.confidence),
        type: 'other',
        tier: '',
      }))
      .filter((line) => line.text)
  }
  return values.filter((line) => line.text).slice(0, 24)
}

function uniqueText(values, maximumItems = 16) {
  const result = []
  const seen = new Set()
  for (const value of Array.isArray(values) ? values : []) {
    const text = capText(value, 220)
    const key = text.toLocaleLowerCase('vi')
    if (!text || seen.has(key)) continue
    seen.add(key)
    result.push(text)
    if (result.length >= maximumItems) break
  }
  return result
}

function normalizedTextKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function metadataCandidateLocationHints(items = []) {
  const result = []
  const seen = new Set()

  for (const item of Array.isArray(items) ? items : []) {
    const type = capText(item?.type, 40).toLowerCase()
    if (type !== 'youtube_title' && type !== 'title') continue

    const text = capText(item?.text, 500)
    for (const match of text.matchAll(/\b(?:Quận|Quan|Q\.?)\s*0?(\d{1,2})\b/giu)) {
      const districtNumber = Number(match[1])
      if (!Number.isInteger(districtNumber) || districtNumber < 1) continue

      const value = `Quận ${districtNumber}`
      const key = value.toLowerCase()
      if (seen.has(key)) continue

      seen.add(key)
      result.push({
        value,
        source: type,
        evidence: text,
      })
    }
  }

  return result.slice(0, 4)
}

function strongerLineType(left, right) {
  const priority = {
    address: 4,
    phone: 3,
    sign: 2,
    other: 1,
  }
  return (priority[right] || 0) > (priority[left] || 0) ? right : left
}

function normalizedFrameEvidence(collection = {}) {
  const groups = new Map()
  const sourceFrames = Array.isArray(collection.frameOcrEvidence)
    ? collection.frameOcrEvidence
    : []

  for (const [frameIndex, frame] of sourceFrames.slice(0, 60).entries()) {
    const timestampSeconds = Number.isFinite(Number(frame?.timestampSeconds))
      ? Math.round(Number(frame.timestampSeconds) * 1000) / 1000
      : null
    for (const line of (Array.isArray(frame?.lines) ? frame.lines : []).slice(0, 8)) {
      const text = capText(line?.text, 220)
      const key = normalizedTextKey(text)
      if (!text || !key) continue
      const confidence = roundScore(line?.confidence ?? frame?.confidence)
      const type = capText(line?.type || 'other', 30)
      const existing = groups.get(key) || {
        source: 'youtube_frame_ocr',
        text,
        confidence: 0,
        type: 'other',
        tier: '',
        timestamps: [],
        supportCount: 0,
        warnings: [],
        evidenceTexts: [],
        frameKeys: new Set(),
      }
      existing.confidence = Math.max(existing.confidence, confidence)
      existing.type = strongerLineType(existing.type, type)
      if (line?.tier === 'strong') existing.tier = 'strong'
      else if (!existing.tier && line?.tier) existing.tier = capText(line.tier, 20)
      if (
        timestampSeconds !== null &&
        !existing.timestamps.includes(timestampSeconds)
      ) {
        existing.timestamps.push(timestampSeconds)
      }
      existing.frameKeys.add(
        timestampSeconds === null ? `frame:${frameIndex}` : `time:${timestampSeconds}`,
      )
      existing.supportCount = existing.frameKeys.size
      existing.warnings.push(
        ...(Array.isArray(frame?.warnings) ? frame.warnings : []),
      )
      const evidenceText = capText(line?.evidenceText, 220)
      if (
        evidenceText &&
        !existing.evidenceTexts.some(
          (value) =>
            normalizedTextKey(value) === normalizedTextKey(evidenceText),
        )
      ) {
        existing.evidenceTexts.push(evidenceText)
      }
      groups.set(key, existing)
    }
  }

  if (!groups.size) {
    for (const textValue of Array.isArray(collection.frameTexts)
      ? collection.frameTexts
      : []) {
      const text = capText(textValue, 220)
      const key = normalizedTextKey(text)
      if (!text || !key || groups.has(key)) continue
      groups.set(key, {
        source: 'youtube_frame_ocr',
        text,
        confidence: 0.45,
        type: 'other',
        tier: '',
        timestamps: [],
        supportCount: 1,
        warnings: [],
      })
    }
  }

  return [...groups.values()]
    .map((item) => {
      const typeBoost =
        item.type === 'address'
          ? 0.12
          : item.type === 'phone'
            ? 0.1
            : item.type === 'sign'
              ? 0.08
              : 0
      const repeatedBoost = Math.min(
        0.14,
        Math.max(0, item.supportCount - 1) * 0.07,
      )
      return {
        source: item.source,
        text: item.text,
        timestampSeconds: item.timestamps[0] ?? null,
        timestamps: item.timestamps.slice(0, 8),
        confidence: roundScore(
          Math.min(0.95, item.confidence + typeBoost + repeatedBoost),
        ),
        type: item.type,
        tier: item.tier,
        supportCount: Math.min(8, item.supportCount),
        warnings: uniqueText(item.warnings, 4),
        evidenceText: item.evidenceTexts?.[0] || item.text,
      }
    })
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        right.supportCount - left.supportCount,
    )
    .slice(0, 60)
}

export function normalizeVisionEvidence(collection = {}) {
  const candidateLocationHints = metadataCandidateLocationHints(
    collection.metadata,
  )
  const metadata = uniqueSources(collection.metadata).filter(
    (source) => !unsafeWeakSocialTextSource(source),
  )
  const uploadedOcrEvidence =
    collection.uploadedOcrEvidence?.usable === true
      ? collection.uploadedOcrEvidence
      : collection.uploadedOcrEvidence || null
  const uploadedLines = evidenceLines(uploadedOcrEvidence)
  const thumbnailLines = evidenceLines(collection.thumbnailOcrEvidence)
  const frameEvidence = normalizedFrameEvidence(collection)
  const frameTexts = uniqueText(
    frameEvidence.map((item) => item.text),
    60,
  )
  const audioTexts = uniqueText(collection.audioTexts, 12)
  const thumbnailText = thumbnailLines.map((line) => line.text).join('\n')
  const textSources = uniqueSources([
    ...metadata,
    thumbnailText && !unsafeWeakSocialTextSource({ type: 'thumbnail_ocr', text: thumbnailText })
      ? {
          type: 'thumbnail_ocr',
          text: thumbnailText,
          confidence: collection.thumbnailOcrEvidence?.confidence,
          source: 'metadata_image',
        }
      : null,
    ...frameEvidence.map((item) => ({
      type: 'youtube_frame_ocr',
      text: item.text,
      confidence: item.confidence,
      source: 'youtube_frame_ocr',
      lineType: item.type,
      supportCount: item.supportCount,
      evidenceText: item.evidenceText,
    })),
    ...audioTexts.map((text) => ({
      type: 'audio_transcript',
      text,
      confidence: 0.45,
      source: 'speech_to_text',
    })),
  ])

  return {
    metadata,
    uploadedOcrEvidence,
    textSources,
    ocrLines: [...uploadedLines, ...thumbnailLines]
      .map((line) => line.text)
      .slice(0, 20),
    frameEvidence,
    frameTexts,
    audioTexts,
    candidateLocationHints,
    warnings: uniqueText(collection.warnings, 16),
    debug: {
      metadataCount: metadata.length,
      uploadedOcrLineCount: uploadedLines.length,
      thumbnailOcrLineCount: thumbnailLines.length,
      frameTextCount: frameTexts.length,
      frameEvidenceCount: frameEvidence.length,
      audioTextCount: audioTexts.length,
    },
  }
}
