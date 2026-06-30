import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cleanAddressNoRepair } from '../src/services/shortsGeminiAddressCleanService.js'
import { confirmExplicitAddressWithGemini } from '../src/services/shortsGeminiAddressConfirmService.js'
import { runShortsTrack1Pipeline } from '../src/services/shortsTrack1PipelineService.js'

const SHORTS_URL = 'https://www.youtube.com/shorts/abc123DEF45'

function explicitMetadata(overrides = {}) {
  return {
    url: SHORTS_URL,
    videoId: 'abc123DEF45',
    title: 'Banh Mi with NO Pate?!',
    description: 'Address: 39 Nguyen Trai, District 1, HCMC',
    pageMetadataText: '',
    serpSnippet: '',
    jsonldObjects: [],
    ocrText: '',
    asrText: '',
    ...overrides,
  }
}

function placesResult() {
  return {
    candidates: [
      {
        placeId: 'place-123',
        displayName: 'Banh Mi Shop',
        formattedAddress: '39 Nguyen Trai, District 1, Ho Chi Minh City',
        primaryType: 'restaurant',
        businessStatus: 'OPERATIONAL',
        movedPlace: null,
        movedPlaceId: null,
      },
    ],
    raw: null,
  }
}

describe('shortsGeminiAddress clean service', () => {
  const expectedTrack1Addresses = [
    '39 Nguyen Trai, District 1, TP. Hồ Chí Minh',
    '52 Nguyen Cong Tru, Ward 19, Binh Thanh District, Ho Chi Minh city',
    'Số 9, ngõ 56 Trần Quang Diệu, phường Ô Chợ Dừa, quận Đống Đa, Hà Nội',
    '28 đường Thảo Điền, phường An Khánh, Quận 2, TP. Hồ Chí Minh',
    'Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. Hồ Chí Minh',
    '92C Cao Thắng, Phường 4, Quận 3, TP. Hồ Chí Minh',
    '284/3 Chợ Lớn (Quận 6, TP. Hồ Chí Minh)',
    '213B Phan Văn Khỏe (Quận 6, TP. Hồ Chí Minh)',
    '14 Trịnh Văn Cấn, Phường Cầu Ông Lãnh, Quận 1, TP. Hồ Chí Minh',
    '371/67A Hẻm 371 Trường Chinh, Phường 14, Quận Tân Bình, TP. Hồ Chí Minh',
  ]

  it('shortsGeminiAddress clean accepts the 10 expected Track 1 bounded addresses without Gemini veto', async () => {
    for (const address of expectedTrack1Addresses) {
      const result = await cleanAddressNoRepair({
        rawCandidate: address,
        sourceType: 'description',
        sourceName: 'EXPLICIT_LABEL',
        sourceSnippet: address,
        geminiClient: async () => {
          throw new Error('Gemini should not be needed for bounded address')
        },
      })

      assert.equal(result.status, 'OK', address)
      assert.ok(result.normalizedAddress, address)
      assert.equal(result.disallowedRepairDetected, false, address)
      assert.equal(result.validationReason, 'bounded_address_like')
    }
  })

  it('shortsGeminiAddress clean OK keeps a Track 1 candidate usable', async () => {
    const result = await cleanAddressNoRepair({
      rawCandidate: '39 Nguyen Trai, District 1, HCMC',
      sourceType: 'description',
      sourceName: 'EXPLICIT_LABEL',
      sourceSnippet: 'Address: 39 Nguyen Trai, District 1, HCMC',
      geminiClient: async (request) => {
        assert.equal(request.input.rawCandidate, '39 Nguyen Trai, District 1, HCMC')
        return {
          status: 'OK',
          normalizedAddress: '39 Nguyen Trai, District 1, TP. Hồ Chí Minh',
          operationsApplied: ['SAFE_ABBREVIATION_EXPANSION'],
          disallowedRepairDetected: false,
          explanation: 'safe abbreviation expansion only',
        }
      },
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.normalizedAddress, '39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
    assert.equal(result.disallowedRepairDetected, false)
  })

  it('shortsGeminiAddress clean returns DAMAGED as a Track 2 rejection signal', async () => {
    const result = await cleanAddressNoRepair({
      rawCandidate: '114 Le Thi Rieng Quan ...',
      geminiClient: async () => ({
        status: 'DAMAGED',
        normalizedAddress: null,
        operationsApplied: [],
        disallowedRepairDetected: false,
        explanation: 'truncated',
      }),
    })

    assert.equal(result.status, 'DAMAGED')
    assert.equal(result.normalizedAddress, null)
  })

  it('shortsGeminiAddress clean returns NO_ADDRESS and MULTIPLE_ADDRESSES as rejection signals', async () => {
    const noAddress = await cleanAddressNoRepair({
      rawCandidate: 'not an address',
      geminiClient: async () => ({
        status: 'NO_ADDRESS',
        normalizedAddress: null,
        operationsApplied: [],
        disallowedRepairDetected: false,
        explanation: 'no address',
      }),
    })
    const multiple = await cleanAddressNoRepair({
      rawCandidate: 'Address: A / Address: B',
      geminiClient: async () => ({
        status: 'MULTIPLE_ADDRESSES',
        normalizedAddress: null,
        operationsApplied: [],
        disallowedRepairDetected: false,
        explanation: 'multiple',
      }),
    })

    assert.equal(noAddress.status, 'NO_ADDRESS')
    assert.equal(multiple.status, 'MULTIPLE_ADDRESSES')
  })

  it('shortsGeminiAddress clean rejects truncated output as damaged evidence', async () => {
    const result = await cleanAddressNoRepair({
      rawCandidate: '114 Le Thi Rieng, Quan ...',
      geminiClient: async () => ({
        status: 'OK',
        normalizedAddress: '114 Lê Thị Riêng, Quận 1, TP. Hồ Chí Minh',
        operationsApplied: ['SAFE_ABBREVIATION_EXPANSION'],
        disallowedRepairDetected: false,
        explanation: 'completed address',
      }),
    })

    assert.equal(result.status, 'DAMAGED')
    assert.equal(result.normalizedAddress, null)
    assert.equal(result.disallowedRepairDetected, true)
    assert.equal(result.validationReason, 'truncated_candidate')
  })

  it('shortsGeminiAddress cleaner is never called for OCR, ASR, SERP, or title-only evidence', async () => {
    const ineligibleCases = [
      explicitMetadata({
        description: 'The address is pinned on screen.',
        ocrText: '52 Nguyễn Công Trứ, Bình Thạnh',
      }),
      explicitMetadata({
        description: 'Nghe video để biết địa chỉ.',
        asrText: 'địa chỉ là 39 Nguyen Trai, District 1, HCMC',
      }),
      explicitMetadata({
        description: '',
        serpSnippet: 'Địa chỉ: 92C Cao Thắng, Quận 3, TP.HCM',
      }),
      explicitMetadata({
        description: '',
        title: 'NỘM LONG VI DUNG - 23 Hồ Hoàn Kiếm, Quận Hoàn Kiếm, Hà Nội',
      }),
    ]

    for (const metadata of ineligibleCases) {
      let cleanCalls = 0
      const result = await runShortsTrack1Pipeline(SHORTS_URL, {
        fetchShortsMetadata: async () => metadata,
        cleanAddressNoRepair: async () => {
          cleanCalls += 1
          return {
            status: 'OK',
            normalizedAddress: 'should not be used',
            operationsApplied: [],
            disallowedRepairDetected: false,
            explanation: '',
          }
        },
      })

      assert.equal(result.track, 'TRACK_2')
      assert.equal(cleanCalls, 0)
    }
  })
})

describe('shortsGeminiAddress confirm service', () => {
  it('shortsGeminiAddress confirm accepts confidence 0.90 only when hard conditions pass', async () => {
    const result = await runShortsTrack1Pipeline(SHORTS_URL, {
      fetchShortsMetadata: async () => explicitMetadata(),
      cleanAddressNoRepair: async () => ({
        status: 'OK',
        normalizedAddress: '39 Nguyen Trai, District 1, TP. Hồ Chí Minh',
        operationsApplied: ['SAFE_ABBREVIATION_EXPANSION'],
        disallowedRepairDetected: false,
        explanation: 'safe clean',
      }),
      confirmAddressWithPlaces: async () => placesResult(),
      confirmExplicitAddressWithGemini: async () => ({
        decision: 'CONFIRMED',
        confidence: 0.9,
        bestPlaceId: 'place-123',
        reasonCodes: ['EXACT_HOUSE_NUMBER', 'STREET_MATCH', 'DISTRICT_MATCH'],
        explanation: 'matched',
      }),
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.confidence, 0.95)
    assert.equal(result.stages.confirm.confidence, 0.9)
    assert.equal(result.placeId, 'place-123')
  })

  it('shortsGeminiAddress confirm confidence 0.89 keeps explicit address unverified', async () => {
    const result = await runShortsTrack1Pipeline(SHORTS_URL, {
      fetchShortsMetadata: async () => explicitMetadata(),
      cleanAddressNoRepair: async () => ({
        status: 'OK',
        normalizedAddress: '39 Nguyen Trai, District 1, TP. Hồ Chí Minh',
        operationsApplied: [],
        disallowedRepairDetected: false,
        explanation: 'safe clean',
      }),
      confirmAddressWithPlaces: async () => placesResult(),
      confirmExplicitAddressWithGemini: async () => ({
        decision: 'CONFIRMED',
        confidence: 0.89,
        bestPlaceId: 'place-123',
        reasonCodes: ['LOW_CONFIDENCE'],
        explanation: 'not enough',
      }),
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'EXPLICIT_ADDRESS_UNVERIFIED_BY_PLACES')
    assert.equal(result.placeVerificationStatus, 'PLACES_NO_MATCH')
    assert.equal(result.placeId, undefined)
  })

  it('shortsGeminiAddress confirm with null bestPlaceId keeps explicit address unverified', async () => {
    const result = await runShortsTrack1Pipeline(SHORTS_URL, {
      fetchShortsMetadata: async () => explicitMetadata(),
      cleanAddressNoRepair: async () => ({
        status: 'OK',
        normalizedAddress: '39 Nguyen Trai, District 1, TP. Hồ Chí Minh',
        operationsApplied: [],
        disallowedRepairDetected: false,
        explanation: 'safe clean',
      }),
      confirmAddressWithPlaces: async () => placesResult(),
      confirmExplicitAddressWithGemini: async () => ({
        decision: 'CONFIRMED',
        confidence: 0.95,
        bestPlaceId: null,
        reasonCodes: ['NO_PLACES_MATCH'],
        explanation: 'no best place',
      }),
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'EXPLICIT_ADDRESS_UNVERIFIED_BY_PLACES')
    assert.equal(result.placeVerificationStatus, 'PLACES_NO_MATCH')
    assert.equal(result.placeId, undefined)
  })

  it('shortsGeminiAddress confirm REJECT_TO_TRACK2 and UNSURE return Track 2', async () => {
    for (const decision of ['REJECT_TO_TRACK2', 'UNSURE']) {
      const result = await runShortsTrack1Pipeline(SHORTS_URL, {
        fetchShortsMetadata: async () => explicitMetadata(),
        cleanAddressNoRepair: async () => ({
          status: 'OK',
          normalizedAddress: '39 Nguyen Trai, District 1, TP. Hồ Chí Minh',
          operationsApplied: [],
          disallowedRepairDetected: false,
          explanation: 'safe clean',
        }),
        confirmAddressWithPlaces: async () => placesResult(),
        confirmExplicitAddressWithGemini: async () => ({
          decision,
          confidence: 0.95,
          bestPlaceId: 'place-123',
          reasonCodes: ['CONFLICTING_CANDIDATES'],
          explanation: decision,
        }),
      })

      assert.equal(result.track, 'TRACK_2')
      assert.equal(result.reason, 'CONFLICTING_CANDIDATES')
    }
  })

  it('shortsGeminiAddress confirm cannot override source eligibility', async () => {
    const result = await confirmExplicitAddressWithGemini({
      sourceType: 'ocr',
      rawCandidate: '52 Nguyễn Công Trứ, Bình Thạnh',
      normalizedCandidate: '52 Nguyễn Công Trứ, Bình Thạnh',
      placesCandidates: placesResult().candidates,
      geminiClient: async () => ({
        decision: 'CONFIRMED',
        confidence: 0.99,
        bestPlaceId: 'place-123',
        reasonCodes: ['EXACT_HOUSE_NUMBER'],
        explanation: 'would match',
      }),
    })

    assert.equal(result.decision, 'REJECT_TO_TRACK2')
    assert.deepEqual(result.reasonCodes, ['SOURCE_NOT_ELIGIBLE'])
  })

  it('shortsGeminiAddress confirm receives original, cleaned, source, context, and Places candidates', async () => {
    let requestBody = null
    const result = await confirmExplicitAddressWithGemini({
      sourceType: 'description',
      sourceReason: 'EXPLICIT_LABEL',
      rawCandidate: 'Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5',
      normalizedCandidate: 'Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. Hồ Chí Minh',
      cleanedAddress: 'Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. Hồ Chí Minh',
      shopName: 'Quán cà phê Nhật Bản giữa lòng Sài Gòn',
      placeNameContexts: [{ name: 'Lạc Concept', source: 'description' }],
      placesCandidates: [
        {
          placeId: 'place-lac',
          displayName: 'Lạc Concept',
          formattedAddress: 'Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. Hồ Chí Minh',
        },
      ],
      geminiClient: async (request) => {
        requestBody = request
        return {
          decision: 'CONFIRMED',
          confidence: 0.91,
          bestPlaceId: 'place-lac',
          reasonCodes: ['EXACT_HOUSE_NUMBER', 'STREET_MATCH', 'DISTRICT_MATCH', 'NAME_MATCH'],
          explanation: 'same address and name',
        }
      },
    })

    assert.equal(result.decision, 'CONFIRMED')
    assert.equal(result.confidence, 0.91)
    assert.equal(requestBody.input.originalCandidateAddress, 'Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5')
    assert.equal(requestBody.input.cleanedAddress, 'Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. Hồ Chí Minh')
    assert.equal(requestBody.input.sourceReason, 'EXPLICIT_LABEL')
    assert.equal(requestBody.input.evidenceSource, 'description')
    assert.deepEqual(requestBody.input.placeNameContexts, [
      { name: 'Lạc Concept', source: 'description' },
    ])
    assert.equal(requestBody.input.placesCandidates[0].placeId, 'place-lac')
    assert.ok(requestBody.rules.rejectIf.includes('PLACE_IS_ONLY_NEARBY_OR_UNRELATED'))
  })
})
