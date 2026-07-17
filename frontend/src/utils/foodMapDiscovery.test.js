import { describe, expect, it } from 'vitest'
import {
  foodMapDistanceFromCenter,
  foodMapDiscoveryDistance,
  foodMapPriceTier,
  normalizeFoodMapDiscovery,
} from './foodMapDiscovery'

describe('normalizeFoodMapDiscovery', () => {
  it('uses verified restaurant facts without inventing an image or rating', () => {
    const place = normalizeFoodMapDiscovery(
      {
        id: 9,
        name: 'Phở Việt Nam',
        category: 'Phở',
        featured_dish: 'Phở thố đá',
        verified_at: '2026-07-14',
        source_url: 'https://example.com/source',
        latitude: '10.77',
        longitude: '106.69',
        avg_rating: 0,
      },
      'restaurant',
    )

    expect(place.dish).toBe('Phở thố đá')
    expect(place.image).toBeNull()
    expect(place.rating).toBe(0)
    expect(place.source).toBe('Verified 2026-07-14')
    expect(place.sourceUrl).toBe('https://example.com/source')
  })

  it('keeps an explicitly supplied community image and ownership boundary', () => {
    const place = normalizeFoodMapDiscovery(
      { id: 3, name: 'Community place', image: '/place.webp', rating: 4 },
      'community',
    )

    expect(place.image).toBe('/place.webp')
    expect(place.imageAlt).toBe('Photo of Community place')
    expect(place.isOwned).toBe(false)
  })
})

describe('foodMapDiscoveryDistance', () => {
  it('parses numeric distances without treating missing data as zero', () => {
    expect(foodMapDiscoveryDistance({ distance: '2.4 km' })).toBe(2.4)
    expect(Number.isNaN(foodMapDiscoveryDistance({ distance: '' }))).toBe(true)
  })
})

describe('Food Map lens helpers', () => {
  it('measures a place from the current map center', () => {
    const distance = foodMapDistanceFromCenter(
      { latitude: 10.7769, longitude: 106.7009 },
      [10.7769, 106.7009],
    )

    expect(distance).toBeCloseTo(0, 5)
    expect(Number.isNaN(foodMapDistanceFromCenter({}, [10.7769, 106.7009]))).toBe(true)
  })

  it('derives a comparable budget tier only from explicit price marks', () => {
    expect(foodMapPriceTier({ price: '₫' })).toBe(1)
    expect(foodMapPriceTier({ price_range: '₫₫' })).toBe(2)
    expect(Number.isNaN(foodMapPriceTier({ price: '' }))).toBe(true)
  })
})
