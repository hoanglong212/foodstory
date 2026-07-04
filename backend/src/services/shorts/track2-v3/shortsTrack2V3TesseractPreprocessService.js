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

export async function generateShortsTrack2V3TesseractPreprocessVariants(
  image = {},
  { outputDir = '', index = 0 } = {},
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
  const variants = [
    {
      preprocessVariant: 'original',
      imagePath,
      generated: false,
    },
  ]
  const providerErrors = []

  try {
    const metadata = await sharp(imagePath).metadata()
    const width = Number(metadata.width || 0)
    const height = Number(metadata.height || 0)
    if (!width || !height) throw new Error('missing image dimensions')

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
    ]

    for (const definition of definitions) {
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
