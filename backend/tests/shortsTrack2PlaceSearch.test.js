import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { searchPlaceNameCandidates } from '../src/services/shortsTrack2PlaceSearchService.js'

function signals(overrides = {}) {
  return {
    status: 'OK',
    signals: {
      placeNames: ['Quan Com Ba Hoa'],
      areas: ['Quan 5', 'Ho Chi Minh'],
      dishes: ['com'],
      sourceFields: ['title'],
      ...overrides,
    },
  }
}

describe('shortsTrack2PlaceSearch', () => {
  it('missing API key/provider returns UNAVAILABLE', async () => {
    const result = await searchPlaceNameCandidates(signals())

    assert.equal(result.status, 'UNAVAILABLE')
    assert.equal(result.reason, 'PLACE_NAME_PROVIDER_UNAVAILABLE')
  })

  it('no signals returns NO_QUERIES', async () => {
    const result = await searchPlaceNameCandidates({ signals: { placeNames: [], areas: [] } }, {
      track2PlaceSearchProvider: async () => {
        throw new Error('provider should not run')
      },
    })

    assert.equal(result.status, 'NO_QUERIES')
  })

  it('injected provider receives only placeName+area queries', async () => {
    let receivedQueries = []
    const result = await searchPlaceNameCandidates(signals(), {
      track2PlaceSearchProvider: async ({ queries }) => {
        receivedQueries = queries
        return {
          rawCandidates: [
            {
              placeId: 'place-1',
              displayName: 'Quan Com Ba Hoa',
              formattedAddress: '12 Duong A, Quan 5, Ho Chi Minh',
              primaryType: 'restaurant',
              businessStatus: 'OPERATIONAL',
            },
          ],
        }
      },
    })

    assert.equal(result.status, 'OK')
    assert.ok(receivedQueries.length > 0)
    assert.ok(receivedQueries.every((query) => query.textQuery.includes('Quan Com Ba Hoa')))
    assert.ok(receivedQueries.every((query) => /Quan 5|Ho Chi Minh|com/.test(query.textQuery)))
  })

  it('never queries dish-only or area-only', async () => {
    const dishOnly = await searchPlaceNameCandidates({ signals: { placeNames: [], areas: [], dishes: ['pho'] } })
    const areaOnly = await searchPlaceNameCandidates({ signals: { placeNames: [], areas: ['Quan 5'], dishes: [] } })

    assert.equal(dishOnly.status, 'NO_QUERIES')
    assert.equal(areaOnly.status, 'NO_QUERIES')
  })

  it('max queries <= 6', async () => {
    let count = 0
    await searchPlaceNameCandidates(signals({
      areas: ['Quan 5', 'Ho Chi Minh', 'Binh Thanh', 'Quan 1'],
      dishes: ['com', 'pho'],
    }), {
      track2PlaceSearchProvider: async ({ queries }) => {
        count = queries.length
        return { rawCandidates: [] }
      },
    })

    assert.ok(count <= 6)
  })

  it('provider error returns ERROR, not throw', async () => {
    const result = await searchPlaceNameCandidates(signals(), {
      track2PlaceSearchProvider: async () => {
        throw new Error('provider down')
      },
    })

    assert.equal(result.status, 'ERROR')
    assert.equal(result.reason, 'PLACE_NAME_PROVIDER_ERROR')
  })

  it('candidates sanitized and deduplicated', async () => {
    const result = await searchPlaceNameCandidates(signals(), {
      track2PlaceSearchProvider: async () => ({
        rawCandidates: [
          { placeId: 'same', displayName: { text: 'Quan Com Ba Hoa' }, formattedAddress: 'A', primaryType: 'restaurant' },
          { placeId: 'same', displayName: 'Quan Com Ba Hoa', formattedAddress: 'A', primaryType: 'restaurant' },
        ],
      }),
    })

    assert.equal(result.rawCandidates.length, 1)
    assert.equal(result.rawCandidates[0].placeId, 'same')
    assert.equal(result.rawCandidates[0].displayName, 'Quan Com Ba Hoa')
  })
})
