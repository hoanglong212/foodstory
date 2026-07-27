import assert from 'node:assert/strict'
import test from 'node:test'

import express from 'express'
import sharp from 'sharp'

import { createVisionAutoRouter } from '../routes/visionAutoRoutes.js'
import {
  identifyDishFromVideoSource,
  invokeDishVisionGemini,
  searchLocalPlacesForDish,
  __visionDishDiscoveryTestUtils,
} from '../services/visionAuto/visionDishDiscoveryService.js'
import {
  resolveGooglePlacePhoto,
  searchExternalPlacesForDish,
  __visionDishExternalPlaceTestUtils,
} from '../services/visionAuto/visionDishExternalPlaceService.js'

test('dish discovery returns bounded review candidates and never claims the original place', async () => {
  const imageBuffer = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#d4512b' },
  }).png().toBuffer()

  const result = await identifyDishFromVideoSource(
    { sourceUrl: 'https://www.youtube.com/shorts/WisF5f2RlxM' },
    {
      fetchMetadata: async () => ({ title: 'Trying a local noodle dish' }),
      fetchImage: async () => ({ buffer: imageBuffer, contentType: 'image/png' }),
      invokeModel: async () => ({
        candidates: [
          {
            dishName: 'Bún bò Huế',
            cuisine: 'Vietnamese',
            confidence: 0.88,
            aliases: ['bun bo Hue'],
            visualEvidence: ['red broth', 'rice noodles'],
            address: 'must not be exposed',
          },
          {
            dishName: 'Vietnamese food',
            cuisine: 'Vietnamese',
            confidence: 0.99,
            aliases: [],
            visualEvidence: [],
          },
        ],
      }),
    },
  )

  assert.equal(result.status, 'dish_candidates')
  assert.equal(result.originalPlaceKnown, false)
  assert.equal(result.source.url, 'https://www.youtube.com/shorts/WisF5f2RlxM')
  assert.equal(result.selectedDish, null)
  assert.equal(result.restaurants.length, 0)
  assert.equal(result.dishCandidates.length, 1)
  assert.equal(result.dishCandidates[0].dishName, 'Bún bò Huế')
  assert.equal(result.dishCandidates[0].reviewRequired, true)
  assert.equal('address' in result.dishCandidates[0], false)
})

test('dish discovery promotes a dish explicitly named in the video title over a conflicting visual guess', async () => {
  const imageBuffer = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#d4a12b' },
  }).png().toBuffer()

  const result = await identifyDishFromVideoSource(
    { sourceUrl: 'https://www.youtube.com/shorts/AbCdEf12345' },
    {
      fetchMetadata: async () => ({
        title: 'Bí mật của món cao lầu Hội An #food #shorts',
      }),
      resolveTitleDish: async () => '',
      fetchImage: async () => ({ buffer: imageBuffer, contentType: 'image/png' }),
      invokeModel: async () => ({
        titleDishName: 'Cao Lầu',
        candidates: [
          {
            dishName: 'Bún Bò Huế',
            cuisine: 'Vietnamese',
            confidence: 0.86,
            aliases: ['Hue-style beef noodle soup'],
            visualEvidence: ['round noodles', 'broth', 'sliced meat'],
          },
        ],
      }),
    },
  )

  assert.equal(result.status, 'dish_candidates')
  assert.equal(result.dishCandidates[0].dishName, 'Cao Lầu')
  assert.equal(result.dishCandidates[0].evidenceSource, 'title')
  assert.equal(result.dishCandidates[0].evidenceLabel, 'Title evidence')
  assert.deepEqual(
    result.dishCandidates[0].visualEvidence,
    ['Named explicitly in the public video title'],
  )
  assert.equal(result.dishCandidates[1].dishName, 'Bún Bò Huế')
  assert.equal(result.dishCandidates[1].evidenceSource, 'thumbnail')
})

test('dish discovery uses a known dish named in the title without spending provider quota', async () => {
  let imageCalls = 0
  let modelCalls = 0
  const result = await identifyDishFromVideoSource(
    { sourceUrl: 'https://www.youtube.com/shorts/AbCdEf12345' },
    {
      fetchMetadata: async () => ({
        title: 'Bí mật của món cao lầu Hội An #food #shorts',
      }),
      resolveTitleDish: async () => 'Cao Lầu',
      fetchImage: async () => {
        imageCalls += 1
        return null
      },
      invokeModel: async () => {
        modelCalls += 1
        throw new Error('must not be called')
      },
    },
  )

  assert.equal(result.status, 'dish_candidates')
  assert.equal(result.dishCandidates[0].dishName, 'Cao Lầu')
  assert.equal(result.dishCandidates[0].evidenceSource, 'title')
  assert.equal(imageCalls, 0)
  assert.equal(modelCalls, 0)
})

test('known dish title matching keeps the longest exact catalog name', () => {
  assert.equal(
    __visionDishDiscoveryTestUtils.findKnownDishInTitle(
      'Bí mật của món cao lầu Hội An #food',
      ['Lẩu', 'Cao Lầu', 'Bún bò Huế'],
    ),
    'Cao Lầu',
  )
})

