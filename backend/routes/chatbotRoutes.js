import express from 'express'
import { askFoodStoryChatbot } from '../services/foodStoryChatbotService.js'
import { optionalAuth } from '../middleware/authMiddleware.js'

const router = express.Router()
const MAX_MESSAGE_LENGTH = 800
const MAX_CONVERSATION_MEMORY_LENGTH = 4_000

router.post('/ask', optionalAuth, async (req, res) => {
  try {
    const {
      message,
      lastRecipeId = null,
      lastRecipeTitle = null,
      lastRestaurantId = null,
      conversationHistory = [],
      conversationMemory = '',
    } = req.body

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        message: 'Message is required',
      })
    }
    if (message.trim().length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        message: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
      })
    }
    if (
      typeof conversationMemory !== 'string' ||
      conversationMemory.length > MAX_CONVERSATION_MEMORY_LENGTH
    ) {
      return res.status(400).json({
        message: `Conversation memory cannot exceed ${MAX_CONVERSATION_MEMORY_LENGTH} characters`,
      })
    }

    const result = await askFoodStoryChatbot(message, {
      lastRecipeId,
      lastRecipeTitle,
      lastRestaurantId,
      conversationHistory,
      conversationMemory,
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
