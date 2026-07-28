import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from '../db.js'
import { migrateAdminDashboard } from './migrateAdminDashboard.js'
import { migrateLegacyEnglishData } from './migrateLegacyEnglishData.js'
import { migrateRecipeMetadata } from './migrateRecipeMetadata.js'
import { migrateVerifiedRestaurantCatalog } from './migrateVerifiedRestaurantCatalog.js'
import { migrateExpandedRecipeCatalog } from './migrateExpandedRecipeCatalog.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const migrationsDir = path.resolve(__dirname, '../migrations')

function splitSqlStatements(sql) {
  const statements = []
  let current = ''
  let quote = ''
  let inLineComment = false
  let inBlockComment = false

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    const next = sql[index + 1]

    if (inLineComment) {
      current += char
      if (char === '\n') {
        inLineComment = false
      }
      continue
    }

    if (inBlockComment) {
      current += char
      if (char === '*' && next === '/') {
        current += next
        index += 1
        inBlockComment = false
      }
      continue
    }

    if (quote) {
      current += char
      if (char === quote && sql[index - 1] !== '\\') {
        quote = ''
      }
      continue
    }

    if ((char === "'" || char === '"' || char === '`') && !quote) {
      quote = char
      current += char
      continue
    }

    if (char === '-' && next === '-') {
      inLineComment = true
      current += char
      continue
    }

    if (char === '/' && next === '*') {
      inBlockComment = true
      current += char
      continue
    }

    if (char === ';') {
      const statement = current.trim()
      if (statement) {
        statements.push(statement)
      }
      current = ''
      continue
    }

    current += char
  }

  const trailing = current.trim()
  if (trailing) {
    statements.push(trailing)
  }

  return statements
}

async function ensureMigrationTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name VARCHAR(255) PRIMARY KEY,
       run_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  )
}

async function runSqlMigrations() {
  await ensureMigrationTable()

  const [appliedRows] = await pool.execute('SELECT name FROM schema_migrations')
  const applied = new Set(appliedRows.map((row) => row.name))
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right))

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping ${file}; already applied.`)
      continue
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8')
    const statements = splitSqlStatements(sql)
    if (statements.length === 0) {
      console.log(`Skipping ${file}; no SQL statements found.`)
      continue
    }

    for (const statement of statements) {
      await pool.query(statement)
    }

    await pool.execute('INSERT INTO schema_migrations (name) VALUES (?)', [file])
    console.log(`Applied ${file}`)
  }
}

async function migrate() {
  await migrateAdminDashboard()
  await migrateRecipeMetadata()
  await runSqlMigrations()
  await migrateLegacyEnglishData()
  await migrateVerifiedRestaurantCatalog()
  await migrateExpandedRecipeCatalog()
  console.log('Database migrations completed.')
}

migrate()
  .catch((error) => {
    console.error('Database migration failed:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
