import express from 'express'
import pool from '../db.js'
import { requireAuth } from '../middleware/authMiddleware.js'

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

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [items] = await pool.execute(
      `SELECT
         r.*,
         c.name AS category_name,
         COALESCE(AVG(ra.rating_value), 0) AS average_rating,
         COALESCE(AVG(ra.rating_value), 0) AS avg_rating,
         COUNT(DISTINCT ra.id) AS total_ratings,
         COUNT(DISTINCT ra.id) AS rating_count,
         COUNT(DISTINCT comments.id) AS comment_count,
         COUNT(DISTINCT fav_all.user_id) AS favorite_count,
         GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ',') AS tag_names
       FROM favorites fav
       JOIN recipes r ON r.id = fav.recipe_id
       JOIN categories c ON c.id = r.category_id
       LEFT JOIN recipe_tags rt ON rt.recipe_id = r.id
       LEFT JOIN tags t ON t.id = rt.tag_id
       LEFT JOIN ratings ra ON ra.recipe_id = r.id
       LEFT JOIN comments ON comments.recipe_id = r.id
       LEFT JOIN favorites fav_all ON fav_all.recipe_id = r.id
       WHERE fav.user_id = ? AND r.status = 'approved'
       GROUP BY r.id, c.name
       ORDER BY fav.recipe_id DESC`,
      [req.user.id],
    )

    res.json({
      items: items.map((item) => ({
        ...item,
        is_favorite: true,
        average_rating: Number(item.average_rating || 0),
        avg_rating: Number(item.avg_rating || item.average_rating || 0),
        total_ratings: Number(item.total_ratings || 0),
        rating_count: Number(item.rating_count || item.total_ratings || 0),
        comment_count: Number(item.comment_count || 0),
        favorite_count: Number(item.favorite_count || 0),
        tags: item.tag_names ? item.tag_names.split(',') : [],
      })),
    })
  } catch (error) {
    next(error)
  }
})

router.post('/:recipeId', requireAuth, async (req, res, next) => {
  try {
    const recipeId = toPositiveInt(req.params.recipeId)
    if (!recipeId) {
      return res.status(400).json({ error: 'Invalid recipe id.' })
    }

    const [recipes] = await pool.execute(
      "SELECT id FROM recipes WHERE id = ? AND status = 'approved'",
      [recipeId],
    )
    if (recipes.length === 0) {
      return res.status(404).json({ error: 'Recipe not found.' })
    }

    await pool.execute('INSERT IGNORE INTO favorites (user_id, recipe_id) VALUES (?, ?)', [
      req.user.id,
      recipeId,
    ])
    return res.status(201).json({ message: 'Recipe added to favorites.' })
  } catch (error) {
    return next(error)
  }
})

router.delete('/:recipeId', requireAuth, async (req, res, next) => {
  try {
    const recipeId = toPositiveInt(req.params.recipeId)
    if (!recipeId) {
      return res.status(400).json({ error: 'Invalid recipe id.' })
    }

    await pool.execute('DELETE FROM favorites WHERE user_id = ? AND recipe_id = ?', [
      req.user.id,
      recipeId,
    ])
    return res.json({ message: 'Recipe removed from favorites.' })
  } catch (error) {
    return next(error)
  }
})

export default router
