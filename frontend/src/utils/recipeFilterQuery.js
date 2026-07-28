export const RECIPE_SORTS = Object.freeze([
  'newest',
  'popular',
  'rating',
  'fastest',
  'lightest',
  'protein',
  'saved',
])

const recipeSortSet = new Set(RECIPE_SORTS)

function queryText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeRecipeFilterQuery(query = {}) {
  const sort = queryText(query.sort).toLowerCase()

  return {
    search: queryText(query.search),
    category: queryText(query.category) || 'all',
    tag: queryText(query.tag) || 'all',
    sort: recipeSortSet.has(sort) ? sort : 'newest',
  }
}

export function buildRecipeFilterQuery(filters = {}) {
  const normalized = normalizeRecipeFilterQuery(filters)
  const query = {}

  if (normalized.search) {
    query.search = normalized.search
  }
  if (normalized.category !== 'all') {
    query.category = normalized.category
  }
  if (normalized.tag !== 'all') {
    query.tag = normalized.tag
  }
  if (normalized.sort !== 'newest') {
    query.sort = normalized.sort
  }

  return query
}

export function recipeFilterStatesEqual(left, right) {
  const normalizedLeft = normalizeRecipeFilterQuery(left)
  const normalizedRight = normalizeRecipeFilterQuery(right)

  return ['search', 'category', 'tag', 'sort'].every(
    (key) => normalizedLeft[key] === normalizedRight[key],
  )
}
