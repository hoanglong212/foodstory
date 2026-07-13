
import sharp from 'sharp'

function finiteNumber(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clamp(value, min = 0, max = 1) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return min
  return Math.min(max, Math.max(min, parsed))
}

function mean(values = []) {
  if (!values.length) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

function standardDeviation(values = [], average = mean(values)) {
  if (!values.length) return 0
  const variance = values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function smooth(values = [], radius = 2) {
  return values.map((_, index) => {
    let total = 0
    let count = 0
    for (let offset = -radius; offset <= radius; offset += 1) {
      const value = values[index + offset]
      if (!Number.isFinite(value)) continue
      total += value
      count += 1
    }
    return count ? total / count : 0
  })
}

function buildBands(rowScores = [], threshold = 0.04) {
  const bands = []
  let start = null
  for (let index = 0; index < rowScores.length; index += 1) {
    const active = rowScores[index] >= threshold
    if (active && start === null) start = index
    if ((!active || index === rowScores.length - 1) && start !== null) {
      const end = active && index === rowScores.length - 1 ? index : index - 1
      if (end - start + 1 >= 3) bands.push({ start, end })
      start = null
    }
  }
  return bands
}

function mergeBands(bands = [], maxGap = 8) {
  const merged = []
  for (const band of bands) {
    const previous = merged.at(-1)
    if (previous && band.start - previous.end - 1 <= maxGap) {
      previous.end = Math.max(previous.end, band.end)
    } else {
      merged.push({ ...band })
    }
  }
  return merged
}

function bandScore({ start, end }, rowScores, height) {
  const values = rowScores.slice(start, end + 1)
  const average = mean(values)
  const peak = Math.max(0, ...values)
  const heightRatio = (end - start + 1) / Math.max(1, height)
  const center = ((start + end) / 2) / Math.max(1, height)
  const tinyWatermarkPenalty = heightRatio < 0.06 && (center < 0.12 || center > 0.9) ? 0.2 : 0
  const subtitlePenalty = center > 0.7 && heightRatio < 0.11 ? 0.08 : 0
  return average * 0.55 + peak * 0.3 + Math.min(0.2, heightRatio) * 0.75 -
    tinyWatermarkPenalty - subtitlePenalty
}

export async function proposeShortsTrack2V3TextRegions(frame = {}, config = {}, deps = {}) {
  if (config.textRegionProposalEnabled === false) return []
  const imagePath = String(frame.imagePath || frame.path || frame.framePath || '').trim()
  if (!imagePath) return []

  const imageTool = deps.sharp || sharp
  const maxRegions = Math.min(8, Math.max(1, Number(config.maxDynamicTextRegionsPerFrame || 4)))
  try {
    const { data, info } = await imageTool(imagePath)
      .greyscale()
      .resize({ width: 360, withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const width = finiteNumber(info.width, 0)
    const height = finiteNumber(info.height, 0)
    if (!width || !height || data.length < width * height) return []

    const rowScores = []
    for (let y = 0; y < height; y += 1) {
      let edgeCount = 0
      let darkLightTransitions = 0
      let sum = 0
      let sumSquares = 0
      for (let x = 0; x < width; x += 1) {
        const value = data[y * width + x]
        sum += value
        sumSquares += value * value
        if (x > 0) {
          const previous = data[y * width + x - 1]
          const diff = Math.abs(value - previous)
          if (diff >= 24) edgeCount += 1
          if ((value >= 180 && previous <= 90) || (value <= 90 && previous >= 180)) {
            darkLightTransitions += 1
          }
        }
      }
      const average = sum / width
      const variance = Math.max(0, sumSquares / width - average * average)
      const edgeDensity = edgeCount / Math.max(1, width - 1)
      const transitionDensity = darkLightTransitions / Math.max(1, width - 1)
      const varianceScore = clamp(Math.sqrt(variance) / 72)
      rowScores.push(
        clamp(edgeDensity / 0.32) * 0.55 +
        clamp(transitionDensity / 0.18) * 0.25 +
        varianceScore * 0.2,
      )
    }

    const smoothed = smooth(rowScores, 2)
    const average = mean(smoothed)
    const deviation = standardDeviation(smoothed, average)
    const threshold = Math.min(0.42, Math.max(0.055, average + deviation * 0.62))
    const rawBands = buildBands(smoothed, threshold)
    const mergedBands = mergeBands(rawBands, Math.max(4, Math.round(height * 0.022)))
    const minHeight = Math.max(5, Math.round(height * 0.045))
    const maxHeight = Math.max(minHeight, Math.round(height * 0.38))
    const expanded = mergedBands
      .map((band) => {
        const padding = Math.max(3, Math.round(height * 0.018))
        const start = Math.max(0, band.start - padding)
        const end = Math.min(height - 1, band.end + padding)
        return { start, end }
      })
      .filter((band) => band.end - band.start + 1 >= minHeight)
      .map((band) => {
        if (band.end - band.start + 1 <= maxHeight) return band
        const center = Math.round((band.start + band.end) / 2)
        const half = Math.floor(maxHeight / 2)
        return {
          start: Math.max(0, center - half),
          end: Math.min(height - 1, center + half),
        }
      })
      .map((band) => ({
        ...band,
        score: bandScore(band, smoothed, height),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, maxRegions)
      .sort((left, right) => left.start - right.start)

    return expanded.map((band, index) => ({
      variant: `dynamic_text_region_${String(index + 1).padStart(2, '0')}`,
      sourceType: 'smart_overlay_dynamic_text_region',
      yStart: clamp(band.start / height),
      yEnd: clamp((band.end + 1) / height),
      scoreBoost: Math.min(0.16, Math.max(0, band.score * 0.12)),
      proposalScore: Number(band.score.toFixed(6)),
      proposalType: 'DYNAMIC_TEXT_BAND',
    }))
  } catch {
    return []
  }
}

export default {
  proposeShortsTrack2V3TextRegions,
}
