import express from 'express'
import multer from 'multer'
import {
  ALLOWED_IMAGE_TYPES,
  FOOD_THRESHOLD,
  MAX_IMAGE_BYTES,
  VisualSearchError,
  buildLegacyNonFoodResponse,
  embedImageUrl,
  embedUploadedImage,
  searchVisualEmbeddings,
} from '../services/visualSearchService.js'

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    fields: 0,
    parts: 1,
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
    if (!error) {
      next()
      return
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Image must be 5MB or smaller.' })
      return
    }

    res.status(400).json({ error: 'Only JPEG, PNG, WebP, or GIF images are allowed.' })
  })
}

function upstreamError(error, res) {
  const detail = error.detail || error.message
  const status = error.code === 'embedding_timeout' ? 504 : 502
  return res.status(status).json({
    error: 'Visual search failed.',
    detail: detail || 'The image embedding service is unavailable.',
  })
}

router.post('/search', uploadSingleImage, async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided.' })
  }

  try {
    const embedResponse = await embedUploadedImage(req.file)
    if (
      Number.isFinite(embedResponse.food_score) &&
      embedResponse.food_score < FOOD_THRESHOLD
    ) {
      return res.json(buildLegacyNonFoodResponse(embedResponse.food_score))
    }
    const payload = await searchVisualEmbeddings(embedResponse.embedding)
    payload.food_score = embedResponse.food_score

    if (payload.total === 0) {
      payload.message = 'No similar FoodStory items met the similarity threshold.'
    }
    return res.json(payload)
  } catch (error) {
    if (error instanceof VisualSearchError) {
      return upstreamError(error, res)
    }
    return next(error)
  }
})

router.post('/search-url', async (req, res, next) => {
  const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : ''
  if (!imageUrl) {
    return res.status(400).json({ error: 'imageUrl is required.' })
  }

  try {
    const embedResponse = await embedImageUrl(imageUrl)
    if (
      Number.isFinite(embedResponse.food_score) &&
      embedResponse.food_score < FOOD_THRESHOLD
    ) {
      return res.json(buildLegacyNonFoodResponse(embedResponse.food_score))
    }
    const payload = await searchVisualEmbeddings(embedResponse.embedding)
    payload.food_score = embedResponse.food_score

    if (payload.total === 0) {
      payload.message = 'No similar FoodStory items met the similarity threshold.'
    }
    return res.json(payload)
  } catch (error) {
    if (error instanceof VisualSearchError) {
      return upstreamError(error, res)
    }
    return next(error)
  }
})

export default router
