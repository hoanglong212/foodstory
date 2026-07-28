import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from '../db.js'
import { verifiedRestaurantCatalog } from './verifiedRestaurantCatalog.js'

const MIGRATION_NAME = 'verified_restaurant_catalog_v1'

const RESTAURANT_COLUMN_MIGRATIONS = [
  ['featured_dish', 'ALTER TABLE restaurants ADD COLUMN featured_dish VARCHAR(255) NULL AFTER description'],
  ['image_url', 'ALTER TABLE restaurants ADD COLUMN image_url VARCHAR(2048) NULL AFTER featured_dish'],
  ['image_attribution', 'ALTER TABLE restaurants ADD COLUMN image_attribution VARCHAR(255) NULL AFTER image_url'],
  ['source_url', 'ALTER TABLE restaurants ADD COLUMN source_url VARCHAR(2048) NULL AFTER image_attribution'],
  ['verified_at', 'ALTER TABLE restaurants ADD COLUMN verified_at DATE NULL AFTER source_url'],
]

async function ensureMigrationTable(connection) {
  await connection.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name VARCHAR(255) PRIMARY KEY,
       run_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  )
}

async function ensureRestaurantColumns(connection) {
  const [rows] = await connection.execute(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'restaurants'`,
  )
  const existingColumns = new Set(rows.map((row) => row.COLUMN_NAME))

  for (const [columnName, statement] of RESTAURANT_COLUMN_MIGRATIONS) {
    if (!existingColumns.has(columnName)) {
      await connection.query(statement)
    }
  }
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.execute(
    `SELECT 1
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName],
  )
  return rows.length > 0
}

async function clearStaleRestaurantKnowledge(connection) {
  if (await tableExists(connection, 'ai_embeddings')) {
    await connection.execute(
      "DELETE FROM ai_embeddings WHERE source_type = 'restaurant'",
    )
  }
  if (await tableExists(connection, 'ai_documents')) {
    await connection.execute(
      "DELETE FROM ai_documents WHERE source_type = 'restaurant'",
    )
  }
}

export async function migrateVerifiedRestaurantCatalog() {
  const connection = await pool.getConnection()

  try {
    await ensureMigrationTable(connection)
    await ensureRestaurantColumns(connection)

    const [existing] = await connection.execute(
      'SELECT name FROM schema_migrations WHERE name = ?',
      [MIGRATION_NAME],
    )
    if (existing.length > 0) {
      console.log(`Skipping ${MIGRATION_NAME}; already applied.`)
      return
    }

    await connection.beginTransaction()
    await clearStaleRestaurantKnowledge(connection)
    await connection.execute('DELETE FROM restaurants')

    for (const restaurant of verifiedRestaurantCatalog) {
      await connection.execute(
        `INSERT INTO restaurants (
           id, name, address, district, category, latitude, longitude,
           avg_rating, price_range, description, featured_dish, image_url,
           image_attribution, source_url, verified_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          restaurant.id,
          restaurant.name,
          restaurant.address,
          restaurant.district,
          restaurant.category,
          restaurant.latitude,
          restaurant.longitude,
          restaurant.avgRating,
          restaurant.priceRange,
          restaurant.description,
          restaurant.featuredDish,
          restaurant.imageUrl,
          restaurant.imageAttribution,
          restaurant.sourceUrl,
          restaurant.verifiedAt,
        ],
      )
    }

    await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [
      MIGRATION_NAME,
    ])
    await connection.commit()
    await connection.query(
      `ALTER TABLE restaurants AUTO_INCREMENT = ${verifiedRestaurantCatalog.length + 1}`,
    )

    console.log(
      `Applied ${MIGRATION_NAME}: installed ${verifiedRestaurantCatalog.length} source-backed restaurants.`,
    )
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
  migrateVerifiedRestaurantCatalog()
    .catch((error) => {
      console.error('Verified restaurant migration failed:', error.message)
      process.exitCode = 1
    })
    .finally(async () => {
      await pool.end()
    })
}
