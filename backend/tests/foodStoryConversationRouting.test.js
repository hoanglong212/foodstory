import test from 'node:test'
import assert from 'node:assert/strict'
import { routeFoodStoryQuery } from '../services/foodStoryQueryRouter.js'
import {
  filterRecipesBySearchFilters,
  keepBestIngredientCoverage,
} from '../services/recipeStructuredService.js'
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
  assert.equal(
    recipeResultNeedsGroqFallback({
      status: 'no_results',
      kind: 'recipe_filter_search',
    }),
    false
  )
})

test('recipe discovery extracts live nutrition, rating, and tag filters', () => {
  const route = routeFoodStoryQuery(
    'Find healthy recipes under 500 calories rated above 4'
  )

  assert.equal(route.intent, 'recipe_filter_search')
  assert.equal(route.entities.recipeSearchFilters.tag, 'Healthy')
  assert.equal(route.entities.recipeSearchFilters.maxCalories, 500)
  assert.equal(route.entities.recipeSearchFilters.minRating, 4)
  assert.equal(route.entities.recipeSearchFilters.sort, 'rating')
})

test('Vietnamese recipe discovery extracts vegetarian and calorie filters', () => {
  const route = routeFoodStoryQuery('gợi ý món chay dưới 450 calo')

  assert.equal(route.intent, 'recipe_filter_search')
  assert.equal(route.entities.recipeSearchFilters.tag, 'Vegetarian')
  assert.equal(route.entities.recipeSearchFilters.maxCalories, 450)
})

test('short recipe filter follow-ups retain previous constraints', () => {
  const first = routeFoodStoryQuery(
    'Find healthy recipes under 500 calories rated above 4'
  )
  const followup = routeFoodStoryQuery('còn món dưới 30 phút?', {
    recipeSearchFilters: first.entities.recipeSearchFilters,
  })

  assert.equal(followup.intent, 'recipe_filter_search')
  assert.equal(followup.entities.recipeSearchFilters.tag, 'Healthy')
  assert.equal(followup.entities.recipeSearchFilters.maxCalories, 500)
  assert.equal(followup.entities.recipeSearchFilters.minRating, 4)
  assert.equal(followup.entities.recipeSearchFilters.maxTotalTime, 30)
  assert.equal(followup.entities.recipeSearchFilters.sort, 'fastest')
})

test('clearing recipe filters returns an empty popular filter state', () => {
  const route = routeFoodStoryQuery('clear all filters', {
    recipeSearchFilters: {
      tag: 'Healthy',
      maxCalories: 500,
      minRating: 4,
      sort: 'rating',
    },
  })

  assert.equal(route.intent, 'recipe_filter_search')
  assert.deepEqual(route.entities.recipeSearchFilters, {
    category: null,
    tag: null,
    maxCalories: null,
    minRating: null,
    maxTotalTime: null,
    minProtein: null,
    sort: 'popular',
  })
})

test('direct nutrition questions are not mistaken for recipe discovery', () => {
  const route = routeFoodStoryQuery('How many calories are in pho bo?')

  assert.equal(route.intent, 'recipe_nutrition')
})

test('recipe filter ranking uses live nutrition, ratings, time, and tags', () => {
  const recipes = [
    {
      id: 1,
      title: 'Fast tofu bowl',
      category_name: 'Vegetarian',
      tag_names: 'Healthy,Vegetarian',
      calories: 420,
      protein: 28,
      prep_time: 10,
      cook_time: 15,
      avg_rating: 4.7,
      rating_count: 12,
    },
    {
      id: 2,
      title: 'Slow tofu bowl',
      category_name: 'Vegetarian',
      tag_names: 'Healthy,Vegetarian',
      calories: 390,
      protein: 35,
      prep_time: 20,
      cook_time: 40,
      avg_rating: 4.9,
      rating_count: 5,
    },
    {
      id: 3,
      title: 'Quick fried bowl',
      category_name: 'Vegetarian',
      tag_names: 'Vegetarian',
      calories: 650,
      protein: 32,
      prep_time: 5,
      cook_time: 10,
      avg_rating: 5,
      rating_count: 20,
    },
  ]

  const matched = filterRecipesBySearchFilters(recipes, {
    tag: 'Healthy',
    maxCalories: 500,
    minRating: 4.5,
    maxTotalTime: 30,
    minProtein: 25,
    sort: 'rating',
  })

  assert.deepEqual(matched.map((recipe) => recipe.id), [1])
})
