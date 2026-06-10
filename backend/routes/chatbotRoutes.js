import express from 'express'
import { askFoodStoryChatbot } from '../services/foodStoryChatbotService.js'

const router = express.Router()

router.post('/ask', async (req, res) => {
  try {
    const { message } = req.body

    if (!message || !message.trim()) {
      return res.status(400).json({
        message: 'Message is required',
      })
    }

    const result = await askFoodStoryChatbot(message)

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