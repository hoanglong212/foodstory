import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EventEmitter } from 'node:events'
import { buildVisionLocationHypotheses } from '../services/visionAuto/visionLocationHypothesisService.js'
import { decideVisionAutoResult } from '../services/visionAuto/visionFinalDecisionService.js'
import { buildVisionAutoResponse } from '../services/visionAuto/visionResponseBuilder.js'
import { scoreGeoapifyPlace } from '../services/visionAuto/providers/geoapifyPlaceProvider.js'
import { getOrCreateVisionAutoResult, clearVisionAutoResultCache } from '../services/visionAuto/visionAutoResultCache.js'
import { adaptVisionAutoResponse, createVisionAutoRunGuard } from './helpers/visionAutoContractTestAdapters.js'
import { buildVisionAutoTrack2V3ProductConfig, mapShortsTrack2V3ToVisionAutoResponse } from '../services/visionAuto/visionAutoTrack2V3AdapterService.js'
import { startVisionAutoWorker } from '../services/visionAuto/visionAutoWorkerManager.js'

const local = { sourceType: 'foodstory', sourceId: '42', id: 'foodstory:restaurant:42', name: 'Local Place', formattedAddress: '10 Example Street, District 1, Vietnam', lat: 10.77, lng: 106.69, existsInFoodStory: true }
const external = { sourceType: 'external', provider: 'geoapify', providerPlaceId: 'geo-1', id: 'geoapify:geo-1', name: 'External Cafe', formattedAddress: '20 Example Street, District 1, Vietnam', lat: 10.78, lng: 106.68, categories: ['catering.cafe'], existsInFoodStory: false }

