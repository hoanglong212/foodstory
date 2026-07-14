import {
  foldVietnameseText,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'
import { analyzeShortsTrack2V3AddressSignal } from './shortsTrack2V3AddressSignalService.js'
import { scoreShortsTrack2V3AddressLikelihood } from './shortsTrack2V3TesseractOcrScoringService.js'

function finiteNumber(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function safeString(value, maxLength = 2000) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function normalizedTokens(value = '') {
  return foldVietnameseText(normalizeShortsTrack2V3Text(value))
    .replace(/[^a-z0-9/]+/gu, ' ')
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter(Boolean)
}

function tokenSimilarity(left = '', right = '') {
  const a = new Set(normalizedTokens(left))
  const b = new Set(normalizedTokens(right))
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection += 1
  }
  const union = new Set([...a, ...b]).size
  return union ? intersection / union : 0
}

function editDistance(left = '', right = '') {
  const a = String(left)
  const b = String(right)
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const previous = row[j]
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      diagonal = previous
    }
  }
  return row[b.length]
}

function fuzzyTokenMatch(left = '', right = '') {
  if (left === right) return true
  if (left.length < 3 || right.length < 3) return false
  return editDistance(left, right) <= 1
}

function fuzzyStreetSimilarity(leftTokens = [], rightTokens = []) {
  if (!leftTokens.length || !rightTokens.length) return 0
  let matches = 0
  const used = new Set()
  for (const left of leftTokens) {
    const index = rightTokens.findIndex((right, rightIndex) =>
      !used.has(rightIndex) && fuzzyTokenMatch(left, right)
    )
    if (index >= 0) {
      matches += 1
      used.add(index)
    }
  }
  return matches / Math.max(leftTokens.length, rightTokens.length)
}

function groupKey(block = {}, index = 0) {
  if (block.episodeId) return `episode:${block.episodeId}`
  const timestamp = finiteNumber(block.timestampSeconds, null)
  const bucket = timestamp == null ? `index:${index}` : `time:${Math.round(timestamp * 2) / 2}`
  return [
    block.segmentId ? `segment:${block.segmentId}` : bucket,
    safeString(block.cropVariant || block.imageVariant || block.sourceType, 120),
  ].join('|')
}

function observationText(block = {}) {
  return normalizeShortsTrack2V3Text(block.rawText || block.normalizedText || block.text || '')
}

function partialAddressProfile(block = {}) {
  const text = observationText(block)
  const signal = analyzeShortsTrack2V3AddressSignal(text)
  if (
    !signal.features?.hasHouseNumber ||
    !signal.features?.hasStreetComponent ||
    signal.features?.noisyMenuPricePromo
  ) {
    return null
  }
  const houseNumber = String(signal.features.houseNumber || '').toLowerCase()
  const streetText = signal.features.streetSegment || signal.folded
  const streetTokens = normalizedTokens(streetText)
    .filter((token) => token !== houseNumber && !/^\d+$/u.test(token))
    .filter((token) => !['duong', 'street', 'road', 'hem', 'ngo', 'ngach'].includes(token))
    .slice(0, 8)
  if (!houseNumber || streetTokens.length < 2) return null
  return { houseNumber, streetTokens }
}

function compatibleHouseNumber(left = '', right = '') {
  if (!left || !right) return false
  if (left === right) return true
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left]
  return shorter.length >= 3 && longer.length === shorter.length + 1 && longer.endsWith(shorter)
}

function nearby(a = {}, b = {}, seconds = 4.5) {
  const left = finiteNumber(a.timestampSeconds, null)
  const right = finiteNumber(b.timestampSeconds, null)
  return left !== null && right !== null && Math.abs(left - right) <= seconds
}

function crossStagePartialAddressMatch(a = {}, b = {}) {
  if (!nearby(a, b, 4.5)) return false
  const left = partialAddressProfile(a)
  const right = partialAddressProfile(b)
  if (!left || !right || !compatibleHouseNumber(left.houseNumber, right.houseNumber)) return false
  return fuzzyStreetSimilarity(left.streetTokens, right.streetTokens) >= 0.5
}

function shouldGroup(a = {}, aIndex = 0, b = {}, bIndex = 0) {
  if (groupKey(a, aIndex) === groupKey(b, bIndex)) {
    // Episode/segment ids are local to an extraction stage and may collide in
    // listicles. Equal ids are useful hints, not permission to bridge distant
    // parts of a video.
    return nearby(a, b, 4.5)
  }
  return crossStagePartialAddressMatch(a, b)
}

function buildGroups(blocks = []) {
  const visited = new Set()
  const groups = []
  for (let index = 0; index < blocks.length; index += 1) {
    if (visited.has(index)) continue
    const queue = [index]
    const component = []
    visited.add(index)
    while (queue.length) {
      const currentIndex = queue.shift()
      const current = blocks[currentIndex]
      component.push(current)
      for (let otherIndex = 0; otherIndex < blocks.length; otherIndex += 1) {
        if (visited.has(otherIndex)) continue
        if (!shouldGroup(current, currentIndex, blocks[otherIndex], otherIndex)) continue
        visited.add(otherIndex)
        queue.push(otherIndex)
      }
    }
    groups.push(component)
  }
  return groups
}

function exactHouseSupport(item, prepared = []) {
  const profile = partialAddressProfile(item.block)
  if (!profile) return 1
  return prepared.filter((other) =>
    partialAddressProfile(other.block)?.houseNumber === profile.houseNumber
  ).length
}

