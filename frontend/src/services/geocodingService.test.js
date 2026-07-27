import { describe, expect, it, vi } from 'vitest'
import {
  extractHouseNumber,
  normalizeGeocodingResult,
  resultMatchesHouseNumber,
  searchAddresses,
} from './geocodingService'

describe('geocoding service', () => {
  it('normalizes a valid Nominatim place result', () => {
    expect(
      normalizeGeocodingResult({
        place_id: 123,
        display_name: 'Ben Thanh Market, District 1, Ho Chi Minh City, Vietnam',
        name: 'Ben Thanh Market',
        lat: '10.7725',
        lon: '106.6980',
        address: { city_district: 'District 1' },
        type: 'marketplace',
      }),
    ).toEqual({
      id: '123',
      label: 'Ben Thanh Market, District 1, Ho Chi Minh City, Vietnam',
      shortLabel: 'Ben Thanh Market',
      latitude: 10.7725,
      longitude: 106.698,
      district: 'District 1',
      type: 'marketplace',
      houseNumber: '',
      street: '',
      precision: 'place',
      provider: 'openstreetmap',
      sourceType: 'external',
      providerPlaceId: '123',
      placeName: 'Ben Thanh Market',
    })
  })

  it('rejects malformed coordinates', () => {
    expect(
      normalizeGeocodingResult({
        place_id: 1,
        display_name: 'Invalid place',
        lat: '999',
        lon: '106.7',
      }),
    ).toBeNull()
  })

  it('prefers the authenticated precise provider for an exact house number', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        provider: 'geoapify',
        results: [
          {
            id: 'geoapify:7',
            label: '123 Pham Van Chieu, Go Vap, Ho Chi Minh City',
            shortLabel: '123 Pham Van Chieu',
            latitude: 10.83,
            longitude: 106.66,
            houseNumber: '123',
            street: 'Pham Van Chieu',
            precision: 'house',
            provider: 'geoapify',
          },
          {
            id: 'geoapify:7',
            label: 'Duplicate',
            shortLabel: 'Duplicate',
            latitude: 10.83,
            longitude: 106.66,
          },
        ],
      }),
    })

    const results = await searchAddresses('123 Pham Van Chieu test-case-1', {
      fetchImpl,
      token: 'test-token',
    })
    const requestUrl = new URL(fetchImpl.mock.calls[0][0], 'http://foodstory.test')

    expect(requestUrl.pathname).toBe('/api/food-map/address-search')
    expect(requestUrl.searchParams.get('q')).toBe('123 Pham Van Chieu test-case-1')
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token')
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      houseNumber: '123',
      precision: 'house',
      provider: 'geoapify',
    })
  })

  it('caches repeated user-triggered lookups', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
          {
            place_id: 8,
            display_name: 'Landmark 81, Ho Chi Minh City',
            name: 'Landmark 81',
            lat: '10.795',
            lon: '106.722',
            type: 'attraction',
          },
        ],
    })

    const first = await searchAddresses('Landmark 81 test-case-2', { fetchImpl })
    const second = await searchAddresses('Landmark 81 test-case-2', { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
  })

  it('falls back to a bounded Vietnam OpenStreetMap search', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            place_id: 9,
            display_name: 'Pham Van Chieu, Go Vap, Ho Chi Minh City',
            name: 'Pham Van Chieu',
            lat: '10.83',
            lon: '106.66',
            address: { road: 'Pham Van Chieu', city_district: 'Go Vap' },
            type: 'residential',
          },
        ],
      })

    const results = await searchAddresses('123 Pham Van Chieu test-case-3', { fetchImpl })
    const requestUrl = new URL(fetchImpl.mock.calls[1][0])

    expect(requestUrl.hostname).toBe('nominatim.openstreetmap.org')
    expect(requestUrl.searchParams.get('countrycodes')).toBe('vn')
    expect(requestUrl.searchParams.get('addressdetails')).toBe('1')
    expect(results[0]).toMatchObject({
      precision: 'street',
      provider: 'openstreetmap',
    })
  })

  it('extracts and compares Vietnamese-style house numbers', () => {
    expect(extractHouseNumber('12/5A Phạm Văn Chiêu, Gò Vấp')).toBe('12/5A')
    expect(extractHouseNumber('44 / 11 Phạm Văn Chiêu')).toBe('44/11')
    expect(
      resultMatchesHouseNumber({ houseNumber: '12/5a' }, '12/5A'),
    ).toBe(true)
  })

  it('does not call the provider for a very short query', async () => {
    const fetchImpl = vi.fn()

    await expect(searchAddresses('a', { fetchImpl })).rejects.toMatchObject({
      code: 'ADDRESS_QUERY_TOO_SHORT',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
