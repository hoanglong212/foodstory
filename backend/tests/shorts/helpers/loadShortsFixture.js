import { readFileSync } from 'node:fs'

const FIXTURE_DIR = new URL('../../fixtures/', import.meta.url)

export function loadShortsFixture(fileName) {
  const fixtureUrl = new URL(fileName, FIXTURE_DIR)
  try {
    return JSON.parse(readFileSync(fixtureUrl, 'utf8'))
  } catch (error) {
    throw new Error(`Failed to load Shorts fixture ${fileName}: ${error.message}`)
  }
}

export function fixtureCases(fixture) {
  if (Array.isArray(fixture)) return fixture
  if (Array.isArray(fixture?.cases)) return fixture.cases
  throw new Error('Shorts fixture must be an array or expose a cases array')
}

export function enabledCases(fixture) {
  return fixtureCases(fixture).filter((item) => item.enabled !== false)
}

export function expectedTrackCases(fixture, track) {
  return fixtureCases(fixture).filter((item) => item.expectedTrack === track)
}

export function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item?.[key] ?? 'UNKNOWN'
    counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
}

export function findFixtureCase(fixture, id) {
  return fixtureCases(fixture).find((item) => item.id === id) || null
}

export function routeInputForAddressCase(item) {
  return {
    ...item,
    sourceUrl: item.url,
    description: item.descriptionRawFromYoutube || item.description || '',
  }
}

export function videoIdFromShortsUrl(url) {
  const match = String(url || '').match(/\/shorts\/([^/?#]+)/u)
  return match?.[1] || ''
}
