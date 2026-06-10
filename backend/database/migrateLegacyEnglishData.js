import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from '../db.js'
import {
  buildInstructions,
  descriptionFor,
  ingredientsFor,
  nutritionFor,
  recipes as englishRecipes,
} from './seedRecipes.js'

const MIGRATION_NAME = 'legacy_english_data_v1'
const GENERATED_USER_PATTERN = 'foodstory_user\\_%'
const nonAsciiPattern = /[^\x00-\x7F]/

const commentTemplates = [
  ({ title }) =>
    `I cooked ${title} last night and the steps were clear. The flavor was balanced and the leftovers reheated well.`,
  ({ title, category }) =>
    `This ${category} recipe made ${title} approachable. The ingredient list was detailed enough to shop from without guessing.`,
  ({ title }) =>
    `${title} turned out better than expected. The preparation notes made the cooking process easy to follow.`,
  ({ title }) =>
    `Saved ${title} for the weekend. The step-by-step instructions are practical and well organized.`,
  ({ category }) =>
    `A solid ${category} recipe. I adjusted the seasoning at the end and the texture still came out right.`,
  ({ title }) =>
    `The timing cues in ${title} helped a lot. I would make it again and add a little extra garnish next time.`,
  ({ title }) =>
    `${title} works well in a home kitchen. It was easy to portion and looked good on the plate.`,
  ({ title, category }) =>
    `I appreciate the detail in ${title}. This ${category} recipe explains each stage clearly.`,
]

function hasNonAscii(value) {
  return nonAsciiPattern.test(String(value || ''))
}

function toAscii(value) {
  return String(value || '')
    .replace(/[Đđ]/g, (character) => (character === 'Đ' ? 'D' : 'd'))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function restaurantDescription(restaurant) {
  const category = String(restaurant.category || 'local food').toLowerCase()
  const district = restaurant.district || 'Ho Chi Minh City'
  return `A popular ${category} destination in ${district}, known for approachable local flavors and a welcoming atmosphere.`
}

async function ensureMigrationTable(connection) {
  await connection.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name VARCHAR(255) PRIMARY KEY,
       run_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  )
}

