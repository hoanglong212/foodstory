import express from 'express'
import multer from 'multer'
import {
  VisionAutoDisabledError,
  VisionAutoInputError,
  analyzeVisionAutoV2,
} from '../services/visionAuto/visionAutoResolverService.js'
import {
  visionAutoRouteEnabled,
  visionAutoServiceEnabled,
} from '../services/visionAuto/visionAutoConfig.js'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_URL_LENGTH = 2_000
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

function validationError(res, message, field = null) {
  return res.status(400).json({
    error: 'Validation error.',
    message,
    ...(field ? { field } : {}),
  })
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    fields: 2,
  },
  fileFilter(_req, file, callback) {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      const error = new Error(
        'The image must be a JPEG, PNG, WebP, or GIF file.',
      )
      error.code = 'INVALID_IMAGE_MIME'
      callback(error)
      return
    }
    callback(null, true)
  },
})

export function createVisionAutoRouter({
  analyze = analyzeVisionAutoV2,
  isRouteEnabled = visionAutoRouteEnabled,
  isServiceEnabled = visionAutoServiceEnabled,
} = {}) {
  const router = express.Router()

  router.post('/vision-auto-v2', (req, res, next) => {
    if (!isRouteEnabled()) {
      return res.status(404).json({ error: 'Route not found.' })
    }
    if (!isServiceEnabled()) {
      return res.status(503).json({
        error: 'Vision Auto v2 is disabled.',
      })
    }

    upload.single('image')(req, res, async (uploadError) => {
      if (uploadError) {
        if (uploadError.code === 'LIMIT_FILE_SIZE') {
          return validationError(
            res,
            'The image must be 5MB or smaller.',
            'image',
          )
        }
        if (
          uploadError.code === 'INVALID_IMAGE_MIME' ||
          uploadError instanceof multer.MulterError
        ) {
          return validationError(res, uploadError.message, 'image')
        }
        return next(uploadError)
      }

      const url =
        typeof req.body?.url === 'string' ? req.body.url.trim() : ''
      const hint =
        typeof req.body?.hint === 'string' ? req.body.hint.trim() : ''
      if (url.length > MAX_URL_LENGTH) {
        return validationError(
          res,
          `URL must not exceed ${MAX_URL_LENGTH} characters.`,
          'url',
        )
      }
      if (hint) {
        return validationError(
          res,
          'Hints are not accepted in Vision Auto v2.',
          'hint',
        )
      }

      try {
        const result = await analyze({
          image: req.file || null,
          url,
        })
        return res.json(result)
      } catch (error) {
        if (error instanceof VisionAutoInputError) {
          return validationError(res, error.message, error.field)
        }
        if (error instanceof VisionAutoDisabledError) {
          return res.status(503).json({
            error: 'Vision Auto v2 is disabled.',
          })
        }
        return next(error)
      }
    })
  })

  return router
}

export const VISION_AUTO_UPLOAD_LIMITS = Object.freeze({
  maxImageBytes: MAX_IMAGE_BYTES,
  allowedImageTypes: [...ALLOWED_IMAGE_TYPES],
})

export default createVisionAutoRouter()

