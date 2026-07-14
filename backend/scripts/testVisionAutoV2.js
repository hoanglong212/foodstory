import assert from 'node:assert/strict'
import { analyzeVisionAutoV2 } from '../services/visionAuto/visionAutoResolverService.js'
import { buildVisionAutoResponse } from '../services/visionAuto/visionResponseBuilder.js'

const url = 'https://www.youtube.com/shorts/dQw4w9WgXcQ'
const externalPlace = { sourceType: 'external', provider: 'geoapify', providerPlaceId: 'fixture-place', id: 'geoapify:fixture-place', name: 'Resolver Fixture Place', formattedAddress: '10 Fixture Street, District 1, Vietnam', lat: 10.77, lng: 106.69, categories: ['catering.restaurant'], existsInFoodStory: false }

async function run(candidate = externalPlace) {
  return analyzeVisionAutoV2({ url }, {
    config: { enabled: true, cacheEnabled: false, requestDeadlineMs: 5000, pipelineVersion: 'test' },
    collectEvidence: async () => ({ warnings: [] }), normalizeEvidence: () => ({}),
    extractEntities: () => ({ address: { value: '10 Fixture Street, District 1', confidence: .8 }, placeName: { value: 'Resolver Fixture Place', confidence: .8 }, warnings: [] }),
    validateEntities: async ({ candidateEntities }) => ({ entities: candidateEntities, validation: { canResolveLocation: true } }),
    resolvePlaces: async () => ({ resolution: { status: candidate ? 'resolved_places' : 'not_found' }, placeCandidates: candidate ? [candidate] : [], warnings: [] }),
  })
}

const external = await run()
assert.equal(external.status, 'external_place_found')
assert.equal(external.place.provider, 'geoapify')
assert.equal('entities' in external, false)
const noPlace = await run(null)
assert.equal(noPlace.status, 'not_found')
const raw = buildVisionAutoResponse({ status: 'not_found', input: { url }, reason: 'insufficient_evidence' })
assert.equal(JSON.stringify(raw).includes('raw OCR'), false)
console.log('Vision Auto safe-contract tests passed')
