import { parseShortsUrl, routeShortsAddress } from './shortsAddressRouterService.js'
import { fetchShortsMetadata as defaultFetchShortsMetadata } from './shortsMetadataFetchService.js'
import { cleanAddressNoRepair as defaultCleanAddressNoRepair } from './shortsGeminiAddressCleanService.js'
import { isTruncatedEvidence } from './shortsAddressNormalizer.js'
import { confirmAddressWithPlaces as defaultConfirmAddressWithPlaces } from './shortsPlacesConfirmService.js'
import {
  confirmExplicitAddressWithGemini as defaultConfirmExplicitAddressWithGemini,
} from './shortsGeminiAddressConfirmService.js'

const TRACK_1_EVIDENCE_SOURCES = new Set([
  'title',
  'description',
  'page_metadata',
  'jsonld',
])

const TRACK_1_REASONS = new Set([
  'EXPLICIT_LABEL',
  'JSONLD_ADDRESS',
  'CLEAR_DESCRIPTION',
])

const MAX_FINAL_ADDRESS_LENGTH = 180

function safeString(value) {
  return String(value || '').trim()
}

function emptyMetadata(url) {
  const parsed = parseShortsUrl(url)
  return {
    url,
    videoId: parsed.ok ? parsed.videoId : null,
    title: '',
    description: '',
    channelTitle: '',
    publishedAt: '',
    duration: '',
    privacyStatus: '',
    pageMetadataText: '',
    serpSnippet: '',
    jsonldObjects: [],
    ocrText: '',
    asrText: '',
    metadataSource: {
      youtubeApi: false,
      shortsHtml: false,
    },
  }
}

function fallbackTrack2({
  reason,
  url,
  metadata,
  router = null,
  clean = null,
  places = null,
  confirm = null,
  signals = [],
  placeVerificationStatus = null,
}) {
  const warnings = providerWarnings(places)
  return {
    track: 'TRACK_2',
    reason,
    ...(clean?.normalizedAddress ? { address: clean.normalizedAddress } : {}),
    ...(clean?.normalizedAddress ? { normalizedAddress: clean.normalizedAddress } : {}),
    ...(router?.evidenceSource ? { addressSource: router.evidenceSource } : {}),
    ...(router?.reason ? { addressEvidenceReason: router.reason } : {}),
    ...(placeVerificationStatus ? { placeVerificationStatus } : {}),
    ...(warnings.length ? { providerWarnings: warnings } : {}),
    sourceUrl: metadata?.url || url,
    videoId: metadata?.videoId || null,
    signals: signals.length ? signals : router?.signals || [],
    stages: {
      router,
      clean,
      places,
      confirm,
    },
    metadata,
  }
}

function cleanRejectionReason(clean = {}) {
  if (clean.status === 'OK' && clean.disallowedRepairDetected) return 'REPAIR_DETECTED'
  if (clean.status === 'NO_ADDRESS') return 'NO_ADDRESS'
  if (clean.status === 'MULTIPLE_ADDRESSES') return 'MULTIPLE_ADDRESSES'
  return 'DAMAGED_EVIDENCE'
}

function confirmRejectionReason(confirm = {}) {
  if (confirm.decision === 'CONFIRMED' && Number(confirm.confidence) < 0.9) {
    return 'LOW_CONFIDENCE'
  }
  if (confirm.decision === 'CONFIRMED' && !confirm.bestPlaceId) {
    return 'NO_PLACES_MATCH'
  }
  if (Array.isArray(confirm.reasonCodes) && confirm.reasonCodes.length) {
    if (confirm.reasonCodes.includes('LOW_CONFIDENCE')) return 'LOW_CONFIDENCE'
    if (confirm.reasonCodes.includes('NO_PLACES_MATCH')) return 'NO_PLACES_MATCH'
    if (confirm.reasonCodes.includes('REPAIR_NEEDED')) return 'REPAIR_DETECTED'
    if (confirm.reasonCodes.includes('TRUNCATED_EVIDENCE')) return 'TRUNCATED_EVIDENCE'
    if (confirm.reasonCodes.includes('CONFLICTING_CANDIDATES')) return 'CONFLICTING_CANDIDATES'
    if (confirm.reasonCodes.includes('SOURCE_NOT_ELIGIBLE')) return 'SOURCE_NOT_ELIGIBLE'
  }
  return 'LOW_CONFIDENCE'
}

