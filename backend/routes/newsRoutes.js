import express from 'express'
import pool from '../db.js'
import {
  EXTERNAL_NEWS_CATEGORIES,
  fetchGuardianNews,
} from '../services/guardianNewsService.js'

const router = express.Router()

function toPositiveInt(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null
  }

  const text = String(value ?? '').trim()
  if (!/^[1-9]\d*$/.test(text)) {
    return null
  }

  const number = Number(text)
  return Number.isSafeInteger(number) ? number : null
}

function getPagination(query) {
  const page = toPositiveInt(query.page) || 1
  const pageSize = Math.min(toPositiveInt(query.pageSize) || 10, 50)
  const offset = (page - 1) * pageSize
  return { page, pageSize, offset }
}

function isValidDateFilter(value) {
  if (!value) {
    return true
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isValidExternalCategory(value) {
  if (!value || value === 'all') {
    return true
  }

  const normalized = String(value).trim().toLowerCase()
  return EXTERNAL_NEWS_CATEGORIES.some((category) => category.toLowerCase() === normalized)
}

router.get('/categories', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT DISTINCT category FROM news ORDER BY category ASC')
    res.json({ categories: rows.map((row) => row.category) })
  } catch (error) {
    next(error)
  }
})

router.get('/external/categories', (req, res) => {
  res.json({ categories: EXTERNAL_NEWS_CATEGORIES })
})

router.get('/external', async (req, res, next) => {
  try {
    const { page, pageSize } = getPagination(req.query)
    const search = String(req.query.search || '').trim()
    const category = String(req.query.category || 'all').trim()
    const date = String(req.query.date || '').trim()

    if (search.length > 120 || category.length > 100) {
      return res.status(400).json({ error: 'Search and category values are too long.' })
    }

    if (!isValidDateFilter(date)) {
      return res.status(400).json({ error: 'Date must use YYYY-MM-DD format.' })
    }

    if (!isValidExternalCategory(category)) {
      return res.status(400).json({ error: 'Unsupported external news category.' })
    }

    const result = await fetchGuardianNews({
      page,
      pageSize: Math.min(pageSize, 20),
      search,
      category,
      date,
    })

    return res.json(result)
  } catch (error) {
    if (error?.code?.startsWith('EXTERNAL_NEWS_') && error?.status) {
      return res.status(error.status).json({
        error: error.message,
        code: error.code,
      })
    }
    return next(error)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = getPagination(req.query)
    const search = String(req.query.search || '').trim()
    const category = String(req.query.category || '').trim()
    const date = String(req.query.date || '').trim()
    const includeCategories = req.query.includeCategories !== '0'
    const where = []
    const params = []

    if (search.length > 120 || category.length > 100) {
      return res.status(400).json({ error: 'Search and category values are too long.' })
    }

    if (!isValidDateFilter(date)) {
      return res.status(400).json({ error: 'Date must use YYYY-MM-DD format.' })
    }

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
         CASE
           WHEN CHAR_LENGTH(content) > 420 THEN CONCAT(LEFT(content, 420), '...')
           ELSE content
         END AS content,
         category,
         DATE_FORMAT(published_date, '%Y-%m-%d') AS published_date
       FROM news
       ${whereSql}
       ORDER BY published_date DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )

    const [categoryRows] = includeCategories
      ? await pool.execute('SELECT DISTINCT category FROM news ORDER BY category ASC')
      : [[]]

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
    const id = toPositiveInt(req.params.id)
    if (!id) {
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