async function upsertNames(connection, table, names) {
  for (const name of names) {
    await connection.execute(
      `INSERT INTO ${table} (name)
       VALUES (?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [name],
    )
  }
}

async function fetchNameIdMap(connection, table, names) {
  const placeholders = names.map(() => '?').join(', ')
  const [rows] = await connection.execute(
    `SELECT id, name FROM ${table} WHERE name IN (${placeholders})`,
    names,
  )
  return new Map(rows.map((row) => [row.name, row.id]))
}

async function updateChecklistItems(connection, recipeId, ingredients) {
  const [checklists] = await connection.execute(
    'SELECT id FROM checklists WHERE recipe_id = ?',
    [recipeId],
  )

  for (const checklist of checklists) {
    const [items] = await connection.execute(
      `SELECT id
       FROM checklist_items
       WHERE checklist_id = ?
       ORDER BY id ASC`,
      [checklist.id],
    )

    const sharedCount = Math.min(items.length, ingredients.length)
    for (let index = 0; index < sharedCount; index += 1) {
      await connection.execute(
        `UPDATE checklist_items
         SET ingredient_name = ?, quantity = ?
         WHERE id = ?`,
        [ingredients[index].name, ingredients[index].quantity, items[index].id],
      )
    }

    if (items.length > ingredients.length) {
      const extraIds = items.slice(ingredients.length).map((item) => item.id)
      const placeholders = extraIds.map(() => '?').join(', ')
      await connection.execute(
        `DELETE FROM checklist_items WHERE id IN (${placeholders})`,
        extraIds,
      )
    }

    for (const ingredient of ingredients.slice(items.length)) {
      await connection.execute(
        `INSERT INTO checklist_items
           (checklist_id, ingredient_name, quantity, is_checked)
         VALUES (?, ?, ?, FALSE)`,
        [checklist.id, ingredient.name, ingredient.quantity],
      )
    }
  }
}

async function migrateSystemRecipes(connection) {
  const [systemRecipes] = await connection.execute(
    `SELECT id
     FROM recipes
     WHERE submitted_by IS NULL
     ORDER BY id ASC`,
  )

  if (systemRecipes.length > englishRecipes.length) {
    throw new Error(
      `English recipe catalog has ${englishRecipes.length} entries but ${systemRecipes.length} system recipes need migration.`,
    )
  }

  const selectedRecipes = englishRecipes.slice(0, systemRecipes.length)
  const categoryNames = [...new Set(selectedRecipes.map((recipe) => recipe.category))]
  const tagNames = [...new Set(selectedRecipes.flatMap((recipe) => recipe.tags))]

  await upsertNames(connection, 'categories', categoryNames)
  await upsertNames(connection, 'tags', tagNames)

  const categoryIds = await fetchNameIdMap(connection, 'categories', categoryNames)
  const tagIds = await fetchNameIdMap(connection, 'tags', tagNames)

  for (let index = 0; index < systemRecipes.length; index += 1) {
    const recipeId = systemRecipes[index].id
    const recipe = selectedRecipes[index]
    const nutrition = nutritionFor(recipe)
    const ingredients = ingredientsFor(recipe)

    await connection.execute(
      `UPDATE recipes
       SET category_id = ?,
           title = ?,
           instructions = ?,
           description = ?,
           calories = ?,
           protein = ?,
           carbs = ?,
           fat = ?
       WHERE id = ?`,
      [
        categoryIds.get(recipe.category),
        recipe.title,
        buildInstructions(recipe),
        descriptionFor(recipe),
        nutrition.calories,
        nutrition.protein,
        nutrition.carbs,
        nutrition.fat,
        recipeId,
      ],
    )

    await connection.execute('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [
      recipeId,
    ])
    for (const ingredient of ingredients) {
      await connection.execute(
        `INSERT INTO recipe_ingredients
           (recipe_id, ingredient_name, quantity)
         VALUES (?, ?, ?)`,
        [recipeId, ingredient.name, ingredient.quantity],
      )
    }

    await connection.execute('DELETE FROM recipe_tags WHERE recipe_id = ?', [recipeId])
    for (const tagName of recipe.tags) {
      await connection.execute(
        `INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
         VALUES (?, ?)`,
        [recipeId, tagIds.get(tagName)],
      )
    }

    await updateChecklistItems(connection, recipeId, ingredients)
  }

  return systemRecipes.length
}

async function migrateGeneratedComments(connection) {
  const [comments] = await connection.execute(
    `SELECT
       comments.id,
       comments.content,
       recipes.title,
       categories.name AS category
     FROM comments
     JOIN users ON users.id = comments.user_id
     JOIN recipes ON recipes.id = comments.recipe_id
     JOIN categories ON categories.id = recipes.category_id
     WHERE users.username LIKE ? ESCAPE '\\\\'`,
    [GENERATED_USER_PATTERN],
  )

  let updated = 0
  for (const comment of comments) {
    if (!hasNonAscii(comment.content)) {
      continue
    }

    const template = commentTemplates[comment.id % commentTemplates.length]
    await connection.execute('UPDATE comments SET content = ? WHERE id = ?', [
      template({ title: comment.title, category: comment.category }),
      comment.id,
    ])
    updated += 1
  }

  return updated
}

async function migrateRestaurants(connection) {
  const [restaurants] = await connection.execute(
    `SELECT id, name, address, district, category, description
     FROM restaurants`,
  )

  let updated = 0
  for (const restaurant of restaurants) {
    const containsLegacyText = [
      restaurant.name,
      restaurant.address,
      restaurant.district,
      restaurant.category,
      restaurant.description,
    ].some(hasNonAscii)

    if (!containsLegacyText) {
      continue
    }

    await connection.execute(
      `UPDATE restaurants
       SET name = ?,
           address = ?,
           district = ?,
           category = ?,
           description = ?
       WHERE id = ?`,
      [
        toAscii(restaurant.name),
        toAscii(restaurant.address),
        titleCase(toAscii(restaurant.district)),
        titleCase(toAscii(restaurant.category)),
        restaurantDescription(restaurant),
        restaurant.id,
      ],
    )
    updated += 1
  }

  return updated
}

export async function migrateLegacyEnglishData() {
  const connection = await pool.getConnection()

  try {
    await ensureMigrationTable(connection)
    const [existing] = await connection.execute(
      'SELECT name FROM schema_migrations WHERE name = ?',
      [MIGRATION_NAME],
    )

    if (existing.length > 0) {
      console.log(`Skipping ${MIGRATION_NAME}; already applied.`)
      return
    }

    await connection.beginTransaction()

    const recipeCount = await migrateSystemRecipes(connection)
    const commentCount = await migrateGeneratedComments(connection)
    const restaurantCount = await migrateRestaurants(connection)

    await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [
      MIGRATION_NAME,
    ])
    await connection.commit()

    console.log(
      `Applied ${MIGRATION_NAME}: ${recipeCount} recipes, ${commentCount} comments, and ${restaurantCount} restaurants updated.`,
    )
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  migrateLegacyEnglishData()
    .catch((error) => {
      console.error('English data migration failed:', error.message)
      process.exitCode = 1
    })
    .finally(async () => {
      await pool.end()
    })
}
