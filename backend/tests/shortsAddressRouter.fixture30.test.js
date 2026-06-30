import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { routeShortsAddress } from '../src/services/shortsAddressRouterService.js'

const fixture = JSON.parse(
  readFileSync(
    new URL('./fixtures/youtube-shorts-address-30.json', import.meta.url),
    'utf8',
  ),
)

function countByTrack(cases) {
  return cases.reduce((counts, item) => {
    counts[item.expectedTrack] = (counts[item.expectedTrack] || 0) + 1
    return counts
  }, {})
}

function routeInputForCase(item) {
  return {
    ...item,
    description: item.descriptionRawFromYoutube || item.description,
  }
}

function routeFixtureCases() {
  return fixture.cases.map((item) => ({
    item,
    result: routeShortsAddress(routeInputForCase(item)),
  }))
}

function fixtureResultSummary(rows) {
  return [
    'id | expectedTrack | actualTrack | reason | evidenceSource | notes',
    ...rows.map(({ item, result }) => [
      item.id,
      item.expectedTrack,
      result.track,
      result.reason,
      result.evidenceSource ?? 'null',
      item.notes,
    ].join(' | ')),
  ].join('\n')
}

const TRACK_1_REASONS = new Set([
  'EXPLICIT_LABEL',
  'JSONLD_ADDRESS',
  'CLEAR_DESCRIPTION',
])
const TRACK_1_SOURCES = new Set([
  'title',
  'description',
  'page_metadata',
  'jsonld',
])
const TRACK_1_FORBIDDEN_SOURCES = new Set([
  'ocr',
  'asr',
  'serp_snippet',
  'places',
  null,
])

describe('shortsAddressRouter fixture30 seed set', () => {
  it('shortsAddressRouter fixture30 has the frozen 30-case distribution', () => {
    assert.equal(fixture.version, 'shorts-address-router-seed-v1')
    assert.equal(fixture.source, 'report_pdf_seed_set_plus_phase_3_1_unique_replacements')
    assert.equal(fixture.cases.length, 30)

    const uniqueUrls = new Set(fixture.cases.map((item) => item.url))
    assert.equal(uniqueUrls.size, 30)
    assert.equal(fixture.cases.length - uniqueUrls.size, 0)

    const counts = countByTrack(fixture.cases)
    assert.equal(counts.TRACK_1, 10)
    assert.equal(counts.TRACK_2, 20)
  })

  it('shortsAddressRouter fixture30 routes every frozen case without network calls', () => {
    const originalFetch = globalThis.fetch
    let fetchCallCount = 0
    globalThis.fetch = () => {
      fetchCallCount += 1
      throw new Error('fixture30 must not make network calls')
    }

    try {
      for (const item of fixture.cases) {
        const result = routeShortsAddress(routeInputForCase(item))

        assert.equal(result.track, item.expectedTrack, item.id)
        if (Object.hasOwn(item, 'expectedReason')) {
          assert.equal(result.reason, item.expectedReason, item.id)
        }
        if (Object.hasOwn(item, 'expectedEvidenceSource')) {
          assert.equal(result.evidenceSource, item.expectedEvidenceSource, item.id)
        }
        if (Object.hasOwn(item, 'expectedCandidateAddress')) {
          assert.equal(result.candidateAddress, item.expectedCandidateAddress, item.id)
        }
        if (Object.hasOwn(item, 'expectedNormalizedAddress')) {
          assert.equal(result.normalizedAddress, item.expectedNormalizedAddress, item.id)
        }
      }
      assert.equal(fetchCallCount, 0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('shortsAddressRouter fixture30 audits expected TRACK_1 cases with bounded candidates', () => {
    const rows = routeFixtureCases()
    const track1Rows = rows.filter(({ item }) => item.expectedTrack === 'TRACK_1')

    assert.equal(track1Rows.length, 10)
    for (const { item, result } of track1Rows) {
      const summary = fixtureResultSummary([{ item, result }])

      assert.equal(result.track, 'TRACK_1', summary)
      assert.ok(TRACK_1_REASONS.has(result.reason), summary)
      assert.ok(TRACK_1_SOURCES.has(result.evidenceSource), summary)
      assert.notEqual(result.candidateAddress, null, summary)
      assert.notEqual(result.normalizedAddress, null, summary)
      if (Object.hasOwn(item, 'expectedCandidateAddress')) {
        assert.equal(result.candidateAddress, item.expectedCandidateAddress, summary)
      }
      if (Object.hasOwn(item, 'expectedNormalizedAddress')) {
        assert.equal(result.normalizedAddress, item.expectedNormalizedAddress, summary)
      }
    }
  })

  it('shortsAddressRouter fixture30 admits TRACK_1 only through eligible gates', () => {
    const rows = routeFixtureCases()
    const track1Rows = rows.filter(({ item }) => item.expectedTrack === 'TRACK_1')

    assert.equal(track1Rows.length, 10)
    for (const { item, result } of track1Rows) {
      const summary = fixtureResultSummary([{ item, result }])

      assert.equal(result.track, 'TRACK_1', summary)
      assert.ok(TRACK_1_REASONS.has(result.reason), summary)
      assert.notEqual(result.candidateAddress, null, summary)
      assert.notEqual(result.normalizedAddress, null, summary)
      assert.ok(TRACK_1_SOURCES.has(result.evidenceSource), summary)
      assert.equal(TRACK_1_FORBIDDEN_SOURCES.has(result.evidenceSource), false, summary)
    }
  })

  it('shortsAddressRouter fixture30 never promotes frozen TRACK_2 cases to TRACK_1', () => {
    const rows = routeFixtureCases()
    const promotedRows = rows.filter(
      ({ item, result }) => item.expectedTrack === 'TRACK_2' && result.track === 'TRACK_1',
    )

    assert.equal(promotedRows.length, 0, fixtureResultSummary(promotedRows))
    assert.equal(rows.filter(({ item }) => item.expectedTrack === 'TRACK_2').length, 20)
  })
})
