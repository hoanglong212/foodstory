import express from 'express'
import pool from '../db.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireAdmin } from '../middleware/roleMiddleware.js'
import { broadcastToRecipe } from '../websocket/wsServer.js'

const router = express.Router()
const RECIPE_PAGE_SIZE = 10
const USER_PAGE_SIZE = 20
const COMMENT_PAGE_SIZE = 20
const MAX_SEARCH_LENGTH = 120
const MAX_REJECTION_REASON_LENGTH = 500
const MAX_DESCRIPTION_LENGTH = 1000
const MAX_INSTRUCTIONS_LENGTH = 10000

router.use(requireAuth, requireAdmin)

function toPositiveInt(value) {
  const text = String(value ?? '').trim()
  if (!/^[1-9]\d*$/.test(text)) {
    return null
  }

  const number = Number(text)
  return Number.isSafeInteger(number) ? number : null
}

function toNonNegativeInt(value) {
  const text = String(value ?? '').trim()
  if (!/^(0|[1-9]\d*)$/.test(text)) {
    return null
  }

  const number = Number(text)
  return Number.isSafeInteger(number) ? number : null
}

function getPagination(query, pageSize) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1)
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  }
}

function cleanSearch(value) {
  const search = String(value || '').trim()
  return search.length <= MAX_SEARCH_LENGTH ? search : null
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function parseIngredients(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((ingredient) => ({
      ingredient_name: String(
        ingredient.ingredient_name || ingredient.name || '',
      ).trim(),
      quantity: String(ingredient.quantity || '').trim() || null,
    }))
    .filter((ingredient) => ingredient.ingredient_name)
}

function parseTags(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return [...new Set(value.map(toPositiveInt).filter(Boolean))]
}

function validateRecipe(body) {
  const categoryId = toPositiveInt(body.category_id)
  const title = String(body.title || '').trim()
  const imageUrl = String(body.image_url || '').trim()
  const description = String(body.description || '').trim() || null
  const instructions = String(body.instructions || '').trim()
  const calories = toNonNegativeInt(body.calories ?? 0)
  const protein = toNonNegativeInt(body.protein ?? 0)
  const carbs = toNonNegativeInt(body.carbs ?? 0)
  const fat = toNonNegativeInt(body.fat ?? 0)
  const ingredients = parseIngredients(body.ingredients)
  const tags = parseTags(body.tags)

  if (!categoryId || !title || !imageUrl || !instructions) {
    return { error: 'Category, title, image URL and instructions are required.' }
  }
  if (!isValidHttpUrl(imageUrl)) {
    return { error: 'Image URL must be a valid http or https URL.' }
  }
  if (title.length > 255 || imageUrl.length > 500) {
    return { error: 'Title or image URL exceeds the allowed length.' }
  }
  if (
    String(description || '').length > MAX_DESCRIPTION_LENGTH ||
    instructions.length > MAX_INSTRUCTIONS_LENGTH
  ) {
    return { error: 'Description or instructions exceed the allowed length.' }
  }
  if ([calories, protein, carbs, fat].some((value) => value === null)) {
    return { error: 'Nutrition values must be non-negative whole numbers.' }
  }
  if (
    ingredients.length === 0 ||
    ingredients.some(
      (ingredient) =>
        ingredient.ingredient_name.length > 150 ||
        String(ingredient.quantity || '').length > 50,
    )
  ) {
    return { error: 'At least one valid ingredient is required.' }
  }

  return {
    value: {
      categoryId,
      title,
      imageUrl,
      description,
      instructions,
      calories,
      protein,
      carbs,
      fat,
      ingredients,
      tags,
    },
  }
}

function uniqueIds(values) {
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isSafeInteger(value) && value > 0))]
}

