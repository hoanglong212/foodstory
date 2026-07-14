import express from 'express'
import multer from 'multer'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  VisualSearchError,
} from '../services/visualSearchService.js'
import {
  FOOD_MAP_DISCOVERY_LIMITS,
  analyzeFoodMapDiscovery,
  buildUnclearResponse,
  buildUrlExtractionFailedResponse,
} from '../services/foodMapDiscoveryService.js'

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    fields: 3,
    fieldSize: 4096,
    parts: 4,
    headerPairs: 50,
    fieldNestingDepth: 0,
  },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      callback(null, true)
      return
    }
    callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'))
  },
})

function uploadSingleImage(req, res, next) {
  upload.single('image')(req, res, (error) => {
    if (!error) return next()

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json(
        buildUnclearResponse({
          message: 'The image must be 5MB or smaller.',
        }),
      )
    }

    return res.status(400).json(
      buildUnclearResponse({
        message: 'Please upload one JPEG, PNG, WebP, or GIF image.',
      }),
    )
  })
}

function textField(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isSupportedSourceUrl(value) {
  if (!value) return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

router.post('/discover', uploadSingleImage, async (req, res) => {
  const hint = textField(req.body?.hint)
  const sourceUrl = textField(req.body?.sourceUrl)

  if (hint.length > FOOD_MAP_DISCOVERY_LIMITS.maxHintLength) {
    return res.status(400).json(
      buildUnclearResponse({
        message: `The optional hint cannot exceed ${FOOD_MAP_DISCOVERY_LIMITS.maxHintLength} characters.`,
        sourceUrl,
      }),
    )
  }

  if (
    sourceUrl.length > FOOD_MAP_DISCOVERY_LIMITS.maxSourceUrlLength ||
    !isSupportedSourceUrl(sourceUrl)
  ) {
    return res.status(400).json(
      buildUrlExtractionFailedResponse({
        sourceUrl,
        hint,
      }),
    )
  }

  if (!req.file && !sourceUrl && !hint) {
    return res.status(400).json(
      buildUnclearResponse({
        message: 'Upload an image, provide a place hint, or add a social/video URL.',
      }),
    )
  }

  try {
    const result = await analyzeFoodMapDiscovery({
      file: req.file || null,
      hint,
      sourceUrl,
    })
    return res.json(result)
  } catch (error) {
    if (error instanceof VisualSearchError) {
      const message =
        error.code === 'invalid_image'
          ? 'I could not read that image. Please upload a valid, clearer image.'
          : error.code === 'embedding_timeout'
            ? 'Image analysis timed out. Please try a smaller image.'
            : 'Food Map discovery is temporarily unavailable. Please try again.'

      return res.status(error.statusCode).json(
        buildUnclearResponse({
          message,
          sourceUrl,
          debug: { errorCode: error.code },
        }),
      )
    }

    console.error('Food Map discovery error:', error)
    return res.status(500).json(
      buildUnclearResponse({
        message: 'Food Map discovery could not complete this request. Please try again.',
        sourceUrl,
      }),
    )
  }
})

export default router
