import pool from '../db.js'

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function words(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((word) => word.length >= 4)
}

function classifyImage(recipe, duplicateCount) {
  const imageUrl = String(recipe.image_url || '').trim()
  if (!imageUrl) {
    return {
      status: 'missing',
      reason: 'No image_url is set.',
    }
  }

  if (imageUrl.startsWith('/images/')) {
    const expectedName = `${String(recipe.title || '').trim()}.jpg`
    const actualName = decodeURIComponent(imageUrl.slice('/images/'.length))
    return actualName === expectedName
      ? {
          status: 'verified_local',
          reason: 'Local asset filename exactly matches the recipe title.',
        }
      : {
          status: 'manual_review',
          reason: `Local asset ${actualName} does not exactly match ${expectedName}.`,
        }
  }

  let parsedUrl
  try {
    parsedUrl = new URL(imageUrl)
  } catch {
    return {
      status: 'invalid_url',
      reason: 'image_url is not a valid URL.',
    }
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return {
      status: 'invalid_url',
      reason: 'image_url must use http or https.',
    }
  }

  if (duplicateCount > 1) {
    return {
      status: 'duplicate',
      reason: `The same image URL is used by ${duplicateCount} recipes.`,
    }
  }

  const searchableUrl = normalizeText(decodeURIComponent(imageUrl))
  const terms = [...new Set([...words(recipe.title), ...words(recipe.category_name)])]
  const matches = terms.filter((term) => searchableUrl.includes(term))

  if (matches.length > 0) {
    return {
      status: 'likely_match',
      reason: `URL text includes recipe/category term(s): ${matches.join(', ')}.`,
    }
  }

  if (parsedUrl.hostname.includes('images.unsplash.com')) {
    return {
      status: 'manual_review',
      reason:
        'Unsplash photo IDs are generic and do not describe the food; visually confirm this image.',
    }
  }

  return {
    status: 'manual_review',
    reason: 'Could not infer a recipe match from the URL text.',
  }
}

async function auditRecipeImages() {
  const [recipes] = await pool.execute(
    `SELECT
       r.id,
       r.title,
       r.image_url,
       c.name AS category_name
     FROM recipes r
     JOIN categories c ON c.id = r.category_id
     ORDER BY r.id ASC`,
  )

  if (recipes.length === 0) {
    console.log('No recipes found. There are no recipe images to audit.')
    return
  }

  const imageCounts = new Map()
  recipes.forEach((recipe) => {
    const imageUrl = String(recipe.image_url || '').trim()
    if (!imageUrl) {
      return
    }
    imageCounts.set(imageUrl, (imageCounts.get(imageUrl) || 0) + 1)
  })

  const findings = recipes.map((recipe) => {
    const imageUrl = String(recipe.image_url || '').trim()
    const finding = classifyImage(recipe, imageCounts.get(imageUrl) || 0)
    return {
      id: recipe.id,
      title: recipe.title,
      category: recipe.category_name,
      status: finding.status,
      reason: finding.reason,
      image_url: imageUrl,
    }
  })

  const summary = findings.reduce(
    (totals, finding) => {
      totals[finding.status] = (totals[finding.status] || 0) + 1
      return totals
    },
    { total: findings.length },
  )

  console.log('Recipe image audit summary:')
  console.log(JSON.stringify(summary, null, 2))
  console.log('')

  findings.forEach((finding) => {
    console.log(`[${finding.status}] #${finding.id} ${finding.title}`)
    console.log(`  Category: ${finding.category}`)
    console.log(`  Reason: ${finding.reason}`)
    console.log(`  Image: ${finding.image_url || '(blank)'}`)
  })
}

auditRecipeImages()
  .catch((error) => {
    console.error('Failed to audit recipe images:', error.message)
    process.exit(1)
  })
  .finally(async () => {
    await pool.end()
  })
