import express from 'express'
import pool from '../db.js'
import { optionalAuth } from '../middleware/authMiddleware.js'
import {
  analyzeMessage,
  buildRecipeQuery,
  buildRestaurantQuery,
  buildSpotQuery,
  generateResponse,
  handleSmallTalk,
} from '../utils/chatbotNLP.js'

const router = express.Router()
const MAX_MESSAGE_LENGTH = 500

function responseType(intent) {
  const types = {
    FIND_RESTAURANT: 'restaurants',
    FIND_RECIPE: 'recipes',
    FIND_SPOT: 'spots',
    combined: 'combined',
  }
  return types[intent] || 'unknown'
}

async function executeQuery(query, resultType) {
  const [rows] = await pool.execute(query.sql, query.params)
  return rows.map((row) => ({ ...row, result_type: resultType }))
}

function mergeResultGroups(groups, limit = 5) {
  const merged = []
  let rowIndex = 0

  while (merged.length < limit && groups.some((group) => rowIndex < group.length)) {
    for (const group of groups) {
      if (group[rowIndex]) {
        merged.push(group[rowIndex])
      }
      if (merged.length === limit) {
        break
      }
    }
    rowIndex += 1
  }

  return merged
}

router.post('/', optionalAuth, async (req, res, next) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''

    if (!message) {
      return res.status(400).json({ error: 'Enter a question for FoodBot.' })
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: `The question cannot exceed ${MAX_MESSAGE_LENGTH} characters.`,
      })
    }

    const smallTalk = handleSmallTalk(message)
    if (smallTalk) {
      return res.json({ ...smallTalk, results: [] })
    }

    const analysis = analyzeMessage(message)
    if (analysis.intent === 'unknown') {
      return res.json({
        type: 'unknown',
        message:
          'I did not understand that question. Try asking "best pho in District 1" or "banh mi recipe".',
        results: [],
        suggestions: ['Best pho in District 1', 'Affordable restaurants in Binh Thanh', 'Banh mi recipe'],
      })
    }

    const wantsOnlyPersonalSpots =
      analysis.intents.length === 1 && analysis.intents[0] === 'FIND_SPOT'
    if (wantsOnlyPersonalSpots && !req.user) {
      return res.json({
        type: 'spots',
        message: 'You need to log in to view saved places.',
        results: [],
        suggestions: ['Log in', 'Find restaurants'],
      })
    }

    const queries = []
    if (analysis.intents.includes('FIND_RESTAURANT')) {
      queries.push(
        executeQuery(buildRestaurantQuery(analysis.entities), 'restaurant'),
      )
    }
    if (analysis.intents.includes('FIND_RECIPE')) {
      queries.push(executeQuery(buildRecipeQuery(analysis.entities), 'recipe'))
    }
    if (analysis.intents.includes('FIND_SPOT') && req.user) {
      queries.push(
        executeQuery(buildSpotQuery(analysis.entities, req.user.id), 'spot'),
      )
    }

    const groups = await Promise.all(queries)
    const results = mergeResultGroups(groups)
    const generated = generateResponse(
      analysis.intent,
      analysis.entities,
      results,
      {
        requiresLogin: analysis.intents.includes('FIND_SPOT') && !req.user,
      },
    )

    return res.json({
      type: responseType(analysis.intent),
      message: generated.message,
      results,
      suggestions: generated.suggestions,
    })
  } catch (error) {
    return next(error)
  }
})

export default router
