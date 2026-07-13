import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const MAX_PREPROCESS_DIMENSION = 3200

function safeSegment(value, fallback = 'image') {
  const clean = String(value || '')
    .trim()
    .replace(/[^a-z0-9_-]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80)
  return clean || fallback
}

function scaledDimension(value, scale) {
  return Math.max(1, Math.min(MAX_PREPROCESS_DIMENSION, Math.round(value * scale)))
}

async function writeVariant(pipeline, outputPath) {
  await pipeline.png({ compressionLevel: 6 }).toFile(outputPath)
  return outputPath
}

function preprocessError(code, variant) {
  return {
    code,
    message: `Tesseract preprocessing failed safely for ${variant}.`,
    provider: 'local_tesseract',
  }
}

async function detectOverlayTextBands(imagePath, width, height, maxBands = 4) {
  if (height < 90 || width < 80) return []
  const { data, info } = await sharp(imagePath)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const rowWidth = Number(info.width || width)
  const rowHeight = Number(info.height || height)
  const threshold = 0.25
  const rowScores = []
  for (let y = 0; y < rowHeight; y += 1) {
    let edges = 0
    for (let x = 1; x < rowWidth; x += 1) {
      const current = data[y * rowWidth + x]
      const previous = data[y * rowWidth + x - 1]
      if (Math.abs(current - previous) >= 24) edges += 1
    }
    rowScores.push(edges / Math.max(1, rowWidth - 1))
  }

  const groups = []
  let start = null
  for (let y = 0; y < rowHeight; y += 1) {
    if (rowScores[y] >= threshold) {
      if (start === null) start = y
    } else if (start !== null) {
      if (y - start >= 2) groups.push({ top: start, bottom: y - 1 })
      start = null
    }
  }
  if (start !== null && rowHeight - start >= 2) {
    groups.push({ top: start, bottom: rowHeight - 1 })
  }

  const maxBandHeight = Math.max(18, Math.round(rowHeight * 0.28))
  const merged = []
  for (const group of groups) {
    const previous = merged[merged.length - 1]
    const combinedHeight = previous ? group.bottom - previous.top + 1 : 0
    if (
      previous &&
      group.top - previous.bottom - 1 <= 6 &&
      combinedHeight <= maxBandHeight
    ) {
      previous.bottom = group.bottom
    } else {
      merged.push({ ...group })
    }
  }

  const bands = merged
    .filter((group) => group.bottom - group.top + 1 >= 8)
    .map((group) => {
      const padding = 4
      const top = Math.max(0, group.top - padding)
      const bottom = Math.min(rowHeight - 1, group.bottom + padding)
      const meanEdgeDensity = rowScores
        .slice(group.top, group.bottom + 1)
        .reduce((total, value) => total + value, 0) / Math.max(1, group.bottom - group.top + 1)
      return {
        top,
        height: bottom - top + 1,
        meanEdgeDensity,
      }
    })

  const strongest = [...bands]
    .sort((left, right) => right.meanEdgeDensity - left.meanEdgeDensity)
    .slice(0, maxBands)
    .sort((left, right) => left.top - right.top)
  return strongest
}

