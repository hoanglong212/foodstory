import './config/env.js'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/authRoutes.js'
import newsRoutes from './routes/newsRoutes.js'
import recipeRoutes from './routes/recipeRoutes.js'
import commentRoutes from './routes/commentRoutes.js'
import favoriteRoutes from './routes/favoriteRoutes.js'
import ratingRoutes from './routes/ratingRoutes.js'
import checklistRoutes from './routes/checklistRoutes.js'

const app = express()
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'FoodStory API' })
})

app.use('/api/auth', authRoutes)
app.use('/api/news', newsRoutes)
app.use('/api/recipes', recipeRoutes)
app.use('/api', ratingRoutes)
app.use('/api', commentRoutes)
app.use('/api/favorites', favoriteRoutes)
app.use('/api', checklistRoutes)

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' })
})

app.use((error, req, res, next) => {
  console.error(error)
  res.status(500).json({ error: 'Unexpected server error.' })
})

app.listen(port, () => {
  console.log(`FoodStory API running on http://localhost:${port}`)
})
