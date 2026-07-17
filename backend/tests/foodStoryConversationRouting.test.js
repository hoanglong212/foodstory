import test from 'node:test'
import assert from 'node:assert/strict'
import { routeFoodStoryQuery } from '../services/foodStoryQueryRouter.js'
import { keepBestIngredientCoverage } from '../services/recipeStructuredService.js'
import { recipeResultNeedsGroqFallback } from '../services/foodStoryChatbotService.js'

test('Vietnamese named-dish cooking requests use recipe lookup before general guidance', () => {
  const route = routeFoodStoryQuery('tôi muốn nấu bánh canh cua')

  assert.equal(route.intent, 'recipe_steps')
  assert.equal(route.entities.recipeName, 'banh canh cua')
  assert.equal(route.entities.allowGeneralGuidance, true)
  assert.equal(route.shouldUseStructuredLookup, true)
})

test('Vietnamese named-dish cooking requests tolerate the optional word mon', () => {
  const route = routeFoodStoryQuery('tôi muốn nấu món cơm tấm')

  assert.equal(route.intent, 'recipe_steps')
  assert.equal(route.entities.recipeName, 'com tam')
  assert.equal(route.entities.allowGeneralGuidance, true)
})

test('English ingredient-list questions keep the named recipe', () => {
  const route = routeFoodStoryQuery(
    'What ingredients are in Senegalese thieboudienne?'
  )

  assert.equal(route.intent, 'recipe_ingredients')
  assert.equal(route.entities.recipeName, 'senegalese thieboudienne')
  assert.equal(route.entities.needsRecipeContext, false)
})

test('personal Food Map wording routes to private user data', () => {
  const route = routeFoodStoryQuery('Show my saved Food Map places')

  assert.equal(route.intent, 'user_food_spots')
  assert.equal(route.entities.requiresUserId, true)
})

test('pantry recommendations omit weaker partial matches when exact matches exist', () => {
  const ranked = keepBestIngredientCoverage([
    { recipe: { title: 'Exact one' }, coverage: 1, matchScore: 1 },
    { recipe: { title: 'Exact two' }, coverage: 1, matchScore: 0.98 },
    { recipe: { title: 'Milk only' }, coverage: 0.5, matchScore: 0.58 },
  ])

  assert.deepEqual(
    ranked.map((item) => item.recipe.title),
    ['Exact one', 'Exact two']
  )
})

test('pantry recommendations keep the strongest partial tier when no exact match exists', () => {
  const ranked = keepBestIngredientCoverage([
    { recipe: { title: 'Two of three' }, coverage: 2 / 3, matchScore: 0.72 },
    { recipe: { title: 'One of three' }, coverage: 1 / 3, matchScore: 0.4 },
  ])

  assert.deepEqual(ranked.map((item) => item.recipe.title), ['Two of three'])
})

test('missing recipe data falls through to Groq while clarification states do not', () => {
  assert.equal(
    recipeResultNeedsGroqFallback({ status: 'recipe_not_found' }),
    true
  )
  assert.equal(
    recipeResultNeedsGroqFallback({
      status: 'no_results',
      kind: 'ingredient_recommendation',
      results: [],
    }),
    true
  )
  assert.equal(recipeResultNeedsGroqFallback({ status: 'needs_context' }), false)
  assert.equal(recipeResultNeedsGroqFallback({ status: 'ingredient_not_found' }), false)
})
