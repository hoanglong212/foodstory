const SSL_MODES = new Set(['disabled', 'required', 'verify-ca'])

function text(value) {
  return String(value || '').trim()
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function databaseUrlConfig(value) {
  const raw = text(value)
  if (!raw) return {}

  const url = new URL(raw)
  if (!['mysql:', 'mysql2:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use the mysql:// or mysql2:// protocol.')
  }

  return {
    host: url.hostname,
    port: positiveInteger(url.port, 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//u, '')),
  }
}

function databaseSslConfig(env) {
  const mode = text(env.DB_SSL_MODE || 'disabled').toLowerCase()
  if (!SSL_MODES.has(mode)) {
    throw new Error('DB_SSL_MODE must be disabled, required, or verify-ca.')
  }
  if (mode === 'disabled') return undefined

  const rawCertificate = text(env.DB_SSL_CA).replaceAll('\\n', '\n')
  const base64Certificate = text(env.DB_SSL_CA_BASE64)
  const certificate = base64Certificate
    ? Buffer.from(base64Certificate, 'base64').toString('utf8').trim()
    : rawCertificate

  if (mode === 'verify-ca' && !certificate) {
    throw new Error('DB_SSL_CA or DB_SSL_CA_BASE64 is required when DB_SSL_MODE=verify-ca.')
  }
  if (certificate && !certificate.includes('BEGIN CERTIFICATE')) {
    throw new Error('The configured database CA is not a PEM certificate.')
  }

  return {
    rejectUnauthorized: mode === 'verify-ca',
    ...(certificate ? { ca: certificate } : {}),
  }
}

export function buildDatabaseConfig(env = process.env) {
  const fromUrl = databaseUrlConfig(env.DATABASE_URL)
  const config = {
    host: fromUrl.host || text(env.DB_HOST) || '127.0.0.1',
    port: fromUrl.port || positiveInteger(env.DB_PORT, 3306),
    user: fromUrl.user || text(env.DB_USER) || 'root',
    password: fromUrl.password ?? String(env.DB_PASSWORD || ''),
    database: fromUrl.database || text(env.DB_NAME) || 'foodstory',
    waitForConnections: true,
    connectionLimit: positiveInteger(env.DB_CONNECTION_LIMIT, 10),
    queueLimit: 0,
    decimalNumbers: true,
  }

  const ssl = databaseSslConfig(env)
  return ssl ? { ...config, ssl } : config
}
