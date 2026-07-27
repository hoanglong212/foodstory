import crypto from 'node:crypto'
import express from 'express'
import multer from 'multer'

import {
  VisionAutoDisabledError,
  VisionAutoInputError,
  analyzeVisionAutoV2,
} from '../services/visionAuto/visionAutoResolverService.js'
import {
  getSanitizedVisionAutoRuntimeConfig,
  getVisionAutoRuntimeConfig,
  visionAutoRouteEnabled,
  visionAutoServiceEnabled,
} from '../services/visionAuto/visionAutoConfig.js'
import {
  VisionAutoQueueFullError,
  visionAutoJobService,
} from '../services/visionAuto/visionAutoJobService.js'
import {
  parseVisionAutoRequestFields,
  VisionAutoUrlPolicyError,
} from '../services/visionAuto/visionAutoUrlPolicyService.js'
import { visionAutoMetricsSnapshot } from '../services/visionAuto/visionAutoObservabilityService.js'
import { visionAutoCacheStats } from '../services/visionAuto/visionAutoResultCache.js'
import { getVisionAutoReadiness } from '../services/visionAuto/visionAutoReadinessService.js'
import { sniffImageContentType } from '../services/socialUrlExtractionService.js'
import {
  identifyDishFromVideoSource,
} from '../services/visionAuto/visionDishDiscoveryService.js'
import {
  resolveGooglePlacePhoto,
  searchExternalPlacesForDish,
} from '../services/visionAuto/visionDishExternalPlaceService.js'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

function validationError(res, message, field = null, code = 'VISION_AUTO_INPUT_INVALID') {
  return res.status(400).json({
    error: 'Validation error.',
    code,
    message,
    ...(field ? { field } : {}),
  })
}

