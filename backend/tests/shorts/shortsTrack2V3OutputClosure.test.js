import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { mapShortsTrack2V3ToVisionAutoResponse } from '../../services/visionAuto/visionAutoTrack2V3AdapterService.js'
import { buildVisionAutoTrack2V3ProductClue } from '../../services/visionAuto/visionAutoTrack2V3ProductClueService.js'
import { analyzeShortsTrack2V3AddressSignal } from '../../src/services/shorts/track2-v3/shortsTrack2V3AddressSignalService.js'
import { buildShortsTrack2V3Candidates } from '../../src/services/shorts/track2-v3/shortsTrack2V3CandidateBuilderService.js'
import { applyShortsTrack2V3CandidateQualityGate } from '../../src/services/shorts/track2-v3/shortsTrack2V3CandidateQualityGateService.js'
import { extractShortsTrack2V3AsrEvidence } from '../../src/services/shorts/track2-v3/shortsTrack2V3AsrEvidenceService.js'
import { classifyShortsTrack2V3Intent } from '../../src/services/shorts/track2-v3/shortsTrack2V3IntentClassifierService.js'
import {
  classifyShortsTrack2V3NumericContexts,
  SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3NumericContextSafetyService.js'

const input = { type: 'youtube_url', url: 'https://www.youtube.com/shorts/output-closure' }

function asr(text, segments = null) {
  return extractShortsTrack2V3AsrEvidence({
    provider: 'injected-asr',
    model: 'small',
    transcriptText: text,
    segments: segments || [{ id: 0, start: 0, end: 4, text }],
  })
}

function metadataCandidate(address) {
  return {
    id: 'cand:metadata:0',
    type: 'METADATA_ADDRESS',
    addressFragment: address,
    displayText: address,
    evidenceIds: ['metadata:description:0'],
    riskFlags: ['REVIEW_ONLY'],
    canAutoResolve: false,
  }
}

describe('Track 2 V3 output closure semantics', () => {
  it('recognizes generalized alphanumeric, range, branch-separated, and numeric-suffix address structures', () => {
    const cases = [
      ['8D1 Thai Van Lung, Quận 1, TP.HCM', 'STRONG_ADDRESS_ANCHOR'],
      ['165-167 Núi Thành', 'HOUSE_STREET_PARTIAL'],
      ['95-97 AulCo, Quận 11 (gần quận 10)', 'STRONG_ADDRESS_ANCHOR'],
      ['(Cs1\\165\\Nai\\Thanh)', 'HOUSE_STREET_PARTIAL'],
      ['21 Nại Tú 2', 'HOUSE_STREET_PARTIAL'],
      ['105 Nguyễn Thiện Kế', 'HOUSE_STREET_PARTIAL'],
    ]

    for (const [text, expectedClass] of cases) {
      const signal = analyzeShortsTrack2V3AddressSignal(text)
      assert.equal(signal.signalClass, expectedClass, text)
      assert.equal(signal.composableAddressSignal, true, text)
    }
  })

  it('keeps measurement, ingredient, and cooking-action numbers out of address semantics', () => {
    for (const text of ['2m đường', '1/2m hạt nêm']) {
      const signal = analyzeShortsTrack2V3AddressSignal(text)
      assert.equal(signal.signalClass, 'NON_ADDRESS', text)
      assert.equal(signal.composableAddressSignal, false, text)
    }

    const contexts = classifyShortsTrack2V3NumericContexts({
      text: 'khứa 1 đường trên lưng',
      sourceType: 'ASR_TRANSCRIPT_EVIDENCE',
    })
    assert.notEqual(
      contexts.find((item) => item.rawNumberToken === '1')?.contextClass,
      SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES.HOUSE_NUMBER_LIKE,
    )
  })

  it('recovers a spoken address whose street ends with a numeric suffix', () => {
    const text = 'Và đây là quán Châu Sơn, 21 nại tú 2 nha các bạn!'
    const extracted = asr(text)
    assert.equal(extracted.evidenceBucket, 'ASR_FULL_ADDRESS')
    assert.equal(extracted.addressEvidence[0].addressText, '21 nại tú 2')
    assert.deepEqual(extracted.addressEvidence[0].candidateNumberForms, ['21'])
  })

  it('recovers a spoken implicit address after a bounded de-day location cue', () => {
    const text = 'Chá cả thì tôi để đây, bánh xe nhung 105 nguyễn thiện kế nha'
    const extracted = asr(text)
    assert.equal(extracted.evidenceBucket, 'ASR_FULL_ADDRESS')
    assert.equal(extracted.addressEvidence[0].addressText, '105 nguyễn thiện kế')
  })

  it('does not promote ordinary counts or small quantities into spoken full addresses', () => {
    for (const text of ['1 là ngon nhất rồi nha', 'quán có 2 tầng rộng lắm']) {
      const extracted = asr(text)
      assert.notEqual(extracted.evidenceBucket, 'ASR_FULL_ADDRESS', text)
    }
  })

  it('keeps a bounded branch-label OCR address as review-only', () => {
    const rawText = '(Cs1\\165\\Nai\\Thanh)'
    const evidence = [{
      id: 'ev:ocr:branch',
      source: 'local_tesseract',
      sourceType: 'smart_overlay_dynamic_text_region',
      rawText,
      normalizedText: rawText,
      confidence: 0.7,
    }]
    const built = buildShortsTrack2V3Candidates({
      evidence,
      intent: { intent: 'SINGLE_PLACE_LIKELY', mustNotResolve: false },
    })
    const gated = applyShortsTrack2V3CandidateQualityGate({
      candidates: built.candidates,
      evidence,
      intent: { intent: 'SINGLE_PLACE_LIKELY', mustNotResolve: false },
    })

    assert.equal(gated.keptCandidateCount, 1)
    assert.equal(gated.candidates[0].qualityGateReason, 'PARTIAL_HOUSE_STREET_REVIEW')
    assert.equal(gated.candidates[0].canAutoResolve, false)
  })

  it('treats generic addresses-in-video description copy as a weak hint, not a listicle lock', () => {
    const intent = classifyShortsTrack2V3Intent({
      description: 'Địa chỉ các nơi trong video ở phần mô tả này.',
    })
    assert.equal(intent.mustNotResolve, false)
    assert.equal(intent.intent, 'UNKNOWN')
  })

  it('still locks explicit numbered listicle titles as multi-place', () => {
    const intent = classifyShortsTrack2V3Intent({ title: '5 quán hủ tiếu nổi bật tại Cần Thơ' })
    assert.equal(intent.intent, 'MULTI_PLACE_OR_LIST')
    assert.equal(intent.inputClass, 'MULTI_PLACE_LISTICLE')
    assert.equal(intent.mustNotResolve, true)
  })

  it('lets explicit recipe intent beat a generic creator description template', () => {
    const intent = classifyShortsTrack2V3Intent({
      title: 'Cách làm gà chiên nước tương tại nhà',
      description: 'Địa chỉ các nơi trong video ở phần mô tả này.',
    })
    assert.equal(intent.intent, 'NO_ADDRESS_INTENT')
    assert.equal(intent.inputClass, 'RELEVANT_NEGATIVE')
    assert.equal(intent.mustNotResolve, false)
  })

  it('publishes a historical metadata address only as a review candidate', () => {
    const address = '225/3 Nguyễn Đình Chiểu, P. 5, Q. 3, TP. HCM'
    const response = mapShortsTrack2V3ToVisionAutoResponse({
      input,
      track2Result: {
        intent: 'MULTI_PLACE_OR_LIST',
        intentReason: 'DESCRIPTION_ADDRESSES_OF_PLACES',
        inputClass: 'MULTI_PLACE_LISTICLE',
        mustNotResolve: true,
        candidates: [metadataCandidate(address)],
        evidence: [{ id: 'metadata:description:0', sourceType: 'metadata_text', rawText: address }],
      },
    })

    assert.equal(response.status, 'review_candidates')
    assert.equal(response.reviewRequired, true)
    assert.equal(response.reviewCandidates[0].address, address)
    assert.equal(response.reviewCandidates[0].canAutoResolve, false)
    assert.equal('places' in response, false)
  })

  it('publishes an ASR address only as a sanitized review candidate', () => {
    const text = 'Và đây là quán Châu Sơn, 21 nại tú 2 nha các bạn!'
    const response = mapShortsTrack2V3ToVisionAutoResponse({
      input,
      track2Result: {
        intent: 'SINGLE_PLACE_LIKELY',
        inputClass: 'SINGLE_PLACE',
        candidates: [],
        evidence: [],
        asrTranscriptText: text,
        asrTranscriptSegments: [{ id: 22, start: 95.02, end: 100.14, text }],
        asrProvider: 'faster-whisper-local',
        asrModel: 'small',
      },
    })

    assert.equal(response.status, 'review_candidates')
    assert.equal(response.reviewRequired, true)
    assert.equal(response.reviewCandidates[0].canAutoResolve, false)
    assert.equal(response.reviewCandidates[0].sourceType, 'review_candidate')
    assert.equal(JSON.stringify(response).includes('faster-whisper-local'), false)
  })

  it('publishes an observed place/locality clue without inventing an exact address', () => {
    const transcriptText = 'Tới phức hãi thì ghé quán hầu quý mập. Quán hầu quý mập ở phức hãi rất đông.'
    const clue = buildVisionAutoTrack2V3ProductClue({
      intent: 'SINGLE_PLACE_LIKELY',
      inputClass: 'SINGLE_PLACE',
      asrTranscriptText: transcriptText,
      asrTranscriptSegments: [{ id: 0, start: 1, end: 6, text: transcriptText }],
    })
    assert.equal(clue.kind, 'PARTIAL_LOCATION_CLUE')
    assert.equal(clue.placeName, 'hầu quý mập')
    assert.equal(clue.locality, 'phức hãi')
    assert.equal(clue.address, null)
    assert.equal(clue.exactAddressRecovered, false)
  })

  it('publishes a public-metadata place and locality only as a review clue', () => {
    const response = mapShortsTrack2V3ToVisionAutoResponse({
      input,
      track2Result: {
        intent: 'SINGLE_PLACE_LIKELY',
        inputClass: 'SINGLE_PLACE',
        candidates: [],
        evidence: [],
        sourceMetadata: {
          title: 'Đến Phước Hải mà ghé quán này',
          chapters: [{
            title: 'Giới thiệu quán Hàu Quý Mập Phước Hải',
            startSeconds: 0,
            endSeconds: 8,
          }],
        },
      },
    })

    assert.equal(response.status, 'review_candidates')
    assert.equal(response.reviewCandidates[0].placeName, 'Hàu Quý Mập')
    assert.equal(response.reviewCandidates[0].address, 'Phước Hải')
    assert.equal(response.reviewCandidates[0].canAutoResolve, false)
  })

  it('returns honest multi-place source context when no item location is resolved', () => {
    const response = mapShortsTrack2V3ToVisionAutoResponse({
      input,
      track2Result: {
        intent: 'MULTI_PLACE_OR_LIST',
        inputClass: 'MULTI_PLACE_LISTICLE',
        mustNotResolve: true,
        candidates: [],
        evidence: [],
      },
    })
    assert.equal(response.status, 'not_found')
    assert.equal(response.sourceContext.isMultiPlace, true)
    assert.deepEqual(response.places, [])
  })

  it('publishes one listicle OCR hypothesis only as review-only evidence', () => {
    const address = '10 Huỳnh Thúc Kháng, Quận 1'
    const response = mapShortsTrack2V3ToVisionAutoResponse({
      input,
      track2Result: {
        intent: 'MULTI_PLACE_OR_LIST',
        inputClass: 'MULTI_PLACE_LISTICLE',
        mustNotResolve: true,
        candidates: [{
          id: 'cand:item:1',
          type: 'OCR_ADDRESS_FRAGMENT',
          addressFragment: address,
          displayText: address,
          evidenceIds: ['ev:item:1'],
          qualityGateReason: 'ADDRESS_ANCHORED',
          riskFlags: ['REVIEW_ONLY'],
          canAutoResolve: false,
        }],
        evidence: [{ id: 'ev:item:1', rawText: address, segmentId: 'segment-001', timestampSeconds: 5 }],
      },
    })
    assert.equal(response.status, 'review_candidates')
    assert.equal(response.sourceContext.isMultiPlace, true)
    assert.equal(response.reviewCandidates.length, 1)
    assert.equal(response.reviewCandidates[0].canAutoResolve, false)
    assert.equal('places' in response, false)
  })

  it('publishes multiple OCR hypotheses as separate review-only candidates', () => {
    const addresses = [
      ['10 Huỳnh Thúc Kháng, Quận 1', 'segment-001', 5],
      ['35 Đặng Dung, Quận 1', 'segment-002', 25],
    ]
    const response = mapShortsTrack2V3ToVisionAutoResponse({
      input,
      track2Result: {
        intent: 'MULTI_PLACE_OR_LIST',
        inputClass: 'MULTI_PLACE_LISTICLE',
        mustNotResolve: true,
        candidates: addresses.map(([address], index) => ({
          id: `cand:${index}`,
          type: 'OCR_ADDRESS_FRAGMENT',
          addressFragment: address,
          displayText: address,
          evidenceIds: [`ev:${index}`],
          qualityGateReason: 'ADDRESS_ANCHORED',
          riskFlags: ['REVIEW_ONLY'],
          canAutoResolve: false,
        })),
        evidence: addresses.map(([address, segmentId, timestampSeconds], index) => ({
          id: `ev:${index}`,
          rawText: address,
          segmentId,
          timestampSeconds,
        })),
      },
    })
    assert.equal(response.status, 'review_candidates')
    assert.equal(response.sourceContext.isMultiPlace, true)
    assert.equal(response.reviewCandidates.length, 2)
    assert.equal(response.reviewCandidates.every((candidate) => candidate.canAutoResolve === false), true)
    assert.equal('places' in response, false)
  })
})
