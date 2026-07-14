const DURATION_BUCKETS_MS = [250, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, 180000]
const counters = new Map()
const durations = new Map()

function boundedName(value, fallback = 'unknown') {
  const name = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/gu, '_')
    .slice(0, 120)
  return name || fallback
}

function labelKey(name, labels = {}) {
  const labelText = Object.entries(labels)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${boundedName(key)}=${boundedName(value)}`)
    .join(',')
  return labelText ? `${boundedName(name)}{${labelText}}` : boundedName(name)
}

export function incrementVisionAutoMetric(name, labels = {}, amount = 1) {
  const key = labelKey(name, labels)
  counters.set(key, (counters.get(key) || 0) + Math.max(0, Number(amount) || 0))
}

export function observeVisionAutoDuration(name, durationMs, labels = {}) {
  const value = Math.max(0, Number(durationMs) || 0)
  const key = labelKey(name, labels)
  const current = durations.get(key) || {
    count: 0,
    sumMs: 0,
    maxMs: 0,
    buckets: Object.fromEntries(DURATION_BUCKETS_MS.map((bucket) => [String(bucket), 0])),
    overflow: 0,
  }
  current.count += 1
  current.sumMs += value
  current.maxMs = Math.max(current.maxMs, value)
  let bucketed = false
  for (const bucket of DURATION_BUCKETS_MS) {
    if (value <= bucket) {
      current.buckets[String(bucket)] += 1
      bucketed = true
      break
    }
  }
  if (!bucketed) current.overflow += 1
  durations.set(key, current)
}

export function visionAutoMetricsSnapshot() {
  return {
    generatedAt: new Date().toISOString(),
    counters: Object.fromEntries([...counters.entries()].sort(([a], [b]) => a.localeCompare(b))),
    durations: Object.fromEntries(
      [...durations.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [
          key,
          {
            count: value.count,
            averageMs: value.count ? Math.round((value.sumMs / value.count) * 100) / 100 : 0,
            maxMs: Math.round(value.maxMs * 100) / 100,
            buckets: value.buckets,
            overflow: value.overflow,
          },
        ]),
    ),
  }
}

export function logVisionAutoEvent(event, payload = {}, logger = console) {
  const safePayload = {
    event: boundedName(event),
    timestamp: new Date().toISOString(),
    ...Object.fromEntries(
      Object.entries(payload)
        .filter(([key, value]) => !/url|token|secret|key|authorization/iu.test(key) && value !== undefined)
        .map(([key, value]) => [
          boundedName(key),
          typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').slice(0, 500) : value,
        ]),
    ),
  }
  logger.info?.(`[vision-auto] ${JSON.stringify(safePayload)}`)
}

export function resetVisionAutoMetrics() {
  counters.clear()
  durations.clear()
}

export default {
  incrementVisionAutoMetric,
  observeVisionAutoDuration,
  visionAutoMetricsSnapshot,
  logVisionAutoEvent,
  resetVisionAutoMetrics,
}
