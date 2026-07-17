const GUARDIAN_CONTENT_API_URL = 'https://content.guardianapis.com/search'

export const EXTERNAL_NEWS_CATEGORIES = [
  'Recipes',
  'Restaurants',
  'Drinks',
  'Sustainability',
  'Food travel',
]

const CATEGORY_QUERIES = new Map([
  ['recipes', '(recipe OR recipes OR cooking)'],
  ['restaurants', '(restaurant OR dining OR chef)'],
  ['drinks', '(coffee OR tea OR wine OR cocktail OR beverage)'],
  ['sustainability', '(sustainable OR sustainability OR climate OR agriculture)'],
  ['food travel', '(travel OR destination OR cuisine)'],
])

const CATEGORY_LABELS = new Map(
  EXTERNAL_NEWS_CATEGORIES.map((category) => [category.toLowerCase(), category]),
)

const responseCache = new Map()
const MAX_CACHE_ENTRIES = 100

export class ExternalNewsConfigurationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ExternalNewsConfigurationError'
    this.code = 'EXTERNAL_NEWS_NOT_CONFIGURED'
    this.status = 503
  }
}

export class ExternalNewsProviderError extends Error {
  constructor(message, status = 502) {
    super(message)
    this.name = 'ExternalNewsProviderError'
    this.code = 'EXTERNAL_NEWS_PROVIDER_ERROR'
    this.status = status
  }
}

function toBoundedPositiveInt(value, fallback, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback
  }
  return Math.min(parsed, maximum)
}

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/\s+/gu, ' ')
    .trim()
}

function normalizeCategory(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return CATEGORY_LABELS.get(normalized) || 'All'
}

function inferCategory(article, requestedCategory) {
  const requested = normalizeCategory(requestedCategory)
  if (requested !== 'All') {
    return requested
  }

  const haystack = [
    article.webTitle,
    article.fields?.trailText,
    ...(article.tags || []).map((tag) => tag.webTitle),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (/\b(recipe|recipes|cook|cooking|bake|baking)\b/u.test(haystack)) {
    return 'Recipes'
  }
  if (/\b(restaurant|restaurants|dining|chef|eatery)\b/u.test(haystack)) {
    return 'Restaurants'
  }
  if (/\b(coffee|tea|wine|cocktail|beer|drink|beverage)\b/u.test(haystack)) {
    return 'Drinks'
  }
  if (/\b(sustainable|sustainability|climate|agriculture|farming|waste)\b/u.test(haystack)) {
    return 'Sustainability'
  }
  if (/\b(travel|destination|tour|city guide|cuisine)\b/u.test(haystack)) {
    return 'Food travel'
  }
  return 'Food'
}

export function buildGuardianNewsUrl({
  apiKey,
  page = 1,
  pageSize = 4,
  search = '',
  category = 'all',
  date = '',
} = {}) {
  if (!apiKey) {
    throw new ExternalNewsConfigurationError(
      'External food news is not configured. Add GUARDIAN_API_KEY to backend/.env.',
    )
  }

  const safePage = toBoundedPositiveInt(page, 1, 1000)
  const safePageSize = toBoundedPositiveInt(pageSize, 4, 20)
  const safeSearch = String(search ?? '').trim().slice(0, 120)
  const safeCategory = String(category ?? '').trim().toLowerCase()
  const categoryQuery = CATEGORY_QUERIES.get(safeCategory) || ''
  const query = [categoryQuery, safeSearch].filter(Boolean).join(' AND ')

  const url = new URL(GUARDIAN_CONTENT_API_URL)
  url.searchParams.set('api-key', apiKey)
  url.searchParams.set('section', 'food')
  url.searchParams.set('page', String(safePage))
  url.searchParams.set('page-size', String(safePageSize))
  url.searchParams.set('order-by', 'newest')
  url.searchParams.set('show-fields', 'trailText,thumbnail,byline,headline')
  url.searchParams.set('show-tags', 'keyword')

  if (query) {
    url.searchParams.set('q', query)
  }
  if (date) {
    url.searchParams.set('from-date', date)
    url.searchParams.set('to-date', date)
  }

  return url
}

export function normalizeGuardianArticle(article, requestedCategory = 'all') {
  const publishedAt = String(article?.webPublicationDate || '')
  const title = stripHtml(article?.fields?.headline || article?.webTitle || 'Untitled article')
  const summary = stripHtml(article?.fields?.trailText || '')

  return {
    id: String(article?.id || article?.webUrl || title),
    title,
    content: summary || 'Open the original article to continue reading.',
    category: inferCategory(article || {}, requestedCategory),
    published_date: publishedAt ? publishedAt.slice(0, 10) : '',
    published_at: publishedAt,
    url: String(article?.webUrl || ''),
    thumbnail: String(article?.fields?.thumbnail || ''),
    author: stripHtml(article?.fields?.byline || ''),
    source: 'The Guardian',
    isExternal: true,
  }
}

function makeCacheKey({ page, pageSize, search, category, date }) {
  return JSON.stringify({
    page: Number(page) || 1,
    pageSize: Number(pageSize) || 4,
    search: String(search || '').trim(),
    category: String(category || 'all').trim().toLowerCase(),
    date: String(date || '').trim(),
  })
}

function getCachedResponse(cacheKey, now) {
  const cached = responseCache.get(cacheKey)
  if (!cached) {
    return null
  }
  if (cached.expiresAt <= now) {
    responseCache.delete(cacheKey)
    return null
  }
  return cached.value
}

function setCachedResponse(cacheKey, value, expiresAt) {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value
    if (oldestKey) {
      responseCache.delete(oldestKey)
    }
  }
  responseCache.set(cacheKey, { value, expiresAt })
}

