import bcrypt from 'bcryptjs'
import pool from '../db.js'

const SEED_PASSWORD = 'FoodStory123!'
const USER_COUNT = positiveEnv('ENGAGEMENT_USERS', 260)
const TARGET_FAVORITES = positiveEnv('ENGAGEMENT_FAVORITES', 4200)
const TARGET_RATINGS = positiveEnv('ENGAGEMENT_RATINGS', 3600)
const TARGET_COMMENTS = positiveEnv('ENGAGEMENT_COMMENTS', 1800)
const SEED_PREFIX = 'seed_foodie_'

const firstNames = [
  'maya',
  'liam',
  'ava',
  'noah',
  'zoe',
  'ethan',
  'mia',
  'oliver',
  'lina',
  'nina',
  'kai',
  'sara',
  'ben',
  'hana',
  'leo',
  'ivy',
  'minh',
  'lan',
  'long',
  'tina',
]

const lastNames = [
  'nguyen',
  'tran',
  'pham',
  'le',
  'hoang',
  'park',
  'kim',
  'sato',
  'chen',
  'singh',
  'rossi',
  'garcia',
  'papas',
  'brown',
  'stone',
  'rivera',
]

const commentTemplates = [
  ({ title }) =>
    `I cooked ${title} last night and the steps were clear. The flavor was balanced and the leftovers reheated well.`,
  ({ title, category }) =>
    `This ${category} recipe made ${title} feel approachable. The ingredient list was detailed enough to shop from without guessing.`,
  ({ title }) =>
    `${title} turned out better than expected. I liked that the preparation notes explained what to do before heating the pan.`,
  ({ title }) =>
    `Saved this one for the weekend. ${title} has the kind of step-by-step instructions that make the recipe easy to follow.`,
  ({ category }) =>
    `Really solid ${category} flavor. I adjusted the salt at the end and the texture still came out right.`,
  ({ title }) =>
    `The timing cues in ${title} helped a lot. I would make it again and add a little extra garnish next time.`,
  ({ title }) =>
    `This recipe feels practical for a home kitchen. ${title} was easy to portion and looked good on the plate.`,
  ({ category }) =>
    `I appreciate the detail here. The ${category} category can be tricky, but this recipe breaks it down clearly.`,
  ({ title }) =>
    `${title} was a good weeknight option. The ingredients were easy to prep and the instructions did not feel rushed.`,
  ({ title }) =>
    `Made a small batch of ${title} and it still worked well. The storage note was useful for planning leftovers.`,
  ({ title }) =>
    `The sauce and seasoning notes made ${title} taste more complete. This is the kind of recipe I would bookmark.`,
  ({ category }) =>
    `Good balance for a ${category} dish. The recipe gives enough detail without making the cooking process too long.`,
]

function positiveEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10)
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

function createRng(seed) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let next = state
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

const rng = createRng(20260602)

function pick(items) {
  return items[Math.floor(rng() * items.length)]
}

function shuffle(items) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }
  return copy
}

function formatDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function randomTimestamp(maxAgeDays = 210) {
  const ageMs = Math.floor(rng() * maxAgeDays * 24 * 60 * 60 * 1000)
  return new Date(Date.now() - ageMs)
}

function makeSeedUsers(passwordHash) {
  return Array.from({ length: USER_COUNT }, (_, index) => {
    const first = firstNames[index % firstNames.length]
    const last = lastNames[Math.floor(index / firstNames.length) % lastNames.length]
    const suffix = String(index + 1).padStart(3, '0')
    const username = `${SEED_PREFIX}${first}_${last}_${suffix}`.slice(0, 50)

    return {
      username,
      email: `${username}@foodstory.seed`,
      passwordHash,
      role: 'user',
      createdAt: formatDate(randomTimestamp(420)),
    }
  })
}

async function fetchRecipes(connection) {
  const [recipes] = await connection.execute(
    `SELECT
       r.id,
       r.title,
       c.name AS category_name,
       COALESCE(AVG(existing_ratings.rating_value), 0) AS current_average
     FROM recipes r
     JOIN categories c ON c.id = r.category_id
     LEFT JOIN ratings existing_ratings ON existing_ratings.recipe_id = r.id
     GROUP BY r.id, c.name
     ORDER BY r.id ASC`,
  )

  return recipes.map((recipe, index) => ({
    ...recipe,
    popularityWeight: 0.7 + rng() * 1.8 + (index % 9 === 0 ? 1.4 : 0),
  }))
}

async function upsertSeedUsers(connection, users) {
  for (const batch of chunks(users, 80)) {
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?)').join(', ')
    const values = batch.flatMap((user) => [
      user.username,
      user.email,
      user.passwordHash,
      user.role,
      user.createdAt,
    ])

    await connection.execute(
      `INSERT INTO users (username, email, password_hash, role, created_at)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         username = VALUES(username),
         password_hash = VALUES(password_hash),
         role = VALUES(role)`,
      values,
    )
  }
}

async function fetchSeedUsers(connection) {
  const [rows] = await connection.execute(
    `SELECT id, username
     FROM users
     WHERE username LIKE ?
     ORDER BY id ASC`,
    [`${SEED_PREFIX}%`],
  )
  return rows
}

