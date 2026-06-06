import express from 'express'
import pool from '../db.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { broadcastToRecipe } from '../websocket/wsServer.js'

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

router.post('/recipes/:id/rating', requireAuth, async (req, res, next) => {
  let connection

  try {
    const recipeId = toPositiveInt(req.params.id)
    const ratingValue = toPositiveInt(req.body.rating_value)

    if (!recipeId) {
      return res.status(400).json({ error: 'Invalid recipe id.' })
    }
    if (!ratingValue || ratingValue > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5.' })
    }

    connection = await pool.getConnection()
    await connection.beginTransaction()

    const [recipes] = await connection.execute(
      'SELECT id FROM recipes WHERE id = ? FOR UPDATE',
      [recipeId],
    )
    if (recipes.length === 0) {
      await connection.rollback()
      return res.status(404).json({ error: 'Recipe not found.' })
    }

    await connection.execute(
      `INSERT INTO ratings (user_id, recipe_id, rating_value)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE rating_value = VALUES(rating_value)`,
      [req.user.id, recipeId, ratingValue],
    )

    const [summary] = await connection.execute(
      `SELECT COALESCE(AVG(rating_value), 0) AS average_rating, COUNT(*) AS total_ratings
       FROM ratings
       WHERE recipe_id = ?`,
      [recipeId],
    )

    const averageRating = Number(summary[0].average_rating || 0)
    const ratingCount = Number(summary[0].total_ratings || 0)

    await connection.commit()

    broadcastToRecipe(recipeId, {
      type: 'rating_updated',
      recipeId,
      avgRating: averageRating,
      ratingCount,
    })

    return res.json({
      current_user_rating: ratingValue,
      average_rating: averageRating,
      total_ratings: ratingCount,
    })
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback()
      } catch {
        // Preserve the original database error.
      }
    }
    return next(error)
  } finally {
    connection?.release()
  }
})

export default router
