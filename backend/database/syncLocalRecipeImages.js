import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from '../db.js'

const WRITE_CHANGES = process.argv.includes('--write')
const COPY_SOURCE_ASSETS = process.argv.includes('--copy-assets') || WRITE_CHANGES
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '../..')
const FRONTEND_ROOT = path.join(PROJECT_ROOT, 'frontend')
const PUBLIC_ROOT = path.join(FRONTEND_ROOT, 'public')
const TARGET_RECIPE_DIR = path.join(PUBLIC_ROOT, 'images', 'recipes')
const SEARCH_ROOTS = [
  path.join(PUBLIC_ROOT, 'images', 'recipes'),
  path.join(PUBLIC_ROOT, 'images'),
  path.join(FRONTEND_ROOT, 'src', 'assets', 'recipes'),
  path.join(FRONTEND_ROOT, 'src', 'assets'),
]
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])
const IGNORED_NAMES = new Set(['food-placeholder', 'placeholder', 'logo', 'icon', 'avatar'])

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, '-') || 'recipe'
}

function compact(value) {
  return normalize(value).replace(/\s+/g, '')
}

async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function walk(directory) {
  if (!(await pathExists(directory))) {
    return []
  }

  const entries = await fs.readdir(directory, { withFileTypes: true })
  const results = []
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await walk(absolutePath)))
      continue
    }
    const extension = path.extname(entry.name).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(extension)) {
      continue
    }
    const stem = path.basename(entry.name, extension)
    if (IGNORED_NAMES.has(normalize(stem))) {
      continue
    }
    results.push({ absolutePath, extension, stem, key: compact(stem) })
  }
  return results
}

function currentFileName(imageUrl) {
  const clean = String(imageUrl || '').replace(/\\/g, '/').split(/[?#]/, 1)[0]
  return clean.split('/').filter(Boolean).pop() || ''
}

function matchScore(recipe, file) {
  const titleKey = compact(recipe.title)
  const fileKey = file.key.replace(/^\d+/, '')
  const currentName = currentFileName(recipe.image_url)
  if (currentName && currentName.toLowerCase() === path.basename(file.absolutePath).toLowerCase()) {
    return 130
  }
  if (fileKey === titleKey) {
    return 120
  }
  if (fileKey.endsWith(titleKey) || titleKey.endsWith(fileKey)) {
    return Math.min(fileKey.length, titleKey.length) >= 8 ? 105 : 0
  }

  const titleWords = new Set(normalize(recipe.title).split(' ').filter((word) => word.length >= 3))
  const fileWords = new Set(normalize(file.stem).split(' ').filter((word) => word.length >= 3))
  const overlap = [...titleWords].filter((word) => fileWords.has(word)).length
  const denominator = Math.max(titleWords.size, fileWords.size, 1)
  const ratio = overlap / denominator
  return ratio >= 0.8 && overlap >= 2 ? 90 + Math.round(ratio * 10) : 0
}

function findUniqueMatch(recipe, files) {
  const ranked = files
    .map((file) => ({ file, score: matchScore(recipe, file) }))
    .filter((entry) => entry.score >= 90)
    .sort((left, right) => right.score - left.score || left.file.absolutePath.localeCompare(right.file.absolutePath))

  if (!ranked.length) {
    return null
  }
  if (ranked[1] && ranked[1].score === ranked[0].score) {
    return { ambiguous: true, matches: ranked.filter((entry) => entry.score === ranked[0].score) }
  }
  return ranked[0]
}

function isInside(child, parent) {
  const relative = path.relative(parent, child)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function publicUrlFor(recipe, file) {
  if (isInside(file.absolutePath, PUBLIC_ROOT)) {
    return `/${path.relative(PUBLIC_ROOT, file.absolutePath).replace(/\\/g, '/')}`
  }

  if (!COPY_SOURCE_ASSETS) {
    return null
  }

  await fs.mkdir(TARGET_RECIPE_DIR, { recursive: true })
  const targetName = `${slugify(recipe.title)}${file.extension}`
  const targetPath = path.join(TARGET_RECIPE_DIR, targetName)
  if (!(await pathExists(targetPath))) {
    await fs.copyFile(file.absolutePath, targetPath)
  }
  return `/images/recipes/${targetName}`
}

async function main() {
  const uniqueFiles = new Map()
  for (const root of SEARCH_ROOTS) {
    for (const file of await walk(root)) {
      uniqueFiles.set(path.resolve(file.absolutePath).toLowerCase(), file)
    }
  }
  const files = [...uniqueFiles.values()]
  const [recipes] = await pool.execute(
    'SELECT id, title, image_url FROM recipes ORDER BY id ASC',
  )

  console.log(`Found ${files.length} local image files and ${recipes.length} recipes.`)
  console.log(WRITE_CHANGES ? 'WRITE MODE: matching image_url values will be updated.' : 'DRY RUN: no database values will change.')

  const updates = []
  const missing = []
  const ambiguous = []

  for (const recipe of recipes) {
    const match = findUniqueMatch(recipe, files)
    if (!match) {
      missing.push(recipe)
      continue
    }
    if (match.ambiguous) {
      ambiguous.push({ recipe, matches: match.matches })
      continue
    }

    const imageUrl = await publicUrlFor(recipe, match.file)
    if (!imageUrl) {
      missing.push(recipe)
      continue
    }
    updates.push({ recipe, imageUrl, file: match.file, score: match.score })
  }

  if (WRITE_CHANGES && updates.length) {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      for (const update of updates) {
        await connection.execute('UPDATE recipes SET image_url = ? WHERE id = ?', [update.imageUrl, update.recipe.id])
      }
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  updates.forEach((update) => {
    const action = WRITE_CHANGES ? 'updated' : 'would update'
    console.log(`[${action}] #${update.recipe.id} ${update.recipe.title}`)
    console.log(`  ${update.recipe.image_url || '(blank)'} -> ${update.imageUrl}`)
  })

  ambiguous.forEach((item) => {
    console.log(`[ambiguous] #${item.recipe.id} ${item.recipe.title}`)
    item.matches.forEach((match) => console.log(`  ${match.file.absolutePath}`))
  })

  missing.forEach((recipe) => {
    console.log(`[no local match] #${recipe.id} ${recipe.title}`)
  })

  const duplicateMap = new Map()
  for (const update of updates) {
    duplicateMap.set(update.imageUrl, (duplicateMap.get(update.imageUrl) || 0) + 1)
  }
  const duplicates = [...duplicateMap.entries()].filter(([, count]) => count > 1)

  console.log('')
  console.log(JSON.stringify({
    mode: WRITE_CHANGES ? 'write' : 'dry-run',
    localFiles: files.length,
    recipes: recipes.length,
    matched: updates.length,
    ambiguous: ambiguous.length,
    unmatched: missing.length,
    duplicateTargets: duplicates.length,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error('Failed to synchronize recipe images:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
