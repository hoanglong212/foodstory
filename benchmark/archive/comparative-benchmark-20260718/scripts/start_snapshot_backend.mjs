import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const [serverPath, port] = process.argv.slice(2)
if (!serverPath || !port) throw new Error('Usage: node start_snapshot_backend.mjs <server.js> <port>')

const envText = fs.readFileSync('C:\\COS30043\\foodstory\\backend\\.env', 'utf8')
for (const rawLine of envText.split(/\r?\n/u)) {
  const line = rawLine.trim()
  if (!line || line.startsWith('#')) continue
  const separator = line.indexOf('=')
  if (separator < 1) continue
  const key = line.slice(0, separator).trim()
  let value = line.slice(separator + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
  if (!(key in process.env)) process.env[key] = value
}

process.env.PORT = String(port)
await import(pathToFileURL(serverPath).href)
