import mysql from 'mysql2/promise'
import './config/env.js'
import { buildDatabaseConfig } from './config/database.js'

const pool = mysql.createPool(buildDatabaseConfig())

export default pool
