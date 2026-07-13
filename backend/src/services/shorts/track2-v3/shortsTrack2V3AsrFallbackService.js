import {
  ASR_EVIDENCE_TYPES,
  buildShortsTrack2V3AsrReviewCandidates,
  corroborateShortsTrack2V3AsrEvidence,
  extractShortsTrack2V3AsrEvidence,
} from './shortsTrack2V3AsrEvidenceService.js'
import { runShortsTrack2V3AsrProvider } from './shortsTrack2V3AsrProviderService.js'
import { evaluateShortsTrack2V3LateRescueSufficiency } from './shortsTrack2V3LateRescueSufficiencyService.js'
import { analyzeShortsTrack2V3AddressSignal } from './shortsTrack2V3AddressSignalService.js'

export const SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS = Object.freeze({
  EXISTING_CANDIDATE: 'EXISTING_CANDIDATE',
  RESCUE_SUFFICIENT: 'RESCUE_SUFFICIENT',
  DISABLED: 'ASR_DISABLED',
  PROVIDER_UNAVAILABLE: 'ASR_PROVIDER_UNAVAILABLE',
  AUDIO_EXTRACTION_FAILED: 'ASR_AUDIO_EXTRACTION_FAILED',
  MEDIA_ACQUISITION_FAILED: 'ASR_MEDIA_ACQUISITION_FAILED',
  TRANSCRIPTION_FAILED: 'ASR_TRANSCRIPTION_FAILED',
  TIMEOUT: 'ASR_TIMEOUT',
  NO_ADDRESS_EVIDENCE: 'ASR_NO_ADDRESS_EVIDENCE',
  PARTIAL_REVIEW_EVIDENCE: 'ASR_PARTIAL_REVIEW_EVIDENCE',
  CANDIDATE_FOUND: 'ASR_CANDIDATE_FOUND',
  VISUAL_PROVIDER_UNAVAILABLE: 'ASR_SKIPPED_VISUAL_PROVIDER_UNAVAILABLE',
  FULL_AUDIO_SKIPPED_WEAK_VISUAL_SIGNAL: 'ASR_FULL_AUDIO_SKIPPED_WEAK_VISUAL_SIGNAL',
})

function safeString(value, maxLength = 1000) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function safeTexts(values = [], maxItems = 80) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => safeString(value, 2000))
    .filter(Boolean))].slice(0, maxItems)
}

function emptyResult(config = {}, reason) {
  return {
    asrFallbackEnabled: Boolean(config.asrFallbackEnabled),
    asrFallbackRan: false,
    asrFallbackReason: reason,
    asrCalled: false,
    asrProvider: null,
    asrModel: config.asrModel || null,
    asrDevice: config.asrDevice || null,
    asrComputeType: config.asrComputeType || null,
    asrRequestedLanguage: config.asrLanguage || null,
    asrDetectedLanguage: null,
    asrTranscriptText: '',
    asrTranscriptSegments: [],
    asrTranscriptSegmentCount: 0,
    asrTranscriptBestSnippets: [],
    asrAddressEvidence: [],
    asrPlaceOrDistrictEvidence: [],
    asrAddressEvidenceCount: 0,
    asrFullAddressEvidenceCount: 0,
    asrPartialAddressEvidenceCount: 0,
    asrPlaceOrDistrictEvidenceCount: 0,
    candidateCountFromAsr: 0,
    asrCandidates: [],
    asrEvidenceBucket: null,
    asrCorroborationType: 'ASR_NO_CORROBORATION',
    asrDirectlyTranscribedNumberForms: [],
    asrNumberAlternatives: [],
    asrSpokenNumberUncertain: false,
    asrNumberConflict: false,
    asrProviderErrors: [],
    asrRuntimeMs: 0,
    asrAudioDurationSeconds: null,
    asrModelLoadCount: 0,
    asrModelReused: false,
    asrUsedSharedVideo: false,
    asrIndependentDownloadCount: 0,
    asrWindowed: false,
    asrOpportunityWindowCount: 0,
    asrWindowCountProcessed: 0,
    asrWindowSecondsProcessed: 0,
    asrFullAudioFallbackRan: false,
    asrOpportunityWindows: [],
  }
}

