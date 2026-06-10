import express from 'express'
import pool from '../db.js'
import { optionalAuth, requireAuth } from '../middleware/authMiddleware.js'
import { requireAdmin } from '../middleware/roleMiddleware.js'

const router = express.Router()
const MAX_DESCRIPTION_LENGTH = 1000
const MAX_INSTRUCTIONS_LENGTH = 10000

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

function toNonNegativeInt(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null
  }

  const text = String(value ?? '').trim()
  if (!/^(0|[1-9]\d*)$/.test(text)) {
    return null
  }

  const number = Number(text)
  return Number.isSafeInteger(number) ? number : null
}

function getPagination(query) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1)
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize, 10) || 10, 1), 200)
  const offset = (page - 1) * pageSize
  return { page, pageSize, offset }
}

function isTooLong(value, maxLength) {
  return String(value || '').length > maxLength
}

function parseTags(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return [...new Set(value.map((tag) => toPositiveInt(tag)).filter(Boolean))]
}

function parseIngredients(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((ingredient) => ({
      ingredient_name: String(ingredient.ingredient_name || ingredient.name || '').trim(),
      quantity: String(ingredient.quantity || '').trim() || null,
    }))
    .filter((ingredient) => ingredient.ingredient_name)
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function validateRecipe(body) {
  const categoryId = toPositiveInt(body.category_id)
  const title = String(body.title || '').trim()
  const imageUrl = String(body.image_url || '').trim()
  const instructions = String(body.instructions || '').trim()
  const description = String(body.description || '').trim() || null
  const calories = toNonNegativeInt(body.calories ?? 0)
  const protein = toNonNegativeInt(body.protein ?? 0)
  const carbs = toNonNegativeInt(body.carbs ?? 0)
  const fat = toNonNegativeInt(body.fat ?? 0)
  const ingredients = parseIngredients(body.ingredients)
  const tags = parseTags(body.tags)

  if (!categoryId) {
    return { error: 'Category is required.' }
  }
  if (!title) {
    return { error: 'Title is required.' }
  }
  if (!imageUrl) {
    return { error: 'Image URL is required.' }
  }
  if (!isValidHttpUrl(imageUrl)) {
    return { error: 'Image URL must be a valid http or https URL.' }
  }
  if (!instructions) {
    return { error: 'Instructions are required.' }
  }
  if (isTooLong(title, 255)) {
    return { error: 'Title must be 255 characters or fewer.' }
  }
  if (isTooLong(imageUrl, 500)) {
    return { error: 'Image URL must be 500 characters or fewer.' }
  }
  if (isTooLong(description, MAX_DESCRIPTION_LENGTH)) {
    return { error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.` }
  }
  if (isTooLong(instructions, MAX_INSTRUCTIONS_LENGTH)) {
    return { error: `Instructions must be ${MAX_INSTRUCTIONS_LENGTH} characters or fewer.` }
  }
  if ([calories, protein, carbs, fat].some((value) => value === null)) {
    return { error: 'Nutrition values must be whole numbers greater than or equal to 0.' }
  }
  if (ingredients.length === 0) {
    return { error: 'At least one ingredient is required.' }
  }
  if (
    ingredients.some(
      (ingredient) =>
        isTooLong(ingredient.ingredient_name, 150) || isTooLong(ingredient.quantity, 50),
    )
  ) {
    return { error: 'Ingredient names must be 150 characters or fewer and quantities 50 or fewer.' }
  }

  return {
    value: {
      categoryId,
      title,
      imageUrl,
      instructions,
      description,
      calories,
      protein,
      carbs,
      fat,
      ingredients,
      tags,
    },
  }
}

async function validateTagIds(connection, tags) {
  if (tags.length === 0) {
    return true
  }

  const placeholders = tags.map(() => '?').join(', ')
  const [rows] = await connection.execute(`SELECT id FROM tags WHERE id IN (${placeholders})`, tags)
  return rows.length === tags.length
}

async function fetchRecipeDetail(recipeId, user = null) {
  const userId = user?.id || 0
  const userRole = user?.role || 'guest'
  const [rows] = await pool.execute(
    `SELECT
       r.*,
       c.name AS category_name,
       COALESCE(rating_stats.average_rating, 0) AS average_rating,
       COALESCE(rating_stats.average_rating, 0) AS avg_rating,
       COALESCE(rating_stats.rating_count, 0) AS total_ratings,
       COALESCE(rating_stats.rating_count, 0) AS rating_count,
       COALESCE(comment_stats.comment_count, 0) AS comment_count,
       COALESCE(favorite_stats.favorite_count, 0) AS favorite_count,
       CASE WHEN user_fav.user_id IS NULL THEN 0 ELSE 1 END AS is_favorite,
       user_rating.rating_value AS current_user_rating
     FROM recipes r
     JOIN categories c ON c.id = r.category_id
     LEFT JOIN (
       SELECT recipe_id, AVG(rating_value) AS average_rating, COUNT(*) AS rating_count
       FROM ratings
       GROUP BY recipe_id
     ) rating_stats ON rating_stats.recipe_id = r.id
     LEFT JOIN (
       SELECT recipe_id, COUNT(*) AS comment_count
       FROM comments
       GROUP BY recipe_id
     ) comment_stats ON comment_stats.recipe_id = r.id
     LEFT JOIN (
       SELECT recipe_id, COUNT(*) AS favorite_count
       FROM favorites
       GROUP BY recipe_id
     ) favorite_stats ON favorite_stats.recipe_id = r.id
     LEFT JOIN favorites user_fav ON user_fav.recipe_id = r.id AND user_fav.user_id = ?
     LEFT JOIN ratings user_rating ON user_rating.recipe_id = r.id AND user_rating.user_id = ?
     WHERE r.id = ?
       AND (r.status = 'approved' OR ? = 'admin' OR r.submitted_by = ?)`,
    [userId, userId, recipeId, userRole, userId],
  )

  if (rows.length === 0) {
    return null
  }

  const recipe = rows[0]
  const [ingredients] = await pool.execute(
    `SELECT id, ingredient_name, quantity
     FROM recipe_ingredients
     WHERE recipe_id = ?
     ORDER BY id ASC`,
    [recipeId],
  )
  const [tags] = await pool.execute(
    `SELECT t.id, t.name
     FROM tags t
     JOIN recipe_tags rt ON rt.tag_id = t.id
     WHERE rt.recipe_id = ?
     ORDER BY t.name ASC`,
    [recipeId],
  )
  const [comments] = await pool.execute(
    `SELECT
       comments.id,
       comments.user_id,
       users.username,
       comments.content,
       comments.created_at,
       comments.updated_at
     FROM comments
     JOIN users ON users.id = comments.user_id
     WHERE comments.recipe_id = ?
     ORDER BY comments.created_at DESC
     LIMIT 50`,
    [recipeId],
  )
  const [relatedRecipes] = await pool.execute(
    `SELECT
       r.*,
       c.name AS category_name,
       COALESCE(rating_stats.average_rating, 0) AS average_rating,
       COALESCE(rating_stats.average_rating, 0) AS avg_rating,
       COALESCE(rating_stats.rating_count, 0) AS total_ratings,
       COALESCE(rating_stats.rating_count, 0) AS rating_count,
       COALESCE(comment_stats.comment_count, 0) AS comment_count,
       COALESCE(favorite_stats.favorite_count, 0) AS favorite_count,
       tag_stats.tag_names
     FROM recipes r
     JOIN categories c ON c.id = r.category_id
     LEFT JOIN (
       SELECT recipe_id, AVG(rating_value) AS average_rating, COUNT(*) AS rating_count
       FROM ratings
       GROUP BY recipe_id
     ) rating_stats ON rating_stats.recipe_id = r.id
     LEFT JOIN (
       SELECT recipe_id, COUNT(*) AS comment_count
       FROM comments
       GROUP BY recipe_id
     ) comment_stats ON comment_stats.recipe_id = r.id
     LEFT JOIN (
       SELECT recipe_id, COUNT(*) AS favorite_count
       FROM favorites
       GROUP BY recipe_id
     ) favorite_stats ON favorite_stats.recipe_id = r.id
     LEFT JOIN (
       SELECT rt.recipe_id, GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ',') AS tag_names
       FROM recipe_tags rt
       JOIN tags t ON t.id = rt.tag_id
       GROUP BY rt.recipe_id
     ) tag_stats ON tag_stats.recipe_id = r.id
     WHERE r.id <> ?
       AND r.status = 'approved'
       AND (
         r.category_id = ?
         OR EXISTS (
           SELECT 1
           FROM recipe_tags current_rt
           JOIN recipe_tags related_rt ON related_rt.tag_id = current_rt.tag_id
           WHERE current_rt.recipe_id = ? AND related_rt.recipe_id = r.id
         )
       )
     ORDER BY rating_count DESC, avg_rating DESC, favorite_count DESC, r.created_at DESC
     LIMIT 4`,
    [recipeId, recipe.category_id, recipeId],
  )

  return {
    ...recipe,
    average_rating: Number(recipe.average_rating || 0),
    avg_rating: Number(recipe.avg_rating || recipe.average_rating || 0),
    total_ratings: Number(recipe.total_ratings || 0),
    rating_count: Number(recipe.rating_count || recipe.total_ratings || 0),
    comment_count: Number(recipe.comment_count || comments.length || 0),
    favorite_count: Number(recipe.favorite_count || 0),
    is_favorite: Boolean(recipe.is_favorite),
    ingredients,
    tags,
    comments,
    related_recipes: relatedRecipes.map((item) => ({
      ...item,
      average_rating: Number(item.average_rating || 0),
      avg_rating: Number(item.avg_rating || item.average_rating || 0),
      total_ratings: Number(item.total_ratings || 0),
      rating_count: Number(item.rating_count || item.total_ratings || 0),
      comment_count: Number(item.comment_count || 0),
      favorite_count: Number(item.favorite_count || 0),
      tags: item.tag_names ? item.tag_names.split(',') : [],
    })),
  }
}

router.get('/meta', async (req, res, next) => {
  try {
    const [categories] = await pool.execute('SELECT id, name FROM categories ORDER BY name ASC')
    const [tags] = await pool.execute('SELECT id, name FROM tags ORDER BY name ASC')
    res.json({ categories, tags })
  } catch (error) {
    next(error)
  }
})

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { page, pageSize, offset } = getPagination(req.query)
    const search = String(req.query.search || '').trim()
    const category = String(req.query.category || '').trim()
    const tag = String(req.query.tag || '').trim()
    const userId = req.user?.id || 0
    const includeMeta = req.query.includeMeta !== '0'
    const where = ['r.status = ?']
    const params = ['approved']

    if (isTooLong(search, 120) || isTooLong(category, 100) || isTooLong(tag, 100)) {
      return res.status(400).json({ error: 'Search and filter values are too long.' })
    }

    if (search) {
      where.push(
        `(r.title LIKE ?
          OR r.description LIKE ?
          OR c.name LIKE ?
          OR EXISTS (
            SELECT 1
            FROM recipe_ingredients search_ingredients
            WHERE search_ingredients.recipe_id = r.id
              AND search_ingredients.ingredient_name LIKE ?
          ))`,
      )
      const searchTerm = `%${search}%`
      params.push(searchTerm, searchTerm, searchTerm, searchTerm)
    }
    if (category && category !== 'all') {
      where.push('c.name = ?')
      params.push(category)
    }
    if (tag && tag !== 'all') {
      where.push(
        `EXISTS (
          SELECT 1
          FROM recipe_tags filter_rt
          JOIN tags filter_t ON filter_t.id = filter_rt.tag_id
          WHERE filter_rt.recipe_id = r.id AND filter_t.name = ?
        )`,
      )
      params.push(tag)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const [countRows] = await pool.execute(
      `SELECT COUNT(DISTINCT r.id) AS totalItems
       FROM recipes r
       JOIN categories c ON c.id = r.category_id
       ${whereSql}`,
      params,
    )
    const totalItems = countRows[0].totalItems
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

    const [items] = await pool.execute(
      `SELECT
         r.*,
         c.name AS category_name,
         COALESCE(rating_stats.average_rating, 0) AS average_rating,
         COALESCE(rating_stats.average_rating, 0) AS avg_rating,
         COALESCE(rating_stats.rating_count, 0) AS total_ratings,
         COALESCE(rating_stats.rating_count, 0) AS rating_count,
         COALESCE(comment_stats.comment_count, 0) AS comment_count,
         COALESCE(favorite_stats.favorite_count, 0) AS favorite_count,
         CASE WHEN user_fav.user_id IS NULL THEN 0 ELSE 1 END AS is_favorite,
         tag_stats.tag_names
       FROM recipes r
       JOIN categories c ON c.id = r.category_id
       LEFT JOIN (
         SELECT recipe_id, AVG(rating_value) AS average_rating, COUNT(*) AS rating_count
         FROM ratings
         GROUP BY recipe_id
       ) rating_stats ON rating_stats.recipe_id = r.id
       LEFT JOIN (
         SELECT recipe_id, COUNT(*) AS comment_count
         FROM comments
         GROUP BY recipe_id
       ) comment_stats ON comment_stats.recipe_id = r.id
       LEFT JOIN (
         SELECT recipe_id, COUNT(*) AS favorite_count
         FROM favorites
         GROUP BY recipe_id
       ) favorite_stats ON favorite_stats.recipe_id = r.id
       LEFT JOIN (
         SELECT rt.recipe_id, GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ',') AS tag_names
         FROM recipe_tags rt
         JOIN tags t ON t.id = rt.tag_id
         GROUP BY rt.recipe_id
       ) tag_stats ON tag_stats.recipe_id = r.id
       LEFT JOIN favorites user_fav ON user_fav.recipe_id = r.id AND user_fav.user_id = ?
       ${whereSql}
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT ? OFFSET ?`,
      [userId, ...params, pageSize, offset],
    )

    const [categories] = includeMeta
      ? await pool.execute('SELECT id, name FROM categories ORDER BY name ASC')
      : [[]]
    const [tags] = includeMeta
      ? await pool.execute('SELECT id, name FROM tags ORDER BY name ASC')
      : [[]]

    res.json({
      items: items.map((item) => ({
        ...item,
        average_rating: Number(item.average_rating || 0),
        avg_rating: Number(item.avg_rating || item.average_rating || 0),
        total_ratings: Number(item.total_ratings || 0),
        rating_count: Number(item.rating_count || item.total_ratings || 0),
        comment_count: Number(item.comment_count || 0),
        favorite_count: Number(item.favorite_count || 0),
        is_favorite: Boolean(item.is_favorite),
        tags: item.tag_names ? item.tag_names.split(',') : [],
      })),
      currentPage: page,
      totalPages,
      totalItems,
      categories,
      tags,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/submissions', requireAuth, async (req, res, next) => {
  const validation = validateRecipe(req.body)
  if (validation.error) {
    return res.status(400).json({ error: validation.error })
  }

  const data = validation.value
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [categoryRows] = await connection.execute('SELECT id FROM categories WHERE id = ?', [
      data.categoryId,
    ])
    if (categoryRows.length === 0) {
      await connection.rollback()
      return res.status(400).json({ error: 'Selected category does not exist.' })
    }
    if (!(await validateTagIds(connection, data.tags))) {
      await connection.rollback()
      return res.status(400).json({ error: 'One or more selected tags do not exist.' })
    }

    const [result] = await connection.execute(
      `INSERT INTO recipes
         (category_id, submitted_by, title, status, image_url, instructions,
          description, calories, protein, carbs, fat)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.categoryId,
        req.user.id,
        data.title,
        data.imageUrl,
        data.instructions,
        data.description,
        data.calories,
        data.protein,
        data.carbs,
        data.fat,
      ],
    )

    const recipeId = result.insertId
    for (const ingredient of data.ingredients) {
      await connection.execute(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity)
         VALUES (?, ?, ?)`,
        [recipeId, ingredient.ingredient_name, ingredient.quantity],
      )
    }
    for (const tagId of data.tags) {
      await connection.execute('INSERT IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)', [
        recipeId,
        tagId,
      ])
    }

    await connection.commit()
    const recipe = await fetchRecipeDetail(recipeId, req.user)
    return res.status(201).json({
      message: 'The recipe was submitted and is awaiting administrator review.',
      recipe,
    })
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
  }
})

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const recipeId = toPositiveInt(req.params.id)
    if (!recipeId) {
      return res.status(400).json({ error: 'Invalid recipe id.' })
    }

    const recipe = await fetchRecipeDetail(recipeId, req.user)
    if (!recipe) {
      return res.status(404).json({ error: 'Recipe not found.' })
    }

    return res.json({ recipe })
  } catch (error) {
    return next(error)
  }
})

router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  const validation = validateRecipe(req.body)
  if (validation.error) {
    return res.status(400).json({ error: validation.error })
  }

  const data = validation.value
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [categoryRows] = await connection.execute('SELECT id FROM categories WHERE id = ?', [
      data.categoryId,
    ])
    if (categoryRows.length === 0) {
      await connection.rollback()
      return res.status(400).json({ error: 'Selected category does not exist.' })
    }
    if (!(await validateTagIds(connection, data.tags))) {
      await connection.rollback()
      return res.status(400).json({ error: 'One or more selected tags do not exist.' })
    }

    const [result] = await connection.execute(
      `INSERT INTO recipes
         (category_id, submitted_by, title, status, image_url, instructions,
          description, calories, protein, carbs, fat)
       VALUES (?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.categoryId,
        req.user.id,
        data.title,
        data.imageUrl,
        data.instructions,
        data.description,
        data.calories,
        data.protein,
        data.carbs,
        data.fat,
      ],
    )

    const recipeId = result.insertId
    for (const ingredient of data.ingredients) {
      await connection.execute(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity)
         VALUES (?, ?, ?)`,
        [recipeId, ingredient.ingredient_name, ingredient.quantity],
      )
    }
    for (const tagId of data.tags) {
      await connection.execute('INSERT IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)', [
        recipeId,
        tagId,
      ])
    }

    await connection.commit()
    const recipe = await fetchRecipeDetail(recipeId, req.user)
    return res.status(201).json({ recipe })
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
  }
})

router.put('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  const recipeId = toPositiveInt(req.params.id)
  if (!recipeId) {
    return res.status(400).json({ error: 'Invalid recipe id.' })
  }

  const validation = validateRecipe(req.body)
  if (validation.error) {
    return res.status(400).json({ error: validation.error })
  }

  const data = validation.value
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [existing] = await connection.execute('SELECT id FROM recipes WHERE id = ?', [recipeId])
    if (existing.length === 0) {
      await connection.rollback()
      return res.status(404).json({ error: 'Recipe not found.' })
    }

    const [categoryRows] = await connection.execute('SELECT id FROM categories WHERE id = ?', [
      data.categoryId,
    ])
    if (categoryRows.length === 0) {
      await connection.rollback()
      return res.status(400).json({ error: 'Selected category does not exist.' })
    }
    if (!(await validateTagIds(connection, data.tags))) {
      await connection.rollback()
      return res.status(400).json({ error: 'One or more selected tags do not exist.' })
    }

    await connection.execute(
      `UPDATE recipes
       SET category_id = ?, title = ?, image_url = ?, instructions = ?, description = ?,
           calories = ?, protein = ?, carbs = ?, fat = ?
       WHERE id = ?`,
      [
        data.categoryId,
        data.title,
        data.imageUrl,
        data.instructions,
        data.description,
        data.calories,
        data.protein,
        data.carbs,
        data.fat,
        recipeId,
      ],
    )

    await connection.execute('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [recipeId])
    await connection.execute('DELETE FROM recipe_tags WHERE recipe_id = ?', [recipeId])

    for (const ingredient of data.ingredients) {
      await connection.execute(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity)
         VALUES (?, ?, ?)`,
        [recipeId, ingredient.ingredient_name, ingredient.quantity],
      )
    }
    for (const tagId of data.tags) {
      await connection.execute('INSERT IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)', [
        recipeId,
        tagId,
      ])
    }

    await connection.commit()
    const recipe = await fetchRecipeDetail(recipeId, req.user)
    return res.json({ recipe })
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
  }
})

router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
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

export default router
