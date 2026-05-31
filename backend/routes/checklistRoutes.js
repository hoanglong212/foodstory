import express from 'express'
import pool from '../db.js'
import { requireAuth } from '../middleware/authMiddleware.js'

const router = express.Router()

async function getChecklist(userId, recipeId) {
  const [checklists] = await pool.execute(
    `SELECT id, user_id, recipe_id, created_at
     FROM checklists
     WHERE user_id = ? AND recipe_id = ?`,
    [userId, recipeId],
  )

  if (checklists.length === 0) {
    return null
  }

  const checklist = checklists[0]
  const [items] = await pool.execute(
    `SELECT id, ingredient_name, quantity, is_checked
     FROM checklist_items
     WHERE checklist_id = ?
     ORDER BY id ASC`,
    [checklist.id],
  )

  return {
    ...checklist,
    items: items.map((item) => ({
      ...item,
      is_checked: Boolean(item.is_checked),
    })),
  }
}

router.post('/checklists', requireAuth, async (req, res, next) => {
  const recipeId = Number.parseInt(req.body.recipe_id, 10)
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ error: 'Valid recipe_id is required.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [recipes] = await connection.execute('SELECT id FROM recipes WHERE id = ?', [recipeId])
    if (recipes.length === 0) {
      await connection.rollback()
      return res.status(404).json({ error: 'Recipe not found.' })
    }

    const [existing] = await connection.execute(
      'SELECT id FROM checklists WHERE user_id = ? AND recipe_id = ?',
      [req.user.id, recipeId],
    )

    let checklistId = existing[0]?.id
    if (!checklistId) {
      const [result] = await connection.execute(
        'INSERT INTO checklists (user_id, recipe_id) VALUES (?, ?)',
        [req.user.id, recipeId],
      )
      checklistId = result.insertId

      const [ingredients] = await connection.execute(
        `SELECT ingredient_name, quantity
         FROM recipe_ingredients
         WHERE recipe_id = ?
         ORDER BY id ASC`,
        [recipeId],
      )

      for (const ingredient of ingredients) {
        await connection.execute(
          `INSERT INTO checklist_items (checklist_id, ingredient_name, quantity, is_checked)
           VALUES (?, ?, ?, FALSE)`,
          [checklistId, ingredient.ingredient_name, ingredient.quantity],
        )
      }
    }

    await connection.commit()
    const checklist = await getChecklist(req.user.id, recipeId)
    return res.status(201).json({ checklist })
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
  }
})

router.get('/checklists/:recipeId', requireAuth, async (req, res, next) => {
  try {
    const recipeId = Number.parseInt(req.params.recipeId, 10)
    if (!Number.isInteger(recipeId) || recipeId <= 0) {
      return res.status(400).json({ error: 'Invalid recipe id.' })
    }

    const checklist = await getChecklist(req.user.id, recipeId)
    if (!checklist) {
      return res.status(404).json({ error: 'Checklist has not been generated yet.' })
    }

    return res.json({ checklist })
  } catch (error) {
    return next(error)
  }
})

router.patch('/checklist-items/:id', requireAuth, async (req, res, next) => {
  try {
    const itemId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ error: 'Invalid checklist item id.' })
    }

    const [items] = await pool.execute(
      `SELECT checklist_items.id, checklist_items.is_checked
       FROM checklist_items
       JOIN checklists ON checklists.id = checklist_items.checklist_id
       WHERE checklist_items.id = ? AND checklists.user_id = ?`,
      [itemId, req.user.id],
    )

    if (items.length === 0) {
      return res.status(404).json({ error: 'Checklist item not found.' })
    }

    const nextChecked = !Boolean(items[0].is_checked)
    await pool.execute('UPDATE checklist_items SET is_checked = ? WHERE id = ?', [
      nextChecked,
      itemId,
    ])

    return res.json({ id: itemId, is_checked: nextChecked })
  } catch (error) {
    return next(error)
  }
})

export default router
