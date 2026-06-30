import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runShortsTrack2Pipeline } from '../src/services/shortsTrack2PipelineService.js'

const SHORTS_URL = 'https://www.youtube.com/shorts/abc123DEF45'

function track1Fallback(overrides = {}) {
  return {
    track: 'TRACK_2',
    reason: 'TITLE_ONLY',
    sourceUrl: SHORTS_URL,
    videoId: 'abc123DEF45',
    metadata: {
      url: SHORTS_URL,
      videoId: 'abc123DEF45',
      title: 'Title-only address candidate',
      description: '',
      metadataSource: {
        youtubeApi: true,
        shortsHtml: true,
      },
    },
    signals: [
      {
        source: 'title',
        rule: 'TITLE_ADDRESS_WITHOUT_EXACT_PREFIX',
        accepted: false,
        reason: 'TITLE_ONLY',
      },
    ],
    stages: {
      router: {
        track: 'TRACK_2',
        reason: 'TITLE_ONLY',
      },
      clean: null,
      places: null,
      confirm: null,
    },
    ...overrides,
  }
}

function cleanOk(overrides = {}) {
  return {
    status: 'OK',
    normalizedAddress: '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh',
    disallowedRepairDetected: false,
    operationsApplied: [],
    ...overrides,
  }
}

function placesOk(overrides = {}) {
  return {
    status: 'PLACES_CANDIDATES_RETURNED',
    candidates: [
      {
        placeId: 'place-123',
        displayName: 'OCR Cafe',
        formattedAddress: '92C Cao Thang, District 3, Ho Chi Minh City',
      },
    ],
    diagnostics: [],
    ...overrides,
  }
}

function confirmOk(overrides = {}) {
  return {
    status: 'OK',
    decision: 'CONFIRMED',
    confidence: 0.9,
    reason: 'CONSISTENT_ADDRESS',
    explanation: '',
    diagnostics: [],
    ...overrides,
  }
}

function audioOk(overrides = {}) {
  return {
    status: 'OK',
    reason: 'MOCK_AUDIO',
    audio: {
      audioPath: 'C:/tmp/shorts-audio.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 4096,
      durationSeconds: 12,
    },
    diagnostics: [],
    ...overrides,
  }
}

function asrProviderResult(text, overrides = {}) {
  return {
    text,
    language: 'vi',
    confidence: 0.9,
    segments: [],
    diagnostics: [],
    ...overrides,
  }
}

function placeSearchCandidate(overrides = {}) {
  return {
    placeId: 'place-ba-hoa',
    displayName: 'Quan Com Ba Hoa',
    formattedAddress: '12 Duong Le Loi, Quan 5, Ho Chi Minh City',
    primaryType: 'restaurant',
    businessStatus: 'OPERATIONAL',
    foundByStrategies: ['place_district_city', 'place_district'],
    queryCount: 2,
    ...overrides,
  }
}

