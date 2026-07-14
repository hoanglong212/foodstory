import { extractTrack1Evidence } from './shortsTrack1EvidenceExtractor.js'
import {
  isTruncatedEvidence,
  normalizeAddress,
  safePreNormalize,
} from './shortsAddressNormalizer.js'

const HOUSE_NUMBER_PATTERN =
  /\b(?:số\s*)?\d{1,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?){0,2}\b/iu
const ADMIN_MARKER_PATTERN =
  /\b(?:Quận|Quan|Q\.|District|Phường|Phuong|P\.|TP\.?\s*HCM|HCMC|TP\.?\s*Hồ\s*Chí\s*Minh|Hà\s*Nội|Ha\s*Noi)\b/iu
const LOCAL_ADMIN_CLAUSE_PATTERN =
  /(?:,|\()\s*(?:[A-ZÀ-ỸĐ][\p{L}\p{M}'’.+-]*\s*){1,4}\)?(?:\s*$|[,)]|$)/u

function emptyResult(overrides = {}) {
  return {
    track: 'TRACK_2',
    reason: 'NO_EXPLICIT_EVIDENCE',
    evidenceSource: null,
    candidateAddress: null,
    normalizedAddress: null,
    confidence: null,
    signals: [],
    ...overrides,
  }
}

function hasAddressLikeText(text) {
  const value = safePreNormalize(text)
  return Boolean(HOUSE_NUMBER_PATTERN.test(value) &&
    (ADMIN_MARKER_PATTERN.test(value) || LOCAL_ADMIN_CLAUSE_PATTERN.test(value)))
}

function firstAddressLikeText(...values) {
  return values
    .map((value) => String(value || '').trim())
    .find((value) => value && hasAddressLikeText(value)) || null
}

export function parseShortsUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim())
    const host = parsed.hostname.toLowerCase()
    const hostAllowed = host === 'www.youtube.com' || host === 'm.youtube.com'
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (!hostAllowed || parsed.protocol !== 'https:' || parts[0] !== 'shorts') {
      return {
        ok: false,
        videoId: null,
        canonicalUrl: null,
        reason: 'NOT_YOUTUBE_SHORTS',
      }
    }
    const videoId = parts[1] || ''
    if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
      return {
        ok: false,
        videoId: null,
        canonicalUrl: null,
        reason: 'INVALID_VIDEO_ID',
      }
    }
    return {
      ok: true,
      videoId,
      canonicalUrl: `https://${host}/shorts/${videoId}`,
      reason: null,
    }
  } catch {
    return {
      ok: false,
      videoId: null,
      canonicalUrl: null,
      reason: 'INVALID_URL',
    }
  }
}

function track2FromSource({
  reason,
  evidenceSource,
  text,
  signals = [],
} = {}) {
  return emptyResult({
    reason,
    evidenceSource,
    candidateAddress: text || null,
    normalizedAddress: text && !isTruncatedEvidence(text)
      ? normalizeAddress(text)
      : null,
    signals,
  })
}

export function routeShortsAddress({
  url = '',
  title = '',
  description = '',
  pageMetadataText = '',
  serpSnippet = '',
  jsonldObjects = [],
  ocrText = '',
  asrText = '',
} = {}) {
  const parsed = parseShortsUrl(url)
  const signals = [
    {
      source: 'url',
      rule: 'PARSE_SHORTS_URL',
      accepted: parsed.ok,
      reason: parsed.reason,
    },
  ]

  if (!parsed.ok) {
    return emptyResult({
      reason: 'NO_EXPLICIT_EVIDENCE',
      signals,
    })
  }

  const evidence = extractTrack1Evidence({
    title,
    description,
    pageMetadataText,
    jsonldObjects,
  })
  signals.push(...evidence.signals)

  if (evidence.reason === 'TRUNCATED_EVIDENCE') {
    return emptyResult({
      reason: 'TRUNCATED_EVIDENCE',
      evidenceSource: evidence.evidenceSource,
      candidateAddress: evidence.candidateAddress,
      normalizedAddress: null,
      signals,
    })
  }

  if (evidence.accepted) {
    return {
      track: 'TRACK_1',
      reason: evidence.reason,
      evidenceSource: evidence.evidenceSource,
      candidateAddress: evidence.candidateAddress,
      normalizedAddress: evidence.normalizedAddress,
      confidence: evidence.confidence,
      signals: [
        ...signals,
        {
          source: evidence.evidenceSource,
          rule: evidence.reason,
          accepted: true,
          normalized: Boolean(evidence.normalizedAddress),
        },
      ],
    }
  }

  const ocrAddress = firstAddressLikeText(ocrText)
  if (ocrAddress) {
    return track2FromSource({
      reason: 'OCR_ONLY',
      evidenceSource: 'ocr',
      text: ocrAddress,
      signals: [
        ...signals,
        {
          source: 'ocr',
          rule: 'TRACK_1_INELIGIBLE_SOURCE',
          accepted: false,
          reason: 'OCR_ONLY',
        },
      ],
    })
  }

  const asrAddress = firstAddressLikeText(asrText)
  if (asrAddress) {
    return track2FromSource({
      reason: 'ASR_ONLY',
      evidenceSource: 'asr',
      text: asrAddress,
      signals: [
        ...signals,
        {
          source: 'asr',
          rule: 'TRACK_1_INELIGIBLE_SOURCE',
          accepted: false,
          reason: 'ASR_ONLY',
        },
      ],
    })
  }

  const serpSnippetSignal = String(serpSnippet || '').trim()
    ? {
        source: 'serp_snippet',
        rule: 'TRACK_1_INELIGIBLE_SOURCE',
        accepted: false,
        reason: 'SERP_SNIPPET_NOT_ELIGIBLE',
      }
    : null
  if (serpSnippetSignal) {
    signals.push(serpSnippetSignal)
  }

  if (isTruncatedEvidence(title) || isTruncatedEvidence(description) || isTruncatedEvidence(pageMetadataText)) {
    return emptyResult({
      reason: 'TRUNCATED_EVIDENCE',
      evidenceSource: isTruncatedEvidence(description)
        ? 'description'
        : isTruncatedEvidence(title)
          ? 'title'
          : 'page_metadata',
      candidateAddress: isTruncatedEvidence(description)
        ? description
        : isTruncatedEvidence(title)
          ? title
          : pageMetadataText,
      signals,
    })
  }

  const titleAddress = firstAddressLikeText(title)
  if (titleAddress) {
    return track2FromSource({
      reason: 'TITLE_ONLY',
      evidenceSource: 'title',
      text: titleAddress,
      signals: [
        ...signals,
        {
          source: 'title',
          rule: 'TITLE_ADDRESS_WITHOUT_EXACT_PREFIX',
          accepted: false,
          reason: 'TITLE_ONLY',
        },
      ],
    })
  }

  return emptyResult({
    reason: 'NO_EXPLICIT_EVIDENCE',
    signals,
  })
}

export default {
  parseShortsUrl,
  routeShortsAddress,
}
