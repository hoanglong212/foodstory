import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import '../config/env.js'
import { buildDatabaseConfig } from '../config/database.js'

const BOOTSTRAP_MARKER = 'production-bootstrap-v1'
const currentFile = fileURLToPath(import.meta.url)
const databaseDirectory = path.dirname(currentFile)

export function schemaForConfiguredDatabase(sql) {
  return String(sql)
    .replace(/^\s*CREATE\s+DATABASE\b[^;]*;\s*/gimu, '')
    .replace(/^\s*USE\s+`?[^`;]+`?\s*;\s*/gimu, '')
    .trim()
}

function runNodeScript(filename) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(databaseDirectory, filename)], {
      cwd: path.resolve(databaseDirectory, '..'),
      env: process.env,
      stdio: 'inherit',
    })

    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${filename} exited with ${signal ? `signal ${signal}` : `code ${code}`}.`))
    })
  })
}

async function prepareSchema() {
  const connection = await mysql.createConnection({
    ...buildDatabaseConfig(),
    multipleStatements: true,
  })

  try {
    const schema = schemaForConfiguredDatabase(
      await fs.readFile(path.join(databaseDirectory, 'schema.sql'), 'utf8'),
    )
    await connection.query(schema)
    await connection.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name VARCHAR(255) PRIMARY KEY,
         run_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`,
    )
    const [rows] = await connection.execute(
      'SELECT name FROM schema_migrations WHERE name = ? LIMIT 1',
      [BOOTSTRAP_MARKER],
    )
    return rows.length > 0
  } finally {
    await connection.end()
  }
}

async function markComplete() {
  const connection = await mysql.createConnection(buildDatabaseConfig())
  try {
    await connection.execute('INSERT IGNORE INTO schema_migrations (name) VALUES (?)', [
      BOOTSTRAP_MARKER,
    ])
  } finally {
    await connection.end()
  }
}

async function bootstrapProduction() {
  const alreadyComplete = await prepareSchema()
  if (alreadyComplete) {
    await runNodeScript('seedProductionUsers.js')
    console.log('Production database bootstrap already completed; content seeds were not rerun.')
    return
  }

  for (const script of [
    'seedRecipes.js',
    'migrate.js',
    'migrateExpandedRecipeImagesToWebp.js',
    'migrateNews.js',
    'seedProductionUsers.js',
  ]) {
    await runNodeScript(script)
  }

  await markComplete()
  console.log('Production database bootstrap completed.')
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === currentFile
if (isDirectRun) {
  bootstrapProduction().catch((error) => {
    console.error('Production database bootstrap failed:', error.message)
    process.exitCode = 1
  })
}
