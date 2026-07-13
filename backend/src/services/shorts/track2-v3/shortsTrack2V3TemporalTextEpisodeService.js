
function finiteNumber(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clamp(value, min = 0, max = 1) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return min
  return Math.min(max, Math.max(min, parsed))
}

function hammingDistance(left = '', right = '') {
  if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY
  let distance = 0
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1
  }
  return distance
}

function verticalBounds(item = {}) {
  const bounds = item.cropBounds || {}
  const sourceHeight = finiteNumber(item.sourceFrameHeight, null)
  if (sourceHeight && Number.isFinite(Number(bounds.top)) && Number.isFinite(Number(bounds.height))) {
    return {
      start: clamp(Number(bounds.top) / sourceHeight),
      end: clamp((Number(bounds.top) + Number(bounds.height)) / sourceHeight),
    }
  }
  return { start: 0, end: 1 }
}

function verticalIou(left = {}, right = {}) {
  const a = verticalBounds(left)
  const b = verticalBounds(right)
  const intersection = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start))
  const union = Math.max(a.end, b.end) - Math.min(a.start, b.start)
  return union > 0 ? intersection / union : 0
}

function isDynamicRegion(item = {}) {
  return /^dynamic_text_region_/iu.test(String(item.variant || ''))
}

function verticalCenterDistance(left = {}, right = {}) {
  const a = verticalBounds(left)
  const b = verticalBounds(right)
  return Math.abs(((a.start + a.end) / 2) - ((b.start + b.end) / 2))
}

function normalizedSignatureSimilarity(left = {}, right = {}) {
  const leftSignature = String(left.signature || '')
  const rightSignature = String(right.signature || '')
  const distance = hammingDistance(leftSignature, rightSignature)
  if (!Number.isFinite(distance) || !leftSignature.length) return null
  return clamp(1 - distance / leftSignature.length)
}

function geometrySimilarity(left = {}, right = {}) {
  const iou = verticalIou(left, right)
  const centerDistance = verticalCenterDistance(left, right)
  const centerSimilarity = clamp(1 - centerDistance / 0.22)
  return clamp(iou * 0.72 + centerSimilarity * 0.28)
}

function visualScoreSimilarity(left = {}, right = {}) {
  const leftScore = finiteNumber(left.score, null)
  const rightScore = finiteNumber(right.score, null)
  if (leftScore == null || rightScore == null) return 0.5
  return clamp(1 - Math.abs(leftScore - rightScore) / 0.35)
}

function regionCompatible(left = {}, right = {}) {
  // Dynamic region names are rank labels, not stable spatial identities. Rank
  // 01 on two frames may refer to completely different vertical bands.
  if (!isDynamicRegion(left) && !isDynamicRegion(right) && left.variant === right.variant && left.variant) {
    return true
  }
  return verticalIou(left, right) >= 0.36 || verticalCenterDistance(left, right) <= 0.10
}

function temporalAssociationScore(left = {}, right = {}, gapSeconds = 0, maxGapSeconds = 2.25) {
  if (!regionCompatible(left, right)) return null

  const signatureSimilarity = normalizedSignatureSimilarity(left, right)
  const geometry = geometrySimilarity(left, right)
  const scoreSimilarity = visualScoreSimilarity(left, right)
  const temporalSimilarity = clamp(1 - Number(gapSeconds || 0) / Math.max(0.25, maxGapSeconds))

  // The 8x8 luminance signature is a cheap appearance fingerprint, not OCR.
  // Geometry alone must never merge two text overlays: rapidly edited Shorts
  // often reuse the same subtitle/address band for completely different text.
  // We therefore require minimum appearance agreement and only use geometry,
  // temporal proximity and selector score as supporting trajectory signals.
  if (signatureSimilarity != null) {
    if (signatureSimilarity < 0.58) return null
    const associationScore =
      signatureSimilarity * 0.56 +
      geometry * 0.28 +
      temporalSimilarity * 0.10 +
      scoreSimilarity * 0.06
    return {
      associationScore,
      signatureSimilarity,
      geometrySimilarity: geometry,
      temporalSimilarity,
      scoreSimilarity,
    }
  }

  // Missing signatures are rare for scored crops. Fail conservatively: only a
  // near-identical spatial trajectory with similar visual score may associate.
  if (geometry < 0.82 || scoreSimilarity < 0.72) return null
  return {
    associationScore: geometry * 0.72 + temporalSimilarity * 0.18 + scoreSimilarity * 0.10,
    signatureSimilarity: null,
    geometrySimilarity: geometry,
    temporalSimilarity,
    scoreSimilarity,
  }
}