function mergeWindowProviderResults(results = []) {
  const successful = results.filter((result) => result?.status === 'OK')
  if (!successful.length) return null
  const segments = successful.flatMap((result) => Array.isArray(result.segments) ? result.segments : [])
    .sort((a, b) => Number(a.start || 0) - Number(b.start || 0))
    .slice(0, 500)
  return {
    ...successful[0],
    status: 'OK',
    reason: 'ASR_WINDOW_TRANSCRIPTS_COLLECTED',
    transcriptText: successful.map((result) => safeString(result.transcriptText, 20000)).filter(Boolean).join(' '),
    segments,
    audioDurationSeconds: successful.reduce((sum, result) => sum + Number(result.audioDurationSeconds || 0), 0),
    runtimeMs: results.reduce((sum, result) => sum + Number(result?.runtimeMs || 0), 0),
    modelLoadCount: Math.max(0, ...results.map((result) => Number(result?.modelLoadCount || 0))),
    modelReused: successful.some((result) => result.modelReused),
    usedSharedVideo: successful.some((result) => result.usedSharedVideo),
    independentDownloadCount: results.reduce((sum, result) => sum + Number(result?.independentDownloadCount || 0), 0),
    providerErrors: results.flatMap((result) => Array.isArray(result?.providerErrors) ? result.providerErrors : []).slice(0, 24),
    windowed: true,
  }
}

function shouldAllowFullAudioFallback({ config = {}, visualTexts = [], metadataTexts = [] } = {}) {
  const policy = String(config.asrFullAudioFallbackPolicy || 'strong_signal_only').trim().toLowerCase()
  const visual = safeTexts(visualTexts)
  if (policy === 'always') return true
  if (policy === 'no_visual_text') return visual.length === 0
  if (visual.length === 0) return true
  const signals = [...visual, ...safeTexts(metadataTexts)].map(analyzeShortsTrack2V3AddressSignal)
  return signals.some((signal) => Boolean(
    signal.strongAddressAnchor ||
    signal.signalClass === 'HOUSE_STREET_PARTIAL' ||
    signal.signalClass === 'HOUSE_ADMIN_PARTIAL'
  ))
}

