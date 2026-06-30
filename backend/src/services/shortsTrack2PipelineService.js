import { extractShortsAudioForAsr } from './shortsTrack2AudioExtractionService.js'
import { extractAsrAddressCandidates } from './shortsTrack2AsrCandidateExtractorService.js'
import { runAsrOnShortsAudio } from './shortsTrack2AsrService.js'
import { buildTrack2CandidateOutput } from './shortsTrack2CandidateOutputService.js'
import { rankPlaceNameCandidates } from './shortsTrack2PlaceCandidateRankerService.js'
import { extractPlaceNameSignals } from './shortsTrack2PlaceNameExtractorService.js'
import { searchPlaceNameCandidates } from './shortsTrack2PlaceSearchService.js'
import { evaluateTrack2InferenceSafety } from './shortsTrack2SafetyGuardService.js'
import { extractShortsFramesForOcr } from './shortsTrack2FrameExtractionService.js'
import {
  verifyAsrAddressCandidates,
  verifyOcrAddressCandidates,
} from './shortsTrack2CandidateVerifierService.js'
import { confirmTrack2PlaceInferenceWithGemini } from './shortsTrack2GeminiConfirmService.js'
import { extractOcrAddressCandidates } from './shortsTrack2OcrCandidateExtractorService.js'
import { runOcrOnShortsFrames } from './shortsTrack2OcrService.js'

const MULTI_PLACE_SAFETY_REASONS = new Set([
  'MULTI_PLACE_OR_LIST_VIDEO',
  'DESCRIPTION_HAS_MULTIPLE_ADDRESSES',
  'DESCRIPTION_HAS_MULTIPLE_PLACES',
])

function stageDiagnostics(stage, result = {}) {
  const statusDiagnostic = result.status && result.status !== 'OK'
    ? [{ stage, status: result.status, reason: result.reason || null }]
    : []
  const diagnostics = Array.isArray(result.diagnostics)
    ? result.diagnostics.map((diagnostic) => ({ stage, ...diagnostic }))
    : []
  return [...statusDiagnostic, ...diagnostics].slice(0, 12)
}

function safeText(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength)
}

function foldText(value) {
  return safeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9.,:;#@\s/-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function phase6RelevantMetadata(metadata = {}) {
  const safeMetadata = metadata || {}
  const text = foldText([
    safeMetadata.title,
    safeMetadata.descriptionRawFromYoutube,
    safeMetadata.description,
    safeMetadata.pageMetadataText,
    ...(Array.isArray(safeMetadata.jsonldObjects) ? safeMetadata.jsonldObjects.flatMap((item) => [item?.name, item?.description]) : []),
  ].filter(Boolean).join('\n'))
  if (!text) return false
  const generic = /\b(?:top(?:\s*\d+)?|tong\s+hop|nhung\s+quan|cac\s+quan|quan\s+ngon|mon\s+ngon|nen\s+thu|food\s*tour|an\s+sap|review\s+nhieu\s+quan|phan\s*\d+|part\s*\d+|ep\s*\d+|episode|series)\b/.test(text)
  const area = /\b(?:quan|district|q\.?)\s*\d{1,2}|\b(?:binh\s*thanh|go\s*vap|tan\s*binh|thu\s*duc|hcm|ho\s*chi\s*minh|sai\s*gon|ha\s*noi|hanoi)\b/.test(text)
  const name = /\b(?:quan|tiem|cafe|coffee|bistro|restaurant|banh|pho|bun|com|che)\s+[a-z0-9]{2,}|\b[a-z0-9]{2,}\s+(?:cafe|coffee|restaurant|bistro)\b/.test(text)
  const multiple = safeText(safeMetadata.descriptionRawFromYoutube || safeMetadata.description)
    .split(/\r?\n/u)
    .filter((line) => /^(?:[-*•]|\d+[.)])\s*\S+/u.test(line.trim()))
    .length > 1
  return generic || multiple || (area && name)
}

