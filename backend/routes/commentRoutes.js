import express from 'express'
import pool from '../db.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { broadcastToRecipe } from '../websocket/wsServer.js'

const router = express.Router()
const MAX_COMMENT_LENGTH = 1000

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

function cleanContent(value) {
  return String(value || '').trim()
}

function validateContent(content) {
  if (content.length < 5) {
    return 'Comment must be at least 5 characters.'
  }
  if (content.length > MAX_COMMENT_LENGTH) {
    return `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer.`
  }
  return ''
}

router.get('/comments/user', requireAuth, async (req, res, next) => {
  try {
    const [items] = await pool.execute(
      `SELECT
         comments.id,
         comments.recipe_id,
         recipes.title AS recipe_title,
         comments.content,
         comments.created_at,
         comments.updated_at
       FROM comments
       JOIN recipes ON recipes.id = comments.recipe_id
       WHERE comments.user_id = ?
       ORDER BY comments.created_at DESC`,
      [req.user.id],
    )

    return res.json({ items })
  } catch (error) {
    return next(error)
  }
})

router.post('/recipes/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const recipeId = toPositiveInt(req.params.id)
    const content = cleanContent(req.body.content)
    const contentError = validateContent(content)

    if (!recipeId) {
      return res.status(400).json({ error: 'Invalid recipe id.' })
    }
    if (contentError) {
      return res.status(400).json({ error: contentError })
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

    const comment = rows[0]
    broadcastToRecipe(recipeId, {
      type: 'new_comment',
      comment: {
        id: comment.id,
        userId: comment.user_id,
        recipeId,
        content: comment.content,
        createdAt: comment.created_at,
        username: comment.username,
      },
    })

    return res.status(201).json({ comment })
  } catch (error) {
    return next(error)
  }
})

router.put('/comments/:id', requireAuth, async (req, res, next) => {
  try {
    const commentId = toPositiveInt(req.params.id)
    const content = cleanContent(req.body.content)
    const contentError = validateContent(content)

    if (!commentId) {
      return res.status(400).json({ error: 'Invalid comment id.' })
    }
    if (contentError) {
      return res.status(400).json({ error: contentError })
    }

    const [comments] = await pool.execute(
      'SELECT user_id, recipe_id FROM comments WHERE id = ?',
      [commentId],
    )
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

    const comment = rows[0]
    broadcastToRecipe(comments[0].recipe_id, {
      type: 'comment_updated',
      comment: {
        id: comment.id,
        userId: comment.user_id,
        recipeId: comments[0].recipe_id,
        content: comment.content,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        username: comment.username,
      },
    })

    return res.json({ comment })
  } catch (error) {
    return next(error)
  }
})

router.delete('/comments/:id', requireAuth, async (req, res, next) => {
  try {
    const commentId = toPositiveInt(req.params.id)
    if (!commentId) {
      return res.status(400).json({ error: 'Invalid comment id.' })
    }

    const [comments] = await pool.execute(
      'SELECT user_id, recipe_id FROM comments WHERE id = ?',
      [commentId],
    )
    if (comments.length === 0) {
      return res.status(404).json({ error: 'Comment not found.' })
    }
    if (comments[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own comments.' })
    }

    await pool.execute('DELETE FROM comments WHERE id = ?', [commentId])
    broadcastToRecipe(comments[0].recipe_id, {
      type: 'comment_deleted',
      recipeId: comments[0].recipe_id,
      commentId,
    })

    return res.json({ message: 'Comment deleted successfully.' })
  } catch (error) {
    return next(error)
  }
})

export default router
