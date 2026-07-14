import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  findDuplicateFoodMapPlaceFromEvidence,
  scoreDuplicateFoodMapPlaceFromEvidence,
} from '../services/foodMapDuplicatePlaceService.js'

const rows = [
  {
    sourceType: 'restaurant',
    sourceId: 1,
    name: 'Quán A',
    address: '242 Độc Lập, Phường Tân Thành, Quận Tân Phú',
    district: 'Tân Phú',
    lat: 10.78,
    lng: 106.63,
  },
  {
    sourceType: 'restaurant',
    sourceId: 2,
    name: 'Quán B',
    address: '153 Nam Kỳ Khởi Nghĩa, Phường 6, Quận 3',
    district: 'Quận 3',
    lat: 10.79,
    lng: 106.69,
  },
]

describe('Food Map local duplicate matching from visual evidence', () => {
  it('matches an exact normalized address without requiring a place name', async () => {
    const result = await findDuplicateFoodMapPlaceFromEvidence({
      address: { value: '242 Độc Lập, P. Tân Thành, Q. Tân Phú' },
      placeName: { value: null },
    }, { rows })

    assert.equal(result.match?.sourceId, 1)
    assert.ok(result.match.confidence >= 0.86)
  })

  it('does not focus a marker from weak address overlap alone', async () => {
    const result = await findDuplicateFoodMapPlaceFromEvidence({
      address: { value: '242 Độc Lập' },
      placeName: { value: null },
    }, { rows })

    assert.equal(result.match, null)
  })

  it('prefilters database candidates by house number instead of loading both full tables', async () => {
    const calls = []
    const database = {
      async execute(query, params = []) {
        calls.push({ query: query.replace(/\s+/g, ' ').trim(), params })
        return [[]]
      },
    }

    await findDuplicateFoodMapPlaceFromEvidence({
      address: { value: '242 Độc Lập, Phường Tân Thành, Quận Tân Phú' },
      placeName: { value: null },
    }, { database })

    assert.equal(calls.length, 1)
    assert.match(calls[0].query, /FROM restaurants WHERE address LIKE \? LIMIT 250/iu)
    assert.deepEqual(calls[0].params, ['%242%'])
  })

  it('allows name and address to jointly support a conservative match', () => {
    const score = scoreDuplicateFoodMapPlaceFromEvidence({
      address: { value: '153 Nam Kỳ Khởi Nghĩa, Quận 3' },
      placeName: { value: 'Quán B' },
    }, rows[1])

    assert.ok(score.confidence >= 0.86)
    assert.ok(score.matchReasons.length > 0)
  })
})