function track2Outcome(frameResult = {}, ocrResult = {}, candidateResult = {}) {
  if (candidateResult.status === 'NEEDS_REVIEW') {
    return {
      resolution: 'NEEDS_REVIEW',
      reason: 'MULTIPLE_OCR_ADDRESS_CANDIDATES',
    }
  }

  if (Array.isArray(candidateResult.candidates) && candidateResult.candidates.length > 0) {
    return {
      resolution: 'CANDIDATES',
      reason: 'OCR_ADDRESS_CANDIDATES_FOUND',
    }
  }

  if (frameResult.status === 'UNAVAILABLE') {
    return {
      resolution: 'UNRESOLVED',
      reason: 'OCR_FRAME_EXTRACTION_UNAVAILABLE',
    }
  }

  if (frameResult.status === 'ERROR') {
    return {
      resolution: 'UNRESOLVED',
      reason: frameResult.reason || 'FRAME_EXTRACTION_PROVIDER_ERROR',
    }
  }

  if (ocrResult.status === 'UNAVAILABLE' || ocrResult.status === 'ERROR') {
    return {
      resolution: 'UNRESOLVED',
      reason: ocrResult.reason ||
        (ocrResult.status === 'UNAVAILABLE' ? 'OCR_PROVIDER_UNAVAILABLE' : 'OCR_PROVIDER_ERROR'),
    }
  }

  if (candidateResult.status === 'NO_TEXT') {
    return {
      resolution: 'UNRESOLVED',
      reason: 'NO_OCR_TEXT',
    }
  }

  return {
    resolution: 'UNRESOLVED',
    reason: 'NO_OCR_ADDRESS_CANDIDATE',
  }
}

function verifiedOutcome(candidateResult = {}, verificationResult = null) {
  if (!verificationResult) return null

  if (candidateResult.status === 'NEEDS_REVIEW') {
    return {
      resolution: 'NEEDS_REVIEW',
      reason: 'OCR_CANDIDATES_NEED_REVIEW',
    }
  }

  if (verificationResult.verifiedCandidates?.length === 1 && verificationResult.status === 'OK') {
    return {
      resolution: 'RESOLVED',
      reason: 'OCR_ADDRESS_CONFIRMED',
    }
  }

  if (verificationResult.reason === 'MULTIPLE_VERIFIED_OCR_CANDIDATES') {
    return {
      resolution: 'NEEDS_REVIEW',
      reason: 'MULTIPLE_VERIFIED_OCR_CANDIDATES',
    }
  }

  if (verificationResult.status === 'NEEDS_REVIEW' || candidateResult.status === 'NEEDS_REVIEW') {
    return {
      resolution: 'NEEDS_REVIEW',
      reason: 'OCR_CANDIDATES_NEED_REVIEW',
    }
  }

  if (verificationResult.reason === 'PLACES_PROVIDER_ERROR') {
    return {
      resolution: 'UNRESOLVED',
      reason: 'PLACES_PROVIDER_ERROR',
    }
  }

  if (verificationResult.reason === 'PLACES_NOT_CONFIRMED') {
    return {
      resolution: 'CANDIDATES',
      reason: 'PLACES_NOT_CONFIRMED',
    }
  }

  if (verificationResult.reason === 'GEMINI_TRACK2_UNAVAILABLE') {
    return {
      resolution: 'CANDIDATES',
      reason: 'GEMINI_TRACK2_UNAVAILABLE',
    }
  }

  if (verificationResult.reason === 'GEMINI_TRACK2_UNSURE') {
    return {
      resolution: 'CANDIDATES',
      reason: 'GEMINI_TRACK2_UNSURE',
    }
  }

  if (verificationResult.reason === 'GEMINI_TRACK2_REJECTED') {
    return {
      resolution: 'CANDIDATES',
      reason: 'GEMINI_TRACK2_REJECTED',
    }
  }

  return {
    resolution: 'CANDIDATES',
    reason: 'OCR_CANDIDATES_UNVERIFIED',
  }
}

