import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getDailyInspiration,
  mapTheMealDbInspiration,
  resetDailyInspirationCacheForTests,
} from '../services/dailyInspirationService.js'
import {
  answerFoodStoryProductDataQuestion,
  detectFoodStoryProductDataIntent,
} from '../services/foodStoryProductDataService.js'

function mealPayload(overrides = {}) {
  return {
    meals: [
      {
        idMeal: '777',
        strMeal: 'Test Noodle Bowl',
        strMealThumb: 'https://example.com/noodles.jpg',
        strCategory: 'Noodles',
        strArea: 'Vietnamese',
        strInstructions: 'Cook and serve.',
        strTags: 'Quick,Dinner',
        strIngredient1: 'Rice noodles',
        strMeasure1: '200 g',
        strIngredient2: 'Herbs',
        strMeasure2: '1 handful',
        ...overrides,
      },
    ],
  }
}

test('Daily Inspiration is shared for the same Vietnam calendar day', async () => {
  resetDailyInspirationCacheForTests()
  let fetchCount = 0
  const fetchImpl = async () => {
    fetchCount += 1
    return { ok: true, json: async () => mealPayload() }
  }
  const options = {
    fetchImpl,
    now: () => new Date('2026-07-15T04:00:00.000Z'),
  }

  const first = await getDailyInspiration(options)
  const second = await getDailyInspiration(options)

  assert.equal(fetchCount, 1)
  assert.equal(first.title, 'Test Noodle Bowl')
  assert.deepEqual(second, first)
  assert.equal(first.ingredients[0].name, 'Rice noodles')
})

test('Daily Inspiration fails closed to the honest homepage fallback', async () => {
  resetDailyInspirationCacheForTests()
  const meal = await getDailyInspiration({
    fetchImpl: async () => {
      throw new Error('provider unavailable')
    },
    now: () => new Date('2026-07-16T04:00:00.000Z'),
  })

  assert.equal(meal.isFallback, true)
  assert.equal(meal.source, 'fallback')
  assert.ok(meal.title)
  assert.ok(meal.image)
})

test('Daily Inspiration keeps a bounded full ingredient list and cleans instructions', () => {
  const rawMeal = mealPayload({
    strInstructions: '▢\r\nMix everything.\r\n\r\n▢\r\nServe.',
    strIngredient6: 'Lime',
    strMeasure6: '1',
  }).meals[0]
  const meal = mapTheMealDbInspiration(rawMeal)

  assert.equal(meal.ingredients.length, 3)
  assert.equal(meal.ingredients[2].name, 'Lime')
  assert.doesNotMatch(meal.description, /▢/)
  assert.match(meal.description, /Mix everything\.\n\nServe\./)
})

test('product-data intent detection covers natural English and Vietnamese phrasing', () => {
  assert.equal(
    detectFoodStoryProductDataIntent("What is today's random recipe?"),
    'daily_inspiration'
  )
  assert.equal(
    detectFoodStoryProductDataIntent('Món ngẫu nhiên hôm nay là gì?'),
    'daily_inspiration'
  )
  assert.equal(
    detectFoodStoryProductDataIntent('How many recipes does FoodStory have?'),
    'recipe_count'
  )
  assert.equal(
    detectFoodStoryProductDataIntent('FoodStory có bao nhiêu công thức?'),
    'recipe_count'
  )
  assert.equal(
    detectFoodStoryProductDataIntent('What ingredients does it use?', {
      previousIntent: 'daily_inspiration',
    }),
    'daily_inspiration_ingredients'
  )
  assert.equal(
    detectFoodStoryProductDataIntent('How do I make it?', {
      previousIntent: 'daily_inspiration_ingredients',
    }),
    'daily_inspiration_method'
  )
  assert.equal(
    detectFoodStoryProductDataIntent('How many restaurants does FoodStory have?'),
    'restaurant_count'
  )
  assert.equal(
    detectFoodStoryProductDataIntent('How many news articles are on your site?'),
    'news_count'
  )
  assert.equal(detectFoodStoryProductDataIntent('How many eggs are in pho?'), null)
})

test('recipe counts are loaded from the live public database', async () => {
  const database = {
    execute: async () => [[{
      approved_recipes: 121,
      recipe_categories: 14,
      restaurants: 10,
      news_articles: 12,
    }]],
  }
  const response = await answerFoodStoryProductDataQuestion(
    'How many recipes does FoodStory have?',
    'en',
    { database }
  )

  assert.equal(response.intent, 'recipe_count')
  assert.match(response.answer, /121 approved recipes/i)
  assert.match(response.answer, /14 public categories/i)
  assert.equal(response.sources[0].matchLevel, 'live database count')
})

test('chatbot Daily Inspiration uses the shared homepage service result', async () => {
  const response = await answerFoodStoryProductDataQuestion(
    "What's today's Daily Inspiration?",
    'en',
    {
      loadDailyInspiration: async () => ({
        id: 'shared-1',
        title: 'Shared Curry',
        image: '/images/Shared%20Curry.jpg',
        category: 'Curry',
        area: 'Vietnamese',
        ingredients: [{ name: 'Coconut milk' }, { name: 'Chicken' }],
      }),
    }
  )

  assert.equal(response.intent, 'daily_inspiration')
  assert.match(response.answer, /Shared Curry/)
  assert.equal(response.results[0].result_type, 'inspiration')
  assert.equal(response.results[0].image_url, '/images/Shared%20Curry.jpg')
  assert.equal(response.sources[0].path, '/#daily-inspiration')
})

test('Daily Inspiration follow-ups retain the shared meal context', async () => {
  const meal = {
    id: 'shared-2',
    title: 'Shared Curry',
    image: '/images/Shared%20Curry.jpg',
    category: 'Curry',
    area: 'Vietnamese',
    description: 'Simmer the chicken in coconut sauce and serve hot.',
    ingredients: [
      { name: 'Coconut milk', measure: '400 ml' },
      { name: 'Chicken', measure: '500 g' },
    ],
  }
  const ingredients = await answerFoodStoryProductDataQuestion(
    'What ingredients does it use?',
    'en',
    {
      previousIntent: 'daily_inspiration',
      loadDailyInspiration: async () => meal,
    }
  )
  const method = await answerFoodStoryProductDataQuestion(
    'How do I make it?',
    'en',
    {
      previousIntent: 'daily_inspiration_ingredients',
      loadDailyInspiration: async () => meal,
    }
  )

  assert.match(ingredients.answer, /400 ml Coconut milk/)
  assert.match(ingredients.answer, /500 g Chicken/)
  assert.match(method.answer, /Simmer the chicken/)
  assert.equal(method.results[0].title, 'Shared Curry')
})