async function runProviderWithOpportunityWindows({ context, config, deps, opportunityWindows = [], allowFullAudioFallback = true } = {}) {
  const windows = config.windowedAsrEnabled !== false && Array.isArray(opportunityWindows)
    ? opportunityWindows.filter((window) => window && Number(window.endSeconds) > Number(window.startSeconds))
    : []
  if (!windows.length) {
    if (!allowFullAudioFallback) {
      return {
        providerResult: {
          status: 'SKIPPED',
          reason: SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS.FULL_AUDIO_SKIPPED_WEAK_VISUAL_SIGNAL,
          called: false,
          providerErrors: [],
        },
        asrWindowed: false,
        asrOpportunityWindowCount: 0,
        asrWindowCountProcessed: 0,
        asrWindowSecondsProcessed: 0,
        asrFullAudioFallbackRan: false,
        asrOpportunityWindows: [],
      }
    }
    return {
      providerResult: await runShortsTrack2V3AsrProvider({ context, config, deps }),
      asrWindowed: false,
      asrOpportunityWindowCount: 0,
      asrWindowCountProcessed: 0,
      asrWindowSecondsProcessed: 0,
      asrFullAudioFallbackRan: true,
      asrOpportunityWindows: [],
    }
  }

  const windowResults = []
  for (const window of windows) {
    const result = await runShortsTrack2V3AsrProvider({
      context,
      config,
      deps,
      opportunityWindow: window,
    })
    windowResults.push(result)
  }
  const merged = mergeWindowProviderResults(windowResults)
  const mergedEvidence = merged ? extractShortsTrack2V3AsrEvidence(merged) : null
  const windowSignalSufficient = Boolean(
    mergedEvidence && (
      mergedEvidence.addressEvidence.length ||
      mergedEvidence.placeOrDistrictEvidence.length
    ),
  )
  if (merged && windowSignalSufficient) {
    return {
      providerResult: merged,
      asrWindowed: true,
      asrOpportunityWindowCount: windows.length,
      asrWindowCountProcessed: windowResults.length,
      asrWindowSecondsProcessed: windows.reduce((sum, window) => sum + Math.max(0, Number(window.endSeconds) - Number(window.startSeconds)), 0),
      asrFullAudioFallbackRan: false,
      asrOpportunityWindows: windows,
    }
  }

  if (!allowFullAudioFallback) {
    return {
      providerResult: merged || {
        status: 'SKIPPED',
        reason: SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS.FULL_AUDIO_SKIPPED_WEAK_VISUAL_SIGNAL,
        called: false,
        providerErrors: [],
      },
      asrWindowed: true,
      asrOpportunityWindowCount: windows.length,
      asrWindowCountProcessed: windowResults.length,
      asrWindowSecondsProcessed: windows.reduce((sum, window) => sum + Math.max(0, Number(window.endSeconds) - Number(window.startSeconds)), 0),
      asrFullAudioFallbackRan: false,
      asrOpportunityWindows: windows,
    }
  }

  const fullResult = await runShortsTrack2V3AsrProvider({ context, config, deps })
  return {
    providerResult: fullResult,
    asrWindowed: true,
    asrOpportunityWindowCount: windows.length,
    asrWindowCountProcessed: windowResults.length,
    asrWindowSecondsProcessed: windows.reduce((sum, window) => sum + Math.max(0, Number(window.endSeconds) - Number(window.startSeconds)), 0),
    asrFullAudioFallbackRan: true,
    asrOpportunityWindows: windows,
  }
}

function providerFailureReason(providerResult = {}) {
  const reason = safeString(providerResult.reason, 120)
  if (reason === SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS.TIMEOUT) return reason
  if (reason === SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS.AUDIO_EXTRACTION_FAILED) return reason
  if (reason === SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS.MEDIA_ACQUISITION_FAILED) return reason
  if (reason === SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS.FULL_AUDIO_SKIPPED_WEAK_VISUAL_SIGNAL) return reason
  if (providerResult.status === 'UNAVAILABLE' || reason === 'ASR_PROVIDER_UNAVAILABLE') {
    return SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS.PROVIDER_UNAVAILABLE
  }
  return SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS.TRANSCRIPTION_FAILED
}