function asrTrack2Outcome(audioResult = {}, asrResult = {}, candidateResult = {}) {
  if (candidateResult.status === 'NEEDS_REVIEW') {
    return {
      resolution: 'NEEDS_REVIEW',
      reason: 'MULTIPLE_ASR_ADDRESS_CANDIDATES',
    }
  }

  if (Array.isArray(candidateResult.candidates) && candidateResult.candidates.length > 0) {
    return {
      resolution: 'CANDIDATES',
      reason: 'ASR_CANDIDATES_UNVERIFIED',
    }
  }

  if (audioResult.status === 'UNAVAILABLE' || audioResult.status === 'REJECTED') {
    return {
      resolution: 'UNRESOLVED',
      reason: 'ASR_AUDIO_UNAVAILABLE',
    }
  }

  if (asrResult.status === 'UNAVAILABLE') {
    return {
      resolution: 'UNRESOLVED',
      reason: 'ASR_PROVIDER_UNAVAILABLE',
    }
  }

  if (audioResult.status === 'ERROR') {
    return {
      resolution: 'UNRESOLVED',
      reason: audioResult.reason || 'AUDIO_EXTRACTION_PROVIDER_ERROR',
    }
  }

  if (asrResult.status === 'ERROR') {
    return {
      resolution: 'UNRESOLVED',
      reason: asrResult.reason || 'ASR_PROVIDER_ERROR',
    }
  }

  if (candidateResult.status === 'NO_TRANSCRIPT') {
    return {
      resolution: 'UNRESOLVED',
      reason: 'NO_ASR_TRANSCRIPT',
    }
  }

  return {
    resolution: 'UNRESOLVED',
    reason: 'NO_ASR_ADDRESS_CANDIDATE',
  }
}

function asrVerifiedOutcome(candidateResult = {}, verificationResult = null) {
  if (!verificationResult) return null

  if (candidateResult.status === 'NEEDS_REVIEW') {
    return {
      resolution: 'NEEDS_REVIEW',
      reason: 'ASR_CANDIDATES_NEED_REVIEW',
    }
  }

  if (verificationResult.verifiedCandidates?.length === 1 && verificationResult.status === 'OK') {
    return {
      resolution: 'RESOLVED',
      reason: 'ASR_ADDRESS_CONFIRMED',
    }
  }

  if (verificationResult.reason === 'MULTIPLE_VERIFIED_ASR_CANDIDATES') {
    return {
      resolution: 'NEEDS_REVIEW',
      reason: 'MULTIPLE_VERIFIED_ASR_CANDIDATES',
    }
  }

  if (verificationResult.status === 'NEEDS_REVIEW' || candidateResult.status === 'NEEDS_REVIEW') {
    return {
      resolution: 'NEEDS_REVIEW',
      reason: 'ASR_CANDIDATES_NEED_REVIEW',
    }
  }

  if (verificationResult.reason === 'PLACES_PROVIDER_ERROR') {
    return {
      resolution: 'UNRESOLVED',
      reason: 'ASR_COLLECTION_ERROR',
    }
  }

  if (verificationResult.reason === 'ASR_PLACES_NOT_CONFIRMED') {
    return {
      resolution: 'CANDIDATES',
      reason: 'ASR_PLACES_NOT_CONFIRMED',
    }
  }

  if (verificationResult.reason === 'ASR_GEMINI_UNSURE') {
    return {
      resolution: 'CANDIDATES',
      reason: 'ASR_GEMINI_UNSURE',
    }
  }

  if (verificationResult.reason === 'ASR_GEMINI_REJECTED') {
    return {
      resolution: 'CANDIDATES',
      reason: 'ASR_GEMINI_REJECTED',
    }
  }

  return {
    resolution: 'CANDIDATES',
    reason: 'ASR_CANDIDATES_UNVERIFIED',
  }
}

function shouldRunAsrAfterOcr(ocrOutcome = {}, deps = {}) {
  if (ocrOutcome.resolution === 'RESOLVED') return false
  if (ocrOutcome.resolution === 'NEEDS_REVIEW') return false
  return typeof deps.track2AudioExtractor === 'function' ||
    typeof deps.track2AsrProvider === 'function'
}

function chooseOutcome({
  ocrOutcome,
  asrOutcome,
  ocrCandidateCount,
}) {
  if (!asrOutcome) return ocrOutcome
  if (asrOutcome.resolution === 'RESOLVED' || asrOutcome.resolution === 'NEEDS_REVIEW') return asrOutcome
  if (ocrCandidateCount === 0) return asrOutcome
  if (asrOutcome.resolution === 'CANDIDATES') return asrOutcome
  return ocrOutcome
}

