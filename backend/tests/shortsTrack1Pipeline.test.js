import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { runShortsTrack1Pipeline } from '../src/services/shortsTrack1PipelineService.js'

const SHORTS_URL = 'https://www.youtube.com/shorts/abc123DEF45'
const RAW_LAC_URL = 'https://www.youtube.com/shorts/TIflqSNgcl8'
const RAW_LAC_DESCRIPTION = `Lạc Concept
Địa chỉ: Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. HCM
Giá trung bình: 40k - 60k
---------------------
Theo dõi các địa điểm vui chơi, giải trí, trend mới, xu hướng du lịch tại cộng đồng Thánh Riviu 

- Group Thánh Riviu : https://www.facebook.com/groups/riviu...
- Page Thánh Riviu : https://www.facebook.com/Riviu.Official
- Tiktok : https://www.tiktok.com/@thanhriviuoff...
- Instagram : https://www.instagram.com/thanhriviu....
- Youtube : Thánh Riviu
- Liên hệ Email : contact@riviu.vn
#Thanhriviu #riviu #shorts #youtubeshorts #ramen #ramennhat #amthucnhat`
const fixture = JSON.parse(
  readFileSync(
    new URL('./fixtures/youtube-shorts-address-30.json', import.meta.url),
    'utf8',
  ),
)

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
    metadataSource: {
      youtubeApi: true,
      shortsHtml: true,
    },
    ...overrides,
  }
}

function cleanOk(overrides = {}) {
  return {
    status: 'OK',
    normalizedAddress: '39 Nguyen Trai, District 1, TP. Hồ Chí Minh',
    operationsApplied: ['SAFE_ABBREVIATION_EXPANSION'],
    disallowedRepairDetected: false,
    explanation: 'safe clean',
    ...overrides,
  }
}

function placesOk(overrides = {}) {
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
    ...overrides,
  }
}

function confirmOk(overrides = {}) {
  return {
    decision: 'CONFIRMED',
    confidence: 0.95,
    bestPlaceId: 'place-123',
    reasonCodes: ['EXACT_HOUSE_NUMBER', 'STREET_MATCH', 'DISTRICT_MATCH'],
    explanation: 'candidate and place match',
    ...overrides,
  }
}

