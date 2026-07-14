import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const CONTACT_SHEET_COLUMNS = 3
const TILE_WIDTH = 260
const TILE_HEIGHT = 210
const THUMB_WIDTH = 240
const THUMB_HEIGHT = 160

function safeString(value, maxLength = 1000) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function finiteNumber(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function safeSegment(value, fallback = 'item') {
  const clean = safeString(value, 160)
    .replace(/[^a-z0-9._-]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
  return clean || fallback
}

function timestampSegment(value) {
  return finiteNumber(value, 0).toFixed(3).replace(/\./gu, 'p')
}

function cropKey(crop = {}) {
  return [
    finiteNumber(crop.frameIndex, 0),
    finiteNumber(crop.timestampSeconds, 0).toFixed(3),
    safeString(crop.variant || crop.regionType, 120),
  ].join('|')
}

function relativeArtifactPath(outputDir, filePath) {
  if (!filePath) return null
  return path.relative(outputDir, filePath).replace(/\\/gu, '/')
}

function xmlEscape(value) {
  return safeString(value, 300)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;')
}

async function saveCrop(crop, artifactStem, targetDir, imageTool) {
  await fs.mkdir(targetDir, { recursive: true })
  const targetPath = path.join(targetDir, `${safeSegment(artifactStem)}.jpg`)
  const pipeline = imageTool(crop.framePath)
  if (crop.variant !== 'full_raw' && crop.cropBounds) {
    pipeline.extract(crop.cropBounds)
  }
  await pipeline.jpeg({ quality: 88 }).toFile(targetPath)
  return targetPath
}

async function contactSheetTile(item, imageTool) {
  const thumbnail = await imageTool(item.path)
    .resize({
      width: THUMB_WIDTH,
      height: THUMB_HEIGHT,
      fit: 'contain',
      background: { r: 18, g: 18, b: 18 },
    })
    .jpeg({ quality: 80 })
    .toBuffer()
  const marker = item.selected ? 'SELECTED' : 'UNSELECTED'
  const label = `${item.cropId} | t=${finiteNumber(item.timestampSeconds, 0).toFixed(3)}s`
  const detail = `${item.regionType || 'unknown'} | ${marker}`
  const overlay = Buffer.from(`
    <svg width="${THUMB_WIDTH}" height="36" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${item.selected ? '#173f2b' : '#292929'}"/>
      <text x="5" y="14" fill="#ffffff" font-family="Arial" font-size="11">${xmlEscape(label)}</text>
      <text x="5" y="29" fill="${item.selected ? '#83f2b3' : '#d7d7d7'}" font-family="Arial" font-size="11">${xmlEscape(detail)}</text>
    </svg>
  `)
  return imageTool({
    create: {
      width: TILE_WIDTH,
      height: TILE_HEIGHT,
      channels: 3,
      background: { r: 10, g: 10, b: 10 },
    },
  })
    .composite([
      { input: thumbnail, left: 10, top: 8 },
      { input: overlay, left: 10, top: 169 },
    ])
    .jpeg({ quality: 86 })
    .toBuffer()
}

async function writeContactSheet(items, targetPath, imageTool, emptyLabel) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  if (!items.length) {
    const label = Buffer.from(`
      <svg width="520" height="100" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#171717"/>
        <text x="20" y="55" fill="#ffffff" font-family="Arial" font-size="18">${xmlEscape(emptyLabel)}</text>
      </svg>
    `)
    await imageTool(label).jpeg({ quality: 86 }).toFile(targetPath)
    return targetPath
  }

  const tiles = await Promise.all(items.map((item) => contactSheetTile(item, imageTool)))
  const columns = Math.min(CONTACT_SHEET_COLUMNS, tiles.length)
  const rows = Math.ceil(tiles.length / columns)
  await imageTool({
    create: {
      width: columns * TILE_WIDTH,
      height: rows * TILE_HEIGHT,
      channels: 3,
      background: { r: 5, g: 5, b: 5 },
    },
  })
    .composite(tiles.map((input, index) => ({
      input,
      left: (index % columns) * TILE_WIDTH,
      top: Math.floor(index / columns) * TILE_HEIGHT,
    })))
    .jpeg({ quality: 88 })
    .toFile(targetPath)
  return targetPath
}

async function sampledFrameDiagnostics(frames, savedFrames, outputDir, imageTool) {
  const savedByFrame = new Map(savedFrames.map((frame) => [frame.frameIndex, frame]))
  const diagnostics = []
  for (const [index, frame] of frames.entries()) {
    const frameIndex = finiteNumber(frame.frameIndex, index)
    const sourcePath = safeString(frame.path || frame.imagePath, 2000)
    let width = null
    let height = null
    try {
      const metadata = await imageTool(sourcePath).metadata()
      width = finiteNumber(metadata.width, null)
      height = finiteNumber(metadata.height, null)
    } catch {
      // Dimensions remain null when the source frame cannot be inspected.
    }
    const saved = savedByFrame.get(frameIndex)
    diagnostics.push({
      frameId: `frame-${frameIndex}`,
      timestampSeconds: finiteNumber(frame.timestampSeconds, null),
      path: relativeArtifactPath(outputDir, saved?.framePath || sourcePath),
      width,
      height,
    })
  }
  return diagnostics
}

function scoreValue(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null
}

export async function writeShortsTrack2V3SelectorDiagnostics({
  videoId = null,
  frames = [],
  sampledFrames = [],
  scoredCrops = [],
  selectedImages = [],
  outputDir = '',
  deps = {},
} = {}) {
  if (!outputDir) return null
  const imageTool = deps.sharp || sharp
  const allCropsDir = path.join(outputDir, 'all-crops')
  const unselectedCropsDir = path.join(outputDir, 'unselected-crops')
  const contactSheetsDir = path.join(outputDir, 'contact-sheets')
  await Promise.all([
    fs.mkdir(allCropsDir, { recursive: true }),
    fs.mkdir(unselectedCropsDir, { recursive: true }),
    fs.mkdir(contactSheetsDir, { recursive: true }),
  ])
  const selectedKeys = new Set(selectedImages.map(cropKey))
  const cropItems = []
  const cropRegionCounts = {}

  for (const [index, crop] of scoredCrops.entries()) {
    const cropId = `crop-${String(index).padStart(3, '0')}`
    const artifactStem = [
      cropId,
      `f${finiteNumber(crop.frameIndex, 0)}`,
      `t${timestampSegment(crop.timestampSeconds)}`,
      safeSegment(crop.variant, 'region'),
    ].join('-')
    const selected = selectedKeys.has(cropKey(crop))
    const allCropPath = await saveCrop(crop, artifactStem, allCropsDir, imageTool)
    let unselectedPath = null
    if (!selected) {
      await fs.mkdir(unselectedCropsDir, { recursive: true })
      unselectedPath = path.join(unselectedCropsDir, `${safeSegment(artifactStem)}.jpg`)
      await fs.copyFile(allCropPath, unselectedPath)
    }
    const regionType = safeString(crop.variant || crop.sourceType, 120) || 'unknown'
    cropRegionCounts[regionType] = (cropRegionCounts[regionType] || 0) + 1
    cropItems.push({
      cropId,
      frameId: `frame-${finiteNumber(crop.frameIndex, 0)}`,
      frameIndex: finiteNumber(crop.frameIndex, 0),
      timestampSeconds: finiteNumber(crop.timestampSeconds, null),
      regionType,
      selected,
      path: allCropPath,
      unselectedPath,
      x: finiteNumber(crop.cropBounds?.left, null),
      y: finiteNumber(crop.cropBounds?.top, null),
      width: finiteNumber(crop.cropBounds?.width ?? crop.width, null),
      height: finiteNumber(crop.cropBounds?.height ?? crop.height, null),
      sourceWidth: finiteNumber(crop.sourceFrameWidth, null),
      sourceHeight: finiteNumber(crop.sourceFrameHeight, null),
      scores: {
        textDensity: scoreValue(crop.scoreBreakdown?.textBandScore),
        edgeDensity: scoreValue(crop.scoreBreakdown?.edgeDensity),
        contrast: scoreValue(crop.scoreBreakdown?.contrastScore),
        digitPresence: null,
        addressKeywordHint: null,
      },
    })
  }

  const selectedCropIds = cropItems.filter((crop) => crop.selected).map((crop) => crop.cropId)
  const allContactSheetPath = path.join(contactSheetsDir, 'all-crops-contact-sheet.jpg')
  const selectedContactSheetPath = path.join(contactSheetsDir, 'selected-crops-contact-sheet.jpg')
  await writeContactSheet(cropItems, allContactSheetPath, imageTool, 'No generated crops')
  await writeContactSheet(
    cropItems.filter((crop) => crop.selected),
    selectedContactSheetPath,
    imageTool,
    'No selected crops',
  )

  const diagnosticsPath = path.join(outputDir, 'selector-diagnostics.json')
  const diagnostics = {
    videoId: safeString(videoId, 160) || null,
    frameCount: frames.length,
    generatedCropCount: cropItems.length,
    selectedCropCount: selectedCropIds.length,
    selectedCropIds,
    cropRegionCounts,
    sampledFrames: await sampledFrameDiagnostics(frames, sampledFrames, outputDir, imageTool),
    crops: cropItems.map((crop) => ({
      ...crop,
      path: relativeArtifactPath(outputDir, crop.path),
      unselectedPath: relativeArtifactPath(outputDir, crop.unselectedPath),
    })),
    contactSheets: {
      allCrops: relativeArtifactPath(outputDir, allContactSheetPath),
      selectedCrops: relativeArtifactPath(outputDir, selectedContactSheetPath),
    },
  }
  await fs.writeFile(diagnosticsPath, `${JSON.stringify(diagnostics, null, 2)}\n`, 'utf8')

  return {
    ...diagnostics,
    selectorDiagnosticsPath: diagnosticsPath,
    contactSheetPath: allContactSheetPath,
    selectedContactSheetPath,
  }
}

export default {
  writeShortsTrack2V3SelectorDiagnostics,
}
