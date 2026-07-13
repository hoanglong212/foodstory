import crypto from 'node:crypto'
import net from 'node:net'
import { z } from 'zod'

import {
  detectSocialPlatform,
  isPrivateIpAddress,
} from '../socialUrlExtractionService.js'
import { parseYouTubeVideoId } from '../socialUrlProviders/youtubeUrlProvider.js'

const MAX_URL_LENGTH = 2_000
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'utm_campaign',
  'utm_content',
  'utm_medium',
  'utm_source',
  'utm_term',
])
const IMAGE_EXTENSION_PATTERN = /\.(?:gif|jpe?g|png|webp)$/iu
const ASSET_TYPE_HINTS = ['unknown', 'image', 'video']
const AUTH_MODES = ['public', 'signed_url', 'none']

export class VisionAutoUrlPolicyError extends Error {
  constructor(message, { code = 'VISION_AUTO_URL_INVALID', field = 'url' } = {}) {
    super(message)
    this.name = 'VisionAutoUrlPolicyError'
    this.code = code
    this.field = field
  }
}

function optionalTrimmedString(maxLength) {
  return z.preprocess(
    (value) => (value === undefined || value === null ? '' : String(value).trim()),
    z.string().max(maxLength),
  )
}

function optionalBoolean() {
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined
    if (typeof value === 'boolean') return value
    const normalized = String(value).trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'off'].includes(normalized)) return false
    return value
  }, z.boolean().optional())
}

const requestFieldsSchema = z.object({
  url: optionalTrimmedString(MAX_URL_LENGTH).optional(),
  sourceUrl: optionalTrimmedString(MAX_URL_LENGTH).optional(),
  asset_url: optionalTrimmedString(MAX_URL_LENGTH).optional(),
  assetTypeHint: z.enum(ASSET_TYPE_HINTS).optional(),
  asset_type_hint: z.enum(ASSET_TYPE_HINTS).optional(),
  authMode: z.enum(AUTH_MODES).optional(),
  auth_mode: z.enum(AUTH_MODES).optional(),
  tenantId: optionalTrimmedString(120).optional(),
  tenant_id: optionalTrimmedString(120).optional(),
  requestId: optionalTrimmedString(160).optional(),
  request_id: optionalTrimmedString(160).optional(),
  idempotencyKey: optionalTrimmedString(200).optional(),
  idempotency_key: optionalTrimmedString(200).optional(),
  maxDurationSec: z.coerce.number().int().min(1).max(600).optional(),
  max_duration_sec: z.coerce.number().int().min(1).max(600).optional(),
  desiredSync: optionalBoolean(),
  desired_sync: optionalBoolean(),
}).strip()

function normalizedHostname(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/gu, '')
    .replace(/\.$/u, '')
}

function rejectUnsafeLiteralHost(parsed) {
  const hostname = normalizedHostname(parsed.hostname)
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    (net.isIP(hostname) > 0 && isPrivateIpAddress(hostname))
  ) {
    throw new VisionAutoUrlPolicyError(
      'The URL must point to a public internet destination.',
      { code: 'VISION_AUTO_URL_UNSAFE' },
    )
  }
}

function removeTrackingParams(parsed) {
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) parsed.searchParams.delete(key)
  }
}

function canonicalYoutubeUrl(parsed) {
  const videoId = parseYouTubeVideoId(parsed.href)
  if (!videoId) {
    throw new VisionAutoUrlPolicyError(
      'Use a valid YouTube video, Shorts, or youtu.be URL.',
      { code: 'VISION_AUTO_YOUTUBE_URL_UNSUPPORTED' },
    )
  }
  return {
    url: `https://www.youtube.com/shorts/${videoId}`,
    videoId,
  }
}

function directImagePath(parsed) {
  return IMAGE_EXTENSION_PATTERN.test(parsed.pathname)
}

