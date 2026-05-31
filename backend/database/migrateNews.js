import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import pool from '../db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const newsJsonPath = path.resolve(__dirname, '../../src/data/news.json')

async function migrateNews() {
  const raw = await fs.readFile(newsJsonPath, 'utf8')
  const items = JSON.parse(raw)
  let inserted = 0
  let skipped = 0

  for (const item of items) {
    const [existing] = await pool.execute(
      'SELECT id FROM news WHERE title = ? AND published_date = ?',
      [item.title, item.date],
    )

    if (existing.length > 0) {
      skipped += 1
      continue
    }

    await pool.execute(
      `INSERT INTO news (title, content, category, published_date)
       VALUES (?, ?, ?, ?)`,
      [item.title, item.content, item.category, item.date],
    )
    inserted += 1
  }

  console.log(`News migration complete. Inserted: ${inserted}. Skipped: ${skipped}.`)
  await pool.end()
}

migrateNews().catch(async (error) => {
  console.error('News migration failed:', error.message)
  await pool.end()
  process.exit(1)
})
