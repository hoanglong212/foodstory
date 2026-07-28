import bcrypt from 'bcryptjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from '../db.js'

function configuredUsers(env = process.env) {
  const users = []
  const adminEmail = String(env.ADMIN_EMAIL || '').trim().toLowerCase()
  const adminPassword = String(env.ADMIN_PASSWORD || '')
  const adminUsername = String(env.ADMIN_USERNAME || 'admin').trim()

  if (adminEmail || adminPassword) {
    if (!adminEmail || !adminEmail.includes('@')) {
      throw new Error('ADMIN_EMAIL must be a valid email address.')
    }
    if (adminPassword.length < 12) {
      throw new Error('ADMIN_PASSWORD must contain at least 12 characters.')
    }
    users.push({ username: adminUsername, email: adminEmail, password: adminPassword, role: 'admin' })
  }

  const demoEmail = String(env.DEMO_USER_EMAIL || '').trim().toLowerCase()
  const demoPassword = String(env.DEMO_USER_PASSWORD || '')
  const demoUsername = String(env.DEMO_USER_USERNAME || 'demo').trim()

  if (demoEmail || demoPassword) {
    if (!demoEmail || !demoEmail.includes('@')) {
      throw new Error('DEMO_USER_EMAIL must be a valid email address.')
    }
    if (demoPassword.length < 12) {
      throw new Error('DEMO_USER_PASSWORD must contain at least 12 characters.')
    }
    users.push({ username: demoUsername, email: demoEmail, password: demoPassword, role: 'user' })
  }

  return users
}

export async function seedProductionUsers(env = process.env) {
  const users = configuredUsers(env)
  if (users.length === 0) {
    console.log('No production bootstrap users configured; skipping user seed.')
    return 0
  }

  for (const user of users) {
    const passwordHash = await bcrypt.hash(user.password, 12)
    await pool.execute(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         username = VALUES(username),
         password_hash = VALUES(password_hash),
         role = VALUES(role)`,
      [user.username, user.email, passwordHash, user.role],
    )
  }

  console.log(`Seeded ${users.length} production bootstrap user(s); passwords were not logged.`)
  return users.length
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  seedProductionUsers()
    .catch((error) => {
      console.error('Production user seed failed:', error.message)
      process.exitCode = 1
    })
    .finally(async () => {
      await pool.end()
    })
}