export async function generateShortsTrack2V3TesseractPreprocessVariants(
  image = {},
  { outputDir = '', index = 0, variantNames = null } = {},
) {
  const imagePath = String(image.imagePath || image.cropPath || image.path || '').trim()
  if (!imagePath) {
    return {
      variants: [],
      providerErrors: [preprocessError('LOCAL_TESSERACT_PREPROCESS_NO_IMAGE', 'original')],
      cleanup: async () => {},
    }
  }

  const persistent = Boolean(outputDir)
  const root = persistent
    ? path.join(outputDir, 'local-ocr-preprocessed', `${String(index).padStart(2, '0')}-${safeSegment(image.cropVariant)}`)
    : await fs.mkdtemp(path.join(os.tmpdir(), 'track2-v3-tesseract-'))
  await fs.mkdir(root, { recursive: true })
  const cleanup = persistent
    ? async () => {}
    : async () => fs.rm(root, { recursive: true, force: true }).catch(() => {})
  const requestedVariantNames = Array.isArray(variantNames) && variantNames.length
    ? new Set(variantNames.map((value) => String(value || '').trim()).filter(Boolean))
    : null
  const wantsVariant = (name) => !requestedVariantNames || requestedVariantNames.has(name)
  const variants = wantsVariant('original')
    ? [
        {
          preprocessVariant: 'original',
          imagePath,
          generated: false,
        },
      ]
    : []
  const providerErrors = []

  try {
    const metadata = await sharp(imagePath).metadata()
    const width = Number(metadata.width || 0)
    const height = Number(metadata.height || 0)
    if (!width || !height) throw new Error('missing image dimensions')

    let overlayTextBands = []
    const wantsOverlayLineBand = [
      'overlay_line_band_01',
      'overlay_line_band_02',
      'overlay_line_band_03',
      'overlay_line_band_04',
    ].some(wantsVariant)
    if (wantsOverlayLineBand) {
      if (height < 90) {
        // Short dynamic overlay crops are already effectively a single text
        // line/band. The previous >=90px gate prevented targeted rescue from
        // ever running on these high-value address strips. Preserve two bounded
        // binary profiles because outlined social-video text can need either a
        // medium or high threshold; both stay on the same observed crop.
        overlayTextBands = [
          { top: 0, height, meanEdgeDensity: 0, threshold: 180, negate: false, scale: 5 },
          { top: 0, height, meanEdgeDensity: 0, threshold: 240, negate: false, scale: 5 },
        ]
      } else {
        try {
          overlayTextBands = await detectOverlayTextBands(imagePath, width, height, 4)
        } catch {
          overlayTextBands = []
        }
      }
    }
    if (!overlayTextBands.length && height >= 90) {
      overlayTextBands = [0.12, 0.34, 0.56, 0.76].map((topRatio) => {
        const top = Math.max(0, Math.round(height * topRatio))
        return {
          top,
          height: Math.max(1, Math.min(height - top, Math.round(height * 0.22))),
          meanEdgeDensity: 0,
        }
      })
    }

    const definitions = [
      {
        name: 'upscale_3x_gray',
        build: () => sharp(imagePath)
          .grayscale()
          .resize(scaledDimension(width, 3), scaledDimension(height, 3), { kernel: 'lanczos3' })
          .normalize(),
      },
      {
        name: 'upscale_4x_gray',
        build: () => sharp(imagePath)
          .grayscale()
          .resize(scaledDimension(width, 4), scaledDimension(height, 4), { kernel: 'lanczos3' })
          .normalize(),
      },
      {
        name: 'sharpen_contrast',
        build: () => sharp(imagePath)
          .grayscale()
          .resize(scaledDimension(width, 3), scaledDimension(height, 3), { kernel: 'lanczos3' })
          .normalize()
          .linear(1.25, -18)
          .sharpen({ sigma: 1.2 }),
      },
      {
        name: 'threshold_light_text',
        build: () => sharp(imagePath)
          .grayscale()
          .resize(scaledDimension(width, 3), scaledDimension(height, 3), { kernel: 'lanczos3' })
          .normalize()
          .threshold(165),
      },
      {
        name: 'inverted_threshold',
        build: () => sharp(imagePath)
          .grayscale()
          .resize(scaledDimension(width, 3), scaledDimension(height, 3), { kernel: 'lanczos3' })
          .normalize()
          .threshold(165)
          .negate(),
      },
      {
        name: 'tight_address_line',
        build: () => {
          const top = Math.max(0, Math.round(height * 0.12))
          const cropHeight = Math.max(1, Math.min(height - top, Math.round(height * 0.20)))
          return sharp(imagePath)
            .extract({ left: 0, top, width, height: cropHeight })
            .grayscale()
            .resize(scaledDimension(width, 4), scaledDimension(cropHeight, 4), { kernel: 'lanczos3' })
            .normalize()
            .sharpen({ sigma: 1.1 })
        },
      },
      ...(
        overlayTextBands.length
          ? overlayTextBands.map((band, bandIndex) => ({
              name: `overlay_line_band_${String(bandIndex + 1).padStart(2, '0')}`,
              build: () => {
                const threshold = Number.isFinite(Number(band.threshold))
                  ? Number(band.threshold)
                  : overlayTextBands.length >= 3 && bandIndex === 1 ? 210 : 190
                const scale = Number.isFinite(Number(band.scale))
                  ? Number(band.scale)
                  : bandIndex <= 2 ? 5 : 4
                let pipeline = sharp(imagePath)
                  .extract({ left: 0, top: band.top, width, height: band.height })
                  .grayscale()
                  .resize(
                    scaledDimension(width, scale),
                    scaledDimension(band.height, scale),
                    { kernel: 'lanczos3' },
                  )
                  .normalize()
                  .threshold(threshold)
                if (band.negate !== false) pipeline = pipeline.negate()
                return pipeline.extend({
                    top: 24,
                    bottom: 24,
                    left: 24,
                    right: 24,
                    background: { r: 255, g: 255, b: 255 },
                  })
              },
            }))
          : []
      ),
    ]

    for (const definition of definitions) {
      if (!wantsVariant(definition.name)) continue
      const outputPath = path.join(root, `${definition.name}.png`)
      try {
        await writeVariant(definition.build(), outputPath)
        variants.push({
          preprocessVariant: definition.name,
          imagePath: outputPath,
          generated: true,
        })
      } catch {
        providerErrors.push(preprocessError(
          'LOCAL_TESSERACT_PREPROCESS_VARIANT_ERROR',
          definition.name,
        ))
      }
    }
  } catch {
    providerErrors.push(preprocessError(
      'LOCAL_TESSERACT_PREPROCESS_UNAVAILABLE',
      'generated variants',
    ))
  }

  return { variants, providerErrors, cleanup, outputDir: root }
}

export default {
  generateShortsTrack2V3TesseractPreprocessVariants,
}