async function removeUserEngagement(connection, userId) {
  const [commentRows] = await connection.execute(
    'SELECT id, recipe_id FROM comments WHERE user_id = ?',
    [userId],
  )
  const [ratingRows] = await connection.execute(
    'SELECT recipe_id FROM ratings WHERE user_id = ?',
    [userId],
  )

  if (commentRows.length > 0) {
    await connection.execute('DELETE FROM comments WHERE user_id = ?', [userId])
  }
  if (ratingRows.length > 0) {
    await connection.execute('DELETE FROM ratings WHERE user_id = ?', [userId])
  }

  const affectedRatingRecipeIds = uniqueIds(ratingRows.map((rating) => rating.recipe_id))
  const ratingSummaries = affectedRatingRecipeIds.map((recipeId) => ({
    recipeId,
    averageRating: 0,
    ratingCount: 0,
  }))

  if (affectedRatingRecipeIds.length > 0) {
    const placeholders = affectedRatingRecipeIds.map(() => '?').join(', ')
    const [summaryRows] = await connection.execute(
      `SELECT recipe_id, COALESCE(AVG(rating_value), 0) AS average_rating, COUNT(*) AS rating_count
       FROM ratings
       WHERE recipe_id IN (${placeholders})
       GROUP BY recipe_id`,
      affectedRatingRecipeIds,
    )
    const summaryByRecipe = new Map(
      summaryRows.map((row) => [
        Number(row.recipe_id),
        {
          recipeId: Number(row.recipe_id),
          averageRating: Number(row.average_rating || 0),
          ratingCount: Number(row.rating_count || 0),
        },
      ]),
    )

    ratingSummaries.forEach((summary, index) => {
      ratingSummaries[index] = summaryByRecipe.get(summary.recipeId) || summary
    })
  }

  return {
    comments: commentRows.map((comment) => ({
      id: Number(comment.id),
      recipeId: Number(comment.recipe_id),
    })),
    deletedComments: commentRows.length,
    deletedRatings: ratingRows.length,
    ratingSummaries,
  }
}

async function validateRecipeRelations(connection, recipe) {
  const [categories] = await connection.execute(
    'SELECT id FROM categories WHERE id = ?',
    [recipe.categoryId],
  )
  if (categories.length === 0) {
    return 'Selected category does not exist.'
  }

  if (recipe.tags.length > 0) {
    const placeholders = recipe.tags.map(() => '?').join(', ')
    const [tags] = await connection.execute(
      `SELECT id FROM tags WHERE id IN (${placeholders})`,
      recipe.tags,
    )
    if (tags.length !== recipe.tags.length) {
      return 'One or more selected tags do not exist.'
    }
  }

  return ''
}