function isRouterTrack1Eligible(routerResult = {}) {
  return routerResult.track === 'TRACK_1' &&
    TRACK_1_EVIDENCE_SOURCES.has(routerResult.evidenceSource) &&
    TRACK_1_REASONS.has(routerResult.reason) &&
    Boolean(routerResult.candidateAddress)
}

function normalizedAddressTokens(value) {
  return safeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D')
    .toLowerCase()
    .replace(/\b(?:tp|thanh pho|city|ward|phuong|quan|district|so)\b/gu, ' ')
    .replace(/[^a-z0-9/]+/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean)
}

function requiredCoreAddressTokens(value) {
  const tokens = normalizedAddressTokens(value)
  const firstNumber = tokens.find((token) => /\d/.test(token))
  const textTokens = tokens.filter((token) => /[a-z]/.test(token)).slice(0, 4)
  return [firstNumber, ...textTokens].filter(Boolean)
}

function sameAddressCore(candidateAddress, cleanedAddress) {
  const cleanTokens = new Set(normalizedAddressTokens(cleanedAddress))
  const required = requiredCoreAddressTokens(candidateAddress)
  return required.length > 0 && required.every((token) => cleanTokens.has(token))
}

function unsafeFinalCandidateAddress(value) {
  const text = safeString(value)
  if (!text) return 'NO_ADDRESS'
  if (text.length > MAX_FINAL_ADDRESS_LENGTH) return 'DIRTY_ADDRESS_EVIDENCE'
  if (isTruncatedEvidence(text)) return 'TRUNCATED_EVIDENCE'
  if (/(?:https?:\/\/|www\.|@|(?:^|\s)#|follow|theo\s+dõi|instagram|tiktok|facebook|youtube|email|copyright|subscribe|liên\s+hệ)/iu.test(text)) {
    return 'DIRTY_ADDRESS_EVIDENCE'
  }
  return null
}

function providerWarnings(places = null) {
  return (Array.isArray(places?.diagnostics) ? places.diagnostics : [])
    .map((diagnostic) => ({
      endpoint: safeString(diagnostic?.endpoint),
      textQuery: safeString(diagnostic?.textQuery),
      fieldMask: safeString(diagnostic?.fieldMask),
      apiKeyPresent: Boolean(diagnostic?.apiKeyPresent),
      httpStatus: Number.isFinite(Number(diagnostic?.httpStatus))
        ? Number(diagnostic.httpStatus)
        : null,
      message: safeString(diagnostic?.message),
      status: safeString(diagnostic?.status),
      reason: safeString(diagnostic?.reason),
    }))
    .slice(0, 3)
}

function hasHardPlaceConflict(confirm = null) {
  return Array.isArray(confirm?.reasonCodes) &&
    confirm.reasonCodes.includes('CONFLICTING_CANDIDATES')
}

function finalTrack1Result({
  reason,
  url,
  metadata,
  router,
  clean,
  places = null,
  confirm = null,
  placeVerificationStatus,
  placeId = null,
}) {
  const warnings = providerWarnings(places)
  return {
    track: 'TRACK_1',
    reason,
    confidence: Number(router?.confidence) || 0.9,
    address: clean.normalizedAddress,
    normalizedAddress: clean.normalizedAddress,
    addressSource: router.evidenceSource,
    addressEvidenceReason: router.reason,
    placeVerificationStatus,
    ...(placeId ? { placeId } : {}),
    ...(warnings.length ? { providerWarnings: warnings } : {}),
    evidenceSource: router.evidenceSource,
    sourceUrl: metadata?.url || url,
    videoId: metadata?.videoId || null,
    title: metadata?.title || '',
    explanation: safeString(confirm?.explanation),
    stages: {
      router,
      clean,
      places,
      confirm,
    },
    metadata,
  }
}

export async function runShortsTrack1Pipeline(url, deps = {}) {
  const metadataFetcher = deps.fetchShortsMetadata || defaultFetchShortsMetadata
  const cleanAddressNoRepair = deps.cleanAddressNoRepair || defaultCleanAddressNoRepair
  const confirmAddressWithPlaces = deps.confirmAddressWithPlaces || defaultConfirmAddressWithPlaces
  const confirmExplicitAddressWithGemini =
    deps.confirmExplicitAddressWithGemini || defaultConfirmExplicitAddressWithGemini

  let metadata
  try {
    metadata = await metadataFetcher(url, deps)
  } catch (error) {
    const fallbackMetadata = emptyMetadata(url)
    return fallbackTrack2({
      reason: error?.code || 'METADATA_FETCH_FAILED',
      url,
      metadata: fallbackMetadata,
      signals: [],
    })
  }

  const router = routeShortsAddress(metadata)
  if (!isRouterTrack1Eligible(router)) {
    return fallbackTrack2({
      reason: router.reason,
      url,
      metadata,
      router,
    })
  }

  const unsafeCandidateReason = unsafeFinalCandidateAddress(router.candidateAddress)
  if (unsafeCandidateReason) {
    return fallbackTrack2({
      reason: unsafeCandidateReason,
      url,
      metadata,
      router,
    })
  }

  const clean = await cleanAddressNoRepair({
    rawCandidate: router.candidateAddress,
    sourceType: router.evidenceSource,
    sourceName: router.reason,
    sourceSnippet: router.candidateAddress,
    geminiClient: deps.geminiClient,
  })

  if (clean.status !== 'OK' || clean.disallowedRepairDetected || !clean.normalizedAddress) {
    return fallbackTrack2({
      reason: cleanRejectionReason(clean),
      url,
      metadata,
      router,
      clean,
    })
  }

  if (!sameAddressCore(router.candidateAddress, clean.normalizedAddress)) {
    return fallbackTrack2({
      reason: 'REPAIR_DETECTED',
      url,
      metadata,
      router,
      clean,
    })
  }

  const places = await confirmAddressWithPlaces({
    normalizedAddress: clean.normalizedAddress,
    candidateAddress: router.candidateAddress,
    metadata,
    shopName: metadata.title,
    googlePlacesApiKey: deps.googlePlacesApiKey,
    fetch: deps.fetch,
  })

  if (places.status === 'PLACES_PROVIDER_ERROR' || places.error === 'PLACES_PROVIDER_ERROR') {
    return finalTrack1Result({
      reason: 'EXPLICIT_ADDRESS_PLACES_PROVIDER_ERROR',
      url,
      metadata,
      router,
      clean,
      places,
      confirm: null,
      placeVerificationStatus: 'PLACES_PROVIDER_ERROR',
    })
  }

  if (
    places.status === 'PLACES_EMPTY_RESULT' ||
    places.status === 'NO_PLACES_MATCH' ||
    !places.candidates?.length
  ) {
    return finalTrack1Result({
      reason: 'EXPLICIT_ADDRESS_UNVERIFIED_BY_PLACES',
      url,
      metadata,
      router,
      clean,
      places,
      confirm: null,
      placeVerificationStatus: 'PLACES_NO_MATCH',
    })
  }

  const confirm = await confirmExplicitAddressWithGemini({
    sourceType: router.evidenceSource,
    rawCandidate: router.candidateAddress,
    normalizedCandidate: clean.normalizedAddress,
    cleanedAddress: clean.normalizedAddress,
    sourceReason: router.reason,
    shopName: metadata.title,
    placeNameContexts: places.placeNameContexts || [],
    placesCandidates: places.candidates,
    geminiClient: deps.geminiClient,
  })

  if (hasHardPlaceConflict(confirm)) {
    return fallbackTrack2({
      reason: 'CONFLICTING_CANDIDATES',
      url,
      metadata,
      router,
      clean,
      places,
      confirm,
      placeVerificationStatus: 'PLACES_CONFLICT',
    })
  }

  if (
    confirm.decision === 'CONFIRMED' &&
    Number(confirm.confidence) >= 0.9 &&
    Boolean(confirm.bestPlaceId)
  ) {
    return finalTrack1Result({
      reason: 'EXPLICIT_ADDRESS_VERIFIED_BY_PLACES',
      url,
      metadata,
      router,
      clean,
      places,
      confirm,
      placeVerificationStatus: 'PLACES_MATCHED',
      placeId: confirm.bestPlaceId,
    })
  }

  return finalTrack1Result({
    reason: 'EXPLICIT_ADDRESS_UNVERIFIED_BY_PLACES',
    url,
    metadata,
    router,
    clean,
    places,
    confirm,
    placeVerificationStatus: 'PLACES_NO_MATCH',
  })
}

export const __shortsTrack1PipelineTestUtils = {
  TRACK_1_EVIDENCE_SOURCES,
  TRACK_1_REASONS,
  confirmRejectionReason,
  cleanRejectionReason,
  isRouterTrack1Eligible,
}

export default {
  runShortsTrack1Pipeline,
}
