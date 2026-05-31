import express from 'express'
import pool from '../db.js'
import { optionalAuth, requireAuth } from '../middleware/authMiddleware.js'
import { requireAdmin } from '../middleware/roleMiddleware.js'

const router = express.Router()

function toPositiveInt(value) {
  const number = Number.parseInt(value, 10)
  return Number.isInteger(number) && number > 0 ? number : null
}

function toNonNegativeInt(value) {
  const number = Number.parseInt(value, 10)
  return Number.isInteger(number) && number >= 0 ? number : null
}

function getPagination(query) {
  const page = Math.max(Number.parseInt(query.page || '1', 10), 1)
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize || '6', 10), 1), 24)
  const offset = (page - 1) * pageSize
  return { page, pageSize, offset }
}

function parseTags(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((tag) => Number.parseInt(tag, 10))
    .filter((tag) => Number.isInteger(tag) && tag > 0)
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

function validateRecipe(body) {
  const categoryId = toPositiveInt(body.category_id)
  const title = String(body.title || '').trim()
  const imageUrl = String(body.image_url || '').trim()
  const instructions = String(body.instructions || '').trim()
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
  if (!instructions) {
    return { error: 'Instructions are required.' }
  }
  if ([calories, protein, carbs, fat].some((value) => value === null)) {
    return { error: 'Nutrition values must be numbers greater than or equal to 0.' }
  }
  if (ingredients.length === 0) {
    return { error: 'At least one ingredient is required.' }
  }

  return {
    value: {
      categoryId,
      title,
      imageUrl,
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

async function fetchRecipeDetail(recipeId, userId = 0) {
  const [rows] = await pool.execute(
    `SELECT
       r.id,
       r.category_id,
       c.name AS category_name,
       r.title,
       r.image_url,
       r.instructions,
       r.calories,
       r.protein,
       r.carbs,
       r.fat,
       r.created_at,
       COALESCE(AVG(ra.rating_value), 0) AS average_rating,
       COUNT(DISTINCT ra.id) AS total_ratings,
       COUNT(DISTINCT fav.user_id) AS favorite_count,
       MAX(CASE WHEN user_fav.user_id IS NULL THEN 0 ELSE 1 END) AS is_favorite,
       MAX(user_rating.rating_value) AS current_user_rating
     FROM recipes r
     JOIN categories c ON c.id = r.category_id
     LEFT JOIN ratings ra ON ra.recipe_id = r.id
     LEFT JOIN favorites fav ON fav.recipe_id = r.id
     LEFT JOIN favorites user_fav ON user_fav.recipe_id = r.id AND user_fav.user_id = ?
     LEFT JOIN ratings user_rating ON user_rating.recipe_id = r.id AND user_rating.user_id = ?
     WHERE r.id = ?
     GROUP BY r.id, c.name`,
    [userId, userId, recipeId],
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
     ORDER BY comments.created_at DESC`,
    [recipeId],
  )

  return {
    ...recipe,
    average_rating: Number(recipe.average_rating || 0),
    total_ratings: Number(recipe.total_ratings || 0),
    favorite_count: Number(recipe.favorite_count || 0),
    is_favorite: Boolean(recipe.is_favorite),
    ingredients,
    tags,
    comments,
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
    const where = []
    const params = []

    if (search) {
      where.push('r.title LIKE ?')
      params.push(`%${search}%`)
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
         r.id,
         r.title,
         r.image_url,
         r.calories,
         r.protein,
         r.carbs,
         r.fat,
         r.created_at,
         c.name AS category_name,
         COALESCE(AVG(ra.rating_value), 0) AS average_rating,
         COUNT(DISTINCT ra.id) AS total_ratings,
         COUNT(DISTINCT fav.user_id) AS favorite_count,
         MAX(CASE WHEN user_fav.user_id IS NULL THEN 0 ELSE 1 END) AS is_favorite,
         GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ',') AS tag_names
       FROM recipes r
       JOIN categories c ON c.id = r.category_id
       LEFT JOIN recipe_tags rt ON rt.recipe_id = r.id
       LEFT JOIN tags t ON t.id = rt.tag_id
       LEFT JOIN ratings ra ON ra.recipe_id = r.id
       LEFT JOIN favorites fav ON fav.recipe_id = r.id
       LEFT JOIN favorites user_fav ON user_fav.recipe_id = r.id AND user_fav.user_id = ?
       ${whereSql}
       GROUP BY r.id, c.name
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT ? OFFSET ?`,
      [userId, ...params, pageSize, offset],
    )

    const [categories] = await pool.execute('SELECT id, name FROM categories ORDER BY name ASC')
    const [tags] = await pool.execute('SELECT id, name FROM tags ORDER BY name ASC')

    res.json({
      items: items.map((item) => ({
        ...item,
        average_rating: Number(item.average_rating || 0),
        total_ratings: Number(item.total_ratings || 0),
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

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const recipeId = toPositiveInt(req.params.id)
    if (!recipeId) {
      return res.status(400).json({ error: 'Invalid recipe id.' })
    }

    const recipe = await fetchRecipeDetail(recipeId, req.user?.id || 0)
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

    const [result] = await connection.execute(
      `INSERT INTO recipes
         (category_id, title, image_url, instructions, calories, protein, carbs, fat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.categoryId,
        data.title,
        data.imageUrl,
        data.instructions,
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
    const recipe = await fetchRecipeDetail(recipeId, req.user.id)
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

    await connection.execute(
      `UPDATE recipes
       SET category_id = ?, title = ?, image_url = ?, instructions = ?,
           calories = ?, protein = ?, carbs = ?, fat = ?
       WHERE id = ?`,
      [
        data.categoryId,
        data.title,
        data.imageUrl,
        data.instructions,
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
    const recipe = await fetchRecipeDetail(recipeId, req.user.id)
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
