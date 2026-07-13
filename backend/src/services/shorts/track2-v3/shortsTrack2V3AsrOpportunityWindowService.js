import { normalizeShortsTrack2V3Text } from './shortsTrack2V3EvidenceStoreService.js'
import { analyzeShortsTrack2V3AddressSignal } from './shortsTrack2V3AddressSignalService.js'

function finiteNumber(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function normalizeBlock(block = {}) {
  const rawText = normalizeShortsTrack2V3Text(block.rawText || block.normalizedText || block.text || '')
  if (!rawText) return null
  const timestampSeconds = finiteNumber(block.timestampSeconds, null)
  const startSeconds = finiteNumber(block.startSeconds, timestampSeconds)
  const endSeconds = finiteNumber(block.endSeconds, timestampSeconds)
  if (startSeconds == null && endSeconds == null) return null
  const addressSignal = analyzeShortsTrack2V3AddressSignal(rawText)
  return {
    rawText,
    timestampSeconds,
    startSeconds: startSeconds ?? endSeconds,
    endSeconds: endSeconds ?? startSeconds,
    episodeId: String(block.episodeId || '').trim() || null,
    segmentId: String(block.segmentId || '').trim() || null,
    addressSignal,
  }
}

function signalScore(item = {}) {
  const signal = item.addressSignal || {}
  let score = Number(signal.score || 0)
  if (signal.strongAddressAnchor) score += 28
  if (signal.signalClass === 'HOUSE_STREET_PARTIAL') score += 20
  if (signal.signalClass === 'HOUSE_ADMIN_PARTIAL') score += 18
  if (signal.signalClass === 'ADMIN_PARTIAL') score += 8
  return score
}

function mergeWindows(windows = [], maxSeconds = 22) {
  const sorted = [...windows].sort((a, b) => a.startSeconds - b.startSeconds)
  const merged = []
  for (const window of sorted) {
    const previous = merged.at(-1)
    if (
      previous &&
      window.startSeconds <= previous.endSeconds + 1 &&
      (!previous.segmentId || !window.segmentId || previous.segmentId === window.segmentId)
    ) {
      previous.endSeconds = Math.min(
        previous.startSeconds + maxSeconds,
        Math.max(previous.endSeconds, window.endSeconds),
      )
      previous.signalScore = Math.max(previous.signalScore, window.signalScore)
      previous.episodeIds = [...new Set([...previous.episodeIds, ...window.episodeIds])]
      previous.evidenceCount += window.evidenceCount
      continue
    }
    merged.push({ ...window, episodeIds: [...window.episodeIds] })
  }
  return merged
}

export function buildShortsTrack2V3AsrOpportunityWindows({
  textBlocks = [],
  durationSeconds = null,
  config = {},
} = {}) {
  if (config.windowedAsrEnabled === false) return []
  const paddingSeconds = clamp(finiteNumber(config.asrWindowPaddingSeconds, 6), 0, 20)
  const maxSeconds = clamp(finiteNumber(config.asrWindowMaxSeconds, 22), 6, 60)
  const maxCount = Math.max(1, Math.min(8, Math.trunc(finiteNumber(config.asrWindowMaxCount, 3))))
  const duration = finiteNumber(durationSeconds, null)
  const candidates = (Array.isArray(textBlocks) ? textBlocks : [])
    .map(normalizeBlock)
    .filter(Boolean)
    .map((item) => ({ ...item, signalScore: signalScore(item) }))
    .filter((item) => {
      const composableForAsr = Boolean(
        item.addressSignal?.composableAddressSignal &&
        item.addressSignal?.signalClass !== 'EXPLICIT_STREET_PARTIAL'
      )
      return Boolean(item.signalScore >= 32 || composableForAsr)
    })
    .sort((a, b) => b.signalScore - a.signalScore)

  const windows = candidates.map((item, index) => {
    let startSeconds = Math.max(0, Math.min(item.startSeconds, item.endSeconds) - paddingSeconds)
    let endSeconds = Math.max(item.startSeconds, item.endSeconds) + paddingSeconds
    if (endSeconds - startSeconds > maxSeconds) {
      const center = (startSeconds + endSeconds) / 2
      startSeconds = Math.max(0, center - maxSeconds / 2)
      endSeconds = startSeconds + maxSeconds
    }
    if (duration != null && duration > 0) {
      endSeconds = Math.min(duration, endSeconds)
      startSeconds = Math.max(0, Math.min(startSeconds, endSeconds - Math.min(1, endSeconds)))
    }
    return {
      windowId: `asr-window-${String(index + 1).padStart(3, '0')}`,
      startSeconds: Math.round(startSeconds * 1000) / 1000,
      endSeconds: Math.round(endSeconds * 1000) / 1000,
      durationSeconds: Math.round(Math.max(0, endSeconds - startSeconds) * 1000) / 1000,
      episodeIds: item.episodeId ? [item.episodeId] : [],
      segmentId: item.segmentId,
      signalScore: item.signalScore,
      evidenceCount: 1,
      reason: 'WEAK_ADDRESS_EPISODE',
    }
  })

  return mergeWindows(windows, maxSeconds)
    .sort((a, b) => b.signalScore - a.signalScore || a.startSeconds - b.startSeconds)
    .slice(0, maxCount)
    .map((window, index) => ({
      ...window,
      windowId: `asr-window-${String(index + 1).padStart(3, '0')}`,
      durationSeconds: Math.round((window.endSeconds - window.startSeconds) * 1000) / 1000,
    }))
}

export default { buildShortsTrack2V3AsrOpportunityWindows }
