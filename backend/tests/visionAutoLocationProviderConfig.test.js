import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getSanitizedVisionAutoRuntimeConfig, getVisionAutoConfig } from '../services/visionAuto/visionAutoConfig.js'

describe('Vision Auto runtime configuration', () => {
  it('disables Geoapify immediately without a key', () => {
    const config = getVisionAutoConfig({ VISION_AUTO_V2_ENABLED: 'true', LOCATION_RESOLUTION_PROVIDER: 'geoapify' })
    assert.equal(config.externalResolverEnabled, false)
    assert.equal(config.externalProvider, 'disabled')
  })
  it('enables only Geoapify when configured', () => {
    const config = getVisionAutoConfig({ VISION_AUTO_V2_ENABLED: 'true', LOCATION_RESOLUTION_PROVIDER: 'auto', GEOAPIFY_API_KEY: 'test-key' })
    assert.equal(config.externalResolverEnabled, true)
    assert.equal(config.externalProvider, 'geoapify')
    assert.equal('geoapifyApiKey' in getSanitizedVisionAutoRuntimeConfig(config), false)
  })
  it('does not let child ASR or Gemini flags override disabled parents', () => {
    const config = getVisionAutoConfig({ VISION_AUTO_V2_ENABLED: 'true', TRACK2_V3_ENABLED: 'true', TRACK2_V3_ASR_ENABLED: 'false', TRACK2_V3_ASR_FALLBACK_ENABLED: 'true', TRACK2_V3_GEMINI_VISION_ENABLED: 'false', TRACK2_V3_GEMINI_CROP_JUDGE_ENABLED: 'true' })
    assert.equal(config.asrEffectiveEnabled, false)
    assert.equal(config.geminiEffectiveEnabled, false)
  })
  it('allows a bounded deep-analysis deadline for asynchronous jobs', () => {
    assert.equal(getVisionAutoConfig({}).requestDeadlineMs, 150_000)
    assert.equal(getVisionAutoConfig({ VISION_AUTO_REQUEST_DEADLINE_MS: '999999' }).requestDeadlineMs, 180_000)
    assert.equal(getVisionAutoConfig({ VISION_AUTO_REQUEST_DEADLINE_MS: '1000' }).requestDeadlineMs, 30_000)
  })
})
