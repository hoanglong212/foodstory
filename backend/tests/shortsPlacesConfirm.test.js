import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runShortsTrack1Pipeline } from '../src/services/shortsTrack1PipelineService.js'
import {
  __shortsPlacesConfirmTestUtils,
  confirmAddressWithPlaces,
} from '../src/services/shortsPlacesConfirmService.js'

const SHORTS_URL = 'https://www.youtube.com/shorts/abc123DEF45'

describe('shortsPlacesConfirm', () => {
  it('shortsPlacesConfirm sends Text Search with the required FieldMask and maps candidates', async () => {
    const calls = []
    const fetch = async (url, options) => {
      calls.push({ url: String(url), options })
      if (String(url) === __shortsPlacesConfirmTestUtils.TEXT_SEARCH_URL) {
        return {
          ok: true,
          json: async () => ({
            places: [
              {
                id: 'place-123',
                displayName: { text: 'Banh Mi Shop' },
                formattedAddress: '39 Nguyen Trai, District 1, Ho Chi Minh City',
                primaryType: 'restaurant',
                businessStatus: 'OPERATIONAL',
              },
            ],
          }),
        }
      }

      if (String(url) === 'https://places.googleapis.com/v1/places/place-123') {
        return {
          ok: true,
          json: async () => ({
            id: 'place-123',
            displayName: { text: 'Banh Mi Shop Details' },
            formattedAddress: '39 Nguyen Trai, District 1, Ho Chi Minh City',
            primaryType: 'restaurant',
            businessStatus: 'OPERATIONAL',
            moved_place_id: 'moved-456',
          }),
        }
      }

      throw new Error(`unexpected fetch ${url}`)
    }

    const result = await confirmAddressWithPlaces({
      normalizedAddress: '39 Nguyen Trai, District 1, TP. Hồ Chí Minh',
      shopName: 'Banh Mi with NO Pate?!',
      googlePlacesApiKey: 'places-key',
      fetch,
    })

    assert.equal(calls.length, 3)
    assert.equal(calls[0].options.method, 'POST')
    assert.equal(
      calls[0].options.headers['X-Goog-FieldMask'],
      __shortsPlacesConfirmTestUtils.TEXT_SEARCH_FIELD_MASK,
    )
    assert.equal(calls[0].options.headers['X-Goog-Api-Key'], 'places-key')
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      textQuery: 'Banh Mi with NO Pate?!, 39 Nguyen Trai, District 1, TP. Hồ Chí Minh',
      languageCode: 'vi',
      regionCode: 'VN',
      pageSize: 5,
    })
    assert.equal(calls[1].options.method, 'POST')
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      textQuery: '39 Nguyen Trai, District 1, TP. Hồ Chí Minh',
      languageCode: 'vi',
      regionCode: 'VN',
      pageSize: 5,
    })
    assert.equal(calls[2].options.method, 'GET')
    assert.equal(
      calls[2].options.headers['X-Goog-FieldMask'],
      __shortsPlacesConfirmTestUtils.DETAILS_FIELD_MASK,
    )

    assert.equal(result.status, 'PLACES_CANDIDATES_RETURNED')
    assert.equal(result.candidates.length, 1)
    assert.deepEqual(
      {
        placeId: result.candidates[0].placeId,
        displayName: result.candidates[0].displayName,
        formattedAddress: result.candidates[0].formattedAddress,
        primaryType: result.candidates[0].primaryType,
        businessStatus: result.candidates[0].businessStatus,
        movedPlace: result.candidates[0].movedPlace,
        movedPlaceId: result.candidates[0].movedPlaceId,
      },
      {
        placeId: 'place-123',
        displayName: 'Banh Mi Shop Details',
        formattedAddress: '39 Nguyen Trai, District 1, Ho Chi Minh City',
        primaryType: 'restaurant',
        businessStatus: 'OPERATIONAL',
        movedPlace: null,
        movedPlaceId: 'moved-456',
      },
    )
    assert.equal(
      result.candidates[0].queryText,
      'Banh Mi with NO Pate?!, 39 Nguyen Trai, District 1, TP. Hồ Chí Minh',
    )
    assert.equal(result.candidates[0].queryContextSource, 'title')
    assert.deepEqual(result.diagnostics, [])
    assert.equal(result.queryAttempts[0].textQuery, 'Banh Mi with NO Pate?!, 39 Nguyen Trai, District 1, TP. Hồ Chí Minh')
  })

  it('shortsPlacesConfirm handles empty candidates', async () => {
    const result = await confirmAddressWithPlaces({
      normalizedAddress: '39 Nguyen Trai, District 1, TP. Hồ Chí Minh',
      googlePlacesApiKey: 'places-key',
      fetch: async () => ({
        ok: true,
        json: async () => ({ places: [] }),
      }),
    })

    assert.equal(result.status, 'PLACES_EMPTY_RESULT')
    assert.deepEqual(result.candidates, [])
    assert.deepEqual(result.diagnostics, [])
  })

  it('shortsPlacesConfirm handles missing API key as a controlled result', async () => {
    let called = false
    const result = await confirmAddressWithPlaces({
      normalizedAddress: '39 Nguyen Trai, District 1, TP. Hồ Chí Minh',
      fetch: async () => {
        called = true
      },
    })

    assert.equal(called, false)
    assert.equal(result.status, 'PLACES_PROVIDER_ERROR')
    assert.equal(result.error, 'PLACES_PROVIDER_ERROR')
    assert.equal(result.diagnostics[0].apiKeyPresent, false)
    assert.equal(result.diagnostics[0].message, 'missing_api_key')
  })

  it('shortsPlacesConfirm classifies provider HTTP errors with safe diagnostics', async () => {
    const result = await confirmAddressWithPlaces({
      normalizedAddress: '39 Nguyen Trai, District 1, TP. Hồ Chí Minh',
      googlePlacesApiKey: 'places-key',
      fetch: async () => ({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            message: 'Places API has not been used or is disabled.',
            status: 'PERMISSION_DENIED',
            details: [{ reason: 'SERVICE_DISABLED' }],
          },
        }),
      }),
    })

    assert.equal(result.status, 'PLACES_PROVIDER_ERROR')
    assert.equal(result.error, 'PLACES_PROVIDER_ERROR')
    assert.equal(result.diagnostics[0].httpStatus, 403)
    assert.equal(result.diagnostics[0].status, 'PERMISSION_DENIED')
    assert.equal(result.diagnostics[0].reason, 'SERVICE_DISABLED')
    assert.equal(result.diagnostics[0].endpoint, __shortsPlacesConfirmTestUtils.TEXT_SEARCH_URL)
    assert.equal(result.diagnostics[0].fieldMask, __shortsPlacesConfirmTestUtils.TEXT_SEARCH_FIELD_MASK)
    assert.equal(result.diagnostics[0].apiKeyPresent, true)
    assert.equal(JSON.stringify(result).includes('places-key'), false)
  })

  it('shortsPlacesConfirm query builder includes safe place context before an explicit address', () => {
    const attempts = __shortsPlacesConfirmTestUtils.buildPlacesQueryAttempts({
      candidateAddress: 'Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. Hồ Chí Minh',
      normalizedAddress: 'Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. Hồ Chí Minh',
      metadata: {
        title: 'Quán cà phê Nhật Bản giữa lòng Sài Gòn | Thánh Riviu',
        description: `Lạc Concept
Địa chỉ: Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. HCM`,
      },
    })

    assert.equal(
      attempts[0].textQuery,
      'Lạc Concept, Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. Hồ Chí Minh',
    )
    assert.ok(attempts.every((item) => item.textQuery.includes('Hẻm 140 Trần Bình Trọng')))
    assert.ok(attempts.length <= 3)
  })

  it('shortsPlacesConfirm query builder excludes unsafe social, price, email, and slogan context', () => {
    const contexts = __shortsPlacesConfirmTestUtils.extractPlacesQueryContexts({
      candidateAddress: '39 Nguyen Trai, District 1, TP. Hồ Chí Minh',
      metadata: {
        title: 'Follow Thánh Riviu #shorts',
        description: `Giá trung bình: 40k - 60k
Theo dõi tụi mình nha
https://facebook.com/riviu
contact@riviu.vn
Địa chỉ: 39 Nguyen Trai, District 1, HCMC`,
      },
    })

    assert.deepEqual(contexts, [])
  })

  it('shortsPlacesConfirm cannot create Track 1 from Places-only evidence', async () => {
    let placesCalls = 0
    const result = await runShortsTrack1Pipeline(SHORTS_URL, {
      fetchShortsMetadata: async () => ({
        url: SHORTS_URL,
        videoId: 'abc123DEF45',
        title: 'NỘM LONG VI DUNG - 23 Hồ Hoàn Kiếm, Quận Hoàn Kiếm, Hà Nội',
        description: '',
        pageMetadataText: '',
        serpSnippet: '',
        jsonldObjects: [],
        ocrText: '',
        asrText: '',
      }),
      cleanAddressNoRepair: async () => {
        throw new Error('cleaner should not run')
      },
      confirmAddressWithPlaces: async () => {
        placesCalls += 1
        return {
          candidates: [
            {
              placeId: 'place-123',
              formattedAddress: '23 Hồ Hoàn Kiếm, Hà Nội',
            },
          ],
          raw: null,
        }
      },
      confirmExplicitAddressWithGemini: async () => {
        throw new Error('gemini confirm should not run')
      },
    })

    assert.equal(result.track, 'TRACK_2')
    assert.equal(result.reason, 'TITLE_ONLY')
    assert.equal(placesCalls, 0)
  })
})
