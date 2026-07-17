import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from '../db.js'
import { expandedRecipeCatalog } from './expandedRecipeCatalog.js'

const MIGRATION_NAME = 'expanded_recipe_catalog_v4_all_generated_recipe_images'

async function ensureMigrationTable(connection) {
  await connection.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name VARCHAR(255) PRIMARY KEY,
       run_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  )
}

async function upsertNames(connection, table, names) {
  for (const name of names) {
    await connection.execute(
      `INSERT INTO ${table} (name) VALUES (?) ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [name],
    )
  }
}

async function nameIdMap(connection, table, names) {
  const placeholders = names.map(() => '?').join(', ')
  const [rows] = await connection.execute(
    `SELECT id, name FROM ${table} WHERE name IN (${placeholders})`,
    names,
  )
  return new Map(rows.map((row) => [row.name, row.id]))
}

export async function migrateExpandedRecipeCatalog() {
  const connection = await pool.getConnection()

  try {
    await ensureMigrationTable(connection)
    const [applied] = await connection.execute(
      'SELECT name FROM schema_migrations WHERE name = ?',
      [MIGRATION_NAME],
    )
    if (applied.length > 0) {
      console.log(`Skipping ${MIGRATION_NAME}; already applied.`)
      return { inserted: 0, skipped: expandedRecipeCatalog.length }
    }

    await connection.beginTransaction()
    const categories = [...new Set(expandedRecipeCatalog.map((recipe) => recipe.category))]
    const tags = [...new Set(expandedRecipeCatalog.flatMap((recipe) => recipe.tags))]
    await upsertNames(connection, 'categories', categories)
    await upsertNames(connection, 'tags', tags)

    const categoryIds = await nameIdMap(connection, 'categories', categories)
    const tagIds = await nameIdMap(connection, 'tags', tags)
    const titles = expandedRecipeCatalog.map((recipe) => recipe.title)
    const placeholders = titles.map(() => '?').join(', ')
    const [existingRows] = await connection.execute(
      `SELECT id, title, submitted_by FROM recipes WHERE title IN (${placeholders})`,
      titles,
    )
    const existingByTitle = new Map(
      existingRows.map((row) => [row.title.toLocaleLowerCase('en-US'), row]),
    )

    let inserted = 0
    let updated = 0
    let skipped = 0
    for (const recipe of expandedRecipeCatalog) {
      const existingRecipe = existingByTitle.get(recipe.title.toLocaleLowerCase('en-US'))
      if (existingRecipe && existingRecipe.submitted_by !== null) {
        skipped += 1
        continue
      }

      let recipeId
      if (existingRecipe) {
        await connection.execute(
          `UPDATE recipes SET
             category_id = ?, status = 'approved', image_url = ?, instructions = ?,
             description = ?, prep_time = ?, cook_time = ?, servings = ?, difficulty = ?,
             calories = ?, protein = ?, carbs = ?, fat = ?
           WHERE id = ? AND submitted_by IS NULL`,
          [
            categoryIds.get(recipe.category),
            recipe.imageUrl,
            recipe.instructions,
            recipe.description,
            recipe.prepTime,
            recipe.cookTime,
            recipe.servings,
            recipe.difficulty,
            recipe.calories,
            recipe.protein,
            recipe.carbs,
            recipe.fat,
            existingRecipe.id,
          ],
        )
        recipeId = existingRecipe.id
        await connection.execute('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [recipeId])
        await connection.execute('DELETE FROM recipe_tags WHERE recipe_id = ?', [recipeId])
        updated += 1
      } else {
        const [result] = await connection.execute(
          `INSERT INTO recipes (
           category_id, submitted_by, title, status, image_url, instructions,
           description, prep_time, cook_time, servings, difficulty,
           calories, protein, carbs, fat
         ) VALUES (?, NULL, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            categoryIds.get(recipe.category),
            recipe.title,
            recipe.imageUrl,
            recipe.instructions,
            recipe.description,
            recipe.prepTime,
            recipe.cookTime,
            recipe.servings,
            recipe.difficulty,
            recipe.calories,
            recipe.protein,
            recipe.carbs,
            recipe.fat,
          ],
        )
        recipeId = result.insertId
        inserted += 1
      }

      for (const ingredient of recipe.allIngredients) {
        await connection.execute(
          `INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity)
           VALUES (?, ?, ?)`,
          [recipeId, ingredient.name, ingredient.quantity],
        )
      }
      for (const tag of recipe.tags) {
        await connection.execute(
          'INSERT IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)',
          [recipeId, tagIds.get(tag)],
        )
      }
    }

    await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [
      MIGRATION_NAME,
    ])
    await connection.commit()
    console.log(
      `Applied ${MIGRATION_NAME}: inserted ${inserted}, updated ${updated}, skipped ${skipped}.`,
    )
    return { inserted, updated, skipped }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  migrateExpandedRecipeCatalog()
    .catch((error) => {
      console.error('Expanded recipe migration failed:', error.message)
      process.exitCode = 1
    })
    .finally(async () => {
      await pool.end()
    })
}
