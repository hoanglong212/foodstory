import axios from 'axios'
import pool from '../db.js'
import { getAiServiceHeaders } from '../services/aiServiceAuth.js'

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || process.env.FASTAPI_URL || 'http://127.0.0.1:8000'
const CLIP_MODEL = 'ViT-B-32:openai'
const FORCE = process.argv.includes('--force')
const REQUEST_TIMEOUT_MS = 30_000
const ITEM_DELAY_MS = 200

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function parseStoredEmbedding(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return JSON.parse(value)
  return null
}

function restaurantClipText(restaurant) {
  return [
    `A food restaurant named ${cleanText(restaurant.name)}.`,
    restaurant.category ? `Cuisine or food category: ${cleanText(restaurant.category)}.` : '',
    restaurant.description ? `Food description: ${cleanText(restaurant.description)}.` : '',
    restaurant.district ? `Located in ${cleanText(restaurant.district)}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function recipeClipText(recipe) {
  return [
    `A photo of the prepared dish ${cleanText(recipe.title)}.`,
    recipe.category ? `Food category: ${cleanText(recipe.category)}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

async function findExisting(sourceType, sourceId) {
  const [rows] = await pool.execute(
    `SELECT id, image_url AS imageUrl, chunk_text AS chunkText,
            embedding AS textEmbedding, image_embedding AS imageEmbedding
     FROM ai_embeddings
     WHERE source_type = ? AND source_id = ? AND embedding_type = 'image'
     ORDER BY id ASC
     LIMIT 1`,
    [sourceType, sourceId],
  )
  return rows[0] || null
}

async function saveClipEmbedding({
  existingId,
  sourceType,
  sourceId,
  sourceTitle,
  sourceText = null,
  imageUrl = null,
  embedding,
  textEmbedding = null,
  model = CLIP_MODEL,
}) {
  const values = [
    sourceTitle,
    sourceText,
    textEmbedding ? JSON.stringify(textEmbedding) : null,
    JSON.stringify(embedding),
    model,
    imageUrl,
  ]

  if (existingId) {
    await pool.execute(
      `UPDATE ai_embeddings
       SET source_title = ?,
           chunk_text = ?,
           embedding = ?,
           image_embedding = ?,
           embedding_model = ?,
           image_url = ?,
           created_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...values, existingId],
    )
    return
  }

  await pool.execute(
    `INSERT INTO ai_embeddings
       (document_id, chunk_text, embedding, image_embedding, embedding_model,
        embedding_type, source_type, source_id, source_title, image_url)
     VALUES (NULL, ?, ?, ?, ?, 'image', ?, ?, ?, ?)`,
    [
      sourceText,
      textEmbedding ? JSON.stringify(textEmbedding) : null,
      JSON.stringify(embedding),
      model,
      sourceType,
      sourceId,
      sourceTitle,
      imageUrl,
    ],
  )
}

async function precomputeRecipes() {
  const [recipes] = await pool.execute(
    `SELECT r.id, r.title, r.image_url, category.name AS category
     FROM recipes r
     JOIN categories category ON category.id = r.category_id
     WHERE r.status = 'approved'
       AND r.image_url IS NOT NULL
       AND TRIM(r.image_url) <> ''
     ORDER BY r.id ASC`,
  )

  console.log(`Found ${recipes.length} approved recipes with images.`)
  let success = 0
  let skipped = 0
  let failed = 0

  for (const recipe of recipes) {
    try {
      const sourceText = recipeClipText(recipe)
      const existing = await findExisting('recipe', recipe.id)
      const currentImageEmbedding =
        !FORCE && existing?.imageUrl === recipe.image_url
          ? parseStoredEmbedding(existing.imageEmbedding)
          : null
      if (
        !FORCE &&
        currentImageEmbedding &&
        existing?.chunkText === sourceText &&
        existing?.textEmbedding
      ) {
        skipped += 1
        console.log(`Skip recipe ${recipe.id}; image embedding is current.`)
        continue
      }

      const [imageResponse, textResponse] = await Promise.all([
        currentImageEmbedding
          ? Promise.resolve({
              data: { embedding: currentImageEmbedding, model: CLIP_MODEL },
            })
          : axios.post(
              `${AI_SERVICE_URL}/embed-image-url`,
              { url: recipe.image_url },
              { headers: getAiServiceHeaders(), timeout: REQUEST_TIMEOUT_MS },
            ),
        axios.post(
          `${AI_SERVICE_URL}/embed-clip-text`,
          { text: sourceText },
          { headers: getAiServiceHeaders(), timeout: REQUEST_TIMEOUT_MS },
        ),
      ])

      await saveClipEmbedding({
        existingId: existing?.id,
        sourceType: 'recipe',
        sourceId: recipe.id,
        sourceTitle: recipe.title,
        sourceText,
        imageUrl: recipe.image_url,
        embedding: imageResponse.data.embedding,
        textEmbedding: textResponse.data.embedding,
        model: imageResponse.data.model,
      })

      success += 1
      console.log(`Embedded recipe ${recipe.id}: ${recipe.title}`)
      await delay(ITEM_DELAY_MS)
    } catch (error) {
      failed += 1
      console.error(
        `Failed recipe ${recipe.id}: ${error.response?.data?.detail || error.message}`,
      )
    }
  }

  return { success, skipped, failed }
}

async function precomputeRestaurants() {
  const [restaurants] = await pool.execute(
    `SELECT id, name, category, district, description
     FROM restaurants
     ORDER BY id ASC`,
  )

  console.log(`Found ${restaurants.length} restaurants.`)
  let success = 0
  let skipped = 0
  let failed = 0

  for (const restaurant of restaurants) {
    const sourceText = restaurantClipText(restaurant)

    try {
      const existing = await findExisting('restaurant', restaurant.id)
      if (!FORCE && existing?.chunkText === sourceText) {
        skipped += 1
        console.log(`Skip restaurant ${restaurant.id}; CLIP embedding is current.`)
        continue
      }

      const response = await axios.post(
        `${AI_SERVICE_URL}/embed-clip-text`,
        { text: sourceText },
        { headers: getAiServiceHeaders(), timeout: REQUEST_TIMEOUT_MS },
      )

      await saveClipEmbedding({
        existingId: existing?.id,
        sourceType: 'restaurant',
        sourceId: restaurant.id,
        sourceTitle: restaurant.name,
        sourceText,
        embedding: response.data.embedding,
        model: response.data.model,
      })

      success += 1
      console.log(`Embedded restaurant ${restaurant.id}: ${restaurant.name}`)
      await delay(ITEM_DELAY_MS)
    } catch (error) {
      failed += 1
      console.error(
        `Failed restaurant ${restaurant.id}: ${error.response?.data?.detail || error.message}`,
      )
    }
  }

  return { success, skipped, failed }
}

async function main() {
  console.log(`Starting CLIP precomputation via ${AI_SERVICE_URL}...`)
  const recipes = await precomputeRecipes()
  const restaurants = await precomputeRestaurants()
  console.log('CLIP precomputation complete.', { recipes, restaurants })

  if (recipes.failed + restaurants.failed > 0) {
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.error('CLIP precomputation failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