router.get('/stats', async (req, res, next) => {
  try {
    const [statsRows] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM users) AS total_users,
         (SELECT COUNT(*) FROM recipes WHERE status = 'approved') AS total_recipes,
         (SELECT COUNT(*) FROM recipes WHERE status = 'pending') AS pending_recipes,
         (SELECT COUNT(*) FROM comments) AS total_comments,
         (SELECT COUNT(*) FROM food_spots) AS total_spots,
         (SELECT COUNT(*) FROM users WHERE role = 'admin') AS total_admins`,
    )
    const [pendingRecipes] = await pool.query(
      `SELECT r.id, r.title, r.created_at, u.username AS submitter_name
       FROM recipes r
       LEFT JOIN users u ON u.id = r.submitted_by
       WHERE r.status = 'pending'
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT 5`,
    )
    const [recentComments] = await pool.query(
      `SELECT c.id, c.content, c.created_at, u.username, r.title AS recipe_title
       FROM comments c
       JOIN users u ON u.id = c.user_id
       JOIN recipes r ON r.id = c.recipe_id
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT 5`,
    )
    const [recentUsers] = await pool.query(
      `SELECT id, username, email, role, is_banned, created_at
       FROM users
       ORDER BY created_at DESC, id DESC
       LIMIT 5`,
    )

    return res.json({
      stats: statsRows[0],
      recent: {
        pending_recipes: pendingRecipes,
        comments: recentComments,
        users: recentUsers.map((user) => ({
          ...user,
          is_banned: Boolean(user.is_banned),
        })),
      },
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/recipes', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = getPagination(req.query, RECIPE_PAGE_SIZE)
    const search = cleanSearch(req.query.search)
    const status = String(req.query.status || '').trim().toLowerCase()
    const conditions = []
    const params = []

    if (search === null) {
      return res.status(400).json({ error: 'Search value is too long.' })
    }
    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid recipe status.' })
    }
    if (status) {
      conditions.push('r.status = ?')
      params.push(status)
    }
    if (search) {
      conditions.push('(r.title LIKE ? OR c.name LIKE ? OR u.username LIKE ?)')
      const pattern = `%${search}%`
      params.push(pattern, pattern, pattern)
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM recipes r
       JOIN categories c ON c.id = r.category_id
       LEFT JOIN users u ON u.id = r.submitted_by
       ${whereSql}`,
      params,
    )
    // MySQL 8.4 rejects binary-protocol parameters in LIMIT/OFFSET. These
    // values are bounded integers from getPagination, while query() still
    // escapes all search and filter values before rendering the SQL.
    const [items] = await pool.query(
      `SELECT
         r.id, r.category_id, r.submitted_by, r.title, r.image_url,
         r.description, r.instructions, r.calories, r.protein, r.carbs, r.fat,
         r.prep_time, r.cook_time, r.servings, r.difficulty,
         r.status, r.rejection_reason, r.moderated_at, r.created_at,
         c.name AS category_name,
         u.username AS submitter_name,
         u.email AS submitter_email,
         (
           SELECT GROUP_CONCAT(
             CONCAT(ingredient.ingredient_name, COALESCE(CONCAT(' | ', ingredient.quantity), ''))
             ORDER BY ingredient.id SEPARATOR '\n'
           )
           FROM recipe_ingredients ingredient
           WHERE ingredient.recipe_id = r.id
         ) AS ingredient_summary,
         (
           SELECT GROUP_CONCAT(tag.name ORDER BY tag.name SEPARATOR ', ')
           FROM recipe_tags recipe_tag
           JOIN tags tag ON tag.id = recipe_tag.tag_id
           WHERE recipe_tag.recipe_id = r.id
         ) AS tag_names,
         COALESCE(rating_stats.avg_rating, 0) AS avg_rating,
         COALESCE(rating_stats.rating_count, 0) AS rating_count
       FROM recipes r
       JOIN categories c ON c.id = r.category_id
       LEFT JOIN users u ON u.id = r.submitted_by
       LEFT JOIN (
         SELECT recipe_id, AVG(rating_value) AS avg_rating, COUNT(*) AS rating_count
         FROM ratings
         GROUP BY recipe_id
       ) rating_stats ON rating_stats.recipe_id = r.id
       ${whereSql}
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )
    const totalItems = Number(countRows[0].total || 0)

    return res.json({
      items: items.map((item) => ({
        ...item,
        avg_rating: Number(item.avg_rating || 0),
        rating_count: Number(item.rating_count || 0),
      })),
      currentPage: page,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      totalItems,
      pageSize,
    })
  } catch (error) {
    return next(error)
  }
})

router.put('/recipes/:id', async (req, res, next) => {
  const recipeId = toPositiveInt(req.params.id)
  if (!recipeId) {
    return res.status(400).json({ error: 'Invalid recipe id.' })
  }

  const validation = validateRecipe(req.body)
  if (validation.error) {
    return res.status(400).json({ error: validation.error })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [existing] = await connection.execute(
      'SELECT id FROM recipes WHERE id = ? FOR UPDATE',
      [recipeId],
    )
    if (existing.length === 0) {
      await connection.rollback()
      return res.status(404).json({ error: 'Recipe not found.' })
    }

    const recipe = validation.value
    const relationError = await validateRecipeRelations(connection, recipe)
    if (relationError) {
      await connection.rollback()
      return res.status(400).json({ error: relationError })
    }

    await connection.execute(
      `UPDATE recipes
       SET category_id = ?, title = ?, image_url = ?, description = ?,
           instructions = ?, calories = ?, protein = ?, carbs = ?, fat = ?
       WHERE id = ?`,
      [
        recipe.categoryId,
        recipe.title,
        recipe.imageUrl,
        recipe.description,
        recipe.instructions,
        recipe.calories,
        recipe.protein,
        recipe.carbs,
        recipe.fat,
        recipeId,
      ],
    )
    await connection.execute('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [
      recipeId,
    ])
    await connection.execute('DELETE FROM recipe_tags WHERE recipe_id = ?', [recipeId])

    for (const ingredient of recipe.ingredients) {
      await connection.execute(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity)
         VALUES (?, ?, ?)`,
        [recipeId, ingredient.ingredient_name, ingredient.quantity],
      )
    }
    for (const tagId of recipe.tags) {
      await connection.execute(
        'INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)',
        [recipeId, tagId],
      )
    }

    await connection.commit()
    return res.json({ message: 'Recipe updated successfully.', id: recipeId })
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
  }
})