export function normalizeVisionAutoUrl(
  value,
  {
    assetTypeHint = 'unknown',
    authMode = 'public',
  } = {},
) {
  const source = String(value || '').trim()
  if (!source) {
    throw new VisionAutoUrlPolicyError('Provide one public URL.')
  }
  if (source.length > MAX_URL_LENGTH) {
    throw new VisionAutoUrlPolicyError(
      `URL must not exceed ${MAX_URL_LENGTH} characters.`,
    )
  }

  let parsed
  try {
    parsed = new URL(source)
  } catch {
    throw new VisionAutoUrlPolicyError('URL must be a valid HTTP or HTTPS URL.')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new VisionAutoUrlPolicyError('URL must be a valid HTTP or HTTPS URL.')
  }
  if (parsed.username || parsed.password) {
    throw new VisionAutoUrlPolicyError(
      'URLs containing embedded usernames or passwords are not accepted.',
      { code: 'VISION_AUTO_URL_CREDENTIALS_REJECTED' },
    )
  }
  rejectUnsafeLiteralHost(parsed)

  const normalizedHint = ASSET_TYPE_HINTS.includes(assetTypeHint)
    ? assetTypeHint
    : 'unknown'
  const normalizedAuthMode = AUTH_MODES.includes(authMode) ? authMode : 'public'
  const platform = detectSocialPlatform(parsed)

  if (platform === 'youtube') {
    const youtube = canonicalYoutubeUrl(parsed)
    return {
      type: 'youtube_url',
      assetType: 'video',
      assetTypeHint: normalizedHint === 'image' ? 'unknown' : normalizedHint,
      authMode: 'public',
      platform,
      url: youtube.url,
      videoId: youtube.videoId,
      originHost: 'www.youtube.com',
      fingerprint: crypto.createHash('sha256').update(youtube.url).digest('hex'),
    }
  }

  parsed.hash = ''
  if (normalizedAuthMode !== 'signed_url') removeTrackingParams(parsed)
  if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
    parsed.port = ''
  }

  const isRemoteImage = normalizedHint === 'image' || directImagePath(parsed)
  const canonicalUrl = parsed.href
  return {
    type: isRemoteImage
      ? 'remote_image_url'
      : platform === 'web'
        ? 'blog_url'
        : 'generic_social_url',
    assetType: isRemoteImage ? 'image' : normalizedHint,
    assetTypeHint: normalizedHint,
    authMode: normalizedAuthMode,
    platform,
    url: canonicalUrl,
    videoId: null,
    originHost: normalizedHostname(parsed.hostname),
    fingerprint: crypto.createHash('sha256').update(canonicalUrl).digest('hex'),
  }
}

export function parseVisionAutoRequestFields(raw = {}, { mode = 'sync' } = {}) {
  const parsed = requestFieldsSchema.safeParse(raw || {})
  if (!parsed.success) {
    const issue = parsed.error.issues?.[0]
    throw new VisionAutoUrlPolicyError(
      issue?.message || 'The Vision Auto request is invalid.',
      { code: 'VISION_AUTO_REQUEST_INVALID', field: issue?.path?.[0] || null },
    )
  }

  const value = parsed.data
  const candidateUrls = [value.asset_url, value.sourceUrl, value.url].filter(Boolean)
  const uniqueUrls = [...new Set(candidateUrls)]
  if (uniqueUrls.length > 1) {
    throw new VisionAutoUrlPolicyError(
      'Provide the URL in only one field: asset_url, sourceUrl, or url.',
      { code: 'VISION_AUTO_MULTIPLE_URL_FIELDS' },
    )
  }

  const assetTypeHint = value.asset_type_hint || value.assetTypeHint || 'unknown'
  const authMode = value.auth_mode || value.authMode || 'public'
  const normalized = uniqueUrls[0]
    ? normalizeVisionAutoUrl(uniqueUrls[0], { assetTypeHint, authMode })
    : null

  if (mode === 'job' && normalized?.type !== 'youtube_url') {
    throw new VisionAutoUrlPolicyError(
      'Asynchronous URL jobs currently support YouTube video and Shorts URLs.',
      { code: 'VISION_AUTO_JOB_URL_UNSUPPORTED', field: 'asset_url' },
    )
  }

  return {
    normalized,
    assetUrl: normalized?.url || '',
    assetTypeHint,
    authMode,
    tenantId: value.tenant_id || value.tenantId || 'default',
    requestId: value.request_id || value.requestId || '',
    idempotencyKey: value.idempotency_key || value.idempotencyKey || '',
    maxDurationSec: value.max_duration_sec || value.maxDurationSec || null,
    desiredSync: value.desired_sync ?? value.desiredSync ?? (mode === 'sync'),
  }
}

export function redactedVisionAutoSource(input = {}) {
  const host = String(input?.originHost || '').slice(0, 255)
  return {
    platform: String(input?.platform || 'unknown').slice(0, 40),
    host,
    videoId: input?.videoId ? String(input.videoId).slice(0, 32) : null,
    fingerprint: input?.fingerprint ? String(input.fingerprint).slice(0, 16) : null,
  }
}

export const VISION_AUTO_URL_POLICY_LIMITS = Object.freeze({
  maxUrlLength: MAX_URL_LENGTH,
  assetTypeHints: [...ASSET_TYPE_HINTS],
  authModes: [...AUTH_MODES],
})
