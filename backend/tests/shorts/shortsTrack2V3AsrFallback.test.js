import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getShortsTrack2V3Config } from '../../src/services/shorts/track2-v3/shortsTrack2V3Config.js'
import { runShortsTrack2V3AsrFallback } from '../../src/services/shorts/track2-v3/shortsTrack2V3AsrFallbackService.js'
import { applyShortsTrack2V3CandidateQualityGate } from '../../src/services/shorts/track2-v3/shortsTrack2V3CandidateQualityGateService.js'
import { extractShortsTrack2V3AsrEvidence } from '../../src/services/shorts/track2-v3/shortsTrack2V3AsrEvidenceService.js'
import {
  classifyShortsTrack2V3NumericContexts,
  SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3NumericContextSafetyService.js'

const enabledConfig = Object.freeze({
  ...getShortsTrack2V3Config({}),
  asrFallbackEnabled: true,
  asrTimeoutMs: 1000,
  // These tests exercise ASR evidence extraction itself. Full-audio policy is
  // covered separately by evidence-recovery tests.
  asrFullAudioFallbackPolicy: 'always',
})

function transcriptProvider(text, overrides = {}) {
  return async () => ({
    status: 'OK',
    reason: null,
    called: true,
    provider: 'faster-whisper-local',
    model: 'small',
    device: 'cpu',
    computeType: 'int8',
    requestedLanguage: 'vi',
    detectedLanguage: null,
    languageProbability: null,
    transcriptText: text,
    segments: [{ id: 0, start: 1.25, end: 4.5, text }],
    providerErrors: [],
    runtimeMs: 20,
    audioDurationSeconds: 10,
    modelLoadCount: 1,
    modelReused: false,
    ...overrides,
  })
}

function runTranscript(text, overrides = {}) {
  return runShortsTrack2V3AsrFallback({
    context: { url: 'https://www.youtube.com/shorts/neutral-test' },
    config: enabledConfig,
    deps: { track2V3AsrProvider: transcriptProvider(text, overrides.providerResult) },
    existingCandidates: overrides.existingCandidates || [],
    metadataTexts: overrides.metadataTexts || [],
    visualTexts: overrides.visualTexts || [],
  })
}

describe('Track 2 V3 conservative ASR fallback', () => {
  it('keeps the ASR fallback disabled by default and reads bounded V3 environment config', () => {
    const defaults = getShortsTrack2V3Config({})
    const configured = getShortsTrack2V3Config({
      TRACK2_V3_ASR_FALLBACK_ENABLED: 'true',
      TRACK2_V3_ASR_TIMEOUT_MS: '45000',
      TRACK2_V3_ASR_MODEL: 'small',
      TRACK2_V3_ASR_DEVICE: 'cpu',
      TRACK2_V3_ASR_COMPUTE_TYPE: 'int8',
      TRACK2_V3_ASR_LANGUAGE: 'vi',
      TRACK2_V3_ASR_FULL_AUDIO_FALLBACK_POLICY: 'strong_signal_only',
    })

    assert.equal(defaults.asrFallbackEnabled, false)
    assert.equal(configured.asrFallbackEnabled, true)
    assert.equal(configured.asrTimeoutMs, 45000)
    assert.equal(configured.asrModel, 'small')
    assert.equal(configured.asrDevice, 'cpu')
    assert.equal(configured.asrComputeType, 'int8')
    assert.equal(configured.asrLanguage, 'vi')
    assert.equal(configured.asrFullAudioFallbackPolicy, 'strong_signal_only')
  })

  it('retains a strong full spoken address as an attributed review-only candidate', async () => {
    const rawText = 'địa chỉ quán là 6A đường Tân Quý quận Tân Phú'
    const result = await runTranscript(rawText, { visualTexts: ['O 6'] })

    assert.equal(result.asrEvidenceBucket, 'ASR_FULL_ADDRESS')
    assert.equal(result.asrFullAddressEvidenceCount, 1)
    assert.deepEqual(result.asrDirectlyTranscribedNumberForms, ['6A'])
    assert.deepEqual(result.asrNumberAlternatives, ['6A'])
    assert.equal(result.asrNumberConflict, false)
    assert.equal(result.candidateCountFromAsr, 1)
    assert.equal(result.asrCandidates[0].rawAsrEvidenceText, rawText)
    assert.deepEqual(result.asrCandidates[0].rawAsrSegments, [{
      start: 1.25,
      end: 4.5,
      text: rawText,
    }])
    assert.equal(result.asrCandidates[0].canAutoResolve, false)
    assert.ok(result.asrCandidates[0].riskFlags.includes('REVIEW_ONLY'))

    const gated = applyShortsTrack2V3CandidateQualityGate({
      candidates: result.asrCandidates,
      evidence: result.asrAddressEvidence,
      intent: { mustNotResolve: false, intent: 'UNKNOWN' },
    })
    assert.equal(gated.keptCandidateCount, 1)
    assert.equal(gated.candidates[0].canAutoResolve, false)
    assert.ok(gated.candidates[0].riskFlags.includes('REVIEW_ONLY'))
  })

  it('corroborates raw visual evidence without rewriting either number or street form', async () => {
    const rawAsr = 'hẻm 42,68 đường ôn văn khiêm phường 23 quận Bình Thạnh'
    const rawVisual = '42/68 Ung Văn Khiêm, Q.Bình Thạnh'
    const result = await runTranscript(rawAsr, { visualTexts: [rawVisual] })

    assert.equal(result.asrCorroborationType, 'ASR_CORROBORATES_VISUAL_FRAGMENT')
    assert.equal(result.asrAddressEvidence[0].rawText, rawAsr)
    assert.equal(result.asrAddressEvidence[0].corroboratedRawText, rawVisual)
    assert.ok(result.asrNumberAlternatives.includes('42,68'))
    assert.ok(result.asrNumberAlternatives.includes('42/68'))
    assert.ok(!result.asrNumberAlternatives.includes('23'))
    assert.deepEqual(result.asrDirectlyTranscribedNumberForms, ['42,68', '23'])
    assert.ok(!result.asrCandidates[0].houseNumberAlternatives.includes('23'))
    assert.ok(result.asrAddressEvidence[0].numericContextClassifications.some((item) =>
      item.rawNumberToken === '23' &&
      item.contextClass === SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.ADMIN_NUMBER
    ))
    assert.equal(result.asrSpokenNumberUncertain, true)
    assert.equal(result.asrNumberConflict, true)
    assert.equal(result.asrCandidates[0].canAutoResolve, false)
  })

  it('does not promote a trailing non-house number when an ASR admin word is damaged', async () => {
    const rawAsr = 'Nhà của Pew thì nằm trong hẻm 42,68 đường ôn văn khiêm vườn 23 quận Bình Thạnh.'
    const result = await runTranscript(rawAsr, {
      visualTexts: ['42/68 Ung Văn Khiêm, Q.Bình Thạnh'],
    })

    assert.deepEqual(result.asrDirectlyTranscribedNumberForms, ['42,68', '23'])
    assert.ok(result.asrNumberAlternatives.includes('42,68'))
    assert.ok(result.asrNumberAlternatives.includes('42/68'))
    assert.ok(!result.asrNumberAlternatives.includes('23'))
    assert.ok(!result.asrCandidates[0].houseNumberAlternatives.includes('23'))
    assert.equal(result.asrCandidates[0].rawAsrEvidenceText, rawAsr)
    assert.equal(result.asrCandidates[0].canAutoResolve, false)
    assert.ok(result.asrCandidates[0].riskFlags.includes('REVIEW_ONLY'))
  })

  it('separates a leading house number from ward and district numbers', () => {
    const rawText = '123 Nguyễn Trãi phường 4 quận 5'
    const contexts = classifyShortsTrack2V3NumericContexts({
      text: rawText,
      sourceType: 'ASR_TRANSCRIPT_EVIDENCE',
    })
    const extracted = extractShortsTrack2V3AsrEvidence({
      provider: 'injected-asr',
      model: 'small',
      transcriptText: rawText,
      segments: [{ start: 0, end: 2, text: rawText }],
    })
    const evidence = extracted.addressEvidence[0] || extracted.placeOrDistrictEvidence[0]

    assert.equal(contexts.find((item) => item.rawNumberToken === '123')?.contextClass,
      SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.HOUSE_NUMBER_LIKE)
    assert.equal(contexts.find((item) => item.rawNumberToken === '4')?.contextClass,
      SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.ADMIN_NUMBER)
    assert.equal(contexts.find((item) => item.rawNumberToken === '5')?.contextClass,
      SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.ADMIN_NUMBER)
    assert.deepEqual(evidence.directlyTranscribedNumberForms, ['123', '4', '5'])
    assert.deepEqual(evidence.numberAlternatives, ['123'])
  })

  it('retains partial spoken location evidence without promoting a full candidate', async () => {
    const result = await runTranscript('mở bán tại phố ẩm thực Nguyễn Dữ Lạm')

    assert.equal(result.asrEvidenceBucket, 'ASR_PARTIAL_ADDRESS')
    assert.equal(result.asrPartialAddressEvidenceCount, 1)
    assert.equal(result.asrFullAddressEvidenceCount, 0)
    assert.equal(result.candidateCountFromAsr, 0)
    assert.equal(result.asrFallbackReason, 'ASR_PARTIAL_REVIEW_EVIDENCE')
  })

  it('preserves competing number forms in a damaged partial phrase', async () => {
    const rawText = 'quán nằm tại số 416 đường Ấn Dương Vương vừa 10 quần xáo nha'
    const result = await runTranscript(rawText)

    assert.equal(result.asrEvidenceBucket, 'ASR_PARTIAL_ADDRESS')
    assert.ok(result.asrDirectlyTranscribedNumberForms.includes('416'))
    assert.ok(result.asrDirectlyTranscribedNumberForms.includes('10'))
    assert.equal(result.asrSpokenNumberUncertain, true)
    assert.equal(result.candidateCountFromAsr, 0)
  })

  it('records district-only speech but creates no address candidate', async () => {
    const result = await runTranscript('quán ở quận 4')
    assert.equal(result.asrEvidenceBucket, 'ASR_PLACE_OR_DISTRICT_ONLY')
    assert.equal(result.asrPlaceOrDistrictEvidenceCount, 1)
    assert.equal(result.candidateCountFromAsr, 0)
  })

  it('records city-only speech but creates no address candidate', async () => {
    const result = await runTranscript('buffet sushi ở Sài Gòn')
    assert.equal(result.asrEvidenceBucket, 'ASR_PLACE_OR_DISTRICT_ONLY')
    assert.equal(result.candidateCountFromAsr, 0)
  })

  it('does not interpret ordinary quan-trong speech as an administrative marker', async () => {
    const result = await runTranscript('khẩu vị của bạn mới là quan trọng nhất')
    assert.equal(result.asrEvidenceBucket, 'ASR_NO_ADDRESS_SPEECH_OBSERVED')
    assert.equal(result.asrPlaceOrDistrictEvidenceCount, 0)
    assert.equal(result.candidateCountFromAsr, 0)
  })

  it('does not treat a price as a house number or address candidate', async () => {
    const result = await runTranscript('buffet 169 nghìn ở quận nhất')
    assert.equal(result.candidateCountFromAsr, 0)
    assert.ok(!result.asrDirectlyTranscribedNumberForms.includes('169'))
  })

  it('does not treat opening hours as house numbers or address candidates', async () => {
    const result = await runTranscript('quán bán từ 18 giờ đến 2 giờ sáng')
    assert.equal(result.candidateCountFromAsr, 0)
    assert.deepEqual(result.asrDirectlyTranscribedNumberForms, [])
  })

  it('does not treat a phone number as a house number or address candidate', async () => {
    const result = await runTranscript('gọi số 0901234567 để đặt bàn')
    assert.equal(result.candidateCountFromAsr, 0)
    assert.deepEqual(result.asrDirectlyTranscribedNumberForms, [])
  })

  it('skips ASR when an existing kept candidate is late-rescue sufficient', async () => {
    let calls = 0
    const result = await runShortsTrack2V3AsrFallback({
      config: enabledConfig,
      deps: { track2V3AsrProvider: async () => { calls += 1 } },
      existingCandidates: [{
        id: 'cand:metadata:0',
        type: 'METADATA_ADDRESS',
        addressFragment: '160 Phạm Phú Thứ, P.4, Q.6',
        houseNumberAlternatives: ['160'],
        riskFlags: ['REVIEW_ONLY', 'METADATA_EVIDENCE'],
        canAutoResolve: false,
      }],
    })

    assert.equal(calls, 0)
    assert.equal(result.asrFallbackRan, false)
    assert.equal(result.asrFallbackReason, 'RESCUE_SUFFICIENT')
  })

  it('skips ASR when the fallback is disabled', async () => {
    let calls = 0
    const result = await runShortsTrack2V3AsrFallback({
      config: { ...enabledConfig, asrFallbackEnabled: false },
      deps: { track2V3AsrProvider: async () => { calls += 1 } },
      existingCandidates: [],
    })

    assert.equal(calls, 0)
    assert.equal(result.asrFallbackRan, false)
    assert.equal(result.asrFallbackReason, 'ASR_DISABLED')
  })

  it('keeps provider failures distinct from no-address speech', async () => {
    const result = await runShortsTrack2V3AsrFallback({
      config: enabledConfig,
      deps: {
        track2V3AsrProvider: async () => ({
          status: 'ERROR',
          reason: 'ASR_TRANSCRIPTION_FAILED',
          called: true,
          provider: 'injected-asr',
          providerErrors: [{
            provider: 'injected-asr',
            code: 'ASR_TRANSCRIPTION_FAILED',
            message: 'Injected provider failure.',
          }],
        }),
      },
      existingCandidates: [],
    })

    assert.equal(result.candidateCountFromAsr, 0)
    assert.equal(result.asrFallbackReason, 'ASR_TRANSCRIPTION_FAILED')
    assert.notEqual(result.asrEvidenceBucket, 'ASR_NO_ADDRESS_SPEECH_OBSERVED')
    assert.equal(result.asrProviderErrors[0].code, 'ASR_TRANSCRIPTION_FAILED')
  })
})