function representativeScore(item = {}) {
  const breakdown = item.scoreBreakdown || {}
  const base = finiteNumber(item.score, 0)
  const contrast = finiteNumber(breakdown.contrast, finiteNumber(breakdown.contrastScore, 0))
  const edge = finiteNumber(breakdown.edgeDensity, finiteNumber(breakdown.edgeDensityScore, 0))
  const textBand = finiteNumber(breakdown.textBandScore, 0)
  return base + contrast * 0.12 + edge * 0.18 + textBand * 0.12
}

function chooseRepresentative(items = []) {
  return [...items].sort((left, right) =>
    representativeScore(right) - representativeScore(left) ||
    finiteNumber(left.timestampSeconds, 0) - finiteNumber(right.timestampSeconds, 0)
  )[0] || null
}

function chooseNeighbors(items = [], representative = null, maxNeighbors = 2) {
  if (!representative || maxNeighbors <= 0) return []
  const timestamp = finiteNumber(representative.timestampSeconds, 0)
  const before = [...items]
    .filter((item) => item !== representative && finiteNumber(item.timestampSeconds, 0) < timestamp)
    .sort((left, right) =>
      Math.abs(finiteNumber(left.timestampSeconds, 0) - timestamp) -
      Math.abs(finiteNumber(right.timestampSeconds, 0) - timestamp)
    )[0]
  const after = [...items]
    .filter((item) => item !== representative && finiteNumber(item.timestampSeconds, 0) > timestamp)
    .sort((left, right) =>
      Math.abs(finiteNumber(left.timestampSeconds, 0) - timestamp) -
      Math.abs(finiteNumber(right.timestampSeconds, 0) - timestamp)
    )[0]
  const preferred = [before, after].filter(Boolean)
  if (preferred.length >= maxNeighbors) return preferred.slice(0, maxNeighbors)
  const fallback = [...items]
    .filter((item) => item !== representative && !preferred.includes(item))
    .sort((left, right) =>
      Math.abs(finiteNumber(left.timestampSeconds, 0) - timestamp) -
      Math.abs(finiteNumber(right.timestampSeconds, 0) - timestamp)
    )
  return [...preferred, ...fallback].slice(0, maxNeighbors)
}

function episodeId(index) {
  return `episode-${String(index + 1).padStart(3, '0')}`
}

function segmentId(index) {
  return `segment-${String(index + 1).padStart(3, '0')}`
}

function buildRawEpisodes(items = [], maxGapSeconds = 2.25) {
  const sorted = [...items]
    .filter((item) => item && Number.isFinite(Number(item.timestampSeconds)))
    .sort((left, right) =>
      Number(left.timestampSeconds) - Number(right.timestampSeconds) ||
      Number(left.frameIndex || 0) - Number(right.frameIndex || 0)
    )
  const episodes = []
  let associationComparisonCount = 0
  let acceptedAssociationCount = 0

  for (const item of sorted) {
    const timestamp = Number(item.timestampSeconds)
    let best = null
    let bestAssociation = Number.NEGATIVE_INFINITY
    for (const episode of episodes) {
      const recentItems = episode.items.slice(-4).reverse()
      for (const recent of recentItems) {
        const gap = timestamp - Number(recent.timestampSeconds)
        if (gap < 0 || gap > maxGapSeconds) continue
        associationComparisonCount += 1
        const association = temporalAssociationScore(recent, item, gap, maxGapSeconds)
        if (!association || association.associationScore < 0.70) continue
        if (association.associationScore > bestAssociation) {
          best = episode
          bestAssociation = association.associationScore
        }
      }
    }
    if (best) {
      best.items.push(item)
      acceptedAssociationCount += 1
    }
    else episodes.push({ items: [item] })
  }
  return {
    episodes,
    associationComparisonCount,
    acceptedAssociationCount,
  }
}

