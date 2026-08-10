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
import {
  GroqVisionSearchError,
  isGroqVisionConfigured,
  searchImageUrlWithGroq,
  searchUploadedImageWithGroq,
} from '../services/groqVisionSearchService.js'

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

const VISION_SEARCH_PROVIDER = String(
  process.env.VISION_SEARCH_PROVIDER || 'auto',
).trim().toLowerCase()

function upstreamError(error, res) {
  const detail = error.detail || error.message
  const status = Number(error.statusCode) ||
    (error.code === 'embedding_timeout' ? 504 : 502)
  return res.status(status).json({
    error: 'Visual search failed.',
    detail: detail || 'The image embedding service is unavailable.',
  })
}

async function searchUploadedImage(file) {
  if (VISION_SEARCH_PROVIDER === 'groq') {
    return searchUploadedImageWithGroq(file)
  }

  try {
    const embedResponse = await embedUploadedImage(file)
    if (
      Number.isFinite(embedResponse.food_score) &&
      embedResponse.food_score < FOOD_THRESHOLD
    ) {
      return buildLegacyNonFoodResponse(embedResponse.food_score)
    }
    const payload = await searchVisualEmbeddings(embedResponse.embedding)
    payload.food_score = embedResponse.food_score
    return payload
  } catch (error) {
    if (
      VISION_SEARCH_PROVIDER === 'auto' &&
      error instanceof VisualSearchError &&
      error.code === 'embedding_unavailable' &&
      isGroqVisionConfigured()
    ) {
      return searchUploadedImageWithGroq(file)
    }
    throw error
  }
}

async function searchRemoteImage(imageUrl) {
  if (VISION_SEARCH_PROVIDER === 'groq') {
    return searchImageUrlWithGroq(imageUrl)
  }

  try {
    const embedResponse = await embedImageUrl(imageUrl)
    if (
      Number.isFinite(embedResponse.food_score) &&
      embedResponse.food_score < FOOD_THRESHOLD
    ) {
      return buildLegacyNonFoodResponse(embedResponse.food_score)
    }
    const payload = await searchVisualEmbeddings(embedResponse.embedding)
    payload.food_score = embedResponse.food_score
    return payload
  } catch (error) {
    if (
      VISION_SEARCH_PROVIDER === 'auto' &&
      error instanceof VisualSearchError &&
      error.code === 'embedding_unavailable' &&
      isGroqVisionConfigured()
    ) {
      return searchImageUrlWithGroq(imageUrl)
    }
    throw error
  }
}

router.post('/search', uploadSingleImage, async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided.' })
  }

  try {
    const payload = await searchUploadedImage(req.file)

    if (payload.total === 0) {
      payload.message ||= 'No similar FoodStory items met the similarity threshold.'
    }
    return res.json(payload)
  } catch (error) {
    if (error instanceof VisualSearchError || error instanceof GroqVisionSearchError) {
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
    const payload = await searchRemoteImage(imageUrl)

    if (payload.total === 0) {
      payload.message ||= 'No similar FoodStory items met the similarity threshold.'
    }
    return res.json(payload)
  } catch (error) {
    if (error instanceof VisualSearchError || error instanceof GroqVisionSearchError) {
      return upstreamError(error, res)
    }
    return next(error)
  }
})

export default router