function selectMedoid(blocks = []) {
  const prepared = blocks
    .map((block) => ({
      block,
      text: observationText(block),
      likelihood: scoreShortsTrack2V3AddressLikelihood(observationText(block)),
    }))
    .filter((item) => item.text)
  if (!prepared.length) return null

  return [...prepared]
    .map((item) => {
      const support = prepared.reduce((total, other) => {
        if (other === item) return total
        const similarity = tokenSimilarity(item.text, other.text)
        const partialSupport = crossStagePartialAddressMatch(item.block, other.block) ? 0.75 : 0
        return total + Math.max(similarity, partialSupport)
      }, 0)
      const confidence = finiteNumber(item.block.confidence, 0)
      const houseSupport = exactHouseSupport(item, prepared)
      return {
        ...item,
        medoidScore:
          support * 30 +
          Number(item.likelihood.score || 0) +
          confidence * 8 +
          Math.min(54, Math.max(0, houseSupport - 1) * 18),
        exactHouseSupportCount: houseSupport,
      }
    })
    .sort((left, right) =>
      right.medoidScore - left.medoidScore ||
      right.exactHouseSupportCount - left.exactHouseSupportCount ||
      Number(right.likelihood.score || 0) - Number(left.likelihood.score || 0)
    )[0]
}

export function buildShortsTrack2V3TemporalOcrConsensus(textBlocks = []) {
  const blocks = (Array.isArray(textBlocks) ? textBlocks : []).filter((block) => observationText(block))
  const groups = buildGroups(blocks)
  const consensusBlocks = []
  const episodes = []
  let consensusIndex = 0

  for (const groupBlocks of groups) {
    const medoid = selectMedoid(groupBlocks)
    if (!medoid) continue
    const similar = groupBlocks.filter((block) =>
      tokenSimilarity(medoid.text, observationText(block)) >= 0.55 ||
      crossStagePartialAddressMatch(medoid.block, block)
    )
    const supportBlocks = similar.length ? similar : [medoid.block]
    const timestamps = supportBlocks
      .map((block) => finiteNumber(block.timestampSeconds, null))
      .filter((value) => value !== null)
    const selectedConsensusTokens = normalizedTokens(medoid.text)
    const rawObservations = groupBlocks.map((block) => ({
      id: block.id || null,
      rawText: observationText(block),
      provider: block.provider || block.source || null,
      timestampSeconds: finiteNumber(block.timestampSeconds, null),
      frameIndex: finiteNumber(block.frameIndex, null),
    }))
    const episodeIds = [...new Set(groupBlocks.map((block) => safeString(block.episodeId, 120)).filter(Boolean))]
    const segmentIds = [...new Set(groupBlocks.map((block) => safeString(block.segmentId, 120)).filter(Boolean))]
    const episodeId = episodeIds.length === 1 ? episodeIds[0] : null
    const segmentId = segmentIds.length === 1 ? segmentIds[0] : null
    const consensusId = `temporal-consensus:${String(consensusIndex).padStart(3, '0')}`
    consensusIndex += 1
    const crossStagePartialConsensus = groupBlocks.some((block) =>
      block !== medoid.block && crossStagePartialAddressMatch(medoid.block, block)
    )

    consensusBlocks.push({
      ...medoid.block,
      id: consensusId,
      provider: 'temporal_ocr_consensus',
      source: 'temporal_ocr_consensus',
      sourceType: 'temporal_ocr_consensus',
      rawText: medoid.text,
      normalizedText: medoid.text,
      confidence: Math.max(
        finiteNumber(medoid.block.confidence, 0),
        ...supportBlocks.map((block) => finiteNumber(block.confidence, 0)),
      ),
      episodeId,
      segmentId,
      startSeconds: timestamps.length
        ? Math.min(...timestamps)
        : finiteNumber(medoid.block.startSeconds, null),
      endSeconds: timestamps.length
        ? Math.max(...timestamps)
        : finiteNumber(medoid.block.endSeconds, null),
      supportCount: supportBlocks.length,
      rawObservations,
      selectedConsensusTokens,
      evidenceIds: supportBlocks.map((block) => block.id).filter(Boolean),
      forceReviewOnly: true,
      riskFlags: [...new Set([
        ...(Array.isArray(medoid.block.riskFlags) ? medoid.block.riskFlags : []),
        'TEMPORAL_OCR_CONSENSUS',
        ...(crossStagePartialConsensus ? ['CROSS_STAGE_PARTIAL_ADDRESS_CONSENSUS'] : []),
        'REVIEW_ONLY',
      ])],
      providerMetadata: {
        ...(medoid.block.providerMetadata || {}),
        adapter: 'temporal_ocr_medoid_consensus',
        consensusPolicy: 'OBSERVED_MEDOID_ONLY',
        supportCount: supportBlocks.length,
        observationCount: groupBlocks.length,
        selectedConsensusTokens,
        rawObservationCount: rawObservations.length,
        addressLikelihoodScore: medoid.likelihood.score,
        addressLikelihoodFeatures: medoid.likelihood.features,
        exactHouseSupportCount: medoid.exactHouseSupportCount,
        crossStagePartialConsensus,
      },
    })
    episodes.push({
      key: crossStagePartialConsensus
        ? `cross-stage-partial:${consensusId}`
        : groupKey(medoid.block, consensusIndex - 1),
      episodeId,
      segmentId,
      observationCount: groupBlocks.length,
      supportCount: supportBlocks.length,
      selectedRawText: medoid.text,
      selectedConsensusTokens,
      timestamps,
      rawObservations,
      crossStagePartialConsensus,
    })
  }

  return {
    status: consensusBlocks.length ? 'CONSENSUS_BUILT' : 'NO_CONSENSUS',
    consensusBlocks,
    consensusBlockCount: consensusBlocks.length,
    episodeCount: episodes.length,
    episodes,
  }
}

export default {
  buildShortsTrack2V3TemporalOcrConsensus,
}
