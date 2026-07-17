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
