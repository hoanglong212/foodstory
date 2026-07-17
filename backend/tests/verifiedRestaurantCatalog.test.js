import assert from 'node:assert/strict'
import test from 'node:test'
import {
  VERIFIED_RESTAURANT_CATALOG_DATE,
  verifiedRestaurantCatalog,
} from '../database/verifiedRestaurantCatalog.js'

test('verified restaurant catalog contains only traceable, non-fabricated records', () => {
  assert.equal(verifiedRestaurantCatalog.length, 10)
  assert.equal(new Set(verifiedRestaurantCatalog.map(({ id }) => id)).size, 10)
  assert.equal(new Set(verifiedRestaurantCatalog.map(({ name }) => name)).size, 10)

  for (const restaurant of verifiedRestaurantCatalog) {
    assert.ok(restaurant.name)
    assert.ok(restaurant.address)
    assert.ok(restaurant.district)
    assert.ok(restaurant.category)
    assert.ok(restaurant.featuredDish)
    assert.ok(restaurant.description)
    assert.ok(Number.isFinite(restaurant.latitude))
    assert.ok(Number.isFinite(restaurant.longitude))
    assert.ok(restaurant.latitude >= 10.6 && restaurant.latitude <= 10.9)
    assert.ok(restaurant.longitude >= 106.5 && restaurant.longitude <= 106.9)
    assert.equal(restaurant.avgRating, 0)
    assert.equal(restaurant.imageUrl, null)
    assert.equal(restaurant.imageAttribution, null)
    assert.match(restaurant.sourceUrl, /^https:\/\/guide\.michelin\.com\//)
    assert.equal(restaurant.verifiedAt, VERIFIED_RESTAURANT_CATALOG_DATE)
  }
})
