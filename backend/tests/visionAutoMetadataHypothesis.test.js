import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildMetadataLocationHypothesis, decideVisionMetadataFastPath, fetchVisionMetadata, isStrongRecipeMetadata, resolveMetadataLocalPlace } from '../services/visionAuto/visionMetadataHypothesisService.js'
import { buildVisionAutoResponse } from '../services/visionAuto/visionResponseBuilder.js'

const row = { id: 1, name: 'Pho Le', address: '413 Nguyen Trai', district: 'District 1', latitude: 10.758, longitude: 106.689 }
const database = { execute: async () => [[row]] }

describe('Vision Auto metadata-first hypothesis', () => {
  it('matches unaccented name and street to the real local record shape', async () => {
    const place = await resolveMetadataLocalPlace({ title: 'Pho Le 413 Nguyen Trai' }, { database })
    assert.equal(place.sourceId, '1')
    assert.equal(place.existsInFoodStory, true)
  })

  it('matches Vietnamese diacritics to the same local record', async () => {
    const place = await resolveMetadataLocalPlace({ title: 'Phở Lệ 413 Nguyễn Trãi' }, { database })
    assert.equal(place.sourceId, '1')
  })

  for (const title of [
    'Best pho in Saigon',
    'Công thức nấu phở ngon tại nhà',
    'Top 5 restaurants in Ho Chi Minh City featuring Pho Le',
    'Food tour District 1 Pho Le and friends',
  ]) {
    it(`rejects non-single-place metadata: ${title}`, async () => {
      assert.equal(await resolveMetadataLocalPlace({ title }, { database }), null)
    })
  }

  it('whitelists the public place and removes internal score fields', async () => {
    const place = await resolveMetadataLocalPlace({ title: 'Pho Le 413 Nguyen Trai' }, { database })
    assert.equal('_score' in place, true)
    const response = buildVisionAutoResponse({ status: 'matched_place', place, input: { url: 'https://youtube.com/watch?v=fixture' } })
    assert.equal(response.status, 'matched_place')
    assert.equal('_score' in response.place, false)
    assert.equal(Object.keys(response.place).some((key) => key.startsWith('_')), false)
    assert.equal(JSON.stringify(response).includes('confidence'), false)
  })

  it('builds a safe external name and locality hypothesis from metadata', () => {
    assert.deepEqual(buildMetadataLocationHypothesis({ title: 'The Coffee House, Hai Phong' }), {
      id: 'metadata-title-hypothesis',
      placeName: 'The Coffee House',
      address: null,
      locality: 'Hai Phong',
      confidence: 0.78,
      source: 'metadata',
      sources: ['metadata_title'],
      observationCount: 1,
    })
  })

  it('does not create one metadata hypothesis from a listicle', () => {
    assert.equal(buildMetadataLocationHypothesis({ title: 'Top 5 restaurants, Ho Chi Minh City' }), null)
  })

  it('classifies explicit cooking metadata without treating it as proof that no place exists', () => {
    assert.equal(isStrongRecipeMetadata({ title: 'Easy fish cooking #food #shorts' }), true)
    assert.equal(isStrongRecipeMetadata({ title: 'Pho Le 413 Nguyen Trai' }), false)
    assert.deepEqual(
      decideVisionMetadataFastPath({ metadata: { title: 'Easy fish cooking #food #shorts' } }),
      { terminal: false, recipeLike: true },
    )
  })

  it('still allows an exact local metadata match to finish on the fast path', () => {
    const localPlace = { sourceType: 'foodstory', sourceId: '1', name: 'Pho Le' }
    assert.deepEqual(
      decideVisionMetadataFastPath({ metadata: { title: 'Pho Le 413 Nguyen Trai' }, localPlace }),
      { terminal: true, status: 'matched_place', place: localPlace },
    )
  })

  it('requests only bounded metadata fields instead of the full format catalog', async () => {
    const metadata = await fetchVisionMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      exec(_command, args, _options, callback) {
        assert.equal(args.includes('--print'), true)
        assert.equal(args.includes('--dump-single-json'), false)
        callback(null, JSON.stringify({
          title: 'Safe title',
          description: 'Safe description',
          thumbnail: 'https://example.com/thumb.jpg',
          duration: 30,
        }))
      },
    })
    assert.deepEqual(metadata, {
      title: 'Safe title',
      description: 'Safe description',
      thumbnail: true,
      duration: 30,
    })
  })

  it('falls back to public YouTube oEmbed when yt-dlp is blocked', async () => {
    let fallbackCalls = 0
    const metadata = await fetchVisionMetadata('https://www.youtube.com/shorts/kSu3fdZ2Ua8', {
      exec(_command, _args, _options, callback) {
        callback(new Error('Video unavailable from this hosting IP'))
      },
      async fetchOEmbed(url) {
        fallbackCalls += 1
        assert.equal(url, 'https://www.youtube.com/shorts/kSu3fdZ2Ua8')
        return {
          title: 'Bí mật của món cao lầu Hội An #food #shorts',
          thumbnailUrl: 'https://i.ytimg.com/vi/kSu3fdZ2Ua8/hqdefault.jpg',
        }
      },
    })

    assert.equal(fallbackCalls, 1)
    assert.deepEqual(metadata, {
      title: 'Bí mật của món cao lầu Hội An #food #shorts',
      description: '',
      thumbnail: true,
      duration: null,
    })
  })
})