router.delete('/recipes/:id', async (req, res, next) => {
  try {
    const recipeId = toPositiveInt(req.params.id)
    if (!recipeId) {
      return res.status(400).json({ error: 'Invalid recipe id.' })
    }

    const [result] = await pool.execute('DELETE FROM recipes WHERE id = ?', [recipeId])
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Recipe not found.' })
    }

    return res.json({ message: 'Recipe deleted successfully.' })
  } catch (error) {
    return next(error)
  }
})

router.put('/recipes/:id/approve', async (req, res, next) => {
  try {
    const recipeId = toPositiveInt(req.params.id)
    if (!recipeId) {
      return res.status(400).json({ error: 'Invalid recipe id.' })
    }

    const [result] = await pool.execute(
      `UPDATE recipes
       SET status = 'approved', rejection_reason = NULL,
           moderated_by = ?, moderated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.user.id, recipeId],
    )
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Recipe not found.' })
    }

    return res.json({ message: 'Recipe approved.', status: 'approved' })
  } catch (error) {
    return next(error)
  }
})

router.put('/recipes/:id/reject', async (req, res, next) => {
  try {
    const recipeId = toPositiveInt(req.params.id)
    const reason = String(req.body.reason || '').trim()

    if (!recipeId) {
      return res.status(400).json({ error: 'Invalid recipe id.' })
    }
    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required.' })
    }
    if (reason.length > MAX_REJECTION_REASON_LENGTH) {
      return res.status(400).json({
        error: `Rejection reason must be ${MAX_REJECTION_REASON_LENGTH} characters or fewer.`,
      })
    }

    const [result] = await pool.execute(
      `UPDATE recipes
       SET status = 'rejected', rejection_reason = ?,
           moderated_by = ?, moderated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [reason, req.user.id, recipeId],
    )
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Recipe not found.' })
    }

    return res.json({
      message: 'Recipe rejected.',
      status: 'rejected',
      rejection_reason: reason,
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/users', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = getPagination(req.query, USER_PAGE_SIZE)
    const search = cleanSearch(req.query.search)
    const role = String(req.query.role || '').trim().toLowerCase()
    const conditions = []
    const params = []

    if (search === null) {
      return res.status(400).json({ error: 'Search value is too long.' })
    }
    if (role && !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role filter.' })
    }
    if (role) {
      conditions.push('u.role = ?')
      params.push(role)
    }
    if (search) {
      conditions.push('(u.username LIKE ? OR u.email LIKE ?)')
      const pattern = `%${search}%`
      params.push(pattern, pattern)
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM users u ${whereSql}`,
      params,
    )
    // Keep paginated admin lists compatible with MySQL 8.4 (see above).
    const [items] = await pool.query(
      `SELECT
         u.id, u.username, u.email, u.role, u.is_banned, u.created_at,
         (SELECT COUNT(*) FROM recipes WHERE submitted_by = u.id) AS recipe_count,
         (SELECT COUNT(*) FROM comments WHERE user_id = u.id) AS comment_count
       FROM users u
       ${whereSql}
       ORDER BY u.created_at DESC, u.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )
    const totalItems = Number(countRows[0].total || 0)

    return res.json({
      items: items.map((user) => ({
        ...user,
        is_banned: Boolean(user.is_banned),
        recipe_count: Number(user.recipe_count || 0),
        comment_count: Number(user.comment_count || 0),
      })),
      currentPage: page,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      totalItems,
      pageSize,
    })
  } catch (error) {
    return next(error)
  }
})

router.put('/users/:id/ban', async (req, res, next) => {
  let connection
  let removedEngagement = {
    comments: [],
    deletedComments: 0,
    deletedRatings: 0,
    ratingSummaries: [],
  }

  try {
    const userId = toPositiveInt(req.params.id)
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user id.' })
    }
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot ban your own account.' })
    }

    connection = await pool.getConnection()
    await connection.beginTransaction()

    const [users] = await connection.execute(
      'SELECT id, role, is_banned FROM users WHERE id = ? FOR UPDATE',
      [userId],
    )
    if (users.length === 0) {
      await connection.rollback()
      return res.status(404).json({ error: 'User not found.' })
    }

    const isBanned = !Boolean(users[0].is_banned)
    await connection.execute('UPDATE users SET is_banned = ? WHERE id = ?', [
      isBanned,
      userId,
    ])

    if (isBanned) {
      removedEngagement = await removeUserEngagement(connection, userId)
    }

    await connection.commit()

    removedEngagement.comments.forEach((comment) => {
      broadcastToRecipe(comment.recipeId, {
        type: 'comment_deleted',
        recipeId: comment.recipeId,
        commentId: comment.id,
      })
    })
    removedEngagement.ratingSummaries.forEach((summary) => {
      broadcastToRecipe(summary.recipeId, {
        type: 'rating_updated',
        recipeId: summary.recipeId,
        avgRating: summary.averageRating,
        ratingCount: summary.ratingCount,
      })
    })

    return res.json({
      message: isBanned ? 'User banned.' : 'User unbanned.',
      is_banned: isBanned,
      role: users[0].role,
      user: {
        id: userId,
        role: users[0].role,
        is_banned: isBanned,
      },
      removed_comments: removedEngagement.deletedComments,
      removed_ratings: removedEngagement.deletedRatings,
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

router.put('/users/:id/role', async (req, res, next) => {
  try {
    const userId = toPositiveInt(req.params.id)
    const role = String(req.body.role || '').trim().toLowerCase()

    if (!userId) {
      return res.status(400).json({ error: 'Invalid user id.' })
    }
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own role.' })
    }
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or user.' })
    }

    const [result] = await pool.execute('UPDATE users SET role = ? WHERE id = ?', [
      role,
      userId,
    ])
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found.' })
    }

    return res.json({ message: 'User role updated.', role })
  } catch (error) {
    return next(error)
  }
})

router.get('/comments', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = getPagination(req.query, COMMENT_PAGE_SIZE)
    const search = cleanSearch(req.query.search)
    const conditions = []
    const params = []

    if (search === null) {
      return res.status(400).json({ error: 'Search value is too long.' })
    }
    if (search) {
      conditions.push(
        '(c.content LIKE ? OR u.username LIKE ? OR r.title LIKE ?)',
      )
      const pattern = `%${search}%`
      params.push(pattern, pattern, pattern)
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM comments c
       JOIN users u ON u.id = c.user_id
       JOIN recipes r ON r.id = c.recipe_id
       ${whereSql}`,
      params,
    )
    // Keep paginated admin lists compatible with MySQL 8.4 (see above).
    const [items] = await pool.query(
      `SELECT
         c.id, c.user_id, c.recipe_id, c.content, c.created_at, c.updated_at,
         u.username, u.email, r.title AS recipe_title
       FROM comments c
       JOIN users u ON u.id = c.user_id
       JOIN recipes r ON r.id = c.recipe_id
       ${whereSql}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )
    const totalItems = Number(countRows[0].total || 0)

    return res.json({
      items,
      currentPage: page,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      totalItems,
      pageSize,
    })
  } catch (error) {
    return next(error)
  }
})

router.delete('/comments/:id', async (req, res, next) => {
  try {
    const commentId = toPositiveInt(req.params.id)
    if (!commentId) {
      return res.status(400).json({ error: 'Invalid comment id.' })
    }

    const [comments] = await pool.execute(
      'SELECT recipe_id FROM comments WHERE id = ?',
      [commentId],
    )
    if (comments.length === 0) {
      return res.status(404).json({ error: 'Comment not found.' })
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
