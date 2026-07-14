import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  normalizeVisionAutoUrl,
  parseVisionAutoRequestFields,
  VisionAutoUrlPolicyError,
} from '../services/visionAuto/visionAutoUrlPolicyService.js'
import { resolveVisionAutoInput } from '../services/visionAuto/visionAutoResolverService.js'

describe('Vision Auto URL contract and canonicalization', () => {
  it('canonicalizes supported YouTube URL forms to one Shorts URL', () => {
    const watch = normalizeVisionAutoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=test')
    const short = normalizeVisionAutoUrl('https://youtu.be/dQw4w9WgXcQ?si=secret')
    assert.equal(watch.url, 'https://www.youtube.com/shorts/dQw4w9WgXcQ')
    assert.equal(short.url, watch.url)
    assert.equal(watch.type, 'youtube_url')
    assert.equal(watch.assetType, 'video')
  })

  it('rejects localhost, private literal IPs, and embedded credentials', () => {
    for (const value of [
      'http://localhost/image.jpg',
      'http://127.0.0.1/image.jpg',
      'http://10.1.2.3/image.jpg',
      'https://user:password@example.com/image.jpg',
    ]) {
      assert.throws(() => normalizeVisionAutoUrl(value), VisionAutoUrlPolicyError)
    }
  })

  it('classifies direct image URLs and preserves signed query parameters', () => {
    const input = normalizeVisionAutoUrl(
      'https://cdn.example.com/photo.jpg?X-Amz-Signature=abc&utm_source=keep-because-signed',
      { assetTypeHint: 'image', authMode: 'signed_url' },
    )
    assert.equal(input.type, 'remote_image_url')
    assert.equal(input.authMode, 'signed_url')
    assert.match(input.url, /X-Amz-Signature=abc/u)
    assert.match(input.url, /utm_source=keep-because-signed/u)
  })

  it('removes common tracking parameters from ordinary public web URLs', () => {
    const input = normalizeVisionAutoUrl(
      'https://example.com/article?utm_source=x&id=42#section',
    )
    assert.equal(input.url, 'https://example.com/article?id=42')
  })

  it('accepts the new request contract while preserving legacy URL fields', () => {
    const parsed = parseVisionAutoRequestFields({
      asset_url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      asset_type_hint: 'video',
      auth_mode: 'public',
      tenant_id: 'foodstory',
      request_id: 'request-1',
      idempotency_key: 'same-video',
      max_duration_sec: '90',
      desired_sync: 'false',
    }, { mode: 'job' })
    assert.equal(parsed.assetUrl, 'https://www.youtube.com/shorts/dQw4w9WgXcQ')
    assert.equal(parsed.tenantId, 'foodstory')
    assert.equal(parsed.maxDurationSec, 90)
    assert.equal(parsed.desiredSync, false)
  })

  it('rejects non-YouTube URLs from the asynchronous video-job contract', () => {
    assert.throws(
      () => parseVisionAutoRequestFields({ asset_url: 'https://example.com/video.mp4' }, { mode: 'job' }),
      /currently support YouTube/u,
    )
  })

  it('routes a hinted remote image URL into the image pipeline', () => {
    const input = resolveVisionAutoInput({
      url: 'https://images.example.com/no-extension?id=1',
      assetTypeHint: 'image',
    })
    assert.equal(input.type, 'remote_image_url')
    assert.equal(input.assetType, 'image')
  })
})
