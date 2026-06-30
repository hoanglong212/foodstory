import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  candidateCount,
  evidenceCount,
  missingCandidateTypes,
  missingRiskFlags,
  missingTextIncludes,
} from './helpers/resultTextSearch.js'
import {
  fixtureCases,
  loadShortsFixture,
} from './helpers/loadShortsFixture.js'

const fixture = loadShortsFixture('youtube-shorts-track2-v3-golden.json')
const serviceUrl = new URL(
  '../../src/services/shorts/track2-v3/shortsTrack2V3PipelineService.js',
  import.meta.url,
)
const v3Enabled = process.env.TRACK2_V3_ENABLED === 'true'
const serviceExists = existsSync(serviceUrl)
const skipReason = !v3Enabled
  ? 'TRACK2_V3_ENABLED is not true'
  : !serviceExists
  ? 'shortsTrack2V3PipelineService.js is not implemented'
  : null

async function loadRunner() {
  const mod = await import(serviceUrl)
  const runner = mod.runShortsTrack2V3Pipeline ||
    mod.runShortsTrack2V3 ||
    mod.resolveShortsTrack2V3
  assert.equal(typeof runner, 'function', 'Track 2 V3 service must export a runnable V3 function')
  return runner
}

describe('L3 Shorts Track 2 V3 golden tests', () => {
  it('is skipped until Track 2 V3 is explicitly available', { skip: skipReason || false }, () => {
    assert.equal(skipReason, null)
  })

  it('validates V3 golden candidate output when enabled', { skip: skipReason || false }, async () => {
    const runner = await loadRunner()

    for (const item of fixtureCases(fixture)) {
      const expected = item.expected || {}
      const result = await runner(item.url, { fixtureCase: item })
      const label = `${item.id} ${item.category}`

      assert.ok(
        candidateCount(result) >= expected.minCandidateCount,
        `${label}: candidateCount below ${expected.minCandidateCount}`,
      )
      assert.ok(
        expected.allowedResolutions.includes(result?.resolution),
        `${label}: unexpected resolution ${result?.resolution}`,
      )
      if (expected.mustNotResolve) {
        assert.notEqual(result?.resolution, 'RESOLVED', `${label}: must not auto-resolve`)
      }

      assert.deepEqual(missingCandidateTypes(result, expected.requiredCandidateTypes), [], label)
      assert.deepEqual(missingTextIncludes(result, expected.requiredTextIncludes), [], label)
      assert.deepEqual(missingRiskFlags(result, expected.requiredRiskFlags), [], label)
      assert.ok(evidenceCount(result) > 0, `${label}: expected evidence`)
    }
  })
})
