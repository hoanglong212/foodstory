import jwt from 'jsonwebtoken'
import pool from '../db.js'

function getToken(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) {
    return ''
  }
  return header.slice(7)
}

export async function requireAuth(req, res, next) {
  try {
    const token = getToken(req)
    if (!token) {
      return res.status(401).json({ error: 'Authentication token is required.' })
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const [rows] = await pool.execute(
      'SELECT id, username, email, role, created_at FROM users WHERE id = ?',
      [payload.id],
    )

    if (rows.length === 0) {
      return res.status(401).json({ error: 'User account no longer exists.' })
    }

    req.user = rows[0]
    return next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session has expired.' })
    }
    return res.status(401).json({ error: 'Invalid authentication token.' })
  }
}

export async function optionalAuth(req, res, next) {
  try {
    const token = getToken(req)
    if (!token) {
      req.user = null
      return next()
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const [rows] = await pool.execute(
      'SELECT id, username, email, role, created_at FROM users WHERE id = ?',
      [payload.id],
    )
    req.user = rows[0] || null
    return next()
  } catch {
    req.user = null
    return next()
  }
}
