import { describe, expect, it } from 'vitest'
import {
  friendlyFoodMapCategory,
  foodMapDistanceFromCenter,
  foodMapDiscoveryDistance,
  foodMapPriceTier,
  inferFoodMapDistrict,
  normalizeFoodMapDiscovery,
  parseFoodSpotNotes,
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

  it('recovers provider-backed details from a saved Vision place without exposing its provider ID', () => {
    const place = normalizeFoodMapDiscovery(
      {
        id: 6,
        name: 'Nhà Hàng Funny Beef',
        dish_name: 'Beef Brisket',
        category: 'catering.restaurant',
        district: null,
        latitude: '10.7741495',
        longitude: '106.7042153',
        created_at: '2026-07-27T05:40:40.000Z',
        notes: [
          'Location clue: Nhà Hàng Funny Beef, Nguyễn Huệ, Phường Sài Gòn, Thành phố Thủ Đức, Việt Nam',
          'Source: https://www.youtube.com/shorts/example',
          'Place provider: geoapify',
          'Provider place ID: a-very-long-technical-identifier',
          'Categories: catering.restaurant',
        ].join('\n'),
      },
      'personal',
    )

    expect(place.address).toContain('Nguyễn Huệ')
    expect(place.district).toBe('Thu Duc City')
    expect(place.category).toBe('Restaurant')
    expect(place.categories).toEqual(['Restaurant'])
    expect(place.source).toBe('Geoapify + OpenStreetMap')
    expect(place.sourceUrl).toBe('https://www.youtube.com/shorts/example')
    expect(place.mapUrl).toContain('openstreetmap.org')
    expect(place.description).toContain('Beef Brisket')
    expect(place.description).not.toContain('technical-identifier')
    expect(place.addedAt).toBe('2026-07-27T05:40:40.000Z')
  })
})

describe('saved Food Map metadata', () => {
  it('parses human-readable note fields and leaves personal prose as the story', () => {
    const parsed = parseFoodSpotNotes([
      'Address: 44 Nguyễn Huệ, Thành phố Thủ Đức',
      'Discovery source: Geoapify + OpenStreetMap',
      'OpenStreetMap: https://www.openstreetmap.org/example',
      'Distance when found: 0.5 km',
      'Provider place ID: hidden-value',
      'Great brisket and relaxed atmosphere.',
    ].join('\n'))

    expect(parsed.address).toContain('44 Nguyễn Huệ')
    expect(parsed.source).toBe('Geoapify + OpenStreetMap')
    expect(parsed.mapUrl).toContain('openstreetmap.org')
    expect(parsed.distance).toBe('0.5 km')
    expect(parsed.story).toBe('Great brisket and relaxed atmosphere.')
    expect(JSON.stringify(parsed)).not.toContain('hidden-value')
  })

  it('formats provider categories and infers common Ho Chi Minh City areas', () => {
    expect(friendlyFoodMapCategory('catering.restaurant')).toBe('Restaurant')
    expect(friendlyFoodMapCategory('catering.fast_food')).toBe('Fast food')
    expect(inferFoodMapDistrict('Phường Sài Gòn, Thành phố Thủ Đức')).toBe('Thu Duc City')
    expect(inferFoodMapDistrict('Phường 6, Quận 3, Hồ Chí Minh')).toBe('District 3')
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
