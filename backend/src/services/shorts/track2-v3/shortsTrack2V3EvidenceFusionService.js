import {
  detectShortsTrack2V3EvidenceTokens,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'

function finiteNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function splitLines(value = '') {
  return normalizeShortsTrack2V3Text(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function evidenceText(item = {}) {
  return normalizeShortsTrack2V3Text(item.rawText || item.normalizedText || '')
}

function sameFrame(a = {}, b = {}) {
  const aFrame = finiteNumber(a.frameIndex)
  const bFrame = finiteNumber(b.frameIndex)
  return aFrame !== null && bFrame !== null && aFrame === bFrame
}

function nearbyTimestamp(a = {}, b = {}, windowSeconds = 1) {
  const aTimestamp = finiteNumber(a.timestampSeconds)
  const bTimestamp = finiteNumber(b.timestampSeconds)
  return aTimestamp !== null &&
    bTimestamp !== null &&
    Math.abs(aTimestamp - bTimestamp) <= windowSeconds
}

function shouldCluster(a = {}, b = {}) {
  return sameFrame(a, b) || nearbyTimestamp(a, b)
}

function mergedText(items = []) {
  const lines = []
  const seen = new Set()

  for (const item of items) {
    for (const line of splitLines(evidenceText(item))) {
      const key = line.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      lines.push(line)
    }
  }

  return lines.join('\n')
}

function clusterLooksUseful(text = '') {
  const tokens = detectShortsTrack2V3EvidenceTokens(text)
  return Boolean(
    tokens.hasHouseNumber &&
      (
        tokens.hasStreetLike ||
        tokens.hasWard ||
        tokens.hasDistrict ||
        tokens.hasPlaceNameLike
      ),
  )
}

function clusterReason(items = []) {
  if (items.every((item) => finiteNumber(item.frameIndex) !== null) &&
    new Set(items.map((item) => finiteNumber(item.frameIndex))).size === 1) {
    return 'SAME_FRAME'
  }

  if (items.every((item) => finiteNumber(item.timestampSeconds) !== null)) {
    return 'NEARBY_TIMESTAMP'
  }

  return 'OCR_BLOCK_GROUP'
}

function fusedEvidenceItem(items = [], index = 0) {
  const rawText = mergedText(items)
  if (!rawText || !clusterLooksUseful(rawText)) return null
  const frameIndexes = [
    ...new Set(items.map((item) => finiteNumber(item.frameIndex)).filter((value) => value !== null)),
  ]
  const timestamps = items
    .map((item) => finiteNumber(item.timestampSeconds))
    .filter((value) => value !== null)

  return {
    id: `ev:fused:${index}`,
    source: 'track2_v3_evidence_fusion',
    sourceType: 'ocr_fused_nearby_frame',
    timestampSeconds: timestamps.length ? Math.min(...timestamps) : null,
    frameIndex: frameIndexes.length === 1 ? frameIndexes[0] : null,
    rawText,
    normalizedText: normalizeShortsTrack2V3Text(rawText),
    confidence: Math.max(
      0,
      ...items.map((item) => Number(item.confidence)).filter((value) => Number.isFinite(value)),
    ),
    tokens: detectShortsTrack2V3EvidenceTokens(rawText),
    evidenceIds: items.map((item) => item.id).filter(Boolean),
    forceReviewOnly: true,
    fusion: {
      reason: clusterReason(items),
      frameIndexes,
      timestampSeconds: timestamps,
    },
  }
}

function buildClusters(evidenceItems = []) {
  const clusters = []

  for (let index = 0; index < evidenceItems.length; index += 1) {
    const seed = evidenceItems[index]
    const cluster = [seed]

    for (let otherIndex = 0; otherIndex < evidenceItems.length; otherIndex += 1) {
      if (otherIndex === index) continue
      const other = evidenceItems[otherIndex]
      if (shouldCluster(seed, other)) cluster.push(other)
    }

    if (cluster.length > 1) clusters.push(cluster)
  }

  return clusters
}

export function fuseShortsTrack2V3Evidence({ evidence = [], candidates = [] } = {}) {
  const evidenceItems = (Array.isArray(evidence) ? evidence : [])
    .filter((item) => item && typeof item === 'object' && evidenceText(item))
  const fused = []
  const seen = new Set()

  for (const cluster of buildClusters(evidenceItems)) {
    const item = fusedEvidenceItem(cluster, fused.length)
    if (!item) continue
    const key = item.normalizedText.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    fused.push(item)
  }

  return {
    status: fused.length ? 'FUSED' : 'PASS_THROUGH',
    evidence: evidenceItems,
    candidates,
    fusedEvidence: [...evidenceItems, ...fused],
    fusedEvidenceCount: fused.length,
    fusionClusters: fused.map((item) => item.fusion),
  }
}