function candidateEvidenceSafety(metadata = {}, candidateCount = 0) {
  if (candidateCount <= 0) return null
  const safety = evaluateTrack2InferenceSafety({ metadata })
  if (MULTI_PLACE_SAFETY_REASONS.has(safety.reason)) return safety
  return {
    status: 'OK',
    reason: 'CANDIDATE_EVIDENCE_SAFETY_CLEAR',
    flags: [],
    diagnostics: [],
  }
}

function placeInferenceGap(rankedCandidates = []) {
  if (rankedCandidates.length < 2) return 1
  const gap = Number(rankedCandidates[0]?.score || 0) - Number(rankedCandidates[1]?.score || 0)
  return Math.max(0, Math.min(1, Math.round(gap * 100) / 100))
}

function emptyPhase6Stage(reason) {
  return {
    safety: null,
    placeNameSignals: { status: 'NOT_RUN', reason, signals: { placeNames: [], areas: [], dishes: [], sourceFields: [] }, diagnostics: [] },
    placeSearch: { status: 'NOT_RUN', reason, queries: [], rawCandidates: [], diagnostics: [] },
    placeRanking: { status: 'NOT_RUN', reason, rankedCandidates: [], diagnostics: [] },
    placeConfirm: { status: 'NOT_RUN', reason, decision: 'UNSURE', confidence: 0, diagnostics: [] },
  }
}

