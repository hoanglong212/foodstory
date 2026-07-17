import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from '../db.js'
import { recipes } from './seedRecipes.js'
import { recipeImageAssetName, recipeImageUrl } from './recipeImageCatalog.js'

const databaseDirectory = path.dirname(fileURLToPath(import.meta.url))
const imageDirectory = path.resolve(
  databaseDirectory,
  '../../frontend/public/images'
)

async function assertImageExists(title) {
  const assetName = recipeImageAssetName(title)
  const assetPath = path.join(imageDirectory, assetName)
  await fs.access(assetPath)
  return assetPath
}

export async function syncRecipeImages({ dryRun = false } = {}) {
  const connection = await pool.getConnection()
  const missingAssets = []
  let matchedRecipes = 0
  let updatedRows = 0
  let placeholderRows = 0

  try {
    await connection.beginTransaction()

    for (const recipe of recipes) {
      try {
        await assertImageExists(recipe.title)
      } catch {
        missingAssets.push(recipe.title)
        const [result] = await connection.execute(
          'UPDATE recipes SET image_url = ? WHERE title = ?',
          ['/images/food-placeholder.jpg', recipe.title]
        )
        placeholderRows += result.affectedRows
        continue
      }

      matchedRecipes += 1
      const [result] = await connection.execute(
        'UPDATE recipes SET image_url = ? WHERE title = ?',
        [recipeImageUrl(recipe.title), recipe.title]
      )
      updatedRows += result.affectedRows
    }

    if (dryRun) await connection.rollback()
    else await connection.commit()

    return {
      dryRun,
      catalogRecipes: recipes.length,
      matchedRecipes,
      updatedRows,
      placeholderRows,
      missingAssets,
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  syncRecipeImages({ dryRun: process.argv.includes('--dry-run') })
    .then((summary) => console.log(JSON.stringify(summary, null, 2)))
    .catch((error) => {
      console.error('Failed to sync recipe images:', error.message)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