async function clearSeedEngagement(connection, seedUserIds) {
  for (const batch of chunks(seedUserIds, 80)) {
    const placeholders = batch.map(() => '?').join(', ')
    await connection.execute(`DELETE FROM comments WHERE user_id IN (${placeholders})`, batch)
    await connection.execute(`DELETE FROM ratings WHERE user_id IN (${placeholders})`, batch)
    await connection.execute(`DELETE FROM favorites WHERE user_id IN (${placeholders})`, batch)
  }
}

function chooseWeightedRecipe(recipes) {
  const totalWeight = recipes.reduce((sum, recipe) => sum + recipe.popularityWeight, 0)
  let target = rng() * totalWeight

  for (const recipe of recipes) {
    target -= recipe.popularityWeight
    if (target <= 0) {
      return recipe
    }
  }

  return recipes[recipes.length - 1]
}

function makePairs(targetCount, users, recipes) {
  const maxPairs = users.length * recipes.length
  const wanted = Math.min(targetCount, maxPairs)
  const pairs = new Map()
  let attempts = 0

  while (pairs.size < wanted && attempts < wanted * 40) {
    const user = pick(users)
    const recipe = chooseWeightedRecipe(recipes)
    pairs.set(`${user.id}:${recipe.id}`, { userId: user.id, recipeId: recipe.id, recipe })
    attempts += 1
  }

  if (pairs.size < wanted) {
    for (const user of shuffle(users)) {
      for (const recipe of shuffle(recipes)) {
        pairs.set(`${user.id}:${recipe.id}`, { userId: user.id, recipeId: recipe.id, recipe })
        if (pairs.size >= wanted) {
          return [...pairs.values()]
        }
      }
    }
  }

  return [...pairs.values()]
}

function ratingValue() {
  const roll = rng()
  if (roll < 0.54) return 5
  if (roll < 0.87) return 4
  if (roll < 0.97) return 3
  if (roll < 0.995) return 2
  return 1
}

function makeComments(targetCount, users, recipes) {
  return Array.from({ length: targetCount }, () => {
    const recipe = chooseWeightedRecipe(recipes)
    const user = pick(users)
    const createdAt = randomTimestamp(180)
    const updatedAt =
      rng() < 0.12
        ? new Date(createdAt.getTime() + Math.floor((1 + rng() * 8) * 24 * 60 * 60 * 1000))
        : createdAt
    const template = pick(commentTemplates)

    return {
      userId: user.id,
      recipeId: recipe.id,
      content: template({
        title: recipe.title,
        category: recipe.category_name,
      }),
      createdAt: formatDate(createdAt),
      updatedAt: formatDate(updatedAt),
    }
  })
}

async function insertFavorites(connection, pairs) {
  for (const batch of chunks(pairs, 300)) {
    const placeholders = batch.map(() => '(?, ?)').join(', ')
    await connection.execute(
      `INSERT IGNORE INTO favorites (user_id, recipe_id)
       VALUES ${placeholders}`,
      batch.flatMap((pair) => [pair.userId, pair.recipeId]),
    )
  }
}

async function insertRatings(connection, pairs) {
  for (const batch of chunks(pairs, 300)) {
    const placeholders = batch.map(() => '(?, ?, ?)').join(', ')
    await connection.execute(
      `INSERT INTO ratings (user_id, recipe_id, rating_value)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE rating_value = VALUES(rating_value)`,
      batch.flatMap((pair) => [pair.userId, pair.recipeId, ratingValue()]),
    )
  }
}

async function insertComments(connection, comments) {
  for (const batch of chunks(comments, 200)) {
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?)').join(', ')
    await connection.execute(
      `INSERT INTO comments (user_id, recipe_id, content, created_at, updated_at)
       VALUES ${placeholders}`,
      batch.flatMap((comment) => [
        comment.userId,
        comment.recipeId,
        comment.content,
        comment.createdAt,
        comment.updatedAt,
      ]),
    )
  }
}

function chunks(items, size) {
  const result = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

async function seedEngagement() {
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    const recipes = await fetchRecipes(connection)
    if (recipes.length === 0) {
      await connection.rollback()
      console.log('No recipes found. Seed recipes before running seed:engagement.')
      return
    }

    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10)
    await upsertSeedUsers(connection, makeSeedUsers(passwordHash))
    const seedUsers = await fetchSeedUsers(connection)
    const seedUserIds = seedUsers.map((user) => user.id)

    await clearSeedEngagement(connection, seedUserIds)

    const favoritePairs = makePairs(TARGET_FAVORITES, seedUsers, recipes)
    const ratingPairs = makePairs(TARGET_RATINGS, seedUsers, recipes)
    const comments = makeComments(TARGET_COMMENTS, seedUsers, recipes)

    await insertFavorites(connection, favoritePairs)
    await insertRatings(connection, ratingPairs)
    await insertComments(connection, comments)

    await connection.commit()

    console.log('Seeded realistic recipe engagement:')
    console.log(`- Seed users: ${seedUsers.length}`)
    console.log(`- Recipes used: ${recipes.length}`)
    console.log(`- Favorites: ${favoritePairs.length}`)
    console.log(`- Ratings: ${ratingPairs.length}`)
    console.log(`- Comments: ${comments.length}`)
    console.log(`- Seed user password: ${SEED_PASSWORD}`)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
    await pool.end()
  }
}

seedEngagement().catch((error) => {
  console.error('Failed to seed engagement:', error.message)
  process.exit(1)
})
