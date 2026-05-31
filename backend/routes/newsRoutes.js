import express from 'express'
import pool from '../db.js'

const router = express.Router()

function getPagination(query) {
  const page = Math.max(Number.parseInt(query.page || '1', 10), 1)
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize || '4', 10), 1), 20)
  const offset = (page - 1) * pageSize
  return { page, pageSize, offset }
}

router.get('/categories', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT DISTINCT category FROM news ORDER BY category ASC')
    res.json({ categories: rows.map((row) => row.category) })
  } catch (error) {
    next(error)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = getPagination(req.query)
    const search = String(req.query.search || '').trim()
    const category = String(req.query.category || '').trim()
    const date = String(req.query.date || '').trim()
    const where = []
    const params = []

    if (search) {
      where.push(
        `(title LIKE ? OR content LIKE ? OR category LIKE ? OR DATE_FORMAT(published_date, '%Y-%m-%d') LIKE ?)`,
      )
      const like = `%${search}%`
      params.push(like, like, like, like)
    }

    if (category && category !== 'all') {
      where.push('category = ?')
      params.push(category)
    }

    if (date) {
      where.push('published_date = ?')
      params.push(date)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS totalItems FROM news ${whereSql}`,
      params,
    )
    const totalItems = countRows[0].totalItems
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

    const [items] = await pool.execute(
      `SELECT
         id,
         title,
         content,
         category,
         DATE_FORMAT(published_date, '%Y-%m-%d') AS published_date
       FROM news
       ${whereSql}
       ORDER BY published_date DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )

    const [categoryRows] = await pool.execute('SELECT DISTINCT category FROM news ORDER BY category ASC')

    res.json({
      items,
      currentPage: page,
      totalPages,
      totalItems,
      categories: categoryRows.map((row) => row.category),
    })
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid news id.' })
    }

    const [rows] = await pool.execute(
      `SELECT
         id,
         title,
         content,
         category,
         DATE_FORMAT(published_date, '%Y-%m-%d') AS published_date
       FROM news
       WHERE id = ?`,
      [id],
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: 'News item not found.' })
    }

    return res.json({ item: rows[0] })
  } catch (error) {
    return next(error)
  }
})

export default router
