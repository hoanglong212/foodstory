const DAILY_INSPIRATION_URL = 'https://www.themealdb.com/api/json/v1/1/random.php'
const DAILY_INSPIRATION_TIMEOUT_MS = 2_500

export const FALLBACK_DAILY_INSPIRATION = Object.freeze({
  id: 'fallback-steak-and-kidney-pie',
  title: 'Steak and Kidney Pie',
  image: 'https://www.themealdb.com/images/media/meals/qysyss1511558054.jpg',
  category: 'Beef',
  area: 'British',
  description:
    'A rich savory pie for days when you want something different without losing the comfort of a home-cooked meal.',
  tags: [],
  ingredients: [],
  source: 'fallback',
  isFallback: true,
})

let cachedInspiration = null
let inFlightInspiration = null

function vietnamDateKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

function extractIngredients(meal = {}) {
  const ingredients = []
  for (let index = 1; index <= 20; index += 1) {
    const name = String(meal[`strIngredient${index}`] || '').trim()
    if (!name) continue
    ingredients.push({
      name,
      measure: String(meal[`strMeasure${index}`] || '').trim(),
    })
  }
  return ingredients.slice(0, 20)
}

function sanitizeInstructions(value) {
  return String(value || '')
    .replace(/[□▢■]+/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2_000)
}

export function mapTheMealDbInspiration(meal = {}) {
  const title = String(meal.strMeal || '').trim()
  const image = String(meal.strMealThumb || '').trim()
  if (!title || !image) return null

  return {
    id: String(meal.idMeal || title).trim().slice(0, 80),
    title: title.slice(0, 180),
    image,
    category: String(meal.strCategory || 'Meal').trim().slice(0, 80),
    area: String(meal.strArea || 'Global').trim().slice(0, 80),
    description: sanitizeInstructions(meal.strInstructions),
    tags: String(meal.strTags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 3),
    ingredients: extractIngredients(meal),
    source: 'themealdb',
    isFallback: false,
  }
}

async function fetchDailyInspiration(fetchImpl) {
  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    DAILY_INSPIRATION_TIMEOUT_MS
  )

  try {
    const response = await fetchImpl(DAILY_INSPIRATION_URL, {
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`TheMealDB returned HTTP ${response.status}`)
    const payload = await response.json()
    const inspiration = mapTheMealDbInspiration(payload?.meals?.[0])
    if (!inspiration) throw new Error('TheMealDB returned no usable meal')
    return inspiration
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function getDailyInspiration({
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  const dateKey = vietnamDateKey(now())
  if (cachedInspiration?.dateKey === dateKey) return cachedInspiration.meal
  if (inFlightInspiration?.dateKey === dateKey) return inFlightInspiration.promise

  const promise = (async () => {
    try {
      const meal = await fetchDailyInspiration(fetchImpl)
      cachedInspiration = { dateKey, meal: { ...meal, dateKey } }
    } catch (error) {
      console.error('[Daily Inspiration] provider fallback:', error.message)
      cachedInspiration = {
        dateKey,
        meal: { ...FALLBACK_DAILY_INSPIRATION, dateKey },
      }
    }
    return cachedInspiration.meal
  })().finally(() => {
    if (inFlightInspiration?.promise === promise) inFlightInspiration = null
  })

  inFlightInspiration = { dateKey, promise }
  return promise
}

export function resetDailyInspirationCacheForTests() {
  cachedInspiration = null
  inFlightInspiration = null
}
