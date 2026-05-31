import express from 'express'
import pool from '../db.js'
import { requireAuth } from '../middleware/authMiddleware.js'

const router = express.Router()

function cleanContent(value) {
  return String(value || '').trim()
}

router.post('/recipes/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const recipeId = Number.parseInt(req.params.id, 10)
    const content = cleanContent(req.body.content)

    if (!Number.isInteger(recipeId) || recipeId <= 0) {
      return res.status(400).json({ error: 'Invalid recipe id.' })
    }
    if (content.length < 5) {
      return res.status(400).json({ error: 'Comment must be at least 5 characters.' })
    }

    const [recipes] = await pool.execute('SELECT id FROM recipes WHERE id = ?', [recipeId])
    if (recipes.length === 0) {
      return res.status(404).json({ error: 'Recipe not found.' })
    }

    const [result] = await pool.execute(
      'INSERT INTO comments (user_id, recipe_id, content) VALUES (?, ?, ?)',
      [req.user.id, recipeId, content],
    )

    const [rows] = await pool.execute(
      `SELECT comments.id, comments.user_id, users.username, comments.content,
              comments.created_at, comments.updated_at
       FROM comments
       JOIN users ON users.id = comments.user_id
       WHERE comments.id = ?`,
      [result.insertId],
    )

    return res.status(201).json({ comment: rows[0] })
  } catch (error) {
    return next(error)
  }
})

router.put('/comments/:id', requireAuth, async (req, res, next) => {
  try {
    const commentId = Number.parseInt(req.params.id, 10)
    const content = cleanContent(req.body.content)

    if (!Number.isInteger(commentId) || commentId <= 0) {
      return res.status(400).json({ error: 'Invalid comment id.' })
    }
    if (content.length < 5) {
      return res.status(400).json({ error: 'Comment must be at least 5 characters.' })
    }

    const [comments] = await pool.execute('SELECT user_id FROM comments WHERE id = ?', [commentId])
    if (comments.length === 0) {
      return res.status(404).json({ error: 'Comment not found.' })
    }
    if (comments[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own comments.' })
    }

    await pool.execute('UPDATE comments SET content = ? WHERE id = ?', [content, commentId])

    const [rows] = await pool.execute(
      `SELECT comments.id, comments.user_id, users.username, comments.content,
              comments.created_at, comments.updated_at
       FROM comments
       JOIN users ON users.id = comments.user_id
       WHERE comments.id = ?`,
      [commentId],
    )

    return res.json({ comment: rows[0] })
  } catch (error) {
    return next(error)
  }
})

router.delete('/comments/:id', requireAuth, async (req, res, next) => {
  try {
    const commentId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(commentId) || commentId <= 0) {
      return res.status(400).json({ error: 'Invalid comment id.' })
    }

    const [comments] = await pool.execute('SELECT user_id FROM comments WHERE id = ?', [commentId])
    if (comments.length === 0) {
      return res.status(404).json({ error: 'Comment not found.' })
    }
    if (comments[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own comments.' })
    }

    await pool.execute('DELETE FROM comments WHERE id = ?', [commentId])
    return res.json({ message: 'Comment deleted successfully.' })
  } catch (error) {
    return next(error)
  }
})

export default router
