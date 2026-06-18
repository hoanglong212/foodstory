import express from 'express'
import multer from 'multer'
import { analyzeFoodMapSocialDiscovery } from '../services/foodMapSocialDiscoveryService.js'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_URL_LENGTH = 2_000
const MAX_HINT_LENGTH = 500
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

function optionalString(value, maximumLength) {
  if (value === undefined || value === null) return { value: '' }
  if (typeof value !== 'string') return { error: 'must be a string' }

  const cleaned = value.trim()
  if (cleaned.length > maximumLength) {
    return { error: `must not exceed ${maximumLength} characters` }
  }
  return { value: cleaned }
}

function isHttpUrl(value) {
  if (!value) return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    fields: 3,
  },
  fileFilter(req, file, callback) {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      const error = new Error(
        'The image must be a JPEG, PNG, WebP, or GIF file.',
      )
      error.code = 'INVALID_IMAGE_MIME'
      return callback(error)
    }
    return callback(null, true)
  },
})

export function createFoodMapSocialDiscoveryRouter({
  analyze = analyzeFoodMapSocialDiscovery,
} = {}) {
  const router = express.Router()

  router.post('/social-discovery', (req, res, next) => {
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

      const parsedUrl = optionalString(
        req.body?.url ?? req.body?.sourceUrl,
        MAX_URL_LENGTH,
      )
      const parsedHint = optionalString(req.body?.hint, MAX_HINT_LENGTH)
      if (parsedUrl.error) {
        return validationError(res, `URL ${parsedUrl.error}.`, 'url')
      }
      if (parsedHint.error) {
        return validationError(res, `Hint ${parsedHint.error}.`, 'hint')
      }
      if (!isHttpUrl(parsedUrl.value)) {
        return validationError(
          res,
          'URL must be a valid http(s) URL.',
          'url',
        )
      }
      if (!req.file && !parsedUrl.value && !parsedHint.value) {
        return validationError(
          res,
          'Provide at least one of image, url, or hint.',
        )
      }

      try {
        const result = await analyze({
          image: req.file || null,
          url: parsedUrl.value,
          hint: parsedHint.value,
        })
        return res.json(result)
      } catch (error) {
        return next(error)
      }
    })
  })

  return router
}

export const FOOD_MAP_SOCIAL_UPLOAD_LIMITS = {
  maxImageBytes: MAX_IMAGE_BYTES,
  allowedImageTypes: [...ALLOWED_IMAGE_TYPES],
}

const router = createFoodMapSocialDiscoveryRouter()

export default router
