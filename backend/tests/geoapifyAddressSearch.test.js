import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { searchGeoapifyAddresses } from '../services/visionAuto/providers/geoapifyPlaceProvider.js'

describe('Geoapify address search', () => {
  it('preserves structured house-number precision for the Food Map form', async () => {
    let requestedUrl = null
    const fetchImpl = async (url) => {
      requestedUrl = new URL(url)
      return {
        ok: true,
        json: async () => ({
          features: [
            {
              properties: {
                place_id: 'house-123',
                country_code: 'vn',
                formatted: '123 Phạm Văn Chiêu, Gò Vấp, Hồ Chí Minh, Việt Nam',
                address_line1: '123 Phạm Văn Chiêu',
                housenumber: '123',
                street: 'Phạm Văn Chiêu',
                district: 'Gò Vấp',
                result_type: 'building',
                lat: 10.83,
                lon: 106.66,
              },
              geometry: {
                coordinates: [106.66, 10.83],
              },
            },
          ],
        }),
      }
    }

    const results = await searchGeoapifyAddresses(
      '123 Phạm Văn Chiêu, Gò Vấp, Hồ Chí Minh',
      {
        apiKey: 'test-key',
        fetchImpl,
      },
    )

    assert.equal(requestedUrl.hostname, 'api.geoapify.com')
    assert.equal(requestedUrl.searchParams.get('filter'), 'countrycode:vn')
    assert.equal(results.length, 1)
    assert.deepEqual(results[0], {
      id: 'geoapify:house-123',
      label: '123 Phạm Văn Chiêu, Gò Vấp, Hồ Chí Minh, Việt Nam',
      shortLabel: '123 Phạm Văn Chiêu',
      latitude: 10.83,
      longitude: 106.66,
      district: 'Gò Vấp',
      type: 'building',
      houseNumber: '123',
      street: 'Phạm Văn Chiêu',
      precision: 'house',
      provider: 'geoapify',
      sourceType: 'external',
      providerPlaceId: 'house-123',
      placeName: '',
    })
  })

  it('resolves a Vietnamese slash address through its equivalent alley form', async () => {
    let requestedUrl = null
    const fetchImpl = async (url) => {
      requestedUrl = new URL(url)
      return {
        ok: true,
        json: async () => ({
          features: [
            {
              properties: {
                place_id: 'alley-house-44-11',
                country_code: 'vn',
                formatted: '11, Hẻm 44 Phạm Văn Chiêu, Gò Vấp, Hồ Chí Minh, Việt Nam',
                address_line1: '11 Hẻm 44 Phạm Văn Chiêu',
                housenumber: '11',
                street: 'Hẻm 44 Phạm Văn Chiêu',
                district: 'Gò Vấp',
                result_type: 'building',
                lat: 10.8447676,
                lon: 106.6442713,
              },
              geometry: {
                coordinates: [106.6442713, 10.8447676],
              },
            },
            {
              properties: {
                place_id: 'nested-alley-house',
                country_code: 'vn',
                formatted: '11, Hẻm 44/16 Phạm Văn Chiêu, Gò Vấp, Hồ Chí Minh, Việt Nam',
                address_line1: '11 Hẻm 44/16 Phạm Văn Chiêu',
                housenumber: '11',
                street: 'Hẻm 44/16 Phạm Văn Chiêu',
                district: 'Gò Vấp',
                result_type: 'building',
                lat: 10.844081,
                lon: 106.644252,
              },
              geometry: {
                coordinates: [106.644252, 10.844081],
              },
            },
          ],
        }),
      }
    }

    const results = await searchGeoapifyAddresses(
      '44/11 Phạm Văn Chiêu, Gò Vấp, Hồ Chí Minh',
      {
        apiKey: 'test-key',
        fetchImpl,
      },
    )

    assert.equal(
      requestedUrl.searchParams.get('text'),
      '11 Hẻm 44 Phạm Văn Chiêu, Gò Vấp, Hồ Chí Minh',
    )
    assert.equal(results.length, 1)
    assert.equal(results[0].houseNumber, '44/11')
    assert.equal(results[0].shortLabel, '44/11 Phạm Văn Chiêu')
    assert.equal(results[0].precision, 'house')
    assert.equal(results[0].street, 'Hẻm 44 Phạm Văn Chiêu')
  })

  it('falls back to the original slash query when the alley form is not verified', async () => {
    const requestedQueries = []
    const fetchImpl = async (url) => {
      const requestUrl = new URL(url)
      requestedQueries.push(requestUrl.searchParams.get('text'))
      const isAlleyVariant = requestedQueries.length === 1
      return {
        ok: true,
        json: async () => ({
          features: isAlleyVariant
            ? []
            : [
                {
                  properties: {
                    place_id: 'street-only',
                    country_code: 'vn',
                    formatted: 'Phạm Văn Chiêu, Gò Vấp, Hồ Chí Minh, Việt Nam',
                    address_line1: 'Phạm Văn Chiêu',
                    street: 'Phạm Văn Chiêu',
                    district: 'Gò Vấp',
                    result_type: 'street',
                    lat: 10.8516369,
                    lon: 106.6582077,
                  },
                  geometry: {
                    coordinates: [106.6582077, 10.8516369],
                  },
                },
              ],
        }),
      }
    }

    const results = await searchGeoapifyAddresses(
      '44/11 Phạm Văn Chiêu, Gò Vấp',
      {
        apiKey: 'test-key',
        fetchImpl,
      },
    )

    assert.deepEqual(requestedQueries, [
      '11 Hẻm 44 Phạm Văn Chiêu, Gò Vấp',
      '44/11 Phạm Văn Chiêu, Gò Vấp',
    ])
    assert.equal(results.length, 1)
    assert.equal(results[0].precision, 'street')
    assert.equal(results[0].houseNumber, '')
  })
})