async function runPlaceNameInference({
  track1Result,
  metadata,
  sourceUrl,
  videoId,
  ocrResult,
  ocrCandidateExtraction,
  ocrVerification,
  asrResult,
  asrCandidateExtraction,
  asrVerification,
  deps,
}) {
  if (!phase6RelevantMetadata(metadata)) return null

  const safety = evaluateTrack2InferenceSafety({
    metadata,
    ocrResult,
    ocrCandidateExtraction,
    ocrVerification,
    asrResult,
    asrCandidateExtraction,
    asrVerification,
  })
  const stages = emptyPhase6Stage('SAFETY_NOT_OK')
  stages.safety = safety

  if (safety.status === 'NEEDS_REVIEW') {
    return {
      outcome: { resolution: 'NEEDS_REVIEW', reason: 'PLACE_NAME_NEEDS_REVIEW' },
      candidates: [],
      stages,
      diagnostics: stageDiagnostics('safety', safety),
    }
  }

  if (safety.status === 'BLOCKED') {
    return {
      outcome: {
        resolution: 'UNRESOLVED',
        reason: safety.flags?.includes('MULTI_PLACE_LIKELY')
          ? 'MULTI_PLACE_OR_LIST_VIDEO'
          : 'PLACE_NAME_SAFETY_BLOCKED',
      },
      candidates: [],
      stages,
      diagnostics: stageDiagnostics('safety', safety),
    }
  }

  const placeNameSignals = extractPlaceNameSignals(metadata, { track1Result })
  stages.placeNameSignals = placeNameSignals
  if (placeNameSignals.status === 'NEEDS_REVIEW') {
    return {
      outcome: { resolution: 'NEEDS_REVIEW', reason: 'PLACE_NAME_NEEDS_REVIEW' },
      candidates: [],
      stages,
      diagnostics: [
        ...stageDiagnostics('safety', safety),
        ...stageDiagnostics('placeNameSignals', placeNameSignals),
      ],
    }
  }
  if (placeNameSignals.status === 'BLOCKED' || placeNameSignals.status === 'NO_SIGNALS') {
    return {
      outcome: { resolution: 'UNRESOLVED', reason: 'PLACE_NAME_NO_SIGNALS' },
      candidates: [],
      stages,
      diagnostics: [
        ...stageDiagnostics('safety', safety),
        ...stageDiagnostics('placeNameSignals', placeNameSignals),
      ],
    }
  }

  const placeSearch = await searchPlaceNameCandidates(placeNameSignals, deps)
  stages.placeSearch = placeSearch
  if (placeSearch.status === 'NO_QUERIES') {
    return {
      outcome: { resolution: 'UNRESOLVED', reason: 'PLACE_NAME_NO_QUERIES' },
      candidates: [],
      stages,
      diagnostics: [
        ...stageDiagnostics('safety', safety),
        ...stageDiagnostics('placeNameSignals', placeNameSignals),
        ...stageDiagnostics('placeSearch', placeSearch),
      ],
    }
  }
  if (placeSearch.status === 'UNAVAILABLE' || placeSearch.status === 'ERROR') {
    return {
      outcome: { resolution: 'UNRESOLVED', reason: 'PLACE_NAME_PROVIDER_ERROR' },
      candidates: [],
      stages,
      diagnostics: [
        ...stageDiagnostics('safety', safety),
        ...stageDiagnostics('placeNameSignals', placeNameSignals),
        ...stageDiagnostics('placeSearch', placeSearch),
      ],
    }
  }
  if (!placeSearch.rawCandidates?.length) {
    return {
      outcome: { resolution: 'UNRESOLVED', reason: 'PLACE_NAME_NO_CANDIDATES' },
      candidates: [],
      stages,
      diagnostics: [
        ...stageDiagnostics('safety', safety),
        ...stageDiagnostics('placeNameSignals', placeNameSignals),
        ...stageDiagnostics('placeSearch', placeSearch),
      ],
    }
  }

  const placeRanking = rankPlaceNameCandidates(placeSearch, placeNameSignals, safety)
  stages.placeRanking = placeRanking
  const rankedCandidates = Array.isArray(placeRanking.rankedCandidates) ? placeRanking.rankedCandidates : []
  const topCandidate = rankedCandidates[0]
  const gap = placeInferenceGap(rankedCandidates)

  if (placeRanking.status === 'NEEDS_REVIEW') {
    return {
      outcome: { resolution: 'NEEDS_REVIEW', reason: 'PLACE_NAME_NEEDS_REVIEW' },
      candidates: rankedCandidates,
      stages,
      diagnostics: [
        ...stageDiagnostics('safety', safety),
        ...stageDiagnostics('placeNameSignals', placeNameSignals),
        ...stageDiagnostics('placeSearch', placeSearch),
        ...stageDiagnostics('placeRanking', placeRanking),
      ],
    }
  }

  if (!topCandidate || topCandidate.score < 0.85 || gap < 0.15) {
    return {
      outcome: { resolution: 'CANDIDATES', reason: 'PLACE_NAME_CANDIDATES_UNVERIFIED' },
      candidates: rankedCandidates,
      stages,
      diagnostics: [
        ...stageDiagnostics('safety', safety),
        ...stageDiagnostics('placeNameSignals', placeNameSignals),
        ...stageDiagnostics('placeSearch', placeSearch),
        ...stageDiagnostics('placeRanking', placeRanking),
      ],
    }
  }

  const confirm = await (deps.confirmTrack2PlaceInferenceWithGemini || confirmTrack2PlaceInferenceWithGemini)({
    placeSignals: placeNameSignals,
    rankedCandidate: topCandidate,
    safety,
    metadata,
    sourceUrl,
    videoId,
  }, deps)
  stages.placeConfirm = confirm

  if (confirm.decision === 'CONFIRMED' && Number(confirm.confidence) >= 0.85) {
    return {
      outcome: {
        resolution: 'RESOLVED',
        reason: 'PLACE_NAME_CONFIRMED',
        verifiedPlaceCandidate: topCandidate,
        confidence: Math.min(Number(confirm.confidence) || 0, Number(topCandidate.score) || 0),
      },
      candidates: rankedCandidates,
      stages,
      diagnostics: [
        ...stageDiagnostics('safety', safety),
        ...stageDiagnostics('placeNameSignals', placeNameSignals),
        ...stageDiagnostics('placeSearch', placeSearch),
        ...stageDiagnostics('placeRanking', placeRanking),
        ...stageDiagnostics('placeConfirm', confirm),
      ],
    }
  }

  const reason = confirm.status === 'UNAVAILABLE'
    ? 'PLACE_NAME_GEMINI_UNAVAILABLE'
    : confirm.decision === 'REJECTED'
    ? 'PLACE_NAME_GEMINI_REJECTED'
    : 'PLACE_NAME_GEMINI_UNSURE'
  return {
    outcome: { resolution: 'CANDIDATES', reason },
    candidates: rankedCandidates,
    stages,
    diagnostics: [
      ...stageDiagnostics('safety', safety),
      ...stageDiagnostics('placeNameSignals', placeNameSignals),
      ...stageDiagnostics('placeSearch', placeSearch),
      ...stageDiagnostics('placeRanking', placeRanking),
      ...stageDiagnostics('placeConfirm', confirm),
    ],
  }
}

