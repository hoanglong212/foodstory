import pool from '../db.js'

async function columnExists(tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName],
  )
  return rows.length > 0
}

async function addColumn(tableName, columnName, definition) {
  if (!(await columnExists(tableName, columnName))) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`)
    console.log(`Added ${tableName}.${columnName}`)
  }
}

export async function migrateRecipeMetadata() {
  await addColumn('recipes', 'prep_time', 'INT NOT NULL DEFAULT 0 AFTER `description`')
  await addColumn('recipes', 'cook_time', 'INT NOT NULL DEFAULT 0 AFTER `prep_time`')
  await addColumn('recipes', 'servings', 'INT NULL AFTER `cook_time`')
  await addColumn('recipes', 'difficulty', 'VARCHAR(30) NULL AFTER `servings`')
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}`) {
  migrateRecipeMetadata()
    .then(() => {
      console.log('Recipe metadata migration completed.')
    })
    .catch((error) => {
      console.error('Recipe metadata migration failed:', error.message)
      process.exitCode = 1
    })
    .finally(async () => {
      await pool.end()
    })
}