describe('shortsTrack1Pipeline', () => {
  it('shortsTrack1Pipeline returns Track 1 on the full mocked happy path', async () => {
    const result = await runShortsTrack1Pipeline(SHORTS_URL, {
      fetchShortsMetadata: async () => explicitMetadata(),
      cleanAddressNoRepair: async ({ rawCandidate, sourceType, sourceSnippet }) => {
        assert.equal(rawCandidate, '39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
        assert.equal(sourceType, 'description')
        assert.equal(sourceSnippet, '39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
        return cleanOk()
      },
      confirmAddressWithPlaces: async ({ normalizedAddress, candidateAddress, metadata, shopName }) => {
        assert.equal(normalizedAddress, '39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
        assert.equal(candidateAddress, '39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
        assert.equal(metadata.title, 'Banh Mi with NO Pate?!')
        assert.equal(shopName, 'Banh Mi with NO Pate?!')
        return placesOk()
      },
      confirmExplicitAddressWithGemini: async ({
        sourceType,
        sourceReason,
        cleanedAddress,
        placesCandidates,
      }) => {
        assert.equal(sourceType, 'description')
        assert.equal(sourceReason, 'EXPLICIT_LABEL')
        assert.equal(cleanedAddress, '39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
        assert.equal(placesCandidates.length, 1)
        return confirmOk({ confidence: 0.91 })
      },
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'EXPLICIT_ADDRESS_VERIFIED_BY_PLACES')
    assert.equal(result.address, '39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
    assert.equal(result.normalizedAddress, '39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
    assert.equal(result.addressSource, 'description')
    assert.equal(result.addressEvidenceReason, 'EXPLICIT_LABEL')
    assert.equal(result.placeVerificationStatus, 'PLACES_MATCHED')
    assert.equal(result.placeId, 'place-123')
    assert.equal(result.confidence, 0.95)
    assert.equal(result.stages.confirm.confidence, 0.91)
    assert.equal(result.evidenceSource, 'description')
    assert.equal(result.sourceUrl, SHORTS_URL)
    assert.equal(result.videoId, 'abc123DEF45')
    assert.equal(result.title, 'Banh Mi with NO Pate?!')
    assert.equal(result.stages.router.track, 'TRACK_1')
    assert.equal(result.stages.clean.status, 'OK')
    assert.equal(result.stages.places.candidates.length, 1)
    assert.equal(result.stages.confirm.decision, 'CONFIRMED')
    assert.equal(result.metadata.description, 'Address: 39 Nguyen Trai, District 1, HCMC')
  })

  it('shortsTrack1Pipeline sends only bounded raw description candidate through Track 1 stages', async () => {
    const boundedAddress = 'Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. Hồ Chí Minh'
    const result = await runShortsTrack1Pipeline(RAW_LAC_URL, {
      fetchShortsMetadata: async () => explicitMetadata({
        url: RAW_LAC_URL,
        videoId: 'TIflqSNgcl8',
        title: 'Quán cà phê Nhật Bản giữa lòng Sài Gòn | Thánh Riviu',
        description: RAW_LAC_DESCRIPTION,
      }),
      cleanAddressNoRepair: async ({ rawCandidate, sourceSnippet }) => {
        assert.equal(rawCandidate, boundedAddress)
        assert.equal(sourceSnippet, boundedAddress)
        assert.equal(rawCandidate.includes('Giá trung bình'), false)
        assert.equal(rawCandidate.includes('Theo dõi'), false)
        assert.equal(sourceSnippet.includes('Giá trung bình'), false)
        assert.equal(sourceSnippet.includes('Theo dõi'), false)
        return cleanOk({
          normalizedAddress: boundedAddress,
        })
      },
      confirmAddressWithPlaces: async ({ normalizedAddress, metadata }) => {
        assert.equal(normalizedAddress, boundedAddress)
        assert.equal(metadata.description, RAW_LAC_DESCRIPTION)
        return placesOk({
          placeNameContexts: [{ name: 'Lạc Concept', source: 'description' }],
          candidates: [
            {
              placeId: 'place-lac',
              displayName: 'Lạc Concept',
              formattedAddress: boundedAddress,
              primaryType: 'cafe',
              businessStatus: 'OPERATIONAL',
              movedPlace: null,
              movedPlaceId: null,
            },
          ],
        })
      },
      confirmExplicitAddressWithGemini: async ({ rawCandidate, normalizedCandidate }) => {
        assert.equal(rawCandidate, boundedAddress)
        assert.equal(normalizedCandidate, boundedAddress)
        return confirmOk({
          bestPlaceId: 'place-lac',
        })
      },
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'EXPLICIT_ADDRESS_VERIFIED_BY_PLACES')
    assert.equal(result.evidenceSource, 'description')
    assert.equal(result.stages.router.candidateAddress, boundedAddress)
    assert.equal(result.normalizedAddress, boundedAddress)
    assert.equal(result.placeId, 'place-lac')
  })

  it('shortsTrack1Pipeline returns Track 2 without provider calls when router returns Track 2', async () => {
    let cleanCalls = 0
    let placesCalls = 0
    let confirmCalls = 0
    const result = await runShortsTrack1Pipeline(SHORTS_URL, {
      fetchShortsMetadata: async () => explicitMetadata({
        description: '',
        title: 'NỘM LONG VI DUNG - 23 Hồ Hoàn Kiếm, Quận Hoàn Kiếm, Hà Nội',
      }),
      cleanAddressNoRepair: async () => {
        cleanCalls += 1
        return cleanOk()
      },
      confirmAddressWithPlaces: async () => {
        placesCalls += 1
        return placesOk()
      },
      confirmExplicitAddressWithGemini: async () => {
        confirmCalls += 1
        return confirmOk()
      },
    })

    assert.equal(result.track, 'TRACK_2')
    assert.equal(result.reason, 'TITLE_ONLY')
    assert.equal(cleanCalls, 0)
    assert.equal(placesCalls, 0)
    assert.equal(confirmCalls, 0)
  })

  it('shortsTrack1Pipeline returns Track 2 when clean status is DAMAGED', async () => {
    const result = await runShortsTrack1Pipeline(SHORTS_URL, {
      fetchShortsMetadata: async () => explicitMetadata(),
      cleanAddressNoRepair: async () => cleanOk({
        status: 'DAMAGED',
        normalizedAddress: null,
        operationsApplied: [],
      }),
      confirmAddressWithPlaces: async () => {
        throw new Error('places should not run')
      },
      confirmExplicitAddressWithGemini: async () => {
        throw new Error('confirm should not run')
      },
    })

    assert.equal(result.track, 'TRACK_2')
    assert.equal(result.reason, 'DAMAGED_EVIDENCE')
    assert.equal(result.stages.places, null)
    assert.equal(result.stages.confirm, null)
  })

  it('shortsTrack1Pipeline returns Track 2 when cleaner detects repair', async () => {
    const result = await runShortsTrack1Pipeline(SHORTS_URL, {
      fetchShortsMetadata: async () => explicitMetadata(),
      cleanAddressNoRepair: async () => cleanOk({
        disallowedRepairDetected: true,
        explanation: 'added missing district',
      }),
      confirmAddressWithPlaces: async () => {
        throw new Error('places should not run')
      },
      confirmExplicitAddressWithGemini: async () => {
        throw new Error('confirm should not run')
      },
    })

    assert.equal(result.track, 'TRACK_2')
    assert.equal(result.reason, 'REPAIR_DETECTED')
  })

  it('shortsTrack1Pipeline keeps explicit address Track 1 when Places has no candidates', async () => {
    const result = await runShortsTrack1Pipeline(SHORTS_URL, {
      fetchShortsMetadata: async () => explicitMetadata(),
      cleanAddressNoRepair: async () => cleanOk(),
      confirmAddressWithPlaces: async () => ({
        status: 'PLACES_EMPTY_RESULT',
        candidates: [],
        raw: null,
      }),
      confirmExplicitAddressWithGemini: async () => {
        throw new Error('confirm should not run')
      },
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'EXPLICIT_ADDRESS_UNVERIFIED_BY_PLACES')
    assert.equal(result.placeVerificationStatus, 'PLACES_NO_MATCH')
    assert.equal(result.address, '39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
    assert.equal(result.addressSource, 'description')
    assert.equal(result.addressEvidenceReason, 'EXPLICIT_LABEL')
    assert.equal(result.stages.confirm, null)
  })

  it('shortsTrack1Pipeline keeps explicit address Track 1 and warns when Places errors', async () => {
    let confirmCalls = 0
    const result = await runShortsTrack1Pipeline(SHORTS_URL, {
      fetchShortsMetadata: async () => explicitMetadata(),
      cleanAddressNoRepair: async () => cleanOk(),
      confirmAddressWithPlaces: async () => ({
        status: 'PLACES_PROVIDER_ERROR',
        candidates: [],
        raw: null,
        error: 'PLACES_PROVIDER_ERROR',
        diagnostics: [
          {
            endpoint: 'https://places.googleapis.com/v1/places:searchText',
            httpStatus: 403,
            apiKeyPresent: true,
            message: 'permission denied',
          },
        ],
      }),
      confirmExplicitAddressWithGemini: async () => {
        confirmCalls += 1
        return confirmOk()
      },
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'EXPLICIT_ADDRESS_PLACES_PROVIDER_ERROR')
    assert.equal(result.placeVerificationStatus, 'PLACES_PROVIDER_ERROR')
    assert.equal(result.providerWarnings[0].httpStatus, 403)
    assert.equal(result.providerWarnings[0].apiKeyPresent, true)
    assert.equal(confirmCalls, 0)
    assert.equal(result.stages.places.status, 'PLACES_PROVIDER_ERROR')
    assert.equal(result.stages.confirm, null)
  })

  it('shortsTrack1Pipeline keeps explicit address Track 1 when Places is not confirmed but no hard conflict exists', async () => {
    const result = await runShortsTrack1Pipeline(SHORTS_URL, {
      fetchShortsMetadata: async () => explicitMetadata(),
      cleanAddressNoRepair: async () => cleanOk(),
      confirmAddressWithPlaces: async () => placesOk(),
      confirmExplicitAddressWithGemini: async () => confirmOk({
        confidence: 0.89,
        reasonCodes: ['LOW_CONFIDENCE'],
      }),
    })

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'EXPLICIT_ADDRESS_UNVERIFIED_BY_PLACES')
    assert.equal(result.placeVerificationStatus, 'PLACES_NO_MATCH')
    assert.equal(result.placeId, undefined)
  })

  it('shortsTrack1Pipeline demotes only on hard Places conflict and preserves extracted address stage', async () => {
    const result = await runShortsTrack1Pipeline(SHORTS_URL, {
      fetchShortsMetadata: async () => explicitMetadata(),
      cleanAddressNoRepair: async () => cleanOk(),
      confirmAddressWithPlaces: async () => placesOk(),
      confirmExplicitAddressWithGemini: async () => ({
        decision: 'REJECT_TO_TRACK2',
        confidence: 0.98,
        bestPlaceId: null,
        reasonCodes: ['CONFLICTING_CANDIDATES'],
        explanation: 'same name but different house number',
      }),
    })

    assert.equal(result.track, 'TRACK_2')
    assert.equal(result.reason, 'CONFLICTING_CANDIDATES')
    assert.equal(result.placeVerificationStatus, 'PLACES_CONFLICT')
    assert.equal(result.address, '39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
    assert.equal(result.stages.router.candidateAddress, '39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
    assert.equal(result.stages.clean.normalizedAddress, '39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
    assert.equal(result.stages.confirm.reasonCodes.includes('CONFLICTING_CANDIDATES'), true)
  })

  it('shortsTrack1Pipeline rejects dirty long description candidates before providers', async () => {
    let cleanCalls = 0
    const result = await runShortsTrack1Pipeline(SHORTS_URL, {
      fetchShortsMetadata: async () => explicitMetadata({
        description: `Address: 39 Nguyen Trai, District 1, HCMC ${'menu '.repeat(40)} https://example.com`,
      }),
      cleanAddressNoRepair: async () => {
        cleanCalls += 1
        return cleanOk()
      },
      confirmAddressWithPlaces: async () => placesOk(),
      confirmExplicitAddressWithGemini: async () => confirmOk(),
    })

    assert.equal(result.track, 'TRACK_2')
    assert.equal(result.reason, 'DIRTY_ADDRESS_EVIDENCE')
    assert.equal(cleanCalls, 0)
  })

  it('shortsTrack1Pipeline confirms Places-only evidence cannot create Track 1', async () => {
    let placesCalls = 0
    const result = await runShortsTrack1Pipeline(SHORTS_URL, {
      fetchShortsMetadata: async () => explicitMetadata({
        description: '',
        pageMetadataText: '',
        jsonldObjects: [],
        title: '',
      }),
      cleanAddressNoRepair: async () => cleanOk(),
      confirmAddressWithPlaces: async () => {
        placesCalls += 1
        return placesOk()
      },
      confirmExplicitAddressWithGemini: async () => confirmOk(),
    })

    assert.equal(result.track, 'TRACK_2')
    assert.equal(result.reason, 'NO_EXPLICIT_EVIDENCE')
    assert.equal(placesCalls, 0)
  })

  it('shortsTrack1Pipeline keeps OCR-only fixture evidence in Track 2', async () => {
    const ocrOnly = fixture.cases.find((item) => item.expectedReason === 'OCR_ONLY')
    assert.ok(ocrOnly)

    let cleanCalls = 0
    const result = await runShortsTrack1Pipeline(ocrOnly.url, {
      fetchShortsMetadata: async () => ocrOnly,
      cleanAddressNoRepair: async () => {
        cleanCalls += 1
        return cleanOk()
      },
      confirmAddressWithPlaces: async () => placesOk(),
      confirmExplicitAddressWithGemini: async () => confirmOk(),
    })

    assert.equal(result.track, 'TRACK_2')
    assert.equal(result.reason, 'OCR_ONLY')
    assert.equal(cleanCalls, 0)
  })
})
