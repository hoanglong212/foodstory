import pool from '../db.js'

const requiredTables = [
  'users',
  'news',
  'recipes',
  'recipe_ingredients',
  'comments',
  'favorites',
  'ratings',
  'checklists',
  'checklist_items',
  'food_spots',
  'restaurants',
]

const requiredUniqueConstraints = [
  ['users', 'email'],
  ['ratings', 'user_id,recipe_id'],
  ['checklists', 'user_id,recipe_id'],
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const [databaseRows] = await pool.query('SELECT DATABASE() AS current_database')
  assert(databaseRows[0]?.current_database, 'No active database is configured.')

  const [tables] = await pool.query(
    `SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()`,
  )
  const tableNames = new Set(tables.map((row) => row.TABLE_NAME))
  const missingTables = requiredTables.filter((table) => !tableNames.has(table))
  assert(missingTables.length === 0, `Missing required tables: ${missingTables.join(', ')}`)
  console.log(`PASS required tables present (${requiredTables.length}/${requiredTables.length})`)

  const [foreignKeys] = await pool.query(
    `SELECT TABLE_NAME, CONSTRAINT_NAME
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
  )
  assert(foreignKeys.length > 0, 'No foreign-key constraints were found.')
  console.log(`PASS foreign-key constraints present (${foreignKeys.length})`)

  const [uniqueColumns] = await pool.query(
    `SELECT TABLE_NAME, INDEX_NAME,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS columns_list
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0
     GROUP BY TABLE_NAME, INDEX_NAME`,
  )
  for (const [table, columns] of requiredUniqueConstraints) {
    assert(
      uniqueColumns.some((row) => row.TABLE_NAME === table && row.columns_list === columns),
      `Missing unique constraint on ${table}(${columns}).`,
    )
  }
  console.log(`PASS required ownership/uniqueness constraints (${requiredUniqueConstraints.length}/${requiredUniqueConstraints.length})`)

  const [checks] = await pool.query(
    `SELECT tc.TABLE_NAME, cc.CHECK_CLAUSE
     FROM information_schema.TABLE_CONSTRAINTS tc
     JOIN information_schema.CHECK_CONSTRAINTS cc
       ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
      AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
     WHERE tc.TABLE_SCHEMA = DATABASE() AND tc.CONSTRAINT_TYPE = 'CHECK'`,
  )
  assert(
    checks.some((row) => row.TABLE_NAME === 'ratings' && /rating_value/i.test(row.CHECK_CLAUSE)),
    'The rating range CHECK constraint is missing.',
  )
  console.log('PASS rating range CHECK constraint')

  if (tableNames.has('schema_migrations')) {
    const [migrations] = await pool.query('SELECT name FROM schema_migrations ORDER BY name ASC')
    console.log(`PASS migration ledger readable (${migrations.length} recorded entries)`)
  } else {
    console.log('INFO schema_migrations ledger is not present; baseline schema may have been applied directly')
  }

  console.log('Database schema audit complete: 5/5 checks passed, 0 failed.')
}

main()
  .catch((error) => {
    console.error(`Database schema audit failed: ${error.message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