test('title parsing removes a trailing proper-name location without shortening a title-cased dish', () => {
  assert.equal(
    __visionDishDiscoveryTestUtils.inferTitleDishPhrase(
      'Bí mật của món cao lầu Hội An #food',
    ),
    'cao lầu',
  )
  assert.equal(
    __visionDishDiscoveryTestUtils.inferTitleDishPhrase(
      'Cách làm Bún Bò Huế',
    ),
    'Bún Bò Huế',
  )
})

test('Gemini dish request uses low-variance generation and asks for an explicit title dish', async () => {
  let requestBody = null
  const result = await invokeDishVisionGemini({
    imageBuffer: Buffer.from('fixture-thumbnail'),
    metadata: { title: 'Bí mật của món cao lầu Hội An' },
    apiKey: 'fixture-key',
    model: 'gemini-fixture',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({ titleDishName: 'Cao Lầu', candidates: [] }),
              }],
            },
          }],
        }),
      }
    },
  })

  assert.equal(result.titleDishName, 'Cao Lầu')
  assert.equal(requestBody.generationConfig.temperature, 0)
  assert.equal(requestBody.generationConfig.topP, 0.1)
  assert.ok(requestBody.contents[0].parts[0].text.includes('titleDishName'))
  assert.ok(requestBody.generationConfig.responseSchema.required.includes('titleDishName'))
})

test('title dish extraction rejects a model invention that is absent from the public title', () => {
  assert.equal(
    __visionDishDiscoveryTestUtils.titleDishNamedInMetadata(
      { titleDishName: 'Bún Bò Huế' },
      { title: 'Quick kitchen noodle challenge' },
    ),
    '',
  )
})

test('local dish search ranks matching FoodStory rows using map origin without inventing a place', async () => {
  const rows = [
    {
      id: 1,
      sourceType: 'restaurant',
      name: 'Central Kitchen',
      category: 'Vietnamese',
      description: 'Known for bún bò Huế and noodle soups',
      address: '10 Example Street',
      district: 'District 1',
      latitude: 10.776,
      longitude: 106.7,
      rating: 4.7,
    },
    {
      id: 2,
      sourceType: 'restaurant',
      name: 'Pizza Corner',
      category: 'Italian',
      description: 'Pizza and pasta',
      address: '20 Example Street',
      district: 'District 1',
      latitude: 10.777,
      longitude: 106.701,
      rating: 5,
    },
  ]

  const result = await searchLocalPlacesForDish(
    {
      dishName: 'Bún bò Huế',
      aliases: ['bun bo Hue'],
      origin: { lat: 10.775, lng: 106.699 },
    },
    { rows },
  )

  assert.equal(result.status, 'dish_places_found')
  assert.equal(result.originalPlaceKnown, false)
  assert.equal(result.source, 'foodstory_local')
  assert.equal(result.restaurants.length, 1)
  assert.equal(result.restaurants[0].sourceId, '1')
  assert.ok(result.restaurants[0].distanceKm < 1)
})

test('dish matching handles accented and unaccented Vietnamese names', () => {
  assert.equal(
    __visionDishDiscoveryTestUtils.dishMatchScore(
      ['bún bò Huế'],
      'Quan bun bo Hue dac biet',
    ),
    1,
  )
})

test('external dish search returns reviewable Geoapify places around the map center', async () => {
  let request = null
  const result = await searchExternalPlacesForDish(
    {
      dishName: 'Lẩu hải sản',
      aliases: ['Seafood hotpot'],
      origin: { lat: 10.7769, lng: 106.7009 },
    },
    {
      enabled: true,
      apiKey: 'fixture-key',
      fetchImpl: async (url, options) => {
        request = { url: new URL(String(url)), options }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {
                  place_id: 'place-1',
                  name: 'Seafood Fixture',
                  formatted: '10 Example Street, Ho Chi Minh City',
                  lat: 10.78,
                  lon: 106.7,
                  category: 'catering.restaurant',
                  country_code: 'vn',
                },
                geometry: { type: 'Point', coordinates: [106.7, 10.78] },
              },
              {
                type: 'Feature',
                properties: {
                  place_id: 'non-food-place',
                  name: 'Non-food Fixture',
                  formatted: '20 Example Street',
                  lat: 10.79,
                  lon: 106.71,
                  category: 'commercial.supermarket',
                  country_code: 'vn',
                },
                geometry: { type: 'Point', coordinates: [106.71, 10.79] },
              },
            ],
          }),
        }
      },
    },
  )

  assert.equal(result.status, 'external_places_found')
  assert.equal(result.source, 'geoapify')
  assert.equal(result.originalPlaceKnown, false)
  assert.equal(result.restaurants.length, 1)
  assert.equal(result.restaurants[0].sourceType, 'external')
  assert.equal(result.restaurants[0].providerPlaceId, 'place-1')
  assert.equal(result.restaurants[0].dishHint, 'Lẩu hải sản')
  assert.equal(result.restaurants[0].reviewRequired, true)
  assert.equal(result.restaurants[0].rating, null)
  assert.equal(result.restaurants[0].photo, null)
  assert.deepEqual(result.restaurants[0].reviews, [])
  assert.equal(result.restaurants[0].dishMatchBasis, 'geoapify_food_text_search')
  assert.equal(request.url.origin, 'https://api.geoapify.com')
  assert.equal(request.url.pathname, '/v1/geocode/search')
  assert.equal(request.url.searchParams.get('text'), result.selectedDish.dishName)
  assert.equal(request.url.searchParams.get('filter'), 'circle:106.7009,10.7769,20000')
  assert.equal(request.url.searchParams.get('bias'), 'proximity:106.7009,10.7769')
  assert.equal(request.url.searchParams.get('format'), 'geojson')
  assert.equal(request.url.searchParams.get('apiKey'), 'fixture-key')
  assert.equal(request.options.headers.accept, 'application/json')
})

