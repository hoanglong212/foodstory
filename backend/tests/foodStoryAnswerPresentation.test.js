import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRecipeStructuredResponse,
  buildRetrievalPresentationResults,
} from '../services/foodStoryAnswerBuilder.js'

test('structured recipe answers expose the stored recipe image to the client', () => {
  const response = buildRecipeStructuredResponse(
    {
      status: 'matched',
      kind: 'cooking_time',
      matchScore: 1,
      totalTime: 35,
      prepTime: 10,
      cookTime: 25,
      recipe: {
        id: 42,
        title: 'Ginger Chicken Rice',
        image_url: '/uploads/recipes/ginger-chicken.jpg',
        servings: 4,
        instructions: 'Large stored instructions should not enter chat results.',
      },
    },
    { intent: 'recipe_cooking_time', entities: { responseLanguage: 'en' } }
  )

  assert.equal(response.results.length, 1)
  assert.equal(response.results[0].id, 42)
  assert.equal(
    response.results[0].image_url,
    '/uploads/recipes/ginger-chicken.jpg'
  )
  assert.equal(response.results[0].result_type, 'recipe')
  assert.equal('instructions' in response.results[0], false)
})

test('retrieval metadata becomes a display-ready recipe card', () => {
  const results = buildRetrievalPresentationResults([
    {
      sourceType: 'recipe',
      sourceId: 7,
      title: 'Mushroom Noodles',
      metadata: {
        imageUrl: 'https://images.example/mushroom-noodles.webp',
        categoryName: 'Noodles',
        prepTime: 12,
        cookTime: 18,
        servings: 2,
        averageRating: 4.6,
      },
    },
  ])

  assert.deepEqual(results[0], {
    id: 7,
    title: 'Mushroom Noodles',
    image_url: 'https://images.example/mushroom-noodles.webp',
    category: 'Noodles',
    prep_time: 12,
    cook_time: 18,
    servings: 2,
    difficulty: null,
    calories: 0,
    protein: 0,
    avg_rating: 4.6,
    result_type: 'recipe',
  })
})

test('live recipe filter responses expose rating, nutrition, tags, and filter memory', () => {
  const filters = {
    query: null,
    category: null,
    tag: 'Healthy',
    maxCalories: 500,
    minRating: 4,
    maxTotalTime: 30,
    minProtein: 20,
    sort: 'rating',
  }
  const response = buildRecipeStructuredResponse(
    {
      status: 'matched',
      kind: 'recipe_filter_search',
      filters,
      totalMatched: 1,
      results: [
        {
          id: 9,
          title: 'Healthy Tofu Bowl',
          category_name: 'Vegetarian',
          image_url: '/uploads/recipes/tofu-bowl.webp',
          calories: 420,
          protein: 28,
          prep_time: 10,
          cook_time: 15,
          avg_rating: 4.7,
          rating_count: 12,
          favorite_count: 8,
          tag_names: 'Healthy,Vegetarian',
        },
      ],
    },
    { intent: 'recipe_filter_search', entities: { responseLanguage: 'en' } }
  )

  assert.equal(response.mode, 'structured')
  assert.equal(response.groqCalled, false)
  assert.deepEqual(response.recipeSearchFilters, filters)
  assert.deepEqual(response.results[0], {
    id: 9,
    title: 'Healthy Tofu Bowl',
    category: 'Vegetarian',
    image_url: '/uploads/recipes/tofu-bowl.webp',
    prep_time: 10,
    cook_time: 15,
    servings: null,
    difficulty: null,
    calories: 420,
    protein: 28,
    avg_rating: 4.7,
    rating_count: 12,
    favorite_count: 8,
    tags: ['Healthy', 'Vegetarian'],
    match_coverage: null,
    matched_ingredient_count: null,
    requested_ingredient_count: null,
    missing_ingredients: [],
    result_type: 'recipe',
  })
})
