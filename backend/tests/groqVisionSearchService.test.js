import test from 'node:test'
import assert from 'node:assert/strict'
import {
  analyzeFoodImage,
  matchVisionCandidatesToFoodStory,
  parseGroqVisionResponse,
} from '../services/groqVisionSearchService.js'

test('Groq vision responses preserve ranked dish candidates without inventing labels', () => {
  const parsed = parseGroqVisionResponse(`\`\`\`json
    {
      "is_food": true,
      "food_score": 0.94,
      "candidates": [
        {"name":"Mi quang","alternative_names":["Quang noodles"],"confidence":0.63,"evidence":"yellow noodles"},
        {"name":"Cao lau","alternative_names":["Cao lầu"],"confidence":0.91,"evidence":"thick brown noodles"}
      ]
    }
  \`\`\``)

  assert.equal(parsed.isFood, true)
  assert.equal(parsed.foodScore, 0.94)
  assert.deepEqual(parsed.candidates.map((candidate) => candidate.name), [
    'Cao lau',
    'Mi quang',
  ])
  assert.deepEqual(parsed.candidates[0].alternativeNames, ['Cao lầu'])
})

test('Groq image request uses the configured multimodal model and JSON contract', async () => {
  let request
  const client = {
    chat: {
      completions: {
        async create(payload) {
          request = payload
          return {
            model: 'vision-test-model',
            choices: [{
              message: {
                content: JSON.stringify({
                  is_food: true,
                  food_score: 88,
                  candidates: [{ name: 'Cao lầu', confidence: 86 }],
                }),
              },
            }],
          }
        },
      },
    },
  }

  const result = await analyzeFoodImage('https://example.com/cao-lau.jpg', {
    client,
    model: 'vision-test-model',
  })

  assert.equal(request.model, 'vision-test-model')
  assert.equal(request.response_format.type, 'json_object')
  assert.equal(
    request.messages[1].content[1].image_url.url,
    'https://example.com/cao-lau.jpg'
  )
  assert.equal(result.foodScore, 0.88)
  assert.equal(result.candidates[0].name, 'Cao lầu')
})

test('recognized dishes map only to matching FoodStory recipes and restaurants', async () => {
  const recipeQueries = []
  const restaurantQueries = []
  const result = await matchVisionCandidatesToFoodStory(
    [{
      name: 'Cao lầu',
      alternativeNames: ['Cao lau noodles'],
      confidence: 0.91,
      evidence: 'thick noodles',
    }],
    {
      async recipeSearch(filters) {
        recipeQueries.push(filters.query)
        return filters.query === 'Cao lầu'
          ? {
              status: 'matched',
              results: [
                {
                  id: 42,
                  title: 'Cao Lầu',
                  image_url: '/images/cao-lau.webp',
                  avg_rating: 4.8,
                  category_name: 'Vietnamese',
                },
                {
                  id: 43,
                  title: 'Vietnamese Lemongrass Chicken',
                  image_url: '/images/chicken.webp',
                  avg_rating: 4.7,
                  category_name: 'Vietnamese',
                },
              ],
            }
          : { status: 'no_results', results: [] }
      },
      async restaurantSearch(filters) {
        restaurantQueries.push(filters.dishName)
        return {
          status: 'no_exact_constraint_match',
          results: [{ id: 9, name: 'Unrelated restaurant' }],
        }
      },
    }
  )

  assert.deepEqual(recipeQueries, ['Cao lầu', 'Cao lau noodles'])
  assert.deepEqual(restaurantQueries, ['Cao lầu', 'Cao lau noodles'])
  assert.equal(result.total, 1)
  assert.equal(result.recipes[0].title, 'Cao Lầu')
  assert.deepEqual(result.restaurants, [])
})
