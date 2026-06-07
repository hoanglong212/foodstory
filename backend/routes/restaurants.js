import express from 'express'
import pool from '../db.js'

const router = express.Router()

function optionalText(value, maxLength) {
  const text = String(value ?? '').trim()
  if (!text) {
    return null
  }
  return text.length <= maxLength ? text : undefined
}

router.get('/', async (req, res, next) => {
  try {
    const district = optionalText(req.query.district, 80)
    const category = optionalText(req.query.category, 80)
    const search = optionalText(req.query.search, 150)
    const minimumRating =
      req.query.min_rating === undefined || req.query.min_rating === ''
        ? null
        : Number(req.query.min_rating)

    if (district === undefined || category === undefined || search === undefined) {
      return res.status(400).json({ error: 'Bộ lọc nhà hàng không hợp lệ.' })
    }
    if (
      minimumRating !== null &&
      (!Number.isFinite(minimumRating) || minimumRating < 0 || minimumRating > 5)
    ) {
      return res.status(400).json({ error: 'Đánh giá tối thiểu phải từ 0 đến 5.' })
    }

    const conditions = ['1 = 1']
    const params = []

    if (district) {
      conditions.push('district = ?')
      params.push(district)
    }
    if (category) {
      conditions.push('category = ?')
      params.push(category)
    }
    if (search) {
      conditions.push('(name LIKE ? OR category LIKE ? OR description LIKE ?)')
      const pattern = `%${search}%`
      params.push(pattern, pattern, pattern)
    }
    if (minimumRating !== null) {
      conditions.push('avg_rating >= ?')
      params.push(minimumRating)
    }

    const [restaurants] = await pool.execute(
      `SELECT id, name, address, district, category,
              latitude, longitude, avg_rating, price_range, description
       FROM restaurants
       WHERE ${conditions.join(' AND ')}
       ORDER BY avg_rating DESC, id ASC
       LIMIT 200`,
      params,
    )

    return res.json(restaurants)
  } catch (error) {
    return next(error)
  }
})

export default router
