import express from 'express'
import pool from '../db.js'
import { requireAuth } from '../middleware/authMiddleware.js'

const router = express.Router()

const SPOT_COLUMNS = `
  id, user_id, recipe_id, name, dish_name, category, district,
  latitude, longitude, rating, notes, tags, created_at, updated_at
`

const PUBLIC_SPOT_COLUMNS = `
  id, name, dish_name, category, district,
  latitude, longitude, rating, created_at
`

function toPositiveInt(value) {
  const text = String(value ?? '').trim()
  if (!/^[1-9]\d*$/.test(text)) {
    return null
  }

  const number = Number(text)
  return Number.isSafeInteger(number) ? number : null
}

function optionalText(value, maxLength) {
  const text = String(value ?? '').trim()
  if (!text) {
    return null
  }
  return text.length <= maxLength ? text : undefined
}

function parseNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  const number = Number(value)
  return Number.isFinite(number) ? number : NaN
}

async function validatePayload(body) {
  const name = optionalText(body.name, 150)
  const dishName = optionalText(body.dish_name, 150)
  const category = optionalText(body.category, 80)
  const district = optionalText(body.district, 80)
  const notes = optionalText(body.notes, 65_535)
  const tags = optionalText(body.tags, 255)
  const latitude = parseNumber(body.latitude)
  const longitude = parseNumber(body.longitude)
  const rating = parseNumber(body.rating)
  const recipeId =
    body.recipe_id === '' || body.recipe_id === null || body.recipe_id === undefined
      ? null
      : toPositiveInt(body.recipe_id)

  if (!name) {
    return { error: 'The place name is required and cannot exceed 150 characters.' }
  }
  if (dishName === undefined || category === undefined || district === undefined) {
    return { error: 'One or more text fields exceed the allowed length.' }
  }
  if (notes === undefined || tags === undefined) {
    return { error: 'Notes or tags exceed the allowed length.' }
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { error: 'Latitude must be between -90 and 90.' }
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { error: 'Longitude must be between -180 and 180.' }
  }
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return { error: 'The rating must be an integer from 1 to 5.' }
  }
  if (body.recipe_id !== '' && body.recipe_id !== null && body.recipe_id !== undefined && !recipeId) {
    return { error: 'The linked recipe is invalid.' }
  }

  if (recipeId) {
    const [recipes] = await pool.execute('SELECT id FROM recipes WHERE id = ?', [recipeId])
    if (recipes.length === 0) {
      return { error: 'The linked recipe could not be found.', status: 400 }
    }
  }

  return {
    data: {
      recipeId,
      name,
      dishName,
      category,
      district,
      latitude,
      longitude,
      rating,
      notes,
      tags,
    },
  }
}

async function getSpotById(id) {
  const [rows] = await pool.execute(
    `SELECT ${SPOT_COLUMNS} FROM food_spots WHERE id = ?`,
    [id],
  )
  return rows[0] || null
}

router.get('/public', async (req, res, next) => {
  try {
    const conditions = []
    const params = []
    const dish = optionalText(req.query.dish, 150)
    const category = optionalText(req.query.category, 80)
    const district = optionalText(req.query.district, 80)

    if (dish === undefined || category === undefined || district === undefined) {
      return res.status(400).json({ error: 'The community filters are invalid.' })
    }

    if (dish) {
      conditions.push('(dish_name LIKE ? OR name LIKE ?)')
      params.push(`%${dish}%`, `%${dish}%`)
    }
    if (category) {
      conditions.push('category = ?')
      params.push(category)
    }
    if (district) {
      conditions.push('district = ?')
      params.push(district)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const [spots] = await pool.execute(
      `SELECT ${PUBLIC_SPOT_COLUMNS}
       FROM food_spots
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT 200`,
      params,
    )

    return res.json(spots)
  } catch (error) {
    return next(error)
  }
})

router.use(requireAuth)

router.get('/', async (req, res, next) => {
  try {
    const conditions = ['user_id = ?']
    const params = [req.user.id]
    const district = optionalText(req.query.district, 80)
    const category = optionalText(req.query.category, 80)
    const minimumRating =
      req.query.rating === undefined || req.query.rating === ''
        ? null
        : parseNumber(req.query.rating)

    if (district === undefined || category === undefined) {
      return res.status(400).json({ error: 'The filters are invalid.' })
    }
    if (
      minimumRating !== null &&
      (!Number.isInteger(minimumRating) || minimumRating < 1 || minimumRating > 5)
    ) {
      return res.status(400).json({ error: 'The minimum rating must be between 1 and 5.' })
    }

    if (district) {
      conditions.push('district = ?')
      params.push(district)
    }
    if (category) {
      conditions.push('category = ?')
      params.push(category)
    }
    if (minimumRating !== null) {
      conditions.push('rating >= ?')
      params.push(minimumRating)
    }

    const [spots] = await pool.execute(
      `SELECT ${SPOT_COLUMNS}
       FROM food_spots
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC, id DESC`,
      params,
    )

    return res.json(spots)
  } catch (error) {
    return next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const validation = await validatePayload(req.body)
    if (validation.error) {
      return res.status(validation.status || 400).json({ error: validation.error })
    }

    const spot = validation.data
    const [result] = await pool.execute(
      `INSERT INTO food_spots (
         user_id, recipe_id, name, dish_name, category, district,
         latitude, longitude, rating, notes, tags
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        spot.recipeId,
        spot.name,
        spot.dishName,
        spot.category,
        spot.district,
        spot.latitude,
        spot.longitude,
        spot.rating,
        spot.notes,
        spot.tags,
      ],
    )

    return res.status(201).json(await getSpotById(result.insertId))
  } catch (error) {
    return next(error)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const spotId = toPositiveInt(req.params.id)
    if (!spotId) {
      return res.status(400).json({ error: 'The place ID is invalid.' })
    }

    const existing = await getSpotById(spotId)
    if (!existing) {
      return res.status(404).json({ error: 'The place could not be found.' })
    }
    if (existing.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have permission to edit this place.' })
    }

    const validation = await validatePayload(req.body)
    if (validation.error) {
      return res.status(validation.status || 400).json({ error: validation.error })
    }

    const spot = validation.data
    await pool.execute(
      `UPDATE food_spots
       SET recipe_id = ?, name = ?, dish_name = ?, category = ?, district = ?,
           latitude = ?, longitude = ?, rating = ?, notes = ?, tags = ?
       WHERE id = ? AND user_id = ?`,
      [
        spot.recipeId,
        spot.name,
        spot.dishName,
        spot.category,
        spot.district,
        spot.latitude,
        spot.longitude,
        spot.rating,
        spot.notes,
        spot.tags,
        spotId,
        req.user.id,
      ],
    )

    return res.json(await getSpotById(spotId))
  } catch (error) {
    return next(error)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const spotId = toPositiveInt(req.params.id)
    if (!spotId) {
      return res.status(400).json({ error: 'The place ID is invalid.' })
    }

    const existing = await getSpotById(spotId)
    if (!existing) {
      return res.status(404).json({ error: 'The place could not be found.' })
    }
    if (existing.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have permission to delete this place.' })
    }

    await pool.execute('DELETE FROM food_spots WHERE id = ? AND user_id = ?', [
      spotId,
      req.user.id,
    ])
    return res.json({ message: 'Deleted successfully' })
  } catch (error) {
    return next(error)
  }
})

export default router
