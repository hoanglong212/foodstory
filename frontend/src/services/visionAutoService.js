import api from './api'

export const VISION_AUTO_IMAGE_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

export const VISION_AUTO_MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const VISION_AUTO_MAX_URL_LENGTH = 2_000

export class VisionAutoClientInputError extends Error {
  constructor(message, field = null) {
    super(message)
    this.name = 'VisionAutoClientInputError'
    this.field = field
  }
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function validateImage(image) {
  if (!image || typeof image !== 'object') {
    return 'Choose an image to analyze.'
  }
  if (!VISION_AUTO_IMAGE_TYPES.includes(image.type)) {
    return 'Choose a JPEG, PNG, WebP, or GIF image.'
  }
  if (Number(image.size) > VISION_AUTO_MAX_IMAGE_BYTES) {
    return 'The image must be 5MB or smaller.'
  }
  return ''
}

export async function analyzeVisionAuto({ url = '', image = null, signal } = {}) {
  const normalizedUrl = String(url || '').trim()
  const hasUrl = Boolean(normalizedUrl)
  const hasImage = Boolean(image)

  if (hasUrl === hasImage) {
    throw new VisionAutoClientInputError(
      'Choose either one public link or one image to analyze.',
    )
  }

  if (hasUrl) {
    if (normalizedUrl.length > VISION_AUTO_MAX_URL_LENGTH) {
      throw new VisionAutoClientInputError(
        `The link must be ${VISION_AUTO_MAX_URL_LENGTH} characters or fewer.`,
        'url',
      )
    }
    if (!isHttpUrl(normalizedUrl)) {
      throw new VisionAutoClientInputError(
        'Paste a complete public link that starts with http:// or https://.',
        'url',
      )
    }
  }

  if (hasImage) {
    const imageError = validateImage(image)
    if (imageError) {
      throw new VisionAutoClientInputError(imageError, 'image')
    }
  }

  const formData = new FormData()
  if (hasUrl) {
    formData.append('url', normalizedUrl)
  } else {
    formData.append('image', image)
  }

  return api.post('/food-map/vision-auto-v2', formData, {
    signal,
    timeout: 90_000,
  })
}

export async function createVisionAutoJob({ url, signal } = {}) {
  const sourceUrl = String(url || '').trim()
  if (!isHttpUrl(sourceUrl)) throw new VisionAutoClientInputError('Paste a complete public link that starts with http:// or https://.', 'url')
  return api.post('/food-map/vision-auto-v2/jobs', { sourceUrl }, { signal, timeout: 10_000 })
}

export async function getVisionAutoJob(jobId, { signal } = {}) {
  return api.get(`/food-map/vision-auto-v2/jobs/${encodeURIComponent(jobId)}`, { signal, timeout: 10_000 })
}

export async function cancelVisionAutoJob(jobId, { signal } = {}) {
  return api.delete(`/food-map/vision-auto-v2/jobs/${encodeURIComponent(jobId)}`, { signal, timeout: 10_000 })
}

export async function discoverDishFromVideo({ url, signal } = {}) {
  const sourceUrl = String(url || '').trim()
  if (!isHttpUrl(sourceUrl)) {
    throw new VisionAutoClientInputError(
      'Paste a complete public YouTube link that starts with http:// or https://.',
      'url',
    )
  }
  return api.post(
    '/food-map/vision-auto-v2/dish-discovery',
    { sourceUrl },
    { signal, timeout: 40_000 },
  )
}

export async function searchPlacesForDish({ dishName, aliases = [], origin = null, signal } = {}) {
  return api.post(
    '/food-map/vision-auto-v2/dish-discovery/search',
    { dishName, aliases, origin },
    { signal, timeout: 15_000 },
  )
}

export function googlePlacePhotoUrl(photoName) {
  const name = String(photoName || '').trim()
  if (!name) return ''
  const baseUrl = String(api.defaults.baseURL || '/api').replace(/\/$/u, '')
  return `${baseUrl}/food-map/vision-auto-v2/dish-discovery/place-photo?name=${encodeURIComponent(name)}`
}

export { isHttpUrl, validateImage }
