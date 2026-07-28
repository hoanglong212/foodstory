import test from 'node:test'
import assert from 'node:assert/strict'
import {
  recipeImageAssetName,
  recipeImageUrl,
} from '../database/recipeImageCatalog.js'

test('recipe image URLs are deterministic local assets tied to the title', () => {
  assert.equal(
    recipeImageUrl('Vietnamese Coconut Chicken Curry'),
    '/images/Vietnamese%20Coconut%20Chicken%20Curry.jpg'
  )
  assert.equal(
    recipeImageAssetName('Pesto White Bean Toast'),
    'Pesto White Bean Toast.jpg'
  )
})

test('recipes without a verified asset receive an honest placeholder', () => {
  assert.equal(
    recipeImageUrl('Turkey Quinoa Stuffed Peppers'),
    '/images/food-placeholder.jpg'
  )
})
