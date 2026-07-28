import bcrypt from 'bcryptjs'
import pool from '../db.js'

const users = [
  {
    username: 'admin',
    email: 'admin@foodstory.test',
    password: 'Admin123!',
    role: 'admin',
  },
  {
    username: 'long',
    email: 'long@foodstory.test',
    password: 'User123!',
    role: 'user',
  },
]

async function seedUsers() {
  for (const user of users) {
    const passwordHash = await bcrypt.hash(user.password, 10)
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

  console.log('Seed users created:')
  users.forEach((user) => {
    console.log(`- ${user.role}: ${user.email} (password omitted from logs)`)
  })
  await pool.end()
}

seedUsers().catch(async (error) => {
  console.error('Failed to seed users:', error.message)
  await pool.end()
  process.exit(1)
})
