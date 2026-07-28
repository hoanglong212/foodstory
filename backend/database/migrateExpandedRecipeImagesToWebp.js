import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from '../db.js'
import { expandedRecipeCatalog } from './expandedRecipeCatalog.js'

const MIGRATION_NAME = 'expanded_recipe_catalog_webp_images_v1'

async function ensureMigrationTable(connection) {
  await connection.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name VARCHAR(255) PRIMARY KEY,
       run_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  )
}

export async function migrateExpandedRecipeImagesToWebp({ dryRun = false } = {}) {
  const connection = await pool.getConnection()

  try {
    await ensureMigrationTable(connection)
    const [applied] = await connection.execute(
      'SELECT name FROM schema_migrations WHERE name = ?',
      [MIGRATION_NAME],
    )
    if (applied.length > 0) {
      return { dryRun, updated: 0, skipped: expandedRecipeCatalog.length, alreadyApplied: true }
    }

    await connection.beginTransaction()
    let updated = 0
    for (const recipe of expandedRecipeCatalog) {
      const oldImageUrl = recipe.imageUrl.replace(/\.webp$/, '.png')
      const [result] = await connection.execute(
        `UPDATE recipes
         SET image_url = ?
         WHERE title = ? AND image_url = ?`,
        [recipe.imageUrl, recipe.title, oldImageUrl],
      )
      updated += result.affectedRows
    }

    if (dryRun) {
      await connection.rollback()
    } else {
      await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [
        MIGRATION_NAME,
      ])
      await connection.commit()
    }

    return {
      dryRun,
      updated,
      skipped: expandedRecipeCatalog.length - updated,
      alreadyApplied: false,
    }
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
  migrateExpandedRecipeImagesToWebp({ dryRun: process.argv.includes('--dry-run') })
    .then((summary) => console.log(JSON.stringify(summary, null, 2)))
    .catch((error) => {
      console.error('Expanded recipe image migration failed:', error.message)
      process.exitCode = 1
    })
    .finally(async () => {
      await pool.end()
    })
}
