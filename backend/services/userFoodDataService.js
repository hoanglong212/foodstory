import pool from '../db.js'

function requireUserId(userId) {
  const parsed = Number(userId)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('A valid authenticated userId is required')
  }
  return parsed
}

export async function getUserFavorites(userId) {
  const authenticatedUserId = requireUserId(userId)
  const [rows] = await pool.execute(
    `SELECT
       r.id,
       r.title,
       r.description,
       r.servings,
       r.prep_time,
       r.cook_time,
       r.calories,
       r.protein,
       r.carbs,
       r.fat,
       r.difficulty,
       c.name AS category_name,
       COALESCE(rating_stats.average_rating, 0) AS average_rating,
       COALESCE(rating_stats.rating_count, 0) AS rating_count
     FROM favorites f
     JOIN recipes r ON r.id = f.recipe_id
     LEFT JOIN categories c ON c.id = r.category_id
     LEFT JOIN (
       SELECT recipe_id, AVG(rating_value) AS average_rating, COUNT(*) AS rating_count
       FROM ratings
       GROUP BY recipe_id
     ) rating_stats ON rating_stats.recipe_id = r.id
     WHERE f.user_id = ? AND r.status = 'approved'
     ORDER BY f.recipe_id DESC
     LIMIT 50`,
    [authenticatedUserId]
  )

  return rows.map((row) => ({
    ...row,
    average_rating: Number(row.average_rating || 0),
    rating_count: Number(row.rating_count || 0),
  }))
}

export async function getUserChecklists(userId) {
  const authenticatedUserId = requireUserId(userId)
  const [rows] = await pool.execute(
    `SELECT
       c.id,
       c.recipe_id,
       r.title AS recipe_title,
       c.created_at,
       COUNT(ci.id) AS total_items,
       SUM(CASE WHEN ci.is_checked THEN 1 ELSE 0 END) AS checked_items
     FROM checklists c
     JOIN recipes r ON r.id = c.recipe_id
     LEFT JOIN checklist_items ci ON ci.checklist_id = c.id
     WHERE c.user_id = ?
     GROUP BY c.id, c.recipe_id, r.title, c.created_at
     ORDER BY c.created_at DESC
     LIMIT 50`,
    [authenticatedUserId]
  )

  return rows.map((row) => ({
    ...row,
    total_items: Number(row.total_items || 0),
    checked_items: Number(row.checked_items || 0),
  }))
}

export async function getUserChecklistItems(userId, checklistId) {
  const authenticatedUserId = requireUserId(userId)
  const parsedChecklistId = Number(checklistId)
  if (!Number.isInteger(parsedChecklistId) || parsedChecklistId <= 0) {
    return null
  }

  const [checklists] = await pool.execute(
    `SELECT c.id, c.recipe_id, r.title AS recipe_title, c.created_at
     FROM checklists c
     JOIN recipes r ON r.id = c.recipe_id
     WHERE c.id = ? AND c.user_id = ?
     LIMIT 1`,
    [parsedChecklistId, authenticatedUserId]
  )
  if (!checklists[0]) return null

  const [items] = await pool.execute(
    `SELECT id, ingredient_name, quantity, is_checked
     FROM checklist_items
     WHERE checklist_id = ?
     ORDER BY id ASC`,
    [parsedChecklistId]
  )

  return {
    ...checklists[0],
    items: items.map((item) => ({
      ...item,
      is_checked: Boolean(item.is_checked),
    })),
  }
}

export async function getUserFoodSpots(userId) {
  const authenticatedUserId = requireUserId(userId)
  const [rows] = await pool.execute(
    `SELECT
       id,
       recipe_id,
       name,
       dish_name,
       category,
       district,
       latitude,
       longitude,
       rating,
       notes,
       tags,
       created_at,
       updated_at
     FROM food_spots
     WHERE user_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 100`,
    [authenticatedUserId]
  )

  return rows
}

export async function handleUserFoodDataQuery(intent, userId, entities = {}) {
  if (intent === 'user_favorites') {
    const items = await getUserFavorites(userId)
    return {
      status: items.length ? 'matched' : 'no_results',
      kind: intent,
      items,
    }
  }

  if (intent === 'user_checklists') {
    const checklists = await getUserChecklists(userId)
    const requestedChecklistId = Number(entities.checklistId)

    if (Number.isInteger(requestedChecklistId) && requestedChecklistId > 0) {
      const checklist = await getUserChecklistItems(userId, requestedChecklistId)
      return {
        status: checklist ? 'matched' : 'no_results',
        kind: intent,
        items: checklist ? [checklist] : [],
      }
    }

    return {
      status: checklists.length ? 'matched' : 'no_results',
      kind: intent,
      items: checklists,
    }
  }

  if (intent === 'user_food_spots') {
    const items = await getUserFoodSpots(userId)
    return {
      status: items.length ? 'matched' : 'no_results',
      kind: intent,
      items,
    }
  }

  return { status: 'unsupported', kind: intent, items: [] }
}
