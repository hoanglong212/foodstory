import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { routeShortsAddress } from '../src/services/shortsAddressRouterService.js'
import {
  fetchShortsMetadata,
  parseJsonLdScriptTags,
} from '../src/services/shortsMetadataFetchService.js'

const SHORTS_URL = 'https://www.youtube.com/shorts/ZDPXxZe4uEs'
const RAW_LAC_DESCRIPTION = `Lạc Concept
Địa chỉ: Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. HCM
Giá trung bình: 40k - 60k
---------------------
Theo dõi các địa điểm vui chơi, giải trí, trend mới, xu hướng du lịch tại cộng đồng Thánh Riviu 

- Group Thánh Riviu : https://www.facebook.com/groups/riviu...
- Page Thánh Riviu : https://www.facebook.com/Riviu.Official
- Tiktok : https://www.tiktok.com/@thanhriviuoff...
- Instagram : https://www.instagram.com/thanhriviu....
- Youtube : Thánh Riviu
- Liên hệ Email : contact@riviu.vn
#Thanhriviu #riviu #shorts #youtubeshorts #ramen #ramennhat #amthucnhat`

function createMetadataFetchMock({
  videoId = 'ZDPXxZe4uEs',
  apiTitle = 'Banh Mi with NO Pate?! #vietnamfood #banhmi',
  apiDescription = 'Address: 39 Nguyen Trai, District 1, HCMC',
} = {}) {
  const calls = []
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options })

    if (String(url).startsWith('https://www.googleapis.com/youtube/v3/videos')) {
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              snippet: {
                title: apiTitle,
                description: apiDescription,
                channelTitle: 'Food Shorts',
                publishedAt: '2024-01-01T00:00:00Z',
              },
              contentDetails: {
                duration: 'PT35S',
              },
              status: {
                privacyStatus: 'public',
              },
            },
          ],
        }),
      }
    }

    if (String(url) === `https://www.youtube.com/shorts/${videoId}`) {
      return {
        ok: true,
        text: async () => `
          <html>
            <body>ignored body text</body>
            <script type="application/ld+json">
              {"@type":"Restaurant","address":{"streetAddress":"39 Nguyen Trai","addressLocality":"District 1","addressRegion":"HCMC"}}
            </script>
          </html>
        `,
      }
    }

    throw new Error(`unexpected fetch ${url}`)
  }

  return { fetch, calls }
}

describe('shortsMetadataFetchService', () => {
  it('shortsMetadataFetchService maps YouTube API metadata and parses JSON-LD', async () => {
    const { fetch, calls } = createMetadataFetchMock()

    const metadata = await fetchShortsMetadata(SHORTS_URL, {
      fetch,
      youtubeApiKey: 'youtube-key',
    })

    assert.equal(metadata.videoId, 'ZDPXxZe4uEs')
    assert.equal(metadata.title, 'Banh Mi with NO Pate?! #vietnamfood #banhmi')
    assert.equal(metadata.description, 'Address: 39 Nguyen Trai, District 1, HCMC')
    assert.equal(metadata.channelTitle, 'Food Shorts')
    assert.equal(metadata.publishedAt, '2024-01-01T00:00:00Z')
    assert.equal(metadata.duration, 'PT35S')
    assert.equal(metadata.privacyStatus, 'public')
    assert.equal(metadata.serpSnippet, '')
    assert.equal(metadata.pageMetadataText, '')
    assert.equal(metadata.ocrText, '')
    assert.equal(metadata.asrText, '')
    assert.equal(metadata.metadataSource.youtubeApi, true)
    assert.equal(metadata.metadataSource.shortsHtml, true)
    assert.equal(metadata.jsonldObjects.length, 1)
    assert.equal(metadata.jsonldObjects[0].address.streetAddress, '39 Nguyen Trai')

    assert.equal(calls.length, 2)
    assert.ok(calls[0].url.startsWith('https://www.googleapis.com/youtube/v3/videos?'))
    assert.ok(calls[0].url.includes('part=snippet%2CcontentDetails%2Cstatus'))
    assert.ok(calls[0].url.includes('id=ZDPXxZe4uEs'))
    assert.ok(calls[0].url.includes('key=youtube-key'))
    assert.equal(calls[1].url, 'https://www.youtube.com/shorts/ZDPXxZe4uEs')
  })

  it('shortsMetadataFetchService output can be routed without SERP evidence', async () => {
    const { fetch } = createMetadataFetchMock()
    const metadata = await fetchShortsMetadata(SHORTS_URL, {
      fetch,
      youtubeApiKey: 'youtube-key',
    })

    const result = routeShortsAddress(metadata)

    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'EXPLICIT_LABEL')
    assert.equal(result.evidenceSource, 'description')
    assert.equal(metadata.serpSnippet, '')
  })

  it('shortsMetadataFetchService preserves raw YouTube description and router bounds exact prefix candidate', async () => {
    const { fetch } = createMetadataFetchMock({
      videoId: 'TIflqSNgcl8',
      apiTitle: 'Quán cà phê Nhật Bản giữa lòng Sài Gòn | Thánh Riviu',
      apiDescription: RAW_LAC_DESCRIPTION,
    })

    const metadata = await fetchShortsMetadata('https://www.youtube.com/shorts/TIflqSNgcl8', {
      fetch,
      youtubeApiKey: 'youtube-key',
    })
    const result = routeShortsAddress(metadata)

    assert.equal(metadata.description, RAW_LAC_DESCRIPTION)
    assert.ok(metadata.description.includes('\nGiá trung bình: 40k - 60k'))
    assert.equal(metadata.serpSnippet, '')
    assert.equal(result.track, 'TRACK_1')
    assert.equal(result.reason, 'EXPLICIT_LABEL')
    assert.equal(result.evidenceSource, 'description')
    assert.equal(result.candidateAddress, 'Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. Hồ Chí Minh')
    assert.equal(result.normalizedAddress, 'Hẻm 140 Trần Bình Trọng, Phường 2, Quận 5, TP. Hồ Chí Minh')
  })

  it('shortsMetadataFetchService parses only JSON-LD script tags', () => {
    const objects = parseJsonLdScriptTags(`
      <script>window.__DATA__ = {"address":"ignored"}</script>
      <script type="application/ld+json">[{"@type":"Restaurant","address":"39 Nguyen Trai"}]</script>
      <script type="application/ld+json">{bad json}</script>
    `)

    assert.equal(objects.length, 1)
    assert.equal(objects[0].address, '39 Nguyen Trai')
  })
})