function requestId(value) {
  return String(value || '').trim().slice(0, 160) || crypto.randomUUID()
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    fields: 10,
    fieldSize: 4096,
    parts: 11,
    headerPairs: 50,
    fieldNestingDepth: 0,
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
  jobService = visionAutoJobService,
  getConfig = getVisionAutoRuntimeConfig,
  getReadiness = getVisionAutoReadiness,
  identifyDish = identifyDishFromVideoSource,
  searchDishPlaces = searchExternalPlacesForDish,
  resolveDishPlacePhoto = resolveGooglePlacePhoto,
} = {}) {
  const router = express.Router()

  router.post('/vision-auto-v2/dish-discovery', async (req, res, next) => {
    if (!isRouteEnabled()) return res.status(404).json({ error: 'Route not found.' })
    const sourceUrl = String(req.body?.sourceUrl || req.body?.url || '').trim()
    if (!sourceUrl) {
      return validationError(res, 'Paste one public YouTube video link.', 'sourceUrl', 'DISH_SOURCE_REQUIRED')
    }
    try {
      const controller = new AbortController()
      const abort = () => controller.abort()
      req.once('aborted', abort)
      const result = await identifyDish({ sourceUrl, signal: controller.signal })
      req.removeListener('aborted', abort)
      return res.json(result)
    } catch (error) {
      if (error instanceof VisionAutoUrlPolicyError || error?.code === 'dish_source_unsupported') {
        return validationError(res, error.message, 'sourceUrl', error.code)
      }
      if (error?.code === 'dish_provider_not_configured') {
        return res.status(503).json({ error: 'Dish recognition is not configured.', code: error.code })
      }
      if (error?.code === 'dish_thumbnail_unavailable') {
        return res.status(422).json({ error: error.message, code: error.code })
      }
      if (error?.code === 'dish_provider_timeout' || error?.code === 'dish_provider_quota') {
        return res.status(error.code === 'dish_provider_quota' ? 429 : 504).json({ error: error.message, code: error.code })
      }
      if (error?.code === 'dish_provider_invalid_request' || error?.code === 'dish_provider_invalid_json' || error?.code === 'dish_provider_failed') {
        return res.status(502).json({ error: 'Dish recognition provider is temporarily unavailable.', code: error.code })
      }
      return next(error)
    }
  })

  router.post('/vision-auto-v2/dish-discovery/search', async (req, res, next) => {
    if (!isRouteEnabled()) return res.status(404).json({ error: 'Route not found.' })
    const dishName = String(req.body?.dishName || '').trim()
    const aliases = Array.isArray(req.body?.aliases) ? req.body.aliases.slice(0, 6) : []
    const rawOrigin = req.body?.origin
    const origin = rawOrigin && Number.isFinite(Number(rawOrigin.lat)) && Number.isFinite(Number(rawOrigin.lng))
      ? { lat: Number(rawOrigin.lat), lng: Number(rawOrigin.lng) }
      : null
    try {
      return res.json(await searchDishPlaces({ dishName, aliases, origin }))
    } catch (error) {
      if (error?.code === 'dish_required') {
        return validationError(res, error.message, 'dishName', error.code)
      }
      if (error?.code === 'dish_search_origin_required') {
        return validationError(res, error.message, 'origin', error.code)
      }
      if (error?.code === 'dish_database_timeout') {
        return res.status(503).json({ error: 'FoodStory place search is temporarily unavailable.', code: error.code })
      }
      if (error?.code === 'geoapify_quota_exceeded') {
        return res.status(429).json({ error: 'Geoapify quota is temporarily exhausted.', code: error.code })
      }
      if (error?.code === 'geoapify_timeout') {
        return res.status(504).json({ error: 'Geoapify place search timed out.', code: error.code })
      }
      if (['geoapify_api_key_invalid', 'geoapify_request_failed'].includes(error?.code)) {
        return res.status(502).json({ error: 'Geoapify place search is temporarily unavailable.', code: error.code })
      }
      return next(error)
    }
  })

  router.get('/vision-auto-v2/dish-discovery/place-photo', async (req, res, next) => {
    if (!isRouteEnabled()) return res.status(404).json({ error: 'Route not found.' })
    try {
      const photoUri = await resolveDishPlacePhoto({ photoName: req.query?.name })
      res.setHeader('Cache-Control', 'no-store')
      return res.redirect(302, photoUri)
    } catch (error) {
      if (error?.code === 'google_places_photo_invalid') {
        return validationError(res, error.message, 'name', error.code)
      }
      if (error?.code === 'google_places_photo_unavailable') {
        return res.status(503).json({ error: error.message, code: error.code })
      }
      if (['google_places_api_key_invalid', 'google_places_forbidden', 'google_places_quota_exceeded', 'google_places_request_failed', 'google_places_photo_failed', 'google_places_timeout'].includes(error?.code)) {
        return res.status(502).json({ error: 'Google Places photo is temporarily unavailable.', code: error.code })
      }
      return next(error)
    }
  })

  router.get('/vision-auto-v2/health', async (_req, res, next) => {
    if (!isRouteEnabled()) return res.status(404).json({ error: 'Route not found.' })
    const config = getConfig()
    try {
      const readiness = await getReadiness({ config })
      const statusCode = readiness.ready ? 200 : 503
      return res.status(statusCode).json({
        status: readiness.state,
        readiness,
        runtime: getSanitizedVisionAutoRuntimeConfig(config),
        queue: jobService.stats(),
        cache: visionAutoCacheStats(),
        metrics: visionAutoMetricsSnapshot(),
      })
    } catch (error) {
      return next(error)
    }
  })

  router.post('/vision-auto-v2/jobs', (req, res) => {
    if (!isRouteEnabled()) return res.status(404).json({ error: 'Route not found.' })
    if (!isServiceEnabled()) return res.status(503).json({ error: 'Vision Auto is disabled.' })
    try {
      const parsed = parseVisionAutoRequestFields(req.body || {}, { mode: 'job' })
      if (!parsed.normalized) {
        return validationError(res, 'Paste one public YouTube video link.', 'asset_url')
      }
      const resolvedRequestId = requestId(parsed.requestId)
      const job = jobService.submit({
        sourceUrl: parsed.assetUrl,
        assetTypeHint: 'video',
        authMode: parsed.authMode,
        tenantId: parsed.tenantId,
        requestId: resolvedRequestId,
        idempotencyKey: parsed.idempotencyKey,
        maxDurationSec: parsed.maxDurationSec,
      })
      res.setHeader('X-Request-ID', resolvedRequestId)
      return res.status(202).json(job)
    } catch (error) {
      if (error instanceof VisionAutoQueueFullError) {
        res.setHeader('Retry-After', String(error.retryAfterSeconds || 5))
        return res.status(429).json({
          error: 'Vision Auto is busy.',
          code: error.code,
          message: error.message,
        })
      }
      if (error instanceof VisionAutoInputError || error instanceof VisionAutoUrlPolicyError) {
        return validationError(res, error.message, error.field || 'asset_url', error.code)
      }
      return validationError(res, 'Paste one public YouTube video link.', 'asset_url')
    }
  })

  router.get('/vision-auto-v2/jobs/:jobId', (req, res) => {
    if (!isRouteEnabled()) return res.status(404).json({ error: 'Route not found.' })
    const job = jobService.get(req.params.jobId)
    return job ? res.json(job) : res.status(404).json({ error: 'Job not found.' })
  })

  router.delete('/vision-auto-v2/jobs/:jobId', (req, res) => {
    if (!isRouteEnabled()) return res.status(404).json({ error: 'Route not found.' })
    const job = jobService.cancel(req.params.jobId)
    return job ? res.json(job) : res.status(404).json({ error: 'Job not found.' })
  })

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
          return validationError(res, uploadError.message, 'image', uploadError.code)
        }
        return next(uploadError)
      }

      if (req.file) {
        const actualType = sniffImageContentType(req.file.buffer)
        if (!actualType || actualType !== req.file.mimetype) {
          return validationError(
            res,
            'The uploaded file contents do not match a supported image format.',
            'image',
            'INVALID_IMAGE_CONTENT',
          )
        }
      }

      const hint = typeof req.body?.hint === 'string' ? req.body.hint.trim() : ''
      if (hint) {
        return validationError(
          res,
          'Free-form hints are not accepted. Use asset_type_hint=image or video.',
          'hint',
        )
      }

      let parsed
      try {
        parsed = parseVisionAutoRequestFields(req.body || {}, { mode: 'sync' })
      } catch (error) {
        if (error instanceof VisionAutoUrlPolicyError) {
          return validationError(res, error.message, error.field, error.code)
        }
        return next(error)
      }

      const resolvedRequestId = requestId(parsed.requestId)
      res.setHeader('X-Request-ID', resolvedRequestId)

      if (!req.file && parsed.normalized?.type === 'youtube_url' && parsed.desiredSync === false) {
        try {
          const job = jobService.submit({
            sourceUrl: parsed.assetUrl,
            assetTypeHint: 'video',
            authMode: parsed.authMode,
            tenantId: parsed.tenantId,
            requestId: resolvedRequestId,
            idempotencyKey: parsed.idempotencyKey,
            maxDurationSec: parsed.maxDurationSec,
          })
          return res.status(202).json(job)
        } catch (error) {
          if (error instanceof VisionAutoQueueFullError) {
            res.setHeader('Retry-After', String(error.retryAfterSeconds || 5))
            return res.status(429).json({ error: 'Vision Auto is busy.', code: error.code, message: error.message })
          }
          if (error instanceof VisionAutoInputError) {
            return validationError(res, error.message, error.field, error.code)
          }
          return next(error)
        }
      }

      try {
        const controller = new AbortController()
        const abort = () => controller.abort()
        req.once('aborted', abort)
        res.once('close', () => {
          if (!res.writableEnded) controller.abort()
        })
        const result = await analyze({
          image: req.file || null,
          url: parsed.assetUrl,
          assetTypeHint: parsed.assetTypeHint,
          authMode: parsed.authMode,
          maxDurationSec: parsed.maxDurationSec,
          signal: controller.signal,
        })
        req.removeListener('aborted', abort)
        return res.json(result)
      } catch (error) {
        if (error instanceof VisionAutoInputError) {
          return validationError(res, error.message, error.field, error.code)
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
  maxFields: 10,
})

export default createVisionAutoRouter()
