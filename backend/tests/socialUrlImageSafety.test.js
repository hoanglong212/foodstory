import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  fetchPublicImageBuffer,
  sniffImageContentType,
} from '../services/socialUrlExtractionService.js'

const jpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
])
const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
])

const publicDns = async () => [{ address: '93.184.216.34', family: 4 }]

describe('safe public image fetching', () => {
  it('sniffs supported image magic bytes', () => {
    assert.equal(sniffImageContentType(jpeg), 'image/jpeg')
    assert.equal(sniffImageContentType(png), 'image/png')
    assert.equal(sniffImageContentType(Buffer.from('not an image')), null)
  })

  it('accepts generic binary content type only when bytes are a real image', async () => {
    const result = await fetchPublicImageBuffer(
      { url: 'https://example.com/image' },
      {
        resolveHostname: publicDns,
        fetchImpl: async () => new Response(jpeg, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        }),
      },
    )
    assert.equal(result.status, 'success')
    assert.equal(result.contentType, 'image/jpeg')
    assert.deepEqual(result.warnings, ['image_content_type_sniffed'])
  })

  it('rejects a declared image type that disagrees with the actual bytes', async () => {
    const result = await fetchPublicImageBuffer(
      { url: 'https://example.com/image.png' },
      {
        resolveHostname: publicDns,
        fetchImpl: async () => new Response(jpeg, {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      },
    )
    assert.equal(result.status, 'content_type_mismatch')
    assert.equal(result.detectedContentType, 'image/jpeg')
    assert.equal(result.buffer, null)
  })

  it('rejects HTML disguised as an image', async () => {
    const result = await fetchPublicImageBuffer(
      { url: 'https://example.com/image.jpg' },
      {
        resolveHostname: publicDns,
        fetchImpl: async () => new Response('<html>blocked</html>', {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      },
    )
    assert.equal(result.status, 'unsupported_content_type')
    assert.equal(result.buffer, null)
  })
})
