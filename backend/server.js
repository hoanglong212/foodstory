import './config/env.js'
import http from 'node:http'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/authRoutes.js'
import newsRoutes from './routes/newsRoutes.js'
import recipeRoutes from './routes/recipeRoutes.js'
import commentRoutes from './routes/commentRoutes.js'
import favoriteRoutes from './routes/favoriteRoutes.js'
import ratingRoutes from './routes/ratingRoutes.js'
import checklistRoutes from './routes/checklistRoutes.js'
import foodSpotsRoutes from './routes/foodSpots.js'
import restaurantsRoutes from './routes/restaurants.js'
import chatbotRoutes from './routes/chatbot.js'
import foodStoryChatbotRoutes from './routes/chatbotRoutes.js'
import adminRoutes from './routes/admin.js'
import pool from './db.js'
import aiRoutes from './routes/aiRoutes.js'
import visionRoutes from './routes/vision.js'
import foodMapDiscoveryRoutes from './routes/foodMapDiscoveryRoutes.js'
import foodMapSocialDiscoveryRoutes from './routes/foodMapSocialDiscoveryRoutes.js'
import visionAutoRoutes from './routes/visionAutoRoutes.js'
import { visionAutoRouteEnabled } from './services/visionAuto/visionAutoConfig.js'

import { initWebSocketServer } from './websocket/wsServer.js'

const app = express()
const server = http.createServer(app)
const port = Number(process.env.PORT || 3000)
const localFrontendOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
]
const frontendOrigins = [
  ...(process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
    .filter(Boolean),
  ...localFrontendOrigins,
].filter((origin, index, origins) => origin && origins.indexOf(origin) === index)

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required. Set it in backend/.env or the process environment.')
}
if (process.env.JWT_SECRET === 'replace_with_a_long_random_secret') {
  console.warn('JWT_SECRET should be set to a unique long random value before deployment.')
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || frontendOrigins.includes(origin)) {
        return callback(null, true)
      }

      return callback(null, false)
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    return res.json({
      status: 'ok',
      service: 'FoodStory API',
      database: 'connected',
    })
  } catch (error) {
    console.error(`Database health check failed: ${error.message}`)
    return res.status(503).json({
      status: 'degraded',
      service: 'FoodStory API',
      database: 'unavailable',
    })
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/news', newsRoutes)
app.use('/api/recipes', recipeRoutes)
app.use('/api', ratingRoutes)
app.use('/api', commentRoutes)
app.use('/api/favorites', favoriteRoutes)
app.use('/api', checklistRoutes)
app.use('/api/food-spots', foodSpotsRoutes)
app.use('/api/restaurants', restaurantsRoutes)
app.use('/api/chatbot', chatbotRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/vision', visionRoutes)
app.use('/api/food-map', foodMapDiscoveryRoutes)
app.use('/api/food-map', foodMapSocialDiscoveryRoutes)
if (visionAutoRouteEnabled()) {
  app.use('/api/food-map', visionAutoRoutes)
}
app.use('/api/chatbot', foodStoryChatbotRoutes)

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' })
})

app.use((error, req, res, next) => {
  console.error(error)

  if (
    error.code === 'ECONNREFUSED' ||
    error.code === 'PROTOCOL_CONNECTION_LOST' ||
    error.code === 'ER_CON_COUNT_ERROR'
  ) {
    return res.status(503).json({
      error: 'Database is unavailable. Check that MySQL is running and backend/.env is correct.',
    })
  }

  if (
    error.code === 'ER_BAD_DB_ERROR' ||
    error.code === 'ER_NO_SUCH_TABLE' ||
    error.code === 'ER_BAD_FIELD_ERROR'
  ) {
    return res.status(503).json({
      error: 'Database schema is incomplete. Run backend/database/schema.sql for a new database or npm run migrate for an existing database.',
    })
  }

  res.status(500).json({ error: 'Unexpected server error.' })
})

initWebSocketServer(server)

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the other server or set a different PORT.`)
    process.exitCode = 1
    return
  }

  console.error('HTTP server error:', error)
})

server.listen(port, () => {
  console.log(`FoodStory API running on http://localhost:${port}`)
})