describe('shortsTrack2Pipeline shell', () => {
  it('shortsTrack2Pipeline returns the Phase 2 controlled shell contract by default', async () => {
    const fallback = track1Fallback()

    const output = await runShortsTrack2Pipeline(fallback)

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'UNRESOLVED')
    assert.equal(output.reason, 'OCR_FRAME_EXTRACTION_UNAVAILABLE')
    assert.equal(output.sourceUrl, SHORTS_URL)
    assert.equal(output.videoId, 'abc123DEF45')
    assert.equal(output.metadata, fallback.metadata)
    assert.equal(output.signals, fallback.signals)
    assert.deepEqual(output.candidates, [])
    assert.ok(Array.isArray(output.diagnostics))
    assert.equal(output.stages.track1, fallback.stages)
    assert.deepEqual(output.stages.track2, {
      phase: 'PHASE_2_OCR_COLLECTION',
    })
    assert.equal(output.stages.frameExtraction.status, 'UNAVAILABLE')
    assert.equal(output.stages.ocr.status, 'NO_FRAMES')
  })

  it('shortsTrack2Pipeline Phase 2 collects OCR text with injected providers only', async () => {
    const fallback = track1Fallback()

    const output = await runShortsTrack2Pipeline(fallback, {
      track2FrameExtractor: async () => ({
        status: 'OK',
        reason: 'MOCK_FRAMES',
        sampledTimestamps: [3],
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 3,
            imagePath: 'C:/tmp/frame-0.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
          },
        ],
      }),
      track2OcrProvider: async () => ({
        textBlocks: [
          {
            frameIndex: 0,
            timestampSeconds: 3,
            text: 'visible storefront text',
            confidence: 0.88,
          },
        ],
      }),
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'UNRESOLVED')
    assert.equal(output.reason, 'NO_OCR_ADDRESS_CANDIDATE')
    assert.deepEqual(output.candidates, [])
    assert.equal(output.stages.frameExtraction.status, 'OK')
    assert.equal(output.stages.frameExtraction.frameCount, 1)
    assert.deepEqual(output.stages.ocr.textBlocks, [
      {
        frameIndex: 0,
        timestampSeconds: 3,
        text: 'visible storefront text',
        confidence: 0.88,
      },
    ])
    assert.equal(output.stages.candidateExtraction.status, 'NO_CANDIDATES')
  })

  it('shortsTrack2Pipeline fallback accepts live provider-shaped frame and OCR deps', async () => {
    const fallback = track1Fallback()

    const output = await runShortsTrack2Pipeline(fallback, {
      track2FrameExtractor: async () => ({
        status: 'OK',
        reason: 'LIVE_FRAMES_EXTRACTED',
        sampledTimestamps: [4],
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 4,
            imagePath: 'C:/tmp/live-frame-0.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 2048,
          },
        ],
        diagnostics: [{ code: 'LIVE_FRAME_EXTRACTOR_OK', message: 'mocked live adapter' }],
      }),
      track2OcrProvider: async () => ({
        status: 'OK',
        reason: 'OCR_TEXT_COLLECTED',
        textBlocks: [
          {
            frameIndex: 0,
            timestampSeconds: 4,
            text: 'mock live OCR text',
            confidence: null,
          },
        ],
        diagnostics: [{ code: 'LIVE_OCR_PROVIDER_OK', message: 'mocked live OCR' }],
      }),
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'UNRESOLVED')
    assert.equal(output.stages.frameExtraction.reason, 'LIVE_FRAMES_EXTRACTED')
    assert.equal(output.stages.frameExtraction.frameCount, 1)
    assert.deepEqual(output.stages.ocr.textBlocks, [
      {
        frameIndex: 0,
        timestampSeconds: 4,
        text: 'mock live OCR text',
        confidence: null,
      },
    ])
  })

  it('shortsTrack2Pipeline OCR candidate resolves only after clean + Places + Gemini confirm', async () => {
    let asrCalls = 0
    const output = await runShortsTrack2Pipeline(track1Fallback(), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 3,
            imagePath: 'C:/tmp/frame-0.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
          },
        ],
      }),
      track2OcrProvider: async () => ({
        textBlocks: [
          {
            frameIndex: 0,
            timestampSeconds: 3,
            text: 'Địa chỉ: 92C Cao Thắng, P.4, Q.3, TP.HCM',
            confidence: 0.91,
          },
        ],
      }),
      cleanAddressNoRepair: async ({ rawCandidate }) => {
        assert.equal(rawCandidate, '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh')
        return cleanOk()
      },
      confirmAddressWithPlaces: async ({ metadata, placeNameContexts, shopName }) => {
        assert.deepEqual(metadata, {})
        assert.deepEqual(placeNameContexts, [])
        assert.equal(shopName, '')
        return placesOk()
      },
      confirmTrack2OcrAddressWithGemini: async () => confirmOk({ confidence: 0.88 }),
      asrProvider: async () => {
        asrCalls += 1
      },
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'RESOLVED')
    assert.equal(output.reason, 'OCR_ADDRESS_CONFIRMED')
    assert.equal(output.address, '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh')
    assert.equal(output.normalizedAddress, '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh')
    assert.equal(output.addressSource, 'ocr_frame')
    assert.equal(output.placeId, 'place-123')
    assert.ok(output.confidence >= 0.85)
    assert.ok(output.candidates.length > 0)
    assert.equal(output.candidates[0].sourceType, 'ocr_frame')
    assert.equal(output.candidates[0].verificationReason, 'OCR_ADDRESS_CONFIRMED')
    assert.equal(output.candidates[0].placeVerificationStatus, 'PLACES_MATCHED')
    assert.deepEqual(output.candidates[0].evidence, {
      source: 'ocr',
      text: output.candidates[0].rawText,
      timestampSeconds: 3,
      frameIndex: 0,
    })
    assert.equal(output.candidateCount, 1)
    assert.equal(output.evidence.length, 1)
    assert.equal(output.stages.track2.phase, 'PHASE_4_OCR_CANDIDATE_VERIFICATION')
    assert.equal(output.stages.candidateExtraction.status, 'OK')
    assert.equal(output.stages.verification.status, 'OK')
    assert.equal(asrCalls, 0)
  })

  it('shortsTrack2Pipeline OCR RESOLVED returns before ASR is called', async () => {
    let audioCalls = 0
    let asrCalls = 0
    const output = await runShortsTrack2Pipeline(track1Fallback(), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 3,
            imagePath: 'C:/tmp/frame-0.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
          },
        ],
      }),
      track2OcrProvider: async () => ({
        textBlocks: [
          {
            frameIndex: 0,
            timestampSeconds: 3,
            text: 'Địa chỉ: 92C Cao Thắng, P.4, Q.3, TP.HCM',
            confidence: 0.91,
          },
        ],
      }),
      cleanAddressNoRepair: async ({ rawCandidate }) => cleanOk({ normalizedAddress: rawCandidate }),
      confirmAddressWithPlaces: async () => placesOk(),
      confirmTrack2OcrAddressWithGemini: async () => confirmOk({ confidence: 0.9 }),
      track2AudioExtractor: async () => {
        audioCalls += 1
        throw new Error('ASR audio should not run after OCR RESOLVED')
      },
      track2AsrProvider: async () => {
        asrCalls += 1
        throw new Error('ASR should not run after OCR RESOLVED')
      },
    })

    assert.equal(output.resolution, 'RESOLVED')
    assert.equal(output.reason, 'OCR_ADDRESS_CONFIRMED')
    assert.equal(audioCalls, 0)
    assert.equal(asrCalls, 0)
    assert.equal('audioExtraction' in output.stages, false)
  })

  it('shortsTrack2Pipeline OCR candidate + Places no match does not resolve', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback(), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 3,
            imagePath: 'C:/tmp/frame-0.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
          },
        ],
      }),
      track2OcrProvider: async () => ({
        textBlocks: [
          {
            frameIndex: 0,
            timestampSeconds: 3,
            text: 'Địa chỉ: 92C Cao Thắng, P.4, Q.3, TP.HCM',
            confidence: 0.91,
          },
        ],
      }),
      cleanAddressNoRepair: async () => cleanOk(),
      confirmAddressWithPlaces: async () => placesOk({
        status: 'PLACES_EMPTY_RESULT',
        candidates: [],
      }),
      confirmTrack2OcrAddressWithGemini: async () => {
        throw new Error('Gemini should not run without Places')
      },
    })

    assert.equal(output.track, 'TRACK_2')
    assert.notEqual(output.resolution, 'RESOLVED')
    assert.equal(output.resolution, 'CANDIDATES')
    assert.equal(output.reason, 'PLACES_NOT_CONFIRMED')
    assert.equal(output.stages.verification.reason, 'PLACES_NOT_CONFIRMED')
    assert.equal(output.candidates.length, 1)
    assert.equal(output.candidates[0].verificationReason, 'PLACES_NOT_CONFIRMED')
    assert.equal(output.candidates[0].evidence.source, 'ocr')
  })

  it('preserves an unverified OCR candidate instead of letting place-name safety override it', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback({
      metadata: {
        url: SHORTS_URL,
        videoId: 'abc123DEF45',
        title: 'Quán Nộm Long Vi Dung Hà Nội',
        description: '',
      },
    }), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames: [
          {
            frameIndex: 7,
            timestampSeconds: 53.3,
            imagePath: 'C:/tmp/frame-7.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
          },
        ],
      }),
      track2OcrProvider: async () => ({
        textBlocks: [
          {
            frameIndex: 7,
            timestampSeconds: 53.3,
            text: '23 Hồ Hoàn Kiếm, Q. Hoàn Kiếm, Hà Nội',
            confidence: 0.91,
          },
        ],
      }),
      cleanAddressNoRepair: async ({ rawCandidate }) => cleanOk({
        normalizedAddress: rawCandidate,
      }),
      confirmAddressWithPlaces: async () => placesOk({
        status: 'PLACES_EMPTY_RESULT',
        candidates: [],
      }),
      confirmTrack2OcrAddressWithGemini: async () => {
        throw new Error('Gemini should not run without Places')
      },
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'CANDIDATES')
    assert.equal(output.reason, 'PLACES_NOT_CONFIRMED')
    assert.equal(output.candidates.length, 1)
    assert.equal(output.candidates[0].verificationReason, 'PLACES_NOT_CONFIRMED')
    assert.equal(output.candidates[0].evidence.timestampSeconds, 53.3)
    assert.equal(output.stages.candidateExtraction.candidates.length, 1)
    assert.equal(output.stages.verification.reason, 'PLACES_NOT_CONFIRMED')
    assert.equal('safety' in output.stages, false)
    assert.equal(
      output.diagnostics.some(
        (item) => item.reason === 'OCR_ADDRESS_CANDIDATE_PRESENT',
      ),
      false,
    )
  })

  it('generic list metadata downgrades a verified OCR candidate to NEEDS_REVIEW', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback({
      metadata: {
        url: SHORTS_URL,
        videoId: 'abc123DEF45',
        title: 'Top 5 quan ngon Quan 3',
        description: 'Nhieu dia diem trong mot video',
      },
    }), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames: [{
          frameIndex: 0,
          timestampSeconds: 3,
          imagePath: 'C:/tmp/frame-0.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
        }],
      }),
      track2OcrProvider: async () => ({
        status: 'OK',
        textBlocks: [{
          frameIndex: 0,
          timestampSeconds: 3,
          text: 'Address: 92C Cao Thang, Ward 4, District 3, HCMC',
          confidence: 0.91,
        }],
      }),
      cleanAddressNoRepair: async ({ rawCandidate }) => cleanOk({ normalizedAddress: rawCandidate }),
      confirmAddressWithPlaces: async () => placesOk(),
      confirmTrack2OcrAddressWithGemini: async () => confirmOk({ confidence: 0.9 }),
    })

    assert.equal(output.resolution, 'NEEDS_REVIEW')
    assert.equal(output.reason, 'MULTI_PLACE_OR_LIST_VIDEO')
    assert.equal(output.candidates.length, 1)
    assert.equal(output.candidates[0].sourceType, 'ocr_frame')
    assert.equal(output.candidates[0].evidence.source, 'ocr')
    assert.equal(output.stages.candidateSafety.status, 'BLOCKED')
    assert.equal('address' in output, false)
  })

  it('shortsTrack2Pipeline OCR candidate + Gemini UNSURE does not resolve', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback(), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 3,
            imagePath: 'C:/tmp/frame-0.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
          },
        ],
      }),
      track2OcrProvider: async () => ({
        textBlocks: [
          {
            frameIndex: 0,
            timestampSeconds: 3,
            text: 'Địa chỉ: 92C Cao Thắng, P.4, Q.3, TP.HCM',
            confidence: 0.91,
          },
        ],
      }),
      cleanAddressNoRepair: async () => cleanOk(),
      confirmAddressWithPlaces: async () => placesOk(),
      confirmTrack2OcrAddressWithGemini: async () => confirmOk({
        decision: 'UNSURE',
        confidence: 0.5,
      }),
    })

    assert.equal(output.track, 'TRACK_2')
    assert.notEqual(output.resolution, 'RESOLVED')
    assert.equal(output.resolution, 'CANDIDATES')
    assert.equal(output.reason, 'GEMINI_TRACK2_UNSURE')
  })

  it('shortsTrack2Pipeline OCR candidate + provider error returns controlled non-resolved output', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback(), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 3,
            imagePath: 'C:/tmp/frame-0.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
          },
        ],
      }),
      track2OcrProvider: async () => ({
        textBlocks: [
          {
            frameIndex: 0,
            timestampSeconds: 3,
            text: 'Địa chỉ: 92C Cao Thắng, P.4, Q.3, TP.HCM',
            confidence: 0.91,
          },
        ],
      }),
      cleanAddressNoRepair: async () => cleanOk(),
      confirmAddressWithPlaces: async () => ({
        status: 'PLACES_PROVIDER_ERROR',
        error: 'PLACES_PROVIDER_ERROR',
        candidates: [],
        diagnostics: [{ message: 'provider failed', apiKeyPresent: true }],
      }),
      confirmTrack2OcrAddressWithGemini: async () => {
        throw new Error('Gemini should not run on Places provider error')
      },
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'UNRESOLVED')
    assert.equal(output.reason, 'PLACES_PROVIDER_ERROR')
    assert.equal(output.stages.verification.status, 'ERROR')
  })

  it('shortsTrack2Pipeline OCR text without address returns unresolved no candidate', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback(), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 1,
            imagePath: 'C:/tmp/frame-0.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
          },
        ],
      }),
      track2OcrProvider: async () => ({
        textBlocks: [
          {
            frameIndex: 0,
            timestampSeconds: 1,
            text: 'Bún bò Huế đặc biệt',
            confidence: 0.9,
          },
        ],
      }),
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'UNRESOLVED')
    assert.equal(output.reason, 'NO_OCR_ADDRESS_CANDIDATE')
    assert.deepEqual(output.candidates, [])
    assert.equal(output.stages.candidateExtraction.status, 'NO_CANDIDATES')
  })

  it('shortsTrack2Pipeline multiple OCR addresses returns NEEDS_REVIEW', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback(), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 2,
            imagePath: 'C:/tmp/frame-0.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
          },
        ],
      }),
      track2OcrProvider: async () => ({
        textBlocks: [
          {
            frameIndex: 0,
            timestampSeconds: 2,
            text: `Địa chỉ: 12 Đường A, Phường 1, Quận 1
Địa chỉ: 34 Đường B, Phường 2, Quận 2`,
            confidence: 0.9,
          },
        ],
      }),
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'NEEDS_REVIEW')
    assert.equal(output.reason, 'OCR_CANDIDATES_NEED_REVIEW')
    assert.equal(output.candidates.length, 2)
    assert.equal(output.candidates.every((candidate) => candidate.evidence.source === 'ocr'), true)
    assert.equal(output.candidates.every((candidate) => candidate.verificationReason), true)
    assert.equal(output.stages.candidateExtraction.status, 'NEEDS_REVIEW')
    assert.notEqual(output.resolution, 'RESOLVED')
  })

  it('shortsTrack2Pipeline OCR NEEDS_REVIEW is not overridden by ASR', async () => {
    let audioCalls = 0
    const output = await runShortsTrack2Pipeline(track1Fallback(), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 2,
            imagePath: 'C:/tmp/frame-0.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
          },
        ],
      }),
      track2OcrProvider: async () => ({
        textBlocks: [
          {
            frameIndex: 0,
            timestampSeconds: 2,
            text: `Địa chỉ: 12 Đường A, Phường 1, Quận 1
Địa chỉ: 34 Đường B, Phường 2, Quận 2`,
            confidence: 0.9,
          },
        ],
      }),
      track2AudioExtractor: async () => {
        audioCalls += 1
        return audioOk()
      },
      track2AsrProvider: async () => asrProviderResult(
        'địa chỉ là 92C Đường Cao Thắng, Phường 4, Quận 3, TP.HCM',
      ),
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'NEEDS_REVIEW')
    assert.equal(output.reason, 'OCR_CANDIDATES_NEED_REVIEW')
    assert.equal(audioCalls, 0)
    assert.equal('asr' in output.stages, false)
  })

  it('shortsTrack2Pipeline no OCR candidate + ASR full address verifies to RESOLVED', async () => {
    const asrAddress = '92C Đường Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh'
    const output = await runShortsTrack2Pipeline(track1Fallback({
      metadata: {
        url: SHORTS_URL,
        videoId: 'abc123DEF45',
        title: 'Specific Shop Name must not infer address',
        description: '',
      },
    }), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 1,
            imagePath: 'C:/tmp/frame-0.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
          },
        ],
      }),
      track2OcrProvider: async () => ({
        textBlocks: [
          {
            frameIndex: 0,
            timestampSeconds: 1,
            text: 'Bún bò Huế đặc biệt',
            confidence: 0.9,
          },
        ],
      }),
      track2AudioExtractor: async () => audioOk(),
      track2AsrProvider: async () => asrProviderResult(
        'địa chỉ là 92C Đường Cao Thắng, Phường 4, Quận 3, TP.HCM',
      ),
      cleanAddressNoRepair: async ({ rawCandidate, sourceType }) => {
        assert.equal(sourceType, 'asr_transcript')
        assert.equal(rawCandidate, asrAddress)
        return cleanOk({ normalizedAddress: asrAddress })
      },
      confirmAddressWithPlaces: async ({ metadata, placeNameContexts, shopName }) => {
        assert.deepEqual(metadata, {})
        assert.deepEqual(placeNameContexts, [])
        assert.equal(shopName, '')
        return placesOk()
      },
      confirmTrack2AsrAddressWithGemini: async ({ candidate }) => {
        assert.equal(candidate.sourceType, 'asr_transcript')
        return confirmOk({ confidence: 0.9 })
      },
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'RESOLVED')
    assert.equal(output.reason, 'ASR_ADDRESS_CONFIRMED')
    assert.equal(output.address, asrAddress)
    assert.equal(output.normalizedAddress, asrAddress)
    assert.equal(output.addressSource, 'asr_transcript')
    assert.equal(output.placeId, 'place-123')
    assert.equal(output.stages.track2.phase, 'PHASE_5_ASR_RESOLVER')
    assert.equal(output.stages.asrVerification.status, 'OK')
    assert.equal(output.candidates.some((candidate) => candidate.sourceType === 'asr_transcript'), true)
  })

  it('shortsTrack2Pipeline ASR area-only transcript is not resolved', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback(), {
      track2FrameExtractor: async () => ({ status: 'OK', frames: [] }),
      track2AudioExtractor: async () => audioOk(),
      track2AsrProvider: async () => asrProviderResult('quán ở Quận 5'),
    })

    assert.equal(output.track, 'TRACK_2')
    assert.notEqual(output.resolution, 'RESOLVED')
    assert.equal(output.resolution, 'UNRESOLVED')
    assert.equal(output.reason, 'NO_ASR_ADDRESS_CANDIDATE')
    assert.deepEqual(output.candidates, [])
    assert.equal(output.stages.asrCandidateExtraction.status, 'NO_CANDIDATES')
  })

  it('shortsTrack2Pipeline ASR provider unavailable returns controlled non-resolved output', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback(), {
      track2FrameExtractor: async () => ({ status: 'OK', frames: [] }),
      track2AudioExtractor: async () => audioOk(),
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'UNRESOLVED')
    assert.equal(output.reason, 'ASR_PROVIDER_UNAVAILABLE')
    assert.equal(output.stages.asr.status, 'UNAVAILABLE')
  })

  it('shortsTrack2Pipeline ASR Gemini UNSURE does not resolve', async () => {
    const asrAddress = '92C Đường Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh'
    const output = await runShortsTrack2Pipeline(track1Fallback(), {
      track2FrameExtractor: async () => ({ status: 'OK', frames: [] }),
      track2AudioExtractor: async () => audioOk(),
      track2AsrProvider: async () => asrProviderResult(
        'địa chỉ là 92C Đường Cao Thắng, Phường 4, Quận 3, TP.HCM',
      ),
      cleanAddressNoRepair: async () => cleanOk({ normalizedAddress: asrAddress }),
      confirmAddressWithPlaces: async () => placesOk(),
      confirmTrack2AsrAddressWithGemini: async () => confirmOk({
        decision: 'UNSURE',
        confidence: 0.4,
      }),
    })

    assert.equal(output.track, 'TRACK_2')
    assert.notEqual(output.resolution, 'RESOLVED')
    assert.equal(output.reason, 'ASR_GEMINI_UNSURE')
    assert.equal(output.stages.asrVerification.reason, 'ASR_GEMINI_UNSURE')
  })

  it('shortsTrack2Pipeline multiple ASR addresses returns NEEDS_REVIEW', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback(), {
      track2FrameExtractor: async () => ({ status: 'OK', frames: [] }),
      track2AudioExtractor: async () => audioOk(),
      track2AsrProvider: async () => asrProviderResult(`địa chỉ là 12 Đường A, Phường 1, Quận 1
địa chỉ là 34 Đường B, Phường 2, Quận 2`),
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'NEEDS_REVIEW')
    assert.equal(output.reason, 'ASR_CANDIDATES_NEED_REVIEW')
    assert.equal(output.candidates.filter((candidate) => candidate.sourceType === 'asr_transcript').length, 2)
    assert.notEqual(output.resolution, 'RESOLVED')
  })

  it('shortsTrack2Pipeline no frames returns controlled UNRESOLVED', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback(), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        reason: 'NO_MOCK_FRAMES',
        frames: [],
      }),
      track2OcrProvider: async () => {
        throw new Error('OCR should not run without frames')
      },
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'UNRESOLVED')
    assert.equal(output.reason, 'NO_OCR_TEXT')
    assert.equal(output.stages.frameExtraction.frameCount, 0)
    assert.equal(output.stages.ocr.status, 'NO_FRAMES')
    assert.equal(output.stages.candidateExtraction.status, 'NO_TEXT')
  })

  it('shortsTrack2Pipeline OCR unavailable returns controlled UNRESOLVED', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback(), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames: [
          {
            frameIndex: 0,
            timestampSeconds: 1,
            imagePath: 'C:/tmp/frame-0.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
          },
        ],
      }),
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'UNRESOLVED')
    assert.equal(output.reason, 'OCR_PROVIDER_UNAVAILABLE')
    assert.equal(output.stages.ocr.status, 'UNAVAILABLE')
  })

  it('shortsTrack2Pipeline provider error returns controlled UNRESOLVED', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback(), {
      track2FrameExtractor: async () => {
        throw new Error('mock extractor failed')
      },
      track2OcrProvider: async () => {
        throw new Error('OCR should not run without frames')
      },
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'UNRESOLVED')
    assert.equal(output.reason, 'FRAME_EXTRACTION_PROVIDER_ERROR')
    assert.equal(output.stages.frameExtraction.status, 'ERROR')
    assert.equal(output.stages.ocr.status, 'NO_FRAMES')
  })

  it('shortsTrack2Pipeline does not call metadata, Places, or Gemini providers', async () => {
    const calls = {
      fetchShortsMetadata: 0,
      fetch: 0,
      places: 0,
      gemini: 0,
      asr: 0,
    }

    const output = await runShortsTrack2Pipeline(track1Fallback(), {
      fetchShortsMetadata: async () => {
        calls.fetchShortsMetadata += 1
        throw new Error('metadata fetch should not run')
      },
      fetch: async () => {
        calls.fetch += 1
        throw new Error('network fetch should not run')
      },
      confirmAddressWithPlaces: async () => {
        calls.places += 1
        throw new Error('places should not run')
      },
      confirmExplicitAddressWithGemini: async () => {
        calls.gemini += 1
        throw new Error('gemini should not run')
      },
      asrProvider: async () => {
        calls.asr += 1
        throw new Error('asr should not run')
      },
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(calls.fetchShortsMetadata, 0)
    assert.equal(calls.fetch, 0)
    assert.equal(calls.places, 0)
    assert.equal(calls.gemini, 0)
    assert.equal(calls.asr, 0)
  })

  it('shortsTrack2Pipeline keeps UNRESOLVED as a resolution, not a track', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback())

    assert.notEqual(output.track, 'TRACK_1')
    assert.notEqual(output.track, 'UNRESOLVED')
    assert.notEqual(output.resolution, 'RESOLVED')
    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'UNRESOLVED')
  })

  it('shortsTrack2Pipeline always exposes array candidates and diagnostics', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback({
      signals: null,
    }))

    assert.ok(Array.isArray(output.candidates))
    assert.ok(Array.isArray(output.diagnostics))
    assert.deepEqual(output.candidates, [])
    assert.ok(output.diagnostics.length > 0)
    assert.deepEqual(output.signals, [])
  })

  it('shortsTrack2Pipeline OCR RESOLVED returns before ASR or place inference', async () => {
    const calls = { asr: 0, place: 0 }
    const output = await runShortsTrack2Pipeline(track1Fallback({
      metadata: {
        title: 'Quan Com Ba Hoa Quan 5',
        description: '',
      },
    }), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames: [{ frameIndex: 0, timestampSeconds: 1, imagePath: 'C:/tmp/frame.jpg' }],
      }),
      track2OcrProvider: async () => ({
        textBlocks: [{ text: '12 Duong Le Loi, Phuong 1, Quan 5, TP HCM' }],
      }),
      cleanAddressNoRepair: async ({ rawCandidate }) => cleanOk({ normalizedAddress: rawCandidate }),
      confirmAddressWithPlaces: async () => placesOk({ candidates: [placeSearchCandidate()] }),
      confirmTrack2OcrAddressWithGemini: async () => confirmOk(),
      track2AudioExtractor: async () => {
        calls.asr += 1
        throw new Error('ASR should not run after OCR RESOLVED')
      },
      track2PlaceSearchProvider: async () => {
        calls.place += 1
        throw new Error('place inference should not run after OCR RESOLVED')
      },
    })

    assert.equal(output.resolution, 'RESOLVED')
    assert.equal(output.reason, 'OCR_ADDRESS_CONFIRMED')
    assert.equal(calls.asr, 0)
    assert.equal(calls.place, 0)
  })

  it('shortsTrack2Pipeline OCR NEEDS_REVIEW is not overridden by ASR or place inference', async () => {
    const calls = { asr: 0, place: 0 }
    const output = await runShortsTrack2Pipeline(track1Fallback({
      metadata: {
        title: 'Quan Com Ba Hoa Quan 5',
        description: '',
      },
    }), {
      track2FrameExtractor: async () => ({
        status: 'OK',
        frames: [{ frameIndex: 0, timestampSeconds: 1, imagePath: 'C:/tmp/frame.jpg' }],
      }),
      track2OcrProvider: async () => ({
        textBlocks: [{ text: '12 Duong Le Loi, Phuong 1, Quan 5, TP HCM\n34 Duong Nguyen Trai, Phuong 2, Quan 5, TP HCM' }],
      }),
      track2AudioExtractor: async () => {
        calls.asr += 1
        throw new Error('ASR should not run after OCR NEEDS_REVIEW')
      },
      track2PlaceSearchProvider: async () => {
        calls.place += 1
        throw new Error('place inference should not run after OCR NEEDS_REVIEW')
      },
    })

    assert.equal(output.resolution, 'NEEDS_REVIEW')
    assert.equal(output.reason, 'OCR_CANDIDATES_NEED_REVIEW')
    assert.equal(calls.asr, 0)
    assert.equal(calls.place, 0)
  })

  it('shortsTrack2Pipeline ASR RESOLVED returns before place inference', async () => {
    const calls = { place: 0 }
    const output = await runShortsTrack2Pipeline(track1Fallback({
      metadata: {
        title: 'Quan Com Ba Hoa Quan 5',
        description: '',
      },
    }), {
      track2FrameExtractor: async () => ({ status: 'OK', frames: [] }),
      track2AudioExtractor: async () => audioOk(),
      track2AsrProvider: async () => asrProviderResult('dia chi la 12 Duong Le Loi, Phuong 1, Quan 5, TP HCM'),
      cleanAddressNoRepair: async ({ rawCandidate }) => cleanOk({ normalizedAddress: rawCandidate }),
      confirmAddressWithPlaces: async () => placesOk({ candidates: [placeSearchCandidate()] }),
      confirmTrack2AsrAddressWithGemini: async () => confirmOk(),
      track2PlaceSearchProvider: async () => {
        calls.place += 1
        throw new Error('place inference should not run after ASR RESOLVED')
      },
    })

    assert.equal(output.resolution, 'RESOLVED')
    assert.equal(output.reason, 'ASR_ADDRESS_CONFIRMED')
    assert.equal(calls.place, 0)
  })

  it('shortsTrack2Pipeline ASR NEEDS_REVIEW is not overridden by place inference', async () => {
    const calls = { place: 0 }
    const output = await runShortsTrack2Pipeline(track1Fallback({
      metadata: {
        title: 'Quan Com Ba Hoa Quan 5',
        description: '',
      },
    }), {
      track2FrameExtractor: async () => ({ status: 'OK', frames: [] }),
      track2AudioExtractor: async () => audioOk(),
      track2AsrProvider: async () => asrProviderResult('dia chi la 12 Duong Le Loi, Phuong 1, Quan 5, TP HCM\ndia chi la 34 Duong Nguyen Trai, Phuong 2, Quan 5, TP HCM'),
      track2PlaceSearchProvider: async () => {
        calls.place += 1
        throw new Error('place inference should not run after ASR NEEDS_REVIEW')
      },
    })

    assert.equal(output.resolution, 'NEEDS_REVIEW')
    assert.equal(output.reason, 'ASR_CANDIDATES_NEED_REVIEW')
    assert.equal(calls.place, 0)
  })

  it('shortsTrack2Pipeline generic list title never resolves through place inference', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback({
      metadata: {
        title: 'Top mon ngon Quan 5',
        description: '',
      },
    }), {
      track2FrameExtractor: async () => ({ status: 'OK', frames: [] }),
      track2PlaceSearchProvider: async () => ({
        rawCandidates: [placeSearchCandidate()],
      }),
    })

    assert.notEqual(output.resolution, 'RESOLVED')
    assert.ok(['PLACE_NAME_SAFETY_BLOCKED', 'MULTI_PLACE_OR_LIST_VIDEO'].includes(output.reason))
  })

  it('shortsTrack2Pipeline aggregate shop title never resolves through place inference', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback({
      metadata: {
        title: 'Tong hop quan ngon Binh Thanh',
        description: '',
      },
    }), {
      track2FrameExtractor: async () => ({ status: 'OK', frames: [] }),
      track2PlaceSearchProvider: async () => ({
        rawCandidates: [placeSearchCandidate()],
      }),
    })

    assert.notEqual(output.resolution, 'RESOLVED')
    assert.equal(output.reason, 'MULTI_PLACE_OR_LIST_VIDEO')
  })

  it('shortsTrack2Pipeline resolves specific place only after Places ranking and Gemini confirmation', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback({
      metadata: {
        title: 'Quan Com Ba Hoa Quan 5',
        description: 'Com tam dac biet tai Quan 5',
      },
    }), {
      track2FrameExtractor: async () => ({ status: 'OK', frames: [] }),
      track2PlaceSearchProvider: async () => ({
        rawCandidates: [placeSearchCandidate()],
      }),
      geminiClient: async () => ({
        decision: 'CONFIRMED',
        confidence: 0.91,
        reason: 'SINGLE_PLACE_MATCH',
        explanation: 'Metadata is about the same single place.',
      }),
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'RESOLVED')
    assert.equal(output.reason, 'PLACE_NAME_CONFIRMED')
    assert.equal(output.addressSource, 'place_name_inference')
    assert.equal(output.address, '12 Duong Le Loi, Quan 5, Ho Chi Minh City')
    assert.equal(output.placeId, 'place-ba-hoa')
    assert.equal(output.candidates[0].sourceType, 'place_name_inference')
    assert.equal(output.candidates[0].evidence.source, 'places')
    assert.ok(output.stages.safety)
    assert.ok(output.stages.placeNameSignals)
    assert.ok(output.stages.placeSearch)
    assert.ok(output.stages.placeRanking)
    assert.ok(output.stages.placeConfirm)
  })

  it('shortsTrack2Pipeline Gemini UNSURE does not resolve place inference', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback({
      metadata: {
        title: 'Quan Com Ba Hoa Quan 5',
        description: 'Com tam dac biet tai Quan 5',
      },
    }), {
      track2FrameExtractor: async () => ({ status: 'OK', frames: [] }),
      track2PlaceSearchProvider: async () => ({
        rawCandidates: [placeSearchCandidate()],
      }),
      geminiClient: async () => ({
        decision: 'UNSURE',
        confidence: 0.5,
        reason: 'INSUFFICIENT_CONTEXT',
      }),
    })

    assert.notEqual(output.resolution, 'RESOLVED')
    assert.equal(output.reason, 'PLACE_NAME_GEMINI_UNSURE')
  })

  it('shortsTrack2Pipeline weak place ranking does not resolve place inference', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback({
      metadata: {
        title: 'Quan Com Ba Hoa Quan 5',
        description: 'Com tam dac biet tai Quan 5',
      },
    }), {
      track2FrameExtractor: async () => ({ status: 'OK', frames: [] }),
      track2PlaceSearchProvider: async () => ({
        rawCandidates: [
          placeSearchCandidate({
            placeId: 'place-other',
            displayName: 'Cafe Khac',
            formattedAddress: '99 Le Loi, Quan 5, Ho Chi Minh City',
            foundByStrategies: ['place_area'],
            queryCount: 1,
          }),
        ],
      }),
      geminiClient: async () => {
        throw new Error('Gemini should not run for weak candidate')
      },
    })

    assert.notEqual(output.resolution, 'RESOLVED')
    assert.equal(output.reason, 'PLACE_NAME_CANDIDATES_UNVERIFIED')
    assert.equal(output.resolution, 'CANDIDATES')
    assert.equal(output.candidates.length, 1)
    assert.equal(output.candidates[0].sourceType, 'place_name_inference')
    assert.equal(output.candidates[0].evidence.source, 'places')
  })

  it('shortsTrack2Pipeline multi-place description returns NEEDS_REVIEW', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback({
      metadata: {
        title: 'Quan Com Ba Hoa Quan 5',
        description: '- Quan Com Ba Hoa Quan 5\n- Quan Bun Sau Quan 5',
      },
    }), {
      track2FrameExtractor: async () => ({ status: 'OK', frames: [] }),
      track2PlaceSearchProvider: async () => ({
        rawCandidates: [placeSearchCandidate()],
      }),
    })

    assert.equal(output.resolution, 'NEEDS_REVIEW')
    assert.equal(output.reason, 'PLACE_NAME_NEEDS_REVIEW')
  })

  it('shortsTrack2Pipeline place search provider error is controlled', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback({
      metadata: {
        title: 'Quan Com Ba Hoa Quan 5',
        description: 'Com tam dac biet tai Quan 5',
      },
    }), {
      track2FrameExtractor: async () => ({ status: 'OK', frames: [] }),
      track2PlaceSearchProvider: async () => {
        throw new Error('provider down')
      },
    })

    assert.equal(output.track, 'TRACK_2')
    assert.equal(output.resolution, 'UNRESOLVED')
    assert.equal(output.reason, 'PLACE_NAME_PROVIDER_ERROR')
    assert.ok(Array.isArray(output.diagnostics))
  })

  it('shortsTrack2Pipeline place inference never returns invalid track values', async () => {
    const output = await runShortsTrack2Pipeline(track1Fallback({
      metadata: {
        title: 'Quan Com Ba Hoa Quan 5',
        description: 'Com tam dac biet tai Quan 5',
      },
    }), {
      track2FrameExtractor: async () => ({ status: 'OK', frames: [] }),
      track2PlaceSearchProvider: async () => ({
        rawCandidates: [placeSearchCandidate()],
      }),
      geminiClient: async () => ({
        decision: 'CONFIRMED',
        confidence: 0.9,
        reason: 'SINGLE_PLACE_MATCH',
      }),
    })

    assert.notEqual(output.track, 'TRACK_1')
    assert.notEqual(output.track, 'UNRESOLVED')
    assert.equal(output.track, 'TRACK_2')
  })
})