test('external search fails closed when Geoapify is not configured', async () => {
  let fetched = false
  const result = await searchExternalPlacesForDish(
    { dishName: 'Phở', origin: { lat: 10.7, lng: 106.6 } },
    { enabled: true, apiKey: '', fetchImpl: async () => { fetched = true } },
  )
  assert.equal(result.status, 'external_places_unavailable')
  assert.equal(result.source, 'geoapify')
  assert.equal(result.reason, 'geoapify_not_configured')
  assert.equal(result.restaurants.length, 0)
  assert.equal(fetched, false)
})

test('Google Places photo resolver keeps the API key server-side and returns an HTTPS media URL', async () => {
  let requestedUrl = null
  const photoUri = await resolveGooglePlacePhoto(
    { photoName: 'places/place-1/photos/photo-1', maxWidthPx: 640, maxHeightPx: 420 },
    {
      enabled: true,
      apiKey: 'server-only-key',
      fetchImpl: async (url) => {
        requestedUrl = String(url)
        return {
          ok: true,
          status: 200,
          json: async () => ({ photoUri: 'https://lh3.googleusercontent.com/fixture-photo' }),
        }
      },
    },
  )

  assert.equal(photoUri, 'https://lh3.googleusercontent.com/fixture-photo')
  assert.match(requestedUrl, /places\/place-1\/photos\/photo-1\/media/)
  assert.match(requestedUrl, /maxWidthPx=640/)
  assert.match(requestedUrl, /key=server-only-key/)
  await assert.rejects(
    () => resolveGooglePlacePhoto(
      { photoName: 'https://example.com/not-a-place-photo' },
      { enabled: true, apiKey: 'server-only-key' },
    ),
    { code: 'google_places_photo_invalid' },
  )
})

test('external search requires a real map origin instead of server IP bias', async () => {
  await assert.rejects(
    () => searchExternalPlacesForDish(
      { dishName: 'Phở', origin: null },
      { enabled: true, apiKey: 'fixture-key' },
    ),
    { code: 'dish_search_origin_required' },
  )
  assert.equal(__visionDishExternalPlaceTestUtils.normalizedOrigin({ lat: 91, lng: 106 }), null)
})

test('dish discovery API keeps identification and local place search as separate confirmation steps', async () => {
  const calls = []
  const router = createVisionAutoRouter({
    isRouteEnabled: () => true,
    isServiceEnabled: () => true,
    identifyDish: async ({ sourceUrl }) => ({
      status: 'dish_candidates',
      sourceUrl,
      dishCandidates: [{ id: 'dish:1', dishName: 'Phở', reviewRequired: true }],
      originalPlaceKnown: false,
      restaurants: [],
    }),
    searchDishPlaces: async (input) => {
      calls.push(input)
      return {
        status: 'dish_places_found',
        selectedDish: { dishName: input.dishName },
        originalPlaceKnown: false,
        restaurants: [{ id: 'restaurant:1', name: 'Local fixture' }],
      }
    },
  })
  const app = express()
  app.use(express.json())
  app.use('/api/food-map', router)
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
  })

  try {
    const base = `http://127.0.0.1:${server.address().port}/api/food-map/vision-auto-v2/dish-discovery`
    const identifyResponse = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceUrl: 'https://www.youtube.com/shorts/fixture123' }),
    })
    const identified = await identifyResponse.json()
    assert.equal(identifyResponse.status, 200)
    assert.equal(identified.restaurants.length, 0)
    assert.equal(identified.originalPlaceKnown, false)

    const searchResponse = await fetch(`${base}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dishName: 'Phở', aliases: ['Pho'], origin: { lat: 10.7, lng: 106.6 } }),
    })
    const searched = await searchResponse.json()
    assert.equal(searchResponse.status, 200)
    assert.equal(searched.restaurants.length, 1)
    assert.deepEqual(calls[0].origin, { lat: 10.7, lng: 106.6 })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
