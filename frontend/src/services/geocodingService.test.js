import { describe, expect, it, vi } from 'vitest'
import { normalizeGeocodingResult, searchAddresses } from './geocodingService'

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

  it('constructs a bounded Vietnam address search and removes duplicates', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { place_id: 7, display_name: 'Cho Ben Thanh', lat: '10.77', lon: '106.69' },
        { place_id: 7, display_name: 'Duplicate', lat: '10.77', lon: '106.69' },
      ],
    })

    const results = await searchAddresses('Chợ Bến Thành test-case-1', { fetchImpl })
    const requestUrl = new URL(fetchImpl.mock.calls[0][0])

    expect(requestUrl.searchParams.get('q')).toBe('Chợ Bến Thành test-case-1')
    expect(requestUrl.searchParams.get('countrycodes')).toBe('vn')
    expect(requestUrl.searchParams.get('limit')).toBe('5')
    expect(results).toHaveLength(1)
  })

  it('caches repeated user-triggered lookups', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { place_id: 8, display_name: 'Landmark 81', lat: '10.795', lon: '106.722' },
      ],
    })

    const first = await searchAddresses('Landmark 81 test-case-2', { fetchImpl })
    const second = await searchAddresses('Landmark 81 test-case-2', { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
  })

  it('does not call the provider for a very short query', async () => {
    const fetchImpl = vi.fn()

    await expect(searchAddresses('a', { fetchImpl })).rejects.toMatchObject({
      code: 'ADDRESS_QUERY_TOO_SHORT',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
