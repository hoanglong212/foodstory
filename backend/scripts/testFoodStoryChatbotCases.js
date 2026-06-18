import { askFoodStoryChatbot } from '../services/foodStoryChatbotService.js'
import pool from '../db.js'

function preview(value, length = 90) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > length ? `${text.slice(0, length)}...` : text
}

async function main() {
  const [users] = await pool.execute(
    `SELECT id
     FROM users
     WHERE is_banned = 0
     ORDER BY
       (SELECT COUNT(*) FROM favorites f WHERE f.user_id = users.id) DESC,
       (SELECT COUNT(*) FROM checklists c WHERE c.user_id = users.id) DESC,
       id ASC
     LIMIT 1`
  )
  const authenticatedUserId = users[0]?.id || null
  const testCases = [
    {
      query: 'How much neutral oil do I need for Soy Garlic Chicken for 8 servings?',
    },
    {
      query: 'Does Soy Garlic Chicken use garlic?',
    },
    {
      query: 'How many calories for Soy Garlic Chicken for 8 servings?',
    },
    {
      query: 'How long does Soy Garlic Chicken take?',
    },
    {
      query: 'Where can I eat banh mi in District 1?',
    },
    {
      query: 'Where can I eat Japanese food in District 1?',
    },
    {
      query: 'Show my favorite recipes',
    },
    {
      query: 'Show my favorite recipes',
      context: { userId: authenticatedUserId },
    },
    {
      query: 'How do I save a favorite recipe?',
    },
    {
      query: 'Recommend a healthy low calorie chicken recipe',
    },
  ]
  const rows = []

  for (const testCase of testCases) {
    try {
      const response = await askFoodStoryChatbot(
        testCase.query,
        testCase.context || {}
      )
      rows.push({
        query: testCase.query,
        intent: response.intent,
        mode: response.mode,
        status: response.retrievalStatus,
        groqCalled: response.groqCalled,
        topSource: response.sources?.[0]?.title || '-',
        answerPreview: preview(response.answer),
      })
    } catch (error) {
      rows.push({
        query: testCase.query,
        intent: 'error',
        mode: 'error',
        status: 'error',
        groqCalled: '-',
        topSource: '-',
        answerPreview: preview(error.message),
      })
    }
  }

  console.table(rows)
  await pool.end()
  process.exit(0)
}

main().catch((error) => {
  console.error('FoodStory chatbot cases failed:', error)
  process.exit(1)
})