export async function runShortsTrack2V3AsrFallback({
  context = {},
  config = {},
  deps = {},
  existingCandidates = [],
  metadataTexts = [],
  visualTexts = [],
  lateRescueSufficiency = null,
  opportunityWindows = [],
  visualProviderAvailable = true,
} = {}) {
  const sufficiency = lateRescueSufficiency?.lateRescueSufficiencyEvaluated
    ? lateRescueSufficiency
    : evaluateShortsTrack2V3LateRescueSufficiency({ candidates: existingCandidates })
  const eligibilityDiagnostics = {
    preAsrLateRescueSufficiencyEvaluated: Boolean(sufficiency.lateRescueSufficiencyEvaluated),
    preAsrLateRescueSufficient: Boolean(sufficiency.lateRescueSufficient),
    preAsrLateRescueSufficiencyReason: sufficiency.lateRescueSufficiencyReason || null,
    preAsrLateRescueBlockingCandidateCount: Number(sufficiency.lateRescueBlockingCandidateCount || 0),
    preAsrLateRescueNonBlockingCandidateCount: Number(sufficiency.lateRescueNonBlockingCandidateCount || 0),
  }
  const finish = (result) => ({ ...result, ...eligibilityDiagnostics })

  if (sufficiency.lateRescueSufficient) {
    return finish(emptyResult(config, SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS.RESCUE_SUFFICIENT))
  }
  if (!config.asrFallbackEnabled) {
    return finish(emptyResult(config, SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS.DISABLED))
  }
  if (visualProviderAvailable === false) {
    return finish(emptyResult(
      config,
      SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS.VISUAL_PROVIDER_UNAVAILABLE,
    ))
  }

  const allowFullAudioFallback = shouldAllowFullAudioFallback({
    config,
    visualTexts,
    metadataTexts,
  })
  const providerExecution = await runProviderWithOpportunityWindows({
    context,
    config,
    deps,
    opportunityWindows,
    allowFullAudioFallback,
  })
  const providerResult = providerExecution.providerResult
  const asrWindowDiagnostics = {
    asrWindowed: providerExecution.asrWindowed,
    asrOpportunityWindowCount: providerExecution.asrOpportunityWindowCount,
    asrWindowCountProcessed: providerExecution.asrWindowCountProcessed,
    asrWindowSecondsProcessed: Math.round(Number(providerExecution.asrWindowSecondsProcessed || 0) * 1000) / 1000,
    asrFullAudioFallbackRan: providerExecution.asrFullAudioFallbackRan,
    asrOpportunityWindows: providerExecution.asrOpportunityWindows,
  }
  if (providerResult.status !== 'OK') {
    const reason = providerFailureReason(providerResult)
    return finish({
      ...emptyResult(config, reason),
      asrFallbackRan: providerResult.called !== false,
      asrCalled: providerResult.called !== false,
      asrProvider: providerResult.provider || null,
      asrModel: providerResult.model || config.asrModel || null,
      asrDevice: providerResult.device || config.asrDevice || null,
      asrComputeType: providerResult.computeType || config.asrComputeType || null,
      asrRequestedLanguage: providerResult.requestedLanguage || config.asrLanguage || null,
      asrProviderErrors: providerResult.providerErrors || [],
      asrRuntimeMs: providerResult.runtimeMs || 0,
      asrAudioDurationSeconds: providerResult.audioDurationSeconds ?? null,
      asrModelLoadCount: providerResult.modelLoadCount || 0,
      asrModelReused: Boolean(providerResult.modelReused),
      asrUsedSharedVideo: Boolean(providerResult.usedSharedVideo),
      asrIndependentDownloadCount: Number(providerResult.independentDownloadCount || 0),
      ...asrWindowDiagnostics,
    })
  }

  const extracted = extractShortsTrack2V3AsrEvidence(providerResult)
  if (!extracted.segments.length && !extracted.transcriptText) {
    return finish({
      ...emptyResult(config, SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS.TRANSCRIPTION_FAILED),
      asrFallbackRan: true,
      asrCalled: true,
      asrProvider: providerResult.provider,
      asrModel: providerResult.model,
      asrDevice: providerResult.device,
      asrComputeType: providerResult.computeType,
      asrRequestedLanguage: providerResult.requestedLanguage,
      asrDetectedLanguage: providerResult.detectedLanguage,
      asrProviderErrors: [{
        provider: providerResult.provider,
        code: 'ASR_TRANSCRIPTION_FAILED',
        message: 'ASR provider returned no transcript segments.',
      }],
      asrRuntimeMs: providerResult.runtimeMs || 0,
      asrAudioDurationSeconds: providerResult.audioDurationSeconds ?? null,
      asrModelLoadCount: providerResult.modelLoadCount || 0,
      asrModelReused: Boolean(providerResult.modelReused),
      asrUsedSharedVideo: Boolean(providerResult.usedSharedVideo),
      asrIndependentDownloadCount: Number(providerResult.independentDownloadCount || 0),
      ...asrWindowDiagnostics,
    })
  }

  const baseEvidence = extracted.addressEvidence[0] || null
  const corroboration = corroborateShortsTrack2V3AsrEvidence({
    evidence: baseEvidence,
    visualTexts: safeTexts(visualTexts),
    metadataTexts: safeTexts(metadataTexts),
  })
  const addressEvidence = extracted.addressEvidence.map((evidence) => ({
    ...evidence,
    corroborationType: corroboration.type,
    corroboratedRawText: corroboration.matchedRawText || null,
    numberAlternatives: [...corroboration.numberAlternatives],
    spokenNumberUncertain: Boolean(corroboration.spokenNumberUncertain),
    numberConflict: Boolean(corroboration.numberConflict),
    riskFlags: [...new Set([
      ...(evidence.riskFlags || []),
      corroboration.type,
      ...(corroboration.numberConflict ? ['ASR_NUMBER_CONFLICT'] : []),
      ...(corroboration.spokenNumberUncertain ? ['ASR_SPOKEN_NUMBER_UNCERTAIN'] : []),
      'REVIEW_ONLY',
    ])],
  }))
  const asrCandidates = buildShortsTrack2V3AsrReviewCandidates(addressEvidence)
  const fullCount = addressEvidence.filter((item) => item.evidenceType === ASR_EVIDENCE_TYPES.FULL).length
  const partialCount = addressEvidence.filter((item) => item.evidenceType === ASR_EVIDENCE_TYPES.PARTIAL).length
  const fallbackReason = asrCandidates.length
    ? SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS.CANDIDATE_FOUND
    : partialCount
      ? SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS.PARTIAL_REVIEW_EVIDENCE
      : SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS.NO_ADDRESS_EVIDENCE
  const strongestEvidence = addressEvidence[0] || extracted.placeOrDistrictEvidence[0] || null

  return finish({
    asrFallbackEnabled: true,
    asrFallbackRan: true,
    asrFallbackReason: fallbackReason,
    asrCalled: true,
    asrProvider: providerResult.provider,
    asrModel: providerResult.model,
    asrDevice: providerResult.device,
    asrComputeType: providerResult.computeType,
    asrRequestedLanguage: providerResult.requestedLanguage,
    asrDetectedLanguage: providerResult.detectedLanguage,
    asrLanguageProbability: providerResult.languageProbability,
    asrTranscriptText: extracted.transcriptText,
    asrTranscriptSegments: extracted.segments,
    asrTranscriptSegmentCount: extracted.segments.length,
    asrTranscriptBestSnippets: strongestEvidence ? [strongestEvidence.rawText] : [],
    asrAddressEvidence: addressEvidence,
    asrPlaceOrDistrictEvidence: extracted.placeOrDistrictEvidence,
    asrAddressEvidenceCount: addressEvidence.length,
    asrFullAddressEvidenceCount: fullCount,
    asrPartialAddressEvidenceCount: partialCount,
    asrPlaceOrDistrictEvidenceCount: extracted.placeOrDistrictEvidence.length,
    candidateCountFromAsr: asrCandidates.length,
    asrCandidates,
    asrEvidenceBucket: extracted.evidenceBucket,
    asrCorroborationType: corroboration.type,
    asrDirectlyTranscribedNumberForms: strongestEvidence?.directlyTranscribedNumberForms || [],
    asrNumberAlternatives: addressEvidence[0]?.numberAlternatives || [],
    asrSpokenNumberUncertain: Boolean(addressEvidence[0]?.spokenNumberUncertain),
    asrNumberConflict: Boolean(addressEvidence[0]?.numberConflict),
    asrProviderErrors: providerResult.providerErrors || [],
    asrRuntimeMs: providerResult.runtimeMs || 0,
    asrAudioDurationSeconds: providerResult.audioDurationSeconds ?? null,
    asrModelLoadCount: providerResult.modelLoadCount || 0,
    asrModelReused: Boolean(providerResult.modelReused),
    asrUsedSharedVideo: Boolean(providerResult.usedSharedVideo),
    asrIndependentDownloadCount: Number(providerResult.independentDownloadCount || 0),
    ...asrWindowDiagnostics,
  })
}

export default {
  runShortsTrack2V3AsrFallback,
}