export function clearGuardianNewsCache() {
  responseCache.clear()
}

export async function fetchGuardianNews({
  page = 1,
  pageSize = 4,
  search = '',
  category = 'all',
  date = '',
  apiKey = process.env.GUARDIAN_API_KEY,
  timeoutMs = Number(process.env.GUARDIAN_API_TIMEOUT_MS || 8000),
  cacheTtlMs = Number(process.env.GUARDIAN_NEWS_CACHE_TTL_MS || 300000),
  fetchImpl = globalThis.fetch,
  useCache = true,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new ExternalNewsConfigurationError('The current Node runtime does not provide fetch().')
  }

  const requestUrl = buildGuardianNewsUrl({ apiKey, page, pageSize, search, category, date })
  const cacheKey = makeCacheKey({ page, pageSize, search, category, date })
  const now = Date.now()

  if (useCache && cacheTtlMs > 0) {
    const cached = getCachedResponse(cacheKey, now)
    if (cached) {
      return { ...cached, cached: true }
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs))

  try {
    const response = await fetchImpl(requestUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'FoodStory/1.0 (student food discovery project)',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      const status = response.status === 429 ? 503 : 502
      throw new ExternalNewsProviderError(
        `The Guardian API returned HTTP ${response.status}. Please try again later.`,
        status,
      )
    }

    const payload = await response.json()
    const guardianResponse = payload?.response
    if (guardianResponse?.status !== 'ok' || !Array.isArray(guardianResponse.results)) {
      throw new ExternalNewsProviderError('The Guardian API returned an unexpected response.')
    }

    const value = {
      items: guardianResponse.results.map((article) =>
        normalizeGuardianArticle(article, category),
      ),
      currentPage: Number(guardianResponse.currentPage || page || 1),
      totalPages: Math.max(1, Number(guardianResponse.pages || 1)),
      totalItems: Math.max(0, Number(guardianResponse.total || 0)),
      categories: EXTERNAL_NEWS_CATEGORIES,
      provider: {
        id: 'guardian-open-platform',
        name: 'The Guardian Open Platform',
        homepage: 'https://open-platform.theguardian.com/',
        external: true,
      },
      cached: false,
    }

    if (useCache && cacheTtlMs > 0) {
      setCachedResponse(cacheKey, value, now + cacheTtlMs)
    }

    return value
  } catch (error) {
    if (error instanceof ExternalNewsConfigurationError || error instanceof ExternalNewsProviderError) {
      throw error
    }
    if (error?.name === 'AbortError') {
      throw new ExternalNewsProviderError('The external food-news provider timed out.', 504)
    }
    throw new ExternalNewsProviderError('Unable to retrieve external food news at this time.')
  } finally {
    clearTimeout(timeout)
  }
}
