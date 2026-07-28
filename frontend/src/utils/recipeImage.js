const IMAGE_EXTENSIONS = ['jpg', 'webp', 'png', 'jpeg', 'avif']
const PUBLIC_IMAGE_DIRS = ['/images/recipes', '/images']
const SOURCE_IMAGE_DIRS = ['/src/assets/recipes', '/src/assets']

function firstPresent(...values) {
  const value = values.find((item) => item !== null && item !== undefined && String(item).trim())
  return value === undefined ? '' : String(value).trim()
}

function hashText(value) {
  return [...String(value || 'FoodStory')].reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0,
    0,
  )
}

function unique(values) {
  return values.filter((value, index, items) => value && items.indexOf(value) === index)
}

function removeWrappingQuotes(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
}

export function slugifyRecipeTitle(value) {
  return String(value || 'recipe')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'recipe'
}

export function normalizeRecipeImagePath(value) {
  const raw = removeWrappingQuotes(value)
  if (!raw) {
    return ''
  }

  if (/^(?:data:|blob:|https?:\/\/)/i.test(raw)) {
    return raw
  }

  let normalized = raw.replace(/\\/g, '/').replace(/\/+/g, '/')

  const publicMarker = normalized.toLowerCase().lastIndexOf('/public/')
  if (publicMarker >= 0) {
    normalized = normalized.slice(publicMarker + '/public'.length)
  }

  const frontendPublicMarker = normalized.toLowerCase().indexOf('frontend/public/')
  if (frontendPublicMarker >= 0) {
    normalized = normalized.slice(frontendPublicMarker + 'frontend/public'.length)
  }

  const sourceMarker = normalized.toLowerCase().lastIndexOf('/src/assets/')
  if (sourceMarker >= 0) {
    normalized = normalized.slice(sourceMarker)
  }

  normalized = normalized
    .replace(/^\.?\//, '/')
    .replace(/^frontend\//i, '/')
    .replace(/^public\//i, '/')

  if (/^images\//i.test(normalized) || /^assets\//i.test(normalized) || /^src\//i.test(normalized)) {
    normalized = `/${normalized}`
  }

  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`
  }

  return normalized.replace(/\/+/g, '/')
}

function fileNameFromPath(value) {
  const normalized = removeWrappingQuotes(value).replace(/\\/g, '/')
  const cleanPath = normalized.split(/[?#]/, 1)[0]
  return cleanPath.split('/').filter(Boolean).pop() || ''
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(String(value || ''))
  } catch {
    return String(value || '')
  }
}

function safeFileStem(value) {
  return decodePathSegment(value)
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[\\/]/g, ' ')
    .trim()
}

function encodeFileName(stem, extension) {
  return `${encodeURIComponent(stem)}.${extension}`
}

function localCandidatesFromStem(stem) {
  if (!stem) return []

  return [...PUBLIC_IMAGE_DIRS, ...SOURCE_IMAGE_DIRS].flatMap((directory) =>
    IMAGE_EXTENSIONS.map((extension) => `${directory}/${encodeFileName(stem, extension)}`),
  )
}

function titleCandidates(recipe) {
  const title = firstPresent(recipe?.title, recipe?.name)
  const slug = slugifyRecipeTitle(title)
  return unique([
    ...localCandidatesFromStem(title),
    ...PUBLIC_IMAGE_DIRS.flatMap((directory) =>
      IMAGE_EXTENSIONS.map((extension) => `${directory}/${slug}.${extension}`),
    ),
  ])
}

export function createRecipePlaceholder(recipe) {
  const title = firstPresent(recipe?.title, recipe?.name, 'FoodStory Recipe')
  const category = firstPresent(recipe?.category_name, recipe?.categoryName, 'Recipe')
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('') || 'FS'
  const seed = hashText(`${title}:${category}`)
  const hue = 18 + (seed % 38)
  const secondHue = 72 + (seed % 32)
  const safeTitle = title.replace(/[<>&'"]/g, '')
  const safeCategory = category.replace(/[<>&'"]/g, '')
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="hsl(${hue} 72% 90%)"/>
          <stop offset="1" stop-color="hsl(${secondHue} 55% 86%)"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#g)"/>
      <circle cx="600" cy="315" r="142" fill="rgba(255,255,255,.68)"/>
      <text x="600" y="350" text-anchor="middle" font-family="Arial, sans-serif" font-size="112" font-weight="700" fill="#6f4b35">${initials}</text>
      <text x="600" y="535" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#3f342e">${safeTitle.slice(0, 38)}</text>
      <text x="600" y="595" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#66564d">${safeCategory}</text>
    </svg>`

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export function getRecipeImageCandidates(recipe) {
  const rawSource = firstPresent(
    recipe?.image_url,
    recipe?.imageUrl,
    recipe?.image,
    recipe?.photo_url,
    recipe?.photoUrl,
  )
  const normalizedSource = normalizeRecipeImagePath(rawSource)
  const fileName = fileNameFromPath(rawSource)
  const fileNameCandidates = localCandidatesFromStem(safeFileStem(fileName))
  const slugCandidates = titleCandidates(recipe)
  const sourceIsRemote = /^https?:\/\//i.test(normalizedSource)

  return unique([
    ...(sourceIsRemote ? slugCandidates : []),
    ...(sourceIsRemote ? fileNameCandidates : []),
    normalizedSource,
    ...(sourceIsRemote ? [] : fileNameCandidates),
    ...(sourceIsRemote ? [] : slugCandidates),
    createRecipePlaceholder(recipe),
  ])
}

export function getRecipeImageSource(recipe) {
  return getRecipeImageCandidates(recipe)[0]
}

export function getRecipeBackgroundImage(recipe) {
  const explicitSource = normalizeRecipeImagePath(
    firstPresent(recipe?.image_url, recipe?.imageUrl, recipe?.image, recipe?.photo_url),
  )
  return explicitSource || createRecipePlaceholder(recipe)
}

export function advanceRecipeImage(event, recipe) {
  const image = event?.currentTarget || event?.target
  if (!image) {
    return
  }

  const candidates = getRecipeImageCandidates(recipe)
  const currentIndex = Number.parseInt(image.dataset.recipeImageIndex || '0', 10)
  const nextIndex = Number.isFinite(currentIndex) ? currentIndex + 1 : 1

  if (nextIndex >= candidates.length) {
    image.onerror = null
    image.src = createRecipePlaceholder(recipe)
    return
  }

  image.dataset.recipeImageIndex = String(nextIndex)
  image.src = candidates[nextIndex]
}
