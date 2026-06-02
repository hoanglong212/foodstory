const DAILY_MEAL_CACHE_KEY = 'foodstory_daily_meal_cache'
const DAILY_MEAL_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const DAILY_MEAL_TIMEOUT_MS = 2500
const DAILY_MEAL_URL = 'https://www.themealdb.com/api/json/v1/1/random.php'

function readCachedMeal() {
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(DAILY_MEAL_CACHE_KEY) || 'null')
    if (!cached?.meal || !cached?.savedAt) {
      return null
    }

    if (Date.now() - cached.savedAt > DAILY_MEAL_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(DAILY_MEAL_CACHE_KEY)
      return null
    }

    return cached.meal
  } catch {
    return null
  }
}

function writeCachedMeal(meal) {
  try {
    window.sessionStorage.setItem(
      DAILY_MEAL_CACHE_KEY,
      JSON.stringify({
        meal,
        savedAt: Date.now(),
      }),
    )
  } catch {
    // Cache is an optimization only.
  }
}

export async function fetchDailyMeal() {
  const cachedMeal = readCachedMeal()
  if (cachedMeal) {
    return cachedMeal
  }

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), DAILY_MEAL_TIMEOUT_MS)

  const response = await fetch(DAILY_MEAL_URL, { signal: controller.signal }).finally(() => {
    window.clearTimeout(timeoutId)
  })

  if (!response.ok) {
    throw new Error('Unable to load TheMealDB inspiration.')
  }

  const data = await response.json()
  const meal = data.meals?.[0]

  if (!meal) {
    throw new Error('TheMealDB returned no meal today.')
  }

  const mealSummary = {
    title: meal.strMeal,
    image: meal.strMealThumb,
    category: meal.strCategory,
    area: meal.strArea,
    description: meal.strInstructions,
  }

  writeCachedMeal(mealSummary)
  return mealSummary
}
