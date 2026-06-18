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

async function indexExists(tableName, indexName) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [tableName, indexName],
  )
  return rows.length > 0
}

async function foreignKeyExists(tableName, constraintName) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'
     LIMIT 1`,
    [tableName, constraintName],
  )
  return rows.length > 0
}

async function addColumn(tableName, columnName, definition) {
  if (!(await columnExists(tableName, columnName))) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`)
    console.log(`Added ${tableName}.${columnName}`)
  }
}

async function addIndex(tableName, indexName, columns) {
  if (!(await indexExists(tableName, indexName))) {
    await pool.query(
      `ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` (${columns})`,
    )
    console.log(`Added index ${indexName}`)
  }
}

async function addForeignKey(tableName, constraintName, definition) {
  if (!(await foreignKeyExists(tableName, constraintName))) {
    await pool.query(
      `ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`${constraintName}\` ${definition}`,
    )
    console.log(`Added foreign key ${constraintName}`)
  }
}

export async function migrateAdminDashboard() {
  await addColumn('users', 'is_banned', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER `role`')

  await addColumn('recipes', 'submitted_by', 'INT NULL AFTER `category_id`')
  await addColumn(
    'recipes',
    'status',
    "ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved' AFTER `title`",
  )
  await addColumn(
    'recipes',
    'rejection_reason',
    'VARCHAR(500) NULL AFTER `status`',
  )
  await addColumn('recipes', 'moderated_by', 'INT NULL AFTER `rejection_reason`')
  await addColumn('recipes', 'moderated_at', 'DATETIME NULL AFTER `moderated_by`')

  await pool.query(
    "UPDATE recipes SET status = 'approved' WHERE status IS NULL OR status = ''",
  )

  await addIndex('users', 'idx_users_role_banned', '`role`, `is_banned`')
  await addIndex('recipes', 'idx_recipes_status_created', '`status`, `created_at`')
  await addIndex('recipes', 'idx_recipes_submitted_by', '`submitted_by`')
  await addForeignKey(
    'recipes',
    'fk_recipes_submitted_by',
    'FOREIGN KEY (`submitted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL',
  )
  await addForeignKey(
    'recipes',
    'fk_recipes_moderated_by',
    'FOREIGN KEY (`moderated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL',
  )
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}`) {
  migrateAdminDashboard()
    .then(() => {
      console.log('Admin dashboard migration completed.')
    })
    .catch((error) => {
      console.error('Admin dashboard migration failed:', error.message)
      process.exitCode = 1
    })
    .finally(async () => {
      await pool.end()
    })
}
