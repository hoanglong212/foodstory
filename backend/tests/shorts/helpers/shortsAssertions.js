import assert from 'node:assert/strict'
import { candidateCount, evidenceCount } from './resultTextSearch.js'

export function summarizeRoutingRows(rows) {
  return [
    'id | category | expectedTrack | actualTrack | resolution | reason | evidenceSource',
    ...rows.map(({ item, result }) => [
      item.id,
      item.category || '',
      item.expectedTrack || '',
      result?.track || '',
      result?.resolution || '',
      result?.reason || '',
      result?.evidenceSource || '',
    ].join(' | ')),
  ].join('\n')
}

export function runWithFetchBlocked(fn) {
  const originalFetch = globalThis.fetch
  let fetchCallCount = 0
  globalThis.fetch = () => {
    fetchCallCount += 1
    throw new Error('Shorts fixture harness must not make network calls')
  }

  try {
    const result = fn()
    assert.equal(fetchCallCount, 0, 'Shorts fixture harness made an unexpected fetch call')
    return result
  } finally {
    globalThis.fetch = originalFetch
  }
}

export function assertNotResolved(result, message) {
  assert.notEqual(result?.resolution, 'RESOLVED', message)
  assert.equal(
    Boolean(result?.resolution === 'RESOLVED' && (result?.placeId || result?.address)),
    false,
    message,
  )
}

export function assertAllowedResolution(result, allowedResolutions, message) {
  if (!Array.isArray(allowedResolutions) || allowedResolutions.length === 0) return
  assert.ok(
    allowedResolutions.includes(result?.resolution),
    `${message}\nExpected one of ${allowedResolutions.join(', ')}, got ${result?.resolution}`,
  )
}

export function outputMetrics(result) {
  return {
    resolution: result?.resolution || null,
    candidateCount: candidateCount(result),
    evidenceCount: evidenceCount(result),
  }
}