function episodeSupportMetrics(episodes = []) {
  const supports = episodes.map((episode) => Math.max(1, episode.items.length))
  const totalSupport = supports.reduce((total, support) => total + support, 0)
  return {
    repeatedEpisodeCount: supports.filter((support) => support > 1).length,
    singleFrameEpisodeCount: supports.filter((support) => support === 1).length,
    maxEpisodeSupportCount: supports.length ? Math.max(...supports) : 0,
    averageEpisodeSupportCount: supports.length
      ? Number((totalSupport / supports.length).toFixed(3))
      : 0,
    episodeSupportHistogram: {
      '1': supports.filter((support) => support === 1).length,
      '2': supports.filter((support) => support === 2).length,
      '3-4': supports.filter((support) => support >= 3 && support <= 4).length,
      '5+': supports.filter((support) => support >= 5).length,
    },
  }
}

export function buildShortsTrack2V3TemporalTextEpisodes({
  scoredCrops = [],
  config = {},
} = {}) {
  const enabled = config.temporalEpisodeEnabled === true
  const maxGapSeconds = Math.max(0.25, Math.min(
    8,
    Number(config.temporalEpisodeMaxGapSeconds || 2.25),
  ))
  const maxRepresentatives = Math.max(1, Math.min(
    40,
    Number(config.temporalEpisodeMaxRepresentatives || config.maxSmartOverlaySelectedImages || 12),
  ))
  const neighborCount = Math.max(0, Math.min(
    4,
    Number(config.temporalEpisodeNeighborCount ?? 2),
  ))

  if (!enabled) {
    return {
      enabled: false,
      episodeCount: 0,
      uniqueRegionCount: scoredCrops.length,
      episodes: [],
      representatives: scoredCrops,
      inputRegionCount: scoredCrops.length,
      associationComparisonCount: 0,
      acceptedAssociationCount: 0,
      repeatedEpisodeCount: 0,
      singleFrameEpisodeCount: scoredCrops.length,
      maxEpisodeSupportCount: scoredCrops.length ? 1 : 0,
      averageEpisodeSupportCount: scoredCrops.length ? 1 : 0,
      episodeSupportHistogram: {
        '1': scoredCrops.length,
        '2': 0,
        '3-4': 0,
        '5+': 0,
      },
      reductionRatio: scoredCrops.length ? 1 : 0,
    }
  }

  const rawEpisodeResult = buildRawEpisodes(scoredCrops, maxGapSeconds)
  const rawEpisodes = rawEpisodeResult.episodes
  const supportMetrics = episodeSupportMetrics(rawEpisodes)
  const episodes = rawEpisodes
    .map((episode, index) => {
      const representative = chooseRepresentative(episode.items)
      if (!representative) return null
      const neighbors = chooseNeighbors(episode.items, representative, neighborCount)
      const startSeconds = Math.min(...episode.items.map((item) => Number(item.timestampSeconds)))
      const endSeconds = Math.max(...episode.items.map((item) => Number(item.timestampSeconds)))
      const id = episodeId(index)
      const segment = segmentId(index)
      return {
        episodeId: id,
        segmentId: segment,
        startSeconds,
        endSeconds,
        supportCount: episode.items.length,
        representative: {
          ...representative,
          episodeId: id,
          segmentId: segment,
          startSeconds,
          endSeconds,
          episodeSupportCount: episode.items.length,
          episodeNeighbors: neighbors.map((neighbor) => ({
            ...neighbor,
            episodeId: id,
            segmentId: segment,
            startSeconds,
            endSeconds,
            episodeSupportCount: episode.items.length,
          })),
        },
        observations: episode.items.map((item) => ({
          frameIndex: finiteNumber(item.frameIndex, null),
          timestampSeconds: finiteNumber(item.timestampSeconds, null),
          variant: item.variant || null,
          score: finiteNumber(item.score, 0),
        })),
      }
    })
    .filter(Boolean)
    .sort((left, right) =>
      representativeScore(right.representative) - representativeScore(left.representative)
    )

  const representatives = episodes
    .slice(0, maxRepresentatives)
    .map((episode) => episode.representative)

  return {
    enabled: true,
    episodeCount: episodes.length,
    uniqueRegionCount: episodes.length,
    episodes,
    representatives,
    inputRegionCount: scoredCrops.length,
    associationComparisonCount: rawEpisodeResult.associationComparisonCount,
    acceptedAssociationCount: rawEpisodeResult.acceptedAssociationCount,
    ...supportMetrics,
    reductionRatio: scoredCrops.length
      ? Number((episodes.length / scoredCrops.length).toFixed(4))
      : 0,
  }
}

export default {
  buildShortsTrack2V3TemporalTextEpisodes,
}
