import assert from 'node:assert/strict'
import { it } from 'node:test'

import { analyzeVisionAutoV2 } from '../services/visionAuto/visionAutoResolverService.js'

it('downloads a hinted remote image through the safe fetch boundary before OCR collection', async () => {
  let collected = null
  const result = await analyzeVisionAutoV2({
    url: 'https://images.example.com/asset?id=42',
    assetTypeHint: 'image',
  }, {
    config: {
      visionAutoEnabled: true,
      enabled: true,
      youtubeTrack2V3Enabled: false,
      requestDeadlineMs: 30_000,
      pipelineVersion: 'remote-image-test',
      cacheEnabled: false,
      cacheTtlMs: 1000,
      notFoundCacheTtlMs: 1000,
      cacheMaxEntries: 10,
      remoteImageMaxBytes: 5_000_000,
      remoteImageTimeoutMs: 5_000,
      remoteImageMaxRedirects: 2,
    },
    downloadRemoteImage: async () => ({
      status: 'success',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      contentType: 'image/jpeg',
      warnings: [],
    }),
    collectEvidence: async ({ input, image }) => {
      collected = { input, image }
      return { warnings: [] }
    },
    normalizeEvidence: () => ({}),
    extractEntities: () => ({}),
    validateEntities: async () => ({
      entities: {},
      validation: { canResolveLocation: false },
    }),
  })

  assert.equal(result.status, 'not_found')
  assert.equal(collected.input.type, 'uploaded_image')
  assert.equal(collected.input.remoteImageSource, true)
  assert.equal(collected.image.mimetype, 'image/jpeg')
  assert.equal(Buffer.isBuffer(collected.image.buffer), true)
})
