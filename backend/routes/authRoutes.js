import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pool from '../db.js'
import { requireAuth } from '../middleware/authMiddleware.js'

const router = express.Router()
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function safeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    created_at: user.created_at,
  }
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '2h' },
  )
}

router.post('/register', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim()
    const email = String(req.body.email || '').trim().toLowerCase()
    const password = String(req.body.password || '')

    if (!username) {
      return res.status(400).json({ error: 'Username is required.' })
    }
    if (!emailPattern.test(email)) {
      return res.status(400).json({ error: 'A valid email is required.' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' })
    }

    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email],
    )
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username or email is already registered.' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const [result] = await pool.execute(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES (?, ?, ?, 'user')`,
      [username, email, passwordHash],
    )

    const [rows] = await pool.execute(
      'SELECT id, username, email, role, created_at FROM users WHERE id = ?',
      [result.insertId],
    )
    return res.status(201).json({ user: safeUser(rows[0]) })
  } catch (error) {
    return next(error)
  }
})

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    const password = String(req.body.password || '')

    if (!emailPattern.test(email)) {
      return res.status(400).json({ error: 'A valid email is required.' })
    }
    if (!password) {
      return res.status(400).json({ error: 'Password is required.' })
    }

    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email])
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const user = rows[0]
    const isValid = await bcrypt.compare(password, user.password_hash)
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    return res.json({
      token: createToken(user),
      user: safeUser(user),
    })
  } catch (error) {
    return next(error)
  }
})

router.post('/logout', requireAuth, (req, res) => {
  res.json({ message: 'Logged out successfully.' })
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: safeUser(req.user) })
})

export default router