describe('Vision Auto safe resolver boundary', () => {
  it('collapses same-place OCR mutations into one hypothesis', () => {
    assert.equal(buildVisionLocationHypotheses([{ address: '153 Nam Ky Khoi Nghia, Phuong 6, Quan 3', timestampSeconds: 33 }, { address: '158 Nam Ky Khoi Nghia, Phuong 6, Quan 3', timestampSeconds: 34 }, { address: '155 Nam Ky Khoi Nghia, Phuong 6, Quan 3', timestampSeconds: 34 }]).length, 1)
  })
  it('keeps distinct listicle segments separate', () => {
    assert.equal(buildVisionLocationHypotheses([{ address: '10 Huynh Thuc Khang, Quan 1', segmentId: 'a' }, { address: '35 Dang Dung, Quan 1', segmentId: 'b' }], { sourceMayContainMultiplePlaces: true }).length, 2)
  })
  it('never makes an OCR shape a public place', () => {
    const response = buildVisionAutoResponse({ status: 'not_found', input: { url: 'https://example.test' }, reason: 'insufficient_evidence' })
    assert.equal(response.status, 'not_found'); assert.equal('place' in response, false); assert.equal(JSON.stringify(response).includes('OCR'), false)
  })
  it('returns a local record as matched_place', () => assert.equal(decideVisionAutoResult({ placeCandidates: [local] }).status, 'matched_place'))
  it('returns an external resolver record as external_place_found', () => assert.equal(decideVisionAutoResult({ placeCandidates: [external] }).status, 'external_place_found'))
  it('keeps a one-place listicle review-only by retaining multi-source context', () => {
    const decision = decideVisionAutoResult({ placeCandidates: [external], sourceContext: { isMultiPlace: true } }); assert.equal(decision.status, 'external_place_found'); assert.equal(decision.sourceContext.isMultiPlace, true)
  })
  it('returns multi_place only for resolver records', () => assert.equal(decideVisionAutoResult({ placeCandidates: [local, external], sourceContext: { isMultiPlace: true } }).status, 'multi_place'))
  it('rejects city/street-only provider records', () => assert.equal(scoreGeoapifyPlace({ address: 'District 1' }, { ...external, formattedAddress: 'District 1, Ho Chi Minh City, Vietnam', categories: [] }).accepted, false))
  it('requires finite coordinates for external public places', () => assert.equal(buildVisionAutoResponse({ status: 'external_place_found', place: { ...external, lat: null } }).status, 'error'))
  it('frontend adapter rejects legacy raw candidates', () => assert.equal(adaptVisionAutoResponse({ status: 'possible_place', possiblePlaces: [{ address: 'raw OCR' }] }).state, 'error'))
  it('publishes bounded review-only candidates without raw evidence', () => {
    const response = buildVisionAutoResponse({
      status: 'review_candidates',
      input: { url: 'https://www.youtube.com/shorts/example' },
      reviewCandidates: [{ id: 'candidate-1', placeName: 'Example shop', address: '10 Example Street, District 1', confidence: 0.72, rawText: 'must not leak', canAutoResolve: true }],
    })
    assert.equal(response.status, 'review_candidates')
    assert.equal(response.reviewCandidates[0].reviewRequired, true)
    assert.equal(response.reviewCandidates[0].canAutoResolve, false)
    assert.equal('rawText' in response.reviewCandidates[0], false)
    const adapted = adaptVisionAutoResponse(response)
    assert.equal(adapted.state, 'review')
    assert.equal(adapted.reviewCandidates[0].address, '10 Example Street, District 1')
    assert.equal(adapted.mapTargets.length, 0)
  })
  it('keeps a gated Track 2 address visible when no place resolver match exists', () => {
    const address = '10 Example Street, Ward 1, District 1'
    const response = mapShortsTrack2V3ToVisionAutoResponse({
      input: { type: 'youtube_url', url: 'https://www.youtube.com/shorts/example' },
      track2Result: {
        intent: 'SINGLE_PLACE_LIKELY', inputClass: 'SINGLE_PLACE', mustNotResolve: false,
        candidates: [{ id: 'candidate-1', type: 'FULL_ADDRESS_VERBATIM', addressFragment: address, displayText: address, evidenceIds: ['evidence-1'], riskFlags: ['REVIEW_ONLY'], canAutoResolve: false }],
        evidence: [{ id: 'evidence-1', rawText: address, normalizedText: address, sourceType: 'smart_overlay_dynamic_text_region', timestampSeconds: 12, confidence: 0.8 }],
      },
      placeOutcome: { decision: { status: 'not_found', reason: 'no_resolver_match' }, sourceContext: { isMultiPlace: false, resolvedCount: 0 }, resolutionStatus: 'not_found', warnings: [] },
    })
    assert.equal(response.status, 'review_candidates')
    assert.equal(response.reviewCandidates.length, 1)
    assert.equal(response.reviewCandidates[0].address, address)
    assert.equal(response.reviewCandidates[0].canAutoResolve, false)
  })
  it('keeps enabled Track 2 rescue stages in the bounded product profile', () => {
    const config = buildVisionAutoTrack2V3ProductConfig({
      maxSmartOverlayFrames: 120,
      maxSmartOverlaySelectedImages: 60,
      maxOcrImages: 40,
      ocrBoostEnabled: true,
      track2V3OcrBoostEnabled: true,
      adaptiveFrameSamplingEnabled: true,
      asrFallbackEnabled: true,
      windowedAsrEnabled: true,
    }, 150_000)
    assert.equal(config.maxSmartOverlayFrames, 60)
    assert.equal(config.maxSmartOverlaySelectedImages, 24)
    assert.equal(config.maxOcrImages, 28)
    assert.equal(config.ocrBoostEnabled, true)
    assert.equal(config.adaptiveFrameSamplingEnabled, true)
    assert.equal(config.asrFallbackEnabled, true)
    assert.equal(config.windowedAsrEnabled, true)
  })
  it('honors Vision Auto parent provider gates in the Track 2 product profile', () => {
    const config = buildVisionAutoTrack2V3ProductConfig({
      asrFallbackEnabled: true,
      track2V3GeminiVisionEnabled: true,
      track2V3GeminiCropJudgeEnabled: true,
    }, 150_000, {
      asrEffectiveEnabled: false,
      geminiEffectiveEnabled: false,
    })
    assert.equal(config.asrFallbackEnabled, false)
    assert.equal(config.track2V3GeminiVisionEnabled, false)
    assert.equal(config.track2V3GeminiCropJudgeEnabled, false)
  })
  it('passes the parent environment to the worker and drains silent streams', () => {
    let forkOptions
    let stdoutDrained = false
    let stderrDrained = false
    const child = new EventEmitter()
    child.pid = 123
    child.stdout = { resume() { stdoutDrained = true } }
    child.stderr = { resume() { stderrDrained = true } }
    child.send = () => undefined
    const worker = startVisionAutoWorker({
      jobId: 'job-1',
      sourceUrl: 'https://www.youtube.com/shorts/example',
      deadlineAt: Date.now() + 60_000,
      parentEnv: { Path: 'C:\\Tools', VISION_AUTO_V2_ENABLED: 'true' },
      forkImpl(_path, _args, options) { forkOptions = options; return child },
    })
    assert.equal(forkOptions.env.Path, 'C:\\Tools')
    assert.equal(forkOptions.env.VISION_AUTO_V2_ENABLED, 'true')
    assert.equal(forkOptions.env.NODE_ENV, 'production')
    assert.deepEqual(forkOptions.execArgv, [])
    assert.equal(stdoutDrained, true)
    assert.equal(stderrDrained, true)
    assert.equal(worker.pid, 123)
  })
  it('stale runs cannot overwrite newer state', () => { const guard = createVisionAutoRunGuard(); const first = guard.start(); const second = guard.start(); assert.equal(guard.isCurrent(first), false); assert.equal(guard.isCurrent(second), true) })
  it('shares in-flight identical jobs and caches only final responses', async () => {
    clearVisionAutoResultCache(); let calls = 0; const run = async () => { calls += 1; return buildVisionAutoResponse({ status: 'external_place_found', place: external }) }
    const [a, b] = await Promise.all([getOrCreateVisionAutoResult({ key: 'same', run }), getOrCreateVisionAutoResult({ key: 'same', run })]); const c = await getOrCreateVisionAutoResult({ key: 'same', run }); assert.equal(calls, 1); assert.equal(a.result.status, 'external_place_found'); assert.equal(b.result.status, 'external_place_found'); assert.equal(c.cacheHit, true)
  })
})