function legacyTrack2Reason(frameResult = {}, ocrResult = {}) {
  if (frameResult.status === 'UNAVAILABLE') return 'OCR_FRAME_EXTRACTION_UNAVAILABLE'
  if (frameResult.status === 'ERROR' || ocrResult.status === 'ERROR') return 'OCR_COLLECTION_ERROR'
  if (ocrResult.status === 'UNAVAILABLE') return 'OCR_PROVIDER_UNAVAILABLE'
  if (!Array.isArray(frameResult.frames) || frameResult.frames.length === 0 || ocrResult.status === 'NO_FRAMES') {
    return 'OCR_NO_FRAMES'
  }
  if (Array.isArray(ocrResult.textBlocks) && ocrResult.textBlocks.length > 0) {
    return 'OCR_TEXT_COLLECTED'
  }
  return 'OCR_NO_TEXT_COLLECTED'
}

export async function runShortsTrack2Pipeline(track1Result, deps = {}) {
  const metadata = track1Result?.metadata || null
  const signals = Array.isArray(track1Result?.signals) ? track1Result.signals : []
  const sourceUrl = track1Result?.sourceUrl || metadata?.url || null
  const videoId = track1Result?.videoId || metadata?.videoId || null
  const frameResult = await extractShortsFramesForOcr(track1Result, deps)
  const ocrResult = await runOcrOnShortsFrames(frameResult, {
    ...deps,
    metadata,
  })
  const candidateResult = extractOcrAddressCandidates(ocrResult, {
    metadata,
    sourceUrl: track1Result?.sourceUrl || metadata?.url || null,
    videoId: track1Result?.videoId || metadata?.videoId || null,
  })
  const verificationResult = Array.isArray(candidateResult.candidates) && candidateResult.candidates.length
    ? await verifyOcrAddressCandidates(candidateResult, {
        metadata,
        sourceUrl,
        videoId,
        track1Result,
      }, deps)
    : null
  const outcome = verifiedOutcome(candidateResult, verificationResult) ||
    track2Outcome(frameResult, ocrResult, candidateResult)
  let audioResult = null
  let asrResult = null
  let asrCandidateResult = null
  let asrVerificationResult = null
  let asrOutcome = null

  if (shouldRunAsrAfterOcr(outcome, deps)) {
    audioResult = await extractShortsAudioForAsr(track1Result, deps)
    asrResult = await runAsrOnShortsAudio(audioResult, {
      ...deps,
      metadata,
    })
    asrCandidateResult = extractAsrAddressCandidates(asrResult, {
      metadata,
      sourceUrl,
      videoId,
    })
    asrVerificationResult = Array.isArray(asrCandidateResult.candidates) && asrCandidateResult.candidates.length
      ? await verifyAsrAddressCandidates(asrCandidateResult, {
          metadata,
          sourceUrl,
          videoId,
          track1Result,
        }, deps)
      : null
    asrOutcome = asrVerifiedOutcome(asrCandidateResult, asrVerificationResult) ||
      asrTrack2Outcome(audioResult, asrResult, asrCandidateResult)
  }

  const ocrCandidateCount = Array.isArray(candidateResult.candidates)
    ? candidateResult.candidates.length
    : 0
  const asrCandidateCount = Array.isArray(asrCandidateResult?.candidates)
    ? asrCandidateResult.candidates.length
    : 0
  const candidateSafety = candidateEvidenceSafety(
    metadata || {},
    ocrCandidateCount + asrCandidateCount,
  )
  const prePlaceOutcome = chooseOutcome({
    ocrOutcome: outcome,
    asrOutcome,
    ocrCandidateCount,
  })
  let placeInferenceResult = null
  if (
    prePlaceOutcome.resolution !== 'RESOLVED' &&
    prePlaceOutcome.resolution !== 'NEEDS_REVIEW' &&
    ocrCandidateCount === 0 &&
    asrCandidateCount === 0
  ) {
    placeInferenceResult = await runPlaceNameInference({
      track1Result,
      metadata,
      sourceUrl,
      videoId,
      ocrResult,
      ocrCandidateExtraction: candidateResult,
      ocrVerification: verificationResult,
      asrResult,
      asrCandidateExtraction: asrCandidateResult,
      asrVerification: asrVerificationResult,
      deps,
    })
  }
  let finalOutcome = placeInferenceResult?.outcome || prePlaceOutcome
  if (
    finalOutcome.resolution === 'RESOLVED' &&
    candidateSafety &&
    MULTI_PLACE_SAFETY_REASONS.has(candidateSafety.reason)
  ) {
    finalOutcome = {
      resolution: 'NEEDS_REVIEW',
      reason: candidateSafety.reason,
    }
  }
  const phase = finalOutcome.reason === 'PLACE_NAME_CONFIRMED' ||
    finalOutcome.reason?.startsWith?.('PLACE_NAME_') ||
    finalOutcome.reason === 'MULTI_PLACE_OR_LIST_VIDEO'
    ? 'PHASE_6_PLACE_NAME_INFERENCE'
    : asrOutcome
    ? 'PHASE_5_ASR_RESOLVER'
    : verificationResult
    ? 'PHASE_4_OCR_CANDIDATE_VERIFICATION'
    : candidateResult.status === 'NO_TEXT' && frameResult.status === 'UNAVAILABLE'
    ? 'PHASE_2_OCR_COLLECTION'
    : 'PHASE_3_OCR_CANDIDATE_EXTRACTION'
  const verifiedCandidate = verificationResult?.verifiedCandidates?.length === 1 &&
    verificationResult.status === 'OK'
    ? verificationResult.verifiedCandidates[0]
    : null
  const verifiedAsrCandidate = asrVerificationResult?.verifiedCandidates?.length === 1 &&
    asrVerificationResult.status === 'OK'
    ? asrVerificationResult.verifiedCandidates[0]
    : null
  const finalVerifiedCandidate = finalOutcome.resolution === 'RESOLVED'
    ? finalOutcome.reason === 'ASR_ADDRESS_CONFIRMED'
      ? verifiedAsrCandidate
      : verifiedCandidate
    : null
  const candidates = buildTrack2CandidateOutput({
    ocrExtraction: candidateResult,
    ocrVerification: verificationResult,
    asrExtraction: asrCandidateResult,
    asrVerification: asrVerificationResult,
    placeCandidates: placeInferenceResult?.candidates,
    placeReason: finalOutcome.reason,
  })
  const evidence = candidates.map((candidate) => candidate.evidence)
  const verifiedPlaceCandidate = finalOutcome.verifiedPlaceCandidate || null

  return {
    track: 'TRACK_2',
    resolution: finalOutcome.resolution,
    reason: finalOutcome.reason || legacyTrack2Reason(frameResult, ocrResult),
    ...(finalOutcome.resolution === 'RESOLVED' && finalVerifiedCandidate
      ? {
          address: finalVerifiedCandidate.address,
          normalizedAddress: finalVerifiedCandidate.normalizedAddress,
          addressSource: finalVerifiedCandidate.addressSource,
          confidence: finalVerifiedCandidate.confidence,
          placeId: finalVerifiedCandidate.placeId,
        }
      : finalOutcome.resolution === 'RESOLVED' && verifiedPlaceCandidate
      ? {
          address: verifiedPlaceCandidate.formattedAddress,
          normalizedAddress: verifiedPlaceCandidate.formattedAddress,
          addressSource: 'place_name_inference',
          confidence: finalOutcome.confidence,
          placeId: verifiedPlaceCandidate.placeId,
        }
      : {}),
    sourceUrl,
    videoId,
    metadata,
    signals,
    candidates,
    candidateCount: candidates.length,
    evidence,
    providerWarnings: [
      ...(Array.isArray(ocrResult.providerWarnings) ? ocrResult.providerWarnings : []),
      ...(Array.isArray(asrResult?.providerWarnings) ? asrResult.providerWarnings : []),
    ].slice(0, 16),
    diagnostics: [
      ...stageDiagnostics('frameExtraction', frameResult),
      ...stageDiagnostics('ocr', ocrResult),
      ...stageDiagnostics('candidateExtraction', candidateResult),
      ...stageDiagnostics('verification', verificationResult || {}),
      ...stageDiagnostics('audioExtraction', audioResult || {}),
      ...stageDiagnostics('asr', asrResult || {}),
      ...stageDiagnostics('asrCandidateExtraction', asrCandidateResult || {}),
      ...stageDiagnostics('asrVerification', asrVerificationResult || {}),
      ...stageDiagnostics('candidateSafety', candidateSafety || {}),
      ...(Array.isArray(placeInferenceResult?.diagnostics) ? placeInferenceResult.diagnostics : []),
    ].slice(0, 16),
    stages: {
      track1: track1Result?.stages || null,
      track2: {
        phase,
      },
      ...(candidateSafety ? { candidateSafety } : {}),
      frameExtraction: {
        status: frameResult.status,
        reason: frameResult.reason,
        durationSeconds: frameResult.durationSeconds ?? null,
        maxDurationSeconds: frameResult.maxDurationSeconds,
        budgetMs: frameResult.budgetMs,
        sampleStrategy: frameResult.sampleStrategy,
        maxFrames: frameResult.maxFrames,
        sampledTimestamps: frameResult.sampledTimestamps,
        frameCount: frameResult.frameCount,
        diagnostics: frameResult.diagnostics,
      },
      ocr: {
        status: ocrResult.status,
        reason: ocrResult.reason,
        textBlocks: ocrResult.textBlocks,
        diagnostics: ocrResult.diagnostics,
        providerWarnings: ocrResult.providerWarnings,
      },
      candidateExtraction: {
        status: candidateResult.status,
        reason: candidateResult.reason,
        candidates: Array.isArray(candidateResult.candidates) ? candidateResult.candidates : [],
        diagnostics: candidateResult.diagnostics,
      },
      ...(verificationResult
        ? {
            verification: {
              status: verificationResult.status,
              reason: verificationResult.reason,
              verifiedCandidates: verificationResult.verifiedCandidates,
              rejectedCandidates: verificationResult.rejectedCandidates,
              unresolvedCandidates: verificationResult.unresolvedCandidates,
              diagnostics: verificationResult.diagnostics,
            },
          }
        : {}),
      ...(audioResult
        ? {
            audioExtraction: {
              status: audioResult.status,
              reason: audioResult.reason,
              durationSeconds: audioResult.durationSeconds ?? null,
              maxDurationSeconds: audioResult.maxDurationSeconds,
              budgetMs: audioResult.budgetMs,
              audio: audioResult.audio,
              diagnostics: audioResult.diagnostics,
            },
            asr: {
              status: asrResult.status,
              reason: asrResult.reason,
              transcript: asrResult.transcript,
              diagnostics: asrResult.diagnostics,
              providerWarnings: asrResult.providerWarnings,
            },
            asrCandidateExtraction: {
              status: asrCandidateResult.status,
              reason: asrCandidateResult.reason,
              candidates: Array.isArray(asrCandidateResult.candidates) ? asrCandidateResult.candidates : [],
              diagnostics: asrCandidateResult.diagnostics,
            },
            ...(asrVerificationResult
              ? {
                  asrVerification: {
                    status: asrVerificationResult.status,
                    reason: asrVerificationResult.reason,
                    verifiedCandidates: asrVerificationResult.verifiedCandidates,
                    rejectedCandidates: asrVerificationResult.rejectedCandidates,
                    unresolvedCandidates: asrVerificationResult.unresolvedCandidates,
                    diagnostics: asrVerificationResult.diagnostics,
                  },
                }
              : {}),
          }
        : {}),
      ...(placeInferenceResult
        ? {
            safety: placeInferenceResult.stages.safety,
            placeNameSignals: placeInferenceResult.stages.placeNameSignals,
            placeSearch: placeInferenceResult.stages.placeSearch,
            placeRanking: placeInferenceResult.stages.placeRanking,
            placeConfirm: placeInferenceResult.stages.placeConfirm,
          }
        : {}),
    },
  }
}

export default {
  runShortsTrack2Pipeline,
}
