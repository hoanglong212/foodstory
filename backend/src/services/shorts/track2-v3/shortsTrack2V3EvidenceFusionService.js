import {
  foldVietnameseText,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'
import {
  analyzeShortsTrack2V3AddressSignal,
  areShortsTrack2V3AddressSignalsComplementary,
} from './shortsTrack2V3AddressSignalService.js'

function finiteNumber(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function safeId(value) {
  return String(value || '').trim().slice(0, 120) || null
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

function temporalIdentity(item = {}) {
  return {
    episodeId: safeId(item.episodeId),
    segmentId: safeId(item.segmentId),
  }
}

function normalizedTokens(value = '') {
  return foldVietnameseText(normalizeShortsTrack2V3Text(value))
    .replace(/[^a-z0-9/]+/gu, ' ')
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter(Boolean)
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

function partialAddressProfile(item = {}) {
  const signal = analyzeShortsTrack2V3AddressSignal(evidenceText(item))
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

function crossStagePartialAddressMatch(a = {}, b = {}) {
  if (!nearbyTimestamp(a, b, 4.5)) return false
  const left = partialAddressProfile(a)
  const right = partialAddressProfile(b)
  if (!left || !right || !compatibleHouseNumber(left.houseNumber, right.houseNumber)) return false
  return fuzzyStreetSimilarity(left.streetTokens, right.streetTokens) >= 0.5
}

function crossEpisodeSameFrameComplementary(a = {}, b = {}) {
  if (!sameFrame(a, b)) return false
  const aIdentity = temporalIdentity(a)
  const bIdentity = temporalIdentity(b)
  if (!aIdentity.episodeId || !bIdentity.episodeId || aIdentity.episodeId === bIdentity.episodeId) {
    return false
  }
  return areShortsTrack2V3AddressSignalsComplementary(evidenceText(a), evidenceText(b))
}

function sameFrameComplementary(a = {}, b = {}) {
  return sameFrame(a, b) &&
    areShortsTrack2V3AddressSignalsComplementary(evidenceText(a), evidenceText(b))
}

function trimSemanticFragment(value = '') {
  return normalizeShortsTrack2V3Text(value)
    .replace(/(\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?))["'’]+(?=\p{L})/gu, '$1 ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function observedHouseStreetFragment(item = {}, signal = {}) {
  const houseNumber = String(signal.features?.houseNumber || '').trim()
  const text = evidenceText(item).replace(/\s+/gu, ' ')
  if (!houseNumber || !text) return null
  const start = text.indexOf(houseNumber)
  if (start < 0) return null
  const fragment = trimSemanticFragment(text.slice(start))
  return fragment && analyzeShortsTrack2V3AddressSignal(fragment).signalClass === 'HOUSE_STREET_PARTIAL'
    ? fragment
    : null
}

function cleanObservedAdminValue(value = '') {
  return trimSemanticFragment(value)
    .replace(/[.:]+$/gu, '')
    .trim()
}

function observedRawAdminValue(item = {}, kind = 'ward') {
  const text = evidenceText(item).replace(/\s+/gu, ' ')
  const pattern = kind === 'ward'
    ? /(?:^|[\s,;])(?:phường|phuong|p(?:\.|\s+))\s*([^,;|]+?)(?=\s*(?:,|;|\||(?:quận|quân|quan|q(?:\.|\s+))\b|$))/iu
    : /(?:^|[\s,;])(?:quận|quân|quan|q(?:\.|\s+))\s*([^,;|]+?)(?=\s*(?:,|;|\||$))/iu
  return cleanObservedAdminValue(text.match(pattern)?.[1] || '') || null
}

function observedAdminFragment(item = {}, signal = {}) {
  const parts = []
  if (signal.features?.hasWard && signal.features?.wardValue) {
    const wardValue = observedRawAdminValue(item, 'ward') ||
      cleanObservedAdminValue(signal.features.wardValue)
    if (wardValue) parts.push(`Phường ${wardValue}`)
  }
  if (signal.features?.hasDistrict && signal.features?.districtValue) {
    const districtValue = observedRawAdminValue(item, 'district') ||
      cleanObservedAdminValue(signal.features.districtValue)
    if (districtValue) parts.push(`Quận ${districtValue}`)
  }
  return parts.length ? parts.join(', ') : null
}

function crossStagePartialConsensusText(items = []) {
  const profiled = items
    .map((item) => ({ item, profile: partialAddressProfile(item) }))
    .filter((entry) => entry.profile)
  if (profiled.length < 2) return null
  const houseSupport = new Map()
  for (const { profile } of profiled) {
    houseSupport.set(profile.houseNumber, (houseSupport.get(profile.houseNumber) || 0) + 1)
  }
  return profiled
    .sort((left, right) => {
      const supportDelta = (houseSupport.get(right.profile.houseNumber) || 0) -
        (houseSupport.get(left.profile.houseNumber) || 0)
      if (supportDelta) return supportDelta
      return evidenceText(left.item).length - evidenceText(right.item).length
    })
    .map(({ item }) => evidenceText(item))
    .find(Boolean) || null
}

function semanticComplementaryText(items = []) {
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      const left = items[leftIndex]
      const right = items[rightIndex]
      if (!sameFrameComplementary(left, right)) continue
      const unsafeQualityFlags = new Set([
        ...(Array.isArray(left?.providerMetadata?.qualityFlags)
          ? left.providerMetadata.qualityFlags
          : []),
        ...(Array.isArray(right?.providerMetadata?.qualityFlags)
          ? right.providerMetadata.qualityFlags
          : []),
      ])
      if (
        unsafeQualityFlags.has('OCR_GARBAGE_TOKENS') ||
        unsafeQualityFlags.has('OCR_LONG_NOISY_TEXT')
      ) continue
      const leftSignal = analyzeShortsTrack2V3AddressSignal(evidenceText(left))
      const rightSignal = analyzeShortsTrack2V3AddressSignal(evidenceText(right))
      const houseItem = leftSignal.signalClass === 'HOUSE_STREET_PARTIAL' ? left : right
      const houseSignal = leftSignal.signalClass === 'HOUSE_STREET_PARTIAL' ? leftSignal : rightSignal
      const adminSignal = leftSignal.signalClass === 'ADMIN_PARTIAL' ? leftSignal : rightSignal
      if (houseSignal.signalClass !== 'HOUSE_STREET_PARTIAL' || adminSignal.signalClass !== 'ADMIN_PARTIAL') {
        continue
      }
      const houseStreet = observedHouseStreetFragment(houseItem, houseSignal)
      const adminItem = leftSignal.signalClass === 'ADMIN_PARTIAL' ? left : right
      const admin = observedAdminFragment(adminItem, adminSignal)
      if (!houseStreet || !admin) continue
      return `${houseStreet}, ${admin}`
    }
  }
  return null
}

function shouldCluster(a = {}, b = {}) {
  const aIdentity = temporalIdentity(a)
  const bIdentity = temporalIdentity(b)

  // A complete address overlay can be split into two independently tracked
  // text bands on the exact same frame. Allow only complementary house/street
  // + admin fragments across episode boundaries; arbitrary cross-episode text
  // remains blocked for listicle safety.
  if (crossEpisodeSameFrameComplementary(a, b)) return true

  // The same OCR overlay can be re-read by normal, adaptive, and Gemini-selected
  // stages under different episode/segment ids. Preserve only a tightly matched
  // repeated house+street core and keep the resulting fusion review-only.
  if (crossStagePartialAddressMatch(a, b)) return true

  if (aIdentity.episodeId || bIdentity.episodeId) {
    return Boolean(
      aIdentity.episodeId &&
      bIdentity.episodeId &&
      aIdentity.episodeId === bIdentity.episodeId &&
      (sameFrame(a, b) || nearbyTimestamp(a, b, 4.5)),
    )
  }

  if (aIdentity.segmentId || bIdentity.segmentId) {
    if (!aIdentity.segmentId || !bIdentity.segmentId) return false
    if (aIdentity.segmentId !== bIdentity.segmentId) return false
    return sameFrame(a, b) || nearbyTimestamp(a, b, 2.25)
  }

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
  const signal = analyzeShortsTrack2V3AddressSignal(text)
  return Boolean(
    signal.strongAddressAnchor ||
    signal.signalClass === 'HOUSE_ADMIN_PARTIAL' ||
    signal.signalClass === 'HOUSE_STREET_PARTIAL' ||
    (signal.features?.hasHouseNumber && signal.features?.hasAdmin)
  )
}

function uniqueIds(items = [], key) {
  return [...new Set(items.map((item) => safeId(item?.[key])).filter(Boolean))]
}

function clusterReason(items = []) {
  // Complementary house/street + admin evidence is strictly more informative
  // than repeated partial consensus. Search the whole connected component for
  // a same-frame complement before allowing an earlier partial pair to decide
  // the cluster reason.
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      if (crossEpisodeSameFrameComplementary(items[leftIndex], items[rightIndex])) {
        return 'CROSS_EPISODE_SAME_FRAME_COMPLEMENTARY'
      }
      if (sameFrameComplementary(items[leftIndex], items[rightIndex])) {
        return 'SAME_FRAME_COMPLEMENTARY'
      }
    }
  }

  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      if (crossStagePartialAddressMatch(items[leftIndex], items[rightIndex])) {
        return 'CROSS_STAGE_PARTIAL_ADDRESS_CONSENSUS'
      }
    }
  }

  const episodeIds = uniqueIds(items, 'episodeId')
  if (episodeIds.length === 1 && items.every((item) => safeId(item.episodeId) === episodeIds[0])) {
    return 'SAME_EPISODE'
  }

  const segmentIds = uniqueIds(items, 'segmentId')
  if (segmentIds.length === 1 && items.every((item) => safeId(item.segmentId) === segmentIds[0])) {
    return 'SAME_SEGMENT'
  }

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
  const reason = clusterReason(items)
  const complementaryReason = reason === 'SAME_FRAME_COMPLEMENTARY' ||
    reason === 'CROSS_EPISODE_SAME_FRAME_COMPLEMENTARY'
  const semanticComplement = complementaryReason ? semanticComplementaryText(items) : null
  if (complementaryReason && !semanticComplement) return null
  const rawText = reason === 'CROSS_STAGE_PARTIAL_ADDRESS_CONSENSUS'
    ? crossStagePartialConsensusText(items) || mergedText(items)
    : semanticComplement || mergedText(items)
  const signal = analyzeShortsTrack2V3AddressSignal(rawText)
  if (!rawText || !clusterLooksUseful(rawText)) return null
  const frameIndexes = [
    ...new Set(items.map((item) => finiteNumber(item.frameIndex)).filter((value) => value !== null)),
  ]
  const timestamps = items
    .map((item) => finiteNumber(item.timestampSeconds))
    .filter((value) => value !== null)
  const starts = items
    .map((item) => finiteNumber(item.startSeconds ?? item.timestampSeconds))
    .filter((value) => value !== null)
  const ends = items
    .map((item) => finiteNumber(item.endSeconds ?? item.timestampSeconds))
    .filter((value) => value !== null)
  const episodeIds = uniqueIds(items, 'episodeId')
  const segmentIds = uniqueIds(items, 'segmentId')

  return {
    id: `ev:fused:${index}`,
    source: 'track2_v3_evidence_fusion',
    sourceType: 'ocr_fused_temporal_region',
    timestampSeconds: timestamps.length ? Math.min(...timestamps) : null,
    frameIndex: frameIndexes.length === 1 ? frameIndexes[0] : null,
    episodeId: episodeIds.length === 1 ? episodeIds[0] : null,
    segmentId: segmentIds.length === 1 ? segmentIds[0] : null,
    startSeconds: starts.length ? Math.min(...starts) : null,
    endSeconds: ends.length ? Math.max(...ends) : null,
    supportCount: Math.max(
      items.length,
      ...items.map((item) => Number(item.supportCount)).filter(Number.isFinite),
    ),
    rawText,
    normalizedText: normalizeShortsTrack2V3Text(rawText),
    confidence: Math.max(
      0,
      ...items.map((item) => Number(item.confidence)).filter((value) => Number.isFinite(value)),
    ),
    addressSignal: signal,
    evidenceIds: [...new Set(items.flatMap((item) => [
      item.id,
      ...(Array.isArray(item.evidenceIds) ? item.evidenceIds : []),
    ]).filter(Boolean))].slice(0, 40),
    forceReviewOnly: true,
    fusion: {
      reason,
      frameIndexes,
      timestampSeconds: timestamps,
      episodeId: episodeIds.length === 1 ? episodeIds[0] : null,
      segmentId: segmentIds.length === 1 ? segmentIds[0] : null,
      startSeconds: starts.length ? Math.min(...starts) : null,
      endSeconds: ends.length ? Math.max(...ends) : null,
    },
  }
}

function buildClusters(evidenceItems = []) {
  const visited = new Set()
  const clusters = []

  for (let index = 0; index < evidenceItems.length; index += 1) {
    if (visited.has(index)) continue
    const queue = [index]
    const component = []
    visited.add(index)

    while (queue.length) {
      const currentIndex = queue.shift()
      const current = evidenceItems[currentIndex]
      component.push(current)

      for (let otherIndex = 0; otherIndex < evidenceItems.length; otherIndex += 1) {
        if (visited.has(otherIndex)) continue
        if (!shouldCluster(current, evidenceItems[otherIndex])) continue
        visited.add(otherIndex)
        queue.push(otherIndex)
      }
    }

    if (component.length > 1) clusters.push(component)
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
    const identity = `${item.segmentId || ''}|${item.episodeId || ''}|${item.normalizedText.toLowerCase()}`
    if (seen.has(identity)) continue
    seen.add(identity)
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
