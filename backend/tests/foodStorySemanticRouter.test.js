import test from 'node:test'
import assert from 'node:assert/strict'
import { routeFoodStoryQuery } from '../services/foodStoryQueryRouter.js'
import { resolveFoodStorySemanticRoute } from '../services/foodStorySemanticRouterService.js'

test('semantic fallback converts a natural pantry request into a verified lookup route', async () => {
  const question = 'Fish is all I have tonight, any ideas?'
  const deterministic = routeFoodStoryQuery(question)
  assert.equal(deterministic.intent, 'unknown')

  const result = await resolveFoodStorySemanticRoute(
    question,
    deterministic,
    { conversationHistory: [] },
    {
      invokeSemanticRouter: async () => ({
        intent: 'recipe_by_ingredients',
        confidence: 0.94,
        entities: {
          recipeName: null,
          ingredientName: null,
          availableIngredients: ['fish'],
          targetServings: null,
          dishName: null,
          cuisineOrCategory: null,
          districtOrLocation: null,
          priceRange: null,
          nutritionField: null,
        },
      }),
    }
  )

  assert.equal(result.status, 'resolved')
  assert.equal(result.route.intent, 'recipe_by_ingredients')
  assert.deepEqual(result.route.entities.availableIngredients, ['fish'])
  assert.equal(result.route.shouldUseStructuredLookup, true)
  assert.equal(result.route.shouldUseGroq, false)
})

test('semantic fallback uses active recipe only for an elliptical follow-up', async () => {
  const question = 'And the liquid amount?'
  const deterministic = routeFoodStoryQuery(question, {
    lastRecipeId: 86,
    lastRecipeTitle: 'Coconut Fish Curry',
  })
  const result = await resolveFoodStorySemanticRoute(
    question,
    deterministic,
    {
      lastRecipeId: 86,
      lastRecipeTitle: 'Coconut Fish Curry',
      conversationHistory: [],
    },
    {
      invokeSemanticRouter: async () => ({
        intent: 'recipe_ingredient_quantity',
        confidence: 0.88,
        entities: {
          recipeName: null,
          ingredientName: 'coconut curry sauce',
          availableIngredients: [],
          targetServings: null,
          dishName: null,
          cuisineOrCategory: null,
          districtOrLocation: null,
          priceRange: null,
          nutritionField: null,
        },
      }),
    }
  )

  assert.equal(result.status, 'resolved')
  assert.equal(result.route.entities.needsRecipeContext, true)
  assert.equal(result.route.entities.lastRecipeId, 86)
})

test('semantic fallback fails closed on low confidence or invalid provider output', async () => {
  const deterministic = routeFoodStoryQuery('Something tasty maybe')
  const lowConfidence = await resolveFoodStorySemanticRoute(
    'Something tasty maybe',
    deterministic,
    {},
    {
      invokeSemanticRouter: async () => ({
        intent: 'recipe_recommendation',
        confidence: 0.4,
        entities: {
          recipeName: null,
          ingredientName: null,
          availableIngredients: [],
          targetServings: null,
          dishName: null,
          cuisineOrCategory: null,
          districtOrLocation: null,
          priceRange: null,
          nutritionField: null,
        },
      }),
    }
  )
  assert.equal(lowConfidence.status, 'low_confidence')
  assert.equal(lowConfidence.route, deterministic)

  const invalid = await resolveFoodStorySemanticRoute(
    'Something tasty maybe',
    deterministic,
    {},
    { invokeSemanticRouter: async () => ({ intent: 'make_up_a_place' }) }
  )
  assert.equal(invalid.status, 'invalid_schema')
  assert.equal(invalid.route, deterministic)
})
