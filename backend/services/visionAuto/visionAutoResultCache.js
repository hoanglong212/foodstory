import crypto from 'node:crypto'

const completed = new Map()
const inFlight = new Map()

function now() { return Date.now() }

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex')
}

export function canonicalVisionAutoCacheKey(input = {}, pipelineVersion = 'resolver-v3') {
  if (input?.url) {
    const parsed = new URL(input.url)
    ;['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'].forEach((key) => parsed.searchParams.delete(key))
    parsed.hash = ''
    // Hash the complete normalized URL so signed query parameters never become
    // visible cache keys in memory dumps or diagnostics.
    return `${pipelineVersion}:url:${hash(parsed.href)}`
  }
  if (input?.imageBuffer) return `${pipelineVersion}:image:${hash(input.imageBuffer)}`
  return null
}

function cacheable(result) {
  return ['matched_place', 'external_place_found', 'multi_place', 'not_found'].includes(result?.status)
}

function pruneCompleted(maxEntries) {
  const limit = Math.max(10, Number(maxEntries) || 500)
  const timestamp = now()
  for (const [key, entry] of completed) {
    if (!entry || entry.expiresAt <= timestamp) completed.delete(key)
  }
  while (completed.size > limit) {
    const oldestKey = completed.keys().next().value
    if (!oldestKey) break
    completed.delete(oldestKey)
  }
}

export async function getOrCreateVisionAutoResult({
  key,
  cacheEnabled = true,
  ttlMs = 900000,
  notFoundTtlMs = 120000,
  maxEntries = 500,
  run,
}) {
  pruneCompleted(maxEntries)
  const entry = completed.get(key)
  if (cacheEnabled && entry && entry.expiresAt > now()) {
    // Refresh insertion order for a small LRU-like cache.
    completed.delete(key)
    completed.set(key, entry)
    return { result: entry.result, cacheHit: true, sharedInFlight: false, cacheAgeMs: now() - entry.createdAt }
  }
  if (entry) completed.delete(key)
  if (inFlight.has(key)) return { result: await inFlight.get(key), cacheHit: false, sharedInFlight: true, cacheAgeMs: 0 }
  const promise = Promise.resolve().then(run).then((result) => {
    if (cacheEnabled && cacheable(result)) {
      const effectiveTtl = result.status === 'not_found' ? notFoundTtlMs : ttlMs
      completed.set(key, { result, createdAt: now(), expiresAt: now() + effectiveTtl })
      pruneCompleted(maxEntries)
    }
    return result
  }).finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return { result: await promise, cacheHit: false, sharedInFlight: false, cacheAgeMs: 0 }
}

export function clearVisionAutoResultCache() { completed.clear(); inFlight.clear() }
export function visionAutoCacheStats() { return { completed: completed.size, inFlight: inFlight.size } }
