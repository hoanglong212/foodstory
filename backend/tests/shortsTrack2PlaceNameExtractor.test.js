import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractPlaceNameSignals } from '../src/services/shortsTrack2PlaceNameExtractorService.js'

describe('shortsTrack2PlaceNameExtractor', () => {
  it('specific shop + area extracts placeName and area', () => {
    const result = extractPlaceNameSignals({ title: 'Quan Com Ba Hoa Quan 5' })

    assert.equal(result.status, 'OK')
    assert.ok(result.signals.placeNames.includes('Quan Com Ba Hoa'))
    assert.ok(result.signals.areas.includes('quan 5'))
  })

  it('generic/list title extracts no placeName or returns BLOCKED', () => {
    const result = extractPlaceNameSignals({ title: 'Top mon ngon Quan 5' })

    assert.equal(result.status, 'BLOCKED')
    assert.deepEqual(result.signals.placeNames, [])
  })

  it('dish-only title rejected', () => {
    const result = extractPlaceNameSignals({ title: 'bun bo hue' })

    assert.equal(result.status, 'NO_SIGNALS')
  })

  it('area-only title rejected', () => {
    const result = extractPlaceNameSignals({ title: 'Quan 5' })

    assert.equal(result.status, 'NO_SIGNALS')
  })

  it('social/contact line rejected', () => {
    const result = extractPlaceNameSignals({
      description: 'Follow TikTok @food\nLien he contact@example.com',
    })

    assert.equal(result.status, 'NO_SIGNALS')
  })

  it('title with multiple places returns NEEDS_REVIEW', () => {
    const result = extractPlaceNameSignals({ title: 'Quan A va Quan B Quan 5' })

    assert.equal(result.status, 'NEEDS_REVIEW')
  })

  it('JSON-LD name can be used if specific and safe', () => {
    const result = extractPlaceNameSignals({
      title: 'Quan 5',
      jsonldObjects: [{ name: 'Cafe Hoa Nho' }],
      description: 'Quan 5 Ho Chi Minh',
    })

    assert.equal(result.status, 'OK')
    assert.ok(result.signals.placeNames.includes('Cafe Hoa Nho'))
  })

  it('description line immediately before address label can be used', () => {
    const result = extractPlaceNameSignals({
      description: 'Quan Com Ba Hoa\nDia chi: 12 Duong A, Phuong 1, Quan 5',
    })

    assert.equal(result.status, 'OK')
    assert.ok(result.signals.placeNames.includes('Quan Com Ba Hoa'))
  })
})
