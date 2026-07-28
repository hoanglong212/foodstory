import express from 'express'
import { getDailyInspiration } from '../services/dailyInspirationService.js'

const router = express.Router()

router.get('/daily-inspiration', async (req, res, next) => {
  try {
    const inspiration = await getDailyInspiration()
    return res.json(inspiration)
  } catch (error) {
    return next(error)
  }
})

export default router
