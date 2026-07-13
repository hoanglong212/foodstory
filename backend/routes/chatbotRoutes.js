import express from 'express'
import { askFoodStoryChatbot } from '../services/foodStoryChatbotService.js'
import { optionalAuth } from '../middleware/authMiddleware.js'

const router = express.Router()

router.post('/ask', optionalAuth, async (req, res) => {
  try {
    const {
      message,
      lastRecipeId = null,
      lastRecipeTitle = null,
      lastRestaurantId = null,
      conversationHistory = [],
    } = req.body

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        message: 'Message is required',
      })
    }

    const result = await askFoodStoryChatbot(message, {
      lastRecipeId,
      lastRecipeTitle,
      lastRestaurantId,
      conversationHistory,
      userId: req.user?.id || null,
    })

    return res.json(result)
  } catch (error) {
    console.error('Chatbot error:', error)

    return res.status(500).json({
      message: 'Chatbot failed',
      error: error.message,
    })
  }
})

export default router
