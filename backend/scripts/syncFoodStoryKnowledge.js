import mysql from 'mysql2/promise'
import 'dotenv/config'
import { embedText } from '../services/aiEmbeddingClient.js'
import { saveAiDocumentWithEmbedding } from '../services/aiEmbeddingRepository.js'

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'foodstory',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

const EXPECTED_EMBEDDING_DIMENSION = 384

function cleanText(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

function cleanBlock(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

function joinParts(parts) {
  return parts
    .map(cleanBlock)
    .filter(Boolean)
    .join('\n')
}

async function clearAiTables() {
  await pool.execute('DELETE FROM ai_embeddings')
  await pool.execute('DELETE FROM ai_documents')
  console.log('Cleared old AI knowledge.')
}

function buildRecipeDocument(recipe) {
  const title = cleanText(recipe.title)
  const ingredientText = recipe.ingredients.length
    ? recipe.ingredients
        .map(
          (ingredient) =>
            `- ${cleanText(ingredient.ingredient_name)}: ${
              cleanText(ingredient.quantity) || 'amount not recorded'
            }`
        )
        .join('\n')
    : '- No ingredients recorded.'
  const tagText = recipe.tags.length
    ? recipe.tags.map((tag) => cleanText(tag.name)).join(', ')
    : ''

  const content = joinParts([
    `Recipe title: ${title}.`,
    recipe.category_name ? `Category: ${recipe.category_name}.` : '',
    tagText ? `Tags: ${tagText}.` : '',
    `Servings: ${recipe.servings || 0}.`,
    `Difficulty: ${recipe.difficulty || 'Not recorded'}.`,
    `Preparation time: ${recipe.prep_time || 0} minutes.`,
    `Cooking time: ${recipe.cook_time || 0} minutes.`,
    `Community rating: ${Number(recipe.average_rating || 0).toFixed(1)} from ${
      recipe.rating_count || 0
    } ratings.`,
    `Comment count: ${recipe.comment_count || 0}.`,
    `Nutrition:\nCalories: ${recipe.calories || 0}.\nProtein: ${
      recipe.protein || 0
    }g.\nCarbs: ${recipe.carbs || 0}g.\nFat: ${recipe.fat || 0}g.`,
    `Ingredients:\n${ingredientText}`,
    recipe.description ? `Description: ${recipe.description}` : '',
    recipe.blog_intro ? `Introduction: ${recipe.blog_intro}` : '',
    recipe.why_love_it ? `Why users may like it: ${recipe.why_love_it}` : '',
    recipe.instructions ? `Instructions:\n${recipe.instructions}` : '',
    recipe.recipe_notes ? `Recipe notes: ${recipe.recipe_notes}` : '',
    recipe.storage_notes ? `Storage notes: ${recipe.storage_notes}` : '',
  ])

  return {
    sourceType: 'recipe',
    sourceId: recipe.id,
    title,
    content,
    metadata: {
      categoryId: recipe.category_id,
      categoryName: recipe.category_name,
      status: recipe.status,
      calories: recipe.calories,
      protein: recipe.protein,
      carbs: recipe.carbs,
      fat: recipe.fat,
      prepTime: recipe.prep_time,
      cookTime: recipe.cook_time,
      servings: recipe.servings,
      difficulty: recipe.difficulty,
      imageUrl: recipe.image_url,
      tags: recipe.tags.map((tag) => tag.name),
      ingredientCount: recipe.ingredients.length,
      averageRating: Number(recipe.average_rating || 0),
      ratingCount: Number(recipe.rating_count || 0),
      commentCount: Number(recipe.comment_count || 0),
    },
  }
}

function buildRestaurantDocument(restaurant) {
  const title = cleanText(restaurant.name)

  const content = joinParts([
    `Restaurant name: ${title}.`,
    restaurant.category ? `Category: ${restaurant.category}.` : '',
    restaurant.district ? `District: ${restaurant.district}.` : '',
    restaurant.address ? `Address: ${restaurant.address}.` : '',
    restaurant.description ? `Description: ${restaurant.description}` : '',
    restaurant.price_range ? `Price range: ${restaurant.price_range}.` : '',
    restaurant.avg_rating ? `Average rating: ${restaurant.avg_rating}.` : '',
    `Location coordinates: latitude ${restaurant.latitude}, longitude ${restaurant.longitude}.`,
  ])

  return {
    sourceType: 'restaurant',
    sourceId: restaurant.id,
    title,
    content,
    metadata: {
      district: restaurant.district,
      category: restaurant.category,
      address: restaurant.address,
      latitude: restaurant.latitude,
      longitude: restaurant.longitude,
      avgRating: restaurant.avg_rating,
      priceRange: restaurant.price_range,
    },
  }
}

function buildNewsDocument(newsItem) {
  const title = cleanText(newsItem.title)
  const publishedDate =
    newsItem.published_date instanceof Date
      ? newsItem.published_date.toISOString().slice(0, 10)
      : cleanText(newsItem.published_date)

  const content = joinParts([
    `FoodStory news title: ${title}.`,
    newsItem.category ? `Category: ${newsItem.category}.` : '',
    publishedDate ? `Published date: ${publishedDate}.` : '',
    newsItem.content ? `Content: ${newsItem.content}` : '',
  ])

  return {
    sourceType: 'news',
    sourceId: newsItem.id,
    title,
    content,
    metadata: {
      category: newsItem.category,
      publishedDate,
    },
  }
}

async function fetchRecipes() {
  const [recipes] = await pool.execute(`
    SELECT 
      r.*,
      c.name AS category_name,
      COALESCE(rating_stats.average_rating, 0) AS average_rating,
      COALESCE(rating_stats.rating_count, 0) AS rating_count,
      COALESCE(comment_stats.comment_count, 0) AS comment_count
    FROM recipes r
    LEFT JOIN categories c ON c.id = r.category_id
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
    WHERE r.status = 'approved'
  `)

  const [ingredients] = await pool.execute(`
    SELECT recipe_id, ingredient_name, quantity
    FROM recipe_ingredients
    ORDER BY id ASC
  `)
  const [tags] = await pool.execute(`
    SELECT rt.recipe_id, t.id, t.name
    FROM recipe_tags rt
    JOIN tags t ON t.id = rt.tag_id
    ORDER BY t.name ASC
  `)
  const ingredientsByRecipe = new Map()
  const tagsByRecipe = new Map()

  for (const ingredient of ingredients) {
    const recipeIngredients = ingredientsByRecipe.get(ingredient.recipe_id) || []
    recipeIngredients.push(ingredient)
    ingredientsByRecipe.set(ingredient.recipe_id, recipeIngredients)
  }

  for (const tag of tags) {
    const recipeTags = tagsByRecipe.get(tag.recipe_id) || []
    recipeTags.push({ id: tag.id, name: tag.name })
    tagsByRecipe.set(tag.recipe_id, recipeTags)
  }

  return recipes.map((recipe) => ({
    ...recipe,
    ingredients: ingredientsByRecipe.get(recipe.id) || [],
    tags: tagsByRecipe.get(recipe.id) || [],
  }))
}

async function fetchRestaurants() {
  const [rows] = await pool.execute(`
    SELECT *
    FROM restaurants
  `)

  return rows
}

async function fetchNews() {
  const [rows] = await pool.execute(`
    SELECT id, title, content, category, published_date
    FROM news
    ORDER BY published_date DESC, id DESC
  `)

  return rows
}

async function saveDocument(document) {
  const embeddingResult = await embedText(document.content)
  const dimension = embeddingResult.dimension || embeddingResult.embedding?.length

  if (
    dimension !== EXPECTED_EMBEDDING_DIMENSION ||
    embeddingResult.embedding?.length !== EXPECTED_EMBEDDING_DIMENSION
  ) {
    throw new Error(
      `Unexpected embedding dimension for "${document.title}": ${dimension}`
    )
  }

  const saved = await saveAiDocumentWithEmbedding({
    sourceType: document.sourceType,
    sourceId: document.sourceId,
    title: document.title,
    content: document.content,
    metadata: document.metadata,
    chunkText: document.content,
    embedding: embeddingResult.embedding,
    embeddingModel: embeddingResult.model,
  })

  return saved
}

async function syncDocuments(sourceItems, buildDocument, label, concurrency = 3) {
  let nextIndex = 0

  async function worker() {
    while (nextIndex < sourceItems.length) {
      const index = nextIndex
      nextIndex += 1
      const document = buildDocument(sourceItems[index])
      await saveDocument(document)
      console.log(`Synced ${label}: ${document.title}`)
    }
  }

  const workerCount = Math.min(concurrency, sourceItems.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return sourceItems.length
}

async function syncFoodStoryKnowledge() {
  console.log('Starting FoodStory knowledge sync...')

  await clearAiTables()

  const recipes = await fetchRecipes()
  const restaurants = await fetchRestaurants()
  const newsItems = await fetchNews()

  console.log(`Found ${recipes.length} recipes.`)
  console.log(`Found ${restaurants.length} restaurants.`)
  console.log(`Found ${newsItems.length} public news items.`)
  console.log('Skipped user-owned favorites, checklists, checklist items, and food spots.')

  const recipeCount = await syncDocuments(
    recipes,
    buildRecipeDocument,
    'recipe'
  )
  const restaurantCount = await syncDocuments(
    restaurants,
    buildRestaurantDocument,
    'restaurant'
  )
  const newsCount = await syncDocuments(
    newsItems,
    buildNewsDocument,
    'news item'
  )
  const total = recipeCount + restaurantCount + newsCount

  console.log(`FoodStory knowledge sync completed. Total documents: ${total}`)

  await pool.end()
  process.exit(0)
}

syncFoodStoryKnowledge().catch((error) => {
  console.error('Knowledge sync failed:', error)
  process.exit(1)
})
