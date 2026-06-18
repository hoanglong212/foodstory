import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import sharp from 'sharp'
import {
  createFoodMapSocialDiscoveryRouter,
} from '../routes/foodMapSocialDiscoveryRoutes.js'
import {
  FOOD_MAP_SOCIAL_STATUSES,
  createFoodMapSocialResponse,
} from '../services/foodMapSocialDecisionService.js'
import {
  analyzeFoodMapSocialDiscovery,
} from '../services/foodMapSocialDiscoveryService.js'
import {
  extractFoodMapEntities,
} from '../services/foodMapEntityExtractionService.js'
import {
  buildFoodMapLocationQuery,
} from '../services/foodMapLocationQueryService.js'
import {
  detectSocialPlatform,
  extractSocialUrlSignals,
  isPrivateIpAddress,
} from '../services/socialUrlExtractionService.js'
import {
  extractTextPlaceSignal,
} from '../services/textPlaceSignalExtractor.js'
import {
  extractLocalOcrSignals,
  preprocessLocalOcrImage,
} from '../services/localOcrService.js'

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)
const publicDnsResult = [{ address: '8.8.8.8', family: 4 }]
const resolvePublicHostname = async () => publicDnsResult
const metadataHtml = `<!doctype html>
<html>
  <head>
    <title>Browser title</title>
    <meta name="description" content="Standard description">
    <meta property="og:title" content="Com Tam Thanh Tu">
    <meta property="og:description" content="Broken rice in Ho Chi Minh City">
    <meta property="og:image" content="/images/com-tam.jpg">
    <meta property="og:site_name" content="Food Video">
    <meta name="twitter:title" content="Twitter title">
    <meta name="twitter:description" content="Twitter description">
    <meta name="twitter:image" content="/images/twitter-com-tam.jpg">
    <link rel="canonical" href="/canonical/com-tam">
  </head>
  <body>
    <main>Public restaurant review with rice, pork, and egg.</main>
    <script>privateRuntimeValue = "not visible";</script>
  </body>
</html>`
const mockOcrSuccess = async () => ({
  text: 'COM TAM THANH TU\n123 Le Loi, District 1\n0909 000 111',
  usable: true,
  ocrUsable: true,
  confidence: 0.87,
  reason: 'usable',
  lines: [
    { text: 'COM TAM THANH TU', confidence: 0.91, type: 'sign' },
    { text: '123 Le Loi, District 1', confidence: 0.84, type: 'address' },
    { text: '0909 000 111', confidence: 0.86, type: 'phone' },
  ],
  warnings: [],
  debug: {
    implemented: true,
    engine: 'mock',
    passes: [{ label: 'mock_pass', confidence: 0.87 }],
  },
})
const mockOcrLowConfidence = async () => ({
  text: null,
  usable: false,
  ocrUsable: false,
  confidence: 0.18,
  reason: 'low_confidence',
  lines: [],
  warnings: ['mostly_symbols'],
  debug: {
    implemented: true,
    engine: 'mock',
    rawText: 'àI$ ] Lại si : 7 _',
  },
})
const mockOcrTimeout = async () => ({
  text: null,
  usable: false,
  ocrUsable: false,
  confidence: 0,
  reason: 'timeout',
  lines: [],
  warnings: ['Local OCR timed out.'],
  debug: {
    implemented: true,
    engine: 'mock',
  },
})

function htmlResponse(html, init = {}) {
  return new Response(html, {
    status: init.status || 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...(init.headers || {}),
    },
  })
}

function extractorWith(fetchImpl, overrides = {}) {
  return ({ url }) =>
    extractSocialUrlSignals(
      { url },
      {
        fetchImpl,
        resolveHostname: resolvePublicHostname,
        timeoutMs: 50,
        ...overrides,
      },
    )
}

function analyzerWith(fetchImpl, overrides = {}, dependencyOverrides = {}) {
  return (input) =>
    analyzeFoodMapSocialDiscovery(input, {
      extractSocialUrlSignals: extractorWith(fetchImpl, overrides),
      ...dependencyOverrides,
    })
}

function assertNoPlaceOrDishClaims(result) {
  assert.equal(result.place.name, null)
  assert.equal(result.place.existsInFoodMap, false)
  assert.equal(result.place.matchedFoodMapPlace, null)
  assert.equal(result.dishFallback.broadDish, null)
  assert.equal(result.dishFallback.possibleDish, null)
  assert.equal(result.dishFallback.cuisine, null)
  assert.deepEqual(result.dishFallback.topCandidates, [])
  assert.equal(result.addPlaceDraft, null)
  assert.equal(result.place.address, null)
  assert.equal(result.place.source, null)
  assert.equal(result.place.confidence, 0)
  assert.equal(result.matchedPlace, undefined)
  assert.equal(result.placeId, undefined)
}

function normalizeForAssert(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function assertEntitiesContract(entities) {
  assert.deepEqual(Object.keys(entities), [
    'address',
    'placeName',
    'phones',
    'dishNames',
    'priceHints',
    'locationHints',
    'confidence',
    'status',
    'warnings',
  ])
  assert.deepEqual(Object.keys(entities.address), [
    'value',
    'confidence',
    'source',
    'evidence',
  ])
  assert.deepEqual(Object.keys(entities.placeName), [
    'value',
    'confidence',
    'source',
    'evidence',
  ])
  assert.ok(Array.isArray(entities.phones))
  assert.ok(Array.isArray(entities.dishNames))
  assert.ok(Array.isArray(entities.priceHints))
  assert.ok(Array.isArray(entities.locationHints))
  assert.ok(Array.isArray(entities.warnings))
}

function assertLocationQueryContract(locationQuery) {
  assert.deepEqual(Object.keys(locationQuery), [
    'query',
    'canResolveLocation',
    'confidence',
    'reason',
    'components',
    'warnings',
  ])
  assert.deepEqual(Object.keys(locationQuery.components), [
    'address',
    'placeName',
    'phones',
    'dishNames',
    'locationHints',
    'priceHints',
  ])
  assert.equal(typeof locationQuery.canResolveLocation, 'boolean')
  assert.equal(typeof locationQuery.confidence, 'number')
  assert.equal(typeof locationQuery.reason, 'string')
  assert.ok(Array.isArray(locationQuery.components.phones))
  assert.ok(Array.isArray(locationQuery.components.dishNames))
  assert.ok(Array.isArray(locationQuery.components.locationHints))
  assert.ok(Array.isArray(locationQuery.components.priceHints))
  assert.ok(Array.isArray(locationQuery.warnings))
}

function assertStableResponseContract(result) {
  assert.deepEqual(Object.keys(result), [
    'status',
    'confidence',
    'message',
    'inputSignals',
    'ocrEvidence',
    'textSources',
    'entities',
    'locationQuery',
    'place',
    'dishFallback',
    'addPlaceDraft',
    'debug',
  ])
  assert.deepEqual(Object.keys(result.inputSignals), [
    'url',
    'platform',
    'title',
    'description',
    'ocrText',
    'ocrUsable',
    'hint',
  ])
  assert.deepEqual(Object.keys(result.ocrEvidence), [
    'text',
    'usable',
    'confidence',
    'reason',
    'lines',
    'strongLines',
    'weakLines',
    'warnings',
    'debug',
  ])
  assert.ok(Array.isArray(result.ocrEvidence.lines))
  assert.ok(Array.isArray(result.ocrEvidence.strongLines))
  assert.ok(Array.isArray(result.ocrEvidence.weakLines))
  assert.ok(Array.isArray(result.ocrEvidence.warnings))
  assert.ok(Array.isArray(result.textSources))
  assertEntitiesContract(result.entities)
  assertLocationQueryContract(result.locationQuery)
  assert.deepEqual(Object.keys(result.place), [
    'name',
    'address',
    'district',
    'city',
    'source',
    'existsInFoodMap',
    'matchedFoodMapPlace',
    'confidence',
    'reason',
  ])
  assert.deepEqual(Object.keys(result.dishFallback), [
    'broadDish',
    'possibleDish',
    'cuisine',
    'topCandidates',
    'confidence',
    'reason',
  ])
  assert.ok(Array.isArray(result.debug.steps))
  assert.ok(Array.isArray(result.debug.warnings))
}

async function startTestServer(analyze = analyzeFoodMapSocialDiscovery) {
  const app = express()
  app.use(express.json())
  app.use(
    '/api/food-map',
    createFoodMapSocialDiscoveryRouter({ analyze }),
  )
  app.use((error, _req, res, _next) => {
    res.status(500).json({ error: error.message })
  })

  const server = http.createServer(app)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  return {
    baseUrl: `http://127.0.0.1:${address.port}/api/food-map/social-discovery`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

async function readJson(response) {
  return {
    status: response.status,
    body: await response.json(),
  }
}

async function run() {
  assert.equal(
    detectSocialPlatform('https://vm.tiktok.com/example'),
    'tiktok',
  )
  assert.equal(
    detectSocialPlatform('https://subdomain.instagram.com/reel/example'),
    'instagram',
  )
  assert.equal(
    detectSocialPlatform('https://www.youtube.com/watch?v=example'),
    'youtube',
  )
  assert.equal(
    detectSocialPlatform('https://fb.watch/example'),
    'facebook',
  )
  assert.equal(
    detectSocialPlatform('https://tiktok.com.example.test'),
    'web',
  )
  assert.equal(detectSocialPlatform('not a url'), 'unknown')
  console.log('PASS: social platform detection is deterministic by hostname')

  assert.equal(isPrivateIpAddress('10.0.0.4'), true)
  assert.equal(isPrivateIpAddress('172.31.4.5'), true)
  assert.equal(isPrivateIpAddress('192.168.1.8'), true)
  assert.equal(isPrivateIpAddress('169.254.10.2'), true)
  assert.equal(isPrivateIpAddress('fc00::1'), true)
  assert.equal(isPrivateIpAddress('fe80::1'), true)
  assert.equal(isPrivateIpAddress('8.8.8.8'), false)
  console.log('PASS: private IPv4 and IPv6 ranges are rejected')

  const metadataResult = await extractSocialUrlSignals(
    { url: 'https://www.example.com/posts/com-tam' },
    {
      fetchImpl: async () => htmlResponse(metadataHtml),
      resolveHostname: resolvePublicHostname,
    },
  )
  assert.equal(metadataResult.extractionStatus, 'success')
  assert.equal(metadataResult.finalUrl, 'https://www.example.com/posts/com-tam')
  assert.equal(metadataResult.platform, 'web')
  assert.equal(metadataResult.title, 'Browser title')
  assert.equal(metadataResult.description, 'Standard description')
  assert.equal(metadataResult.ogTitle, 'Com Tam Thanh Tu')
  assert.equal(
    metadataResult.ogDescription,
    'Broken rice in Ho Chi Minh City',
  )
  assert.equal(
    metadataResult.ogImage,
    'https://www.example.com/images/com-tam.jpg',
  )
  assert.equal(metadataResult.twitterTitle, 'Twitter title')
  assert.equal(
    metadataResult.twitterDescription,
    'Twitter description',
  )
  assert.equal(
    metadataResult.twitterImage,
    'https://www.example.com/images/twitter-com-tam.jpg',
  )
  assert.equal(
    metadataResult.canonicalUrl,
    'https://www.example.com/canonical/com-tam',
  )
  assert.equal(metadataResult.siteName, 'Food Video')
  assert.match(metadataResult.rawTextSnippet, /Public restaurant review/)
  assert.doesNotMatch(metadataResult.rawTextSnippet, /privateRuntimeValue/)
  console.log('PASS: public HTML, OpenGraph, Twitter, and canonical metadata extract')

  const successResponse = await analyzerWith(async () =>
    htmlResponse(metadataHtml),
  )({
    url: 'https://www.instagram.com/reel/example',
    hint: 'restaurant: Com Tam Thanh Tu',
  })
  assert.equal(successResponse.status, 'place_name_found')
  assert.ok(successResponse.confidence >= 0.5)
  assert.equal(successResponse.inputSignals.platform, 'instagram')
  assert.equal(successResponse.inputSignals.title, 'Com Tam Thanh Tu')
  assert.equal(
    successResponse.inputSignals.description,
    'Broken rice in Ho Chi Minh City',
  )
  assert.equal(
    successResponse.inputSignals.hint,
    'restaurant: Com Tam Thanh Tu',
  )
  assert.equal(successResponse.debug.urlExtraction.status, 'success')
  assert.match(successResponse.entities.placeName.value, /Com Tam Thanh Tu/i)
  assert.equal(successResponse.entities.placeName.source, 'hint')
  assert.equal(successResponse.locationQuery.canResolveLocation, true)
  assert.match(successResponse.locationQuery.query, /ho chi minh/i)
  assert.ok(successResponse.debug.steps.includes('entity_extraction_completed'))
  assertNoPlaceOrDishClaims(successResponse)
  assertStableResponseContract(successResponse)
  console.log('PASS: URL metadata success extracts Phase 4 entities safely')

  let unsafeDnsCalls = 0
  let unsafeFetchCalls = 0
  const unsafeResult = await extractSocialUrlSignals(
    { url: 'http://127.0.0.1/private' },
    {
      resolveHostname: async () => {
        unsafeDnsCalls += 1
        return publicDnsResult
      },
      fetchImpl: async () => {
        unsafeFetchCalls += 1
        return htmlResponse(metadataHtml)
      },
    },
  )
  assert.equal(unsafeResult.extractionStatus, 'unsafe_url')
  assert.equal(unsafeDnsCalls, 0)
  assert.equal(unsafeFetchCalls, 0)
  console.log('PASS: localhost and loopback URLs are rejected before DNS or fetch')

  let unsupportedFetchCalls = 0
  const unsupportedResult = await extractSocialUrlSignals(
    { url: 'file:///etc/passwd' },
    {
      fetchImpl: async () => {
        unsupportedFetchCalls += 1
        return htmlResponse(metadataHtml)
      },
    },
  )
  assert.equal(unsupportedResult.extractionStatus, 'unsupported_protocol')
  assert.equal(unsupportedFetchCalls, 0)
  console.log('PASS: unsupported protocols are rejected without a request')

  const privateDnsResult = await extractSocialUrlSignals(
    { url: 'https://public-name.example/metadata' },
    {
      resolveHostname: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '192.168.10.2', family: 4 },
      ],
      fetchImpl: async () => htmlResponse(metadataHtml),
    },
  )
  assert.equal(privateDnsResult.extractionStatus, 'unsafe_url')
  console.log('PASS: a hostname with any private DNS answer is rejected')

  let redirectFetchCalls = 0
  const unsafeRedirectResult = await extractSocialUrlSignals(
    { url: 'https://www.example.com/redirect' },
    {
      resolveHostname: resolvePublicHostname,
      fetchImpl: async () => {
        redirectFetchCalls += 1
        return htmlResponse('', {
          status: 302,
          headers: { location: 'http://localhost/private' },
        })
      },
    },
  )
  assert.equal(unsafeRedirectResult.extractionStatus, 'unsafe_url')
  assert.equal(redirectFetchCalls, 1)
  console.log('PASS: redirect targets receive the same SSRF validation')

  const timeoutResponse = await analyzerWith(async () => {
    const error = new Error('timed out')
    error.name = 'AbortError'
    throw error
  })({ url: 'https://www.youtube.com/watch?v=timeout' })
  assert.equal(timeoutResponse.status, 'needs_screenshot_or_hint')
  assert.equal(timeoutResponse.confidence, 0)
  assert.equal(timeoutResponse.debug.urlExtraction.status, 'timeout')
  assertNoPlaceOrDishClaims(timeoutResponse)
  console.log('PASS: URL timeout asks for a screenshot or restaurant name')

  const fetchFailureResponse = await analyzerWith(async () => {
    throw new Error('connection failed')
  })({ url: 'https://www.facebook.com/reel/failure' })
  assert.equal(fetchFailureResponse.status, 'needs_screenshot_or_hint')
  assert.equal(
    fetchFailureResponse.debug.urlExtraction.status,
    'fetch_failed',
  )
  assertNoPlaceOrDishClaims(fetchFailureResponse)
  console.log('PASS: URL fetch failure returns the safe fallback')

  const noMetadataResponse = await analyzerWith(async () =>
    htmlResponse('<html><head></head><body></body></html>'),
  )({ url: 'https://www.tiktok.com/@food/video/no-metadata' })
  assert.equal(noMetadataResponse.status, 'needs_screenshot_or_hint')
  assert.equal(noMetadataResponse.confidence, 0)
  assert.equal(
    noMetadataResponse.debug.urlExtraction.status,
    'no_metadata',
  )
  assertNoPlaceOrDishClaims(noMetadataResponse)
  assertStableResponseContract(noMetadataResponse)
  console.log('PASS: a page without metadata returns the screenshot fallback')

  const explicitHint = extractTextPlaceSignal({
    hint: ' Restaurant:   Com Tam Thanh Tu ',
  })
  assert.equal(explicitHint.candidateName, 'Com Tam Thanh Tu')
  assert.equal(explicitHint.usable, true)
  assert.equal(
    extractTextPlaceSignal({ hint: 'maybe somewhere nearby' }).usable,
    false,
  )
  console.log('PASS: only explicit place-shaped hints become candidates')

  const addressEntities = extractFoodMapEntities({
    ocrEvidence: {
      text: '84 Dang Van Ngu, P.10, Phu Nhuan',
      usable: true,
      confidence: 0.88,
      lines: [
        {
          text: '84 Dang Van Ngu, P.10, Phu Nhuan',
          confidence: 0.88,
          type: 'address',
        },
      ],
    },
    textSources: [],
    inputSignals: {},
  })
  assert.equal(addressEntities.status, 'address_found')
  assert.match(addressEntities.address.value, /Dang Van Ngu/i)
  assert.equal(addressEntities.address.source, 'ocr')
  assertEntitiesContract(addressEntities)
  console.log('PASS: Phase 4 extracts a Vietnamese address from OCR evidence')

  const phoneEntities = extractFoodMapEntities({
    ocrEvidence: {
      text: 'Delivery: 0964.050.030',
      usable: true,
      confidence: 0.82,
      lines: [
        {
          text: 'Delivery: 0964.050.030',
          confidence: 0.82,
          type: 'phone',
        },
      ],
    },
    textSources: [],
    inputSignals: {},
  })
  assert.equal(phoneEntities.status, 'unclear')
  assert.equal(phoneEntities.phones[0].normalized, '0964050030')
  assert.deepEqual(phoneEntities.priceHints, [])
  console.log('PASS: Phase 4 extracts Vietnamese phone numbers without price noise')

  const placeEntities = extractFoodMapEntities({
    ocrEvidence: {
      text: 'QUAN AN HOA SEN SAI GON',
      usable: true,
      confidence: 0.9,
      lines: [
        {
          text: 'QUAN AN HOA SEN SAI GON',
          confidence: 0.9,
          type: 'sign',
        },
      ],
    },
    textSources: [],
    inputSignals: {},
  })
  assert.equal(placeEntities.status, 'place_name_found')
  assert.match(placeEntities.placeName.value, /HOA SEN/i)
  console.log('PASS: Phase 4 extracts a sign-like place name')

  const cleanNumberedSignEntities = extractFoodMapEntities({
    ocrEvidence: {
      text: 'QUAN AN HOA SEN 247',
      usable: true,
      confidence: 0.84,
      lines: [
        {
          text: 'QUAN AN HOA SEN 247',
          confidence: 0.84,
          type: 'sign',
        },
      ],
    },
    textSources: [],
    inputSignals: {},
  })
  assert.equal(cleanNumberedSignEntities.status, 'place_name_found')
  assert.equal(cleanNumberedSignEntities.placeName.value, 'QUAN AN HOA SEN 247')
  assert.ok(cleanNumberedSignEntities.placeName.confidence < 1)
  console.log('PASS: Phase 4 accepts a clean short numbered sign as placeName')

  const menuBlockEntities = extractFoodMapEntities({
    ocrEvidence: {
      text: 'COM GA 35K PHO 45K BUN BO 50K BANH MI 25K',
      usable: true,
      confidence: 0.82,
      lines: [
        {
          text: 'COM GA 35K PHO 45K BUN BO 50K BANH MI 25K',
          confidence: 0.82,
          type: 'sign',
        },
      ],
    },
    textSources: [
      {
        type: 'ocr',
        text: 'COM GA 35K PHO 45K BUN BO 50K BANH MI 25K',
        confidence: 0.82,
        usable: true,
      },
    ],
    inputSignals: {},
  })
  assert.equal(menuBlockEntities.status, 'dish_only')
  assert.equal(menuBlockEntities.placeName.value, null)
  assert.ok(menuBlockEntities.dishNames.length >= 2)
  assert.ok(menuBlockEntities.priceHints.length >= 2)
  console.log('PASS: Phase 4 rejects long menu-like OCR blocks as placeName')

  const dishEntities = extractFoodMapEntities({
    ocrEvidence: {
      text: 'Com ga 35k, com suon 30k',
      usable: true,
      confidence: 0.82,
      lines: [
        {
          text: 'Com ga 35k, com suon 30k',
          confidence: 0.82,
          type: 'other',
        },
      ],
    },
    textSources: [],
    inputSignals: {},
  })
  assert.equal(dishEntities.status, 'dish_only')
  assert.ok(
    dishEntities.dishNames.some(
      (dish) => normalizeForAssert(dish.value) === 'com ga',
    ),
  )
  assert.ok(
    dishEntities.dishNames.some(
      (dish) => normalizeForAssert(dish.value) === 'com suon',
    ),
  )
  assert.deepEqual(
    dishEntities.priceHints.map((price) => normalizeForAssert(price.value)),
    ['35k', '30k'],
  )
  console.log('PASS: Phase 4 extracts dish names and price hints without a place claim')

  const unclearEntities = extractFoodMapEntities({
    ocrEvidence: {
      text: 'GHI GHIÍ ono',
      usable: true,
      confidence: 0.7,
      lines: [{ text: 'GHI GHIÍ ono', confidence: 0.7, type: 'sign' }],
    },
    textSources: [],
    inputSignals: {},
  })
  assert.equal(unclearEntities.status, 'unclear')
  assert.equal(unclearEntities.address.value, null)
  assert.equal(unclearEntities.placeName.value, null)
  assert.deepEqual(unclearEntities.dishNames, [])
  console.log('PASS: Phase 4 keeps noisy OCR unclear')

  const noisyLocationEntities = extractFoodMapEntities({
    ocrEvidence: {
      text: 'AREA FRAGMENT',
      usable: true,
      confidence: 0.72,
      lines: [{ text: 'AREA FRAGMENT', confidence: 0.72, type: 'sign' }],
    },
    textSources: [],
    inputSignals: {},
  })
  assert.equal(noisyLocationEntities.status, 'unclear')
  assert.equal(noisyLocationEntities.address.value, null)
  assert.deepEqual(noisyLocationEntities.locationHints, [])
  console.log('PASS: Phase 4 does not promote an OCR fragment to a location')

  const addressLocationQuery = buildFoodMapLocationQuery(addressEntities)
  assert.equal(addressLocationQuery.canResolveLocation, true)
  assert.match(addressLocationQuery.query, /^84 Dang Van Ngu/i)
  assert.ok(addressLocationQuery.confidence >= 0.7)
  assertLocationQueryContract(addressLocationQuery)
  console.log('PASS: address plus district forms a safe location query')

  const phoneLocationQuery = buildFoodMapLocationQuery({
    ...phoneEntities,
    locationHints: [
      {
        value: 'Ho Chi Minh City',
        type: 'city',
        confidence: 0.78,
        source: 'hint',
        evidence: 'Ho Chi Minh City',
      },
    ],
  })
  assert.equal(phoneLocationQuery.canResolveLocation, true)
  assert.match(phoneLocationQuery.query, /^0964050030/)
  assert.match(phoneLocationQuery.query, /Ho Chi Minh City/i)
  console.log('PASS: normalized Vietnamese phone plus city forms a safe query')

  const locationLabelAddressQuery = buildFoodMapLocationQuery({
    ...phoneEntities,
    address: {
      value: '9 Da Lat',
      confidence: 0.78,
      source: 'ocr',
      evidence: ['9 Da Lat'],
    },
    locationHints: [
      {
        value: 'Da Lat',
        type: 'city',
        confidence: 0.76,
        source: 'ocr',
        evidence: '9 Da Lat',
      },
    ],
  })
  assert.equal(locationLabelAddressQuery.canResolveLocation, true)
  assert.match(locationLabelAddressQuery.query, /^0964050030/)
  assert.doesNotMatch(locationLabelAddressQuery.query, /^9 Da Lat/i)
  assert.match(locationLabelAddressQuery.reason, /phone number/i)
  console.log('PASS: number plus city-only text is not treated as a street address')

  const placeLocationQuery = buildFoodMapLocationQuery(placeEntities)
  assert.equal(placeLocationQuery.canResolveLocation, true)
  assert.match(placeLocationQuery.query, /HOA SEN/i)
  assert.match(placeLocationQuery.query, /sai gon/i)
  console.log('PASS: clean place name plus location hint forms a safe query')

  const dishOnlyLocationQuery = buildFoodMapLocationQuery(dishEntities)
  assert.equal(dishOnlyLocationQuery.canResolveLocation, false)
  assert.equal(dishOnlyLocationQuery.query, null)
  assert.ok(
    dishOnlyLocationQuery.warnings.some((warning) =>
      /dish text alone/i.test(warning),
    ),
  )
  console.log('PASS: dish-only evidence cannot form a location query')

  const weakLocationQuery = buildFoodMapLocationQuery({
    address: { value: null, confidence: 0, source: null, evidence: [] },
    placeName: {
      value: 'GHI GHI GHI GHI GHI GHI',
      confidence: 0.72,
      source: 'ocr',
      evidence: ['GHI GHI GHI GHI GHI GHI'],
    },
    phones: [],
    dishNames: [],
    priceHints: [],
    locationHints: [
      {
        value: 'AREA FRAGMENT',
        type: 'unknown',
        confidence: 0.3,
        source: 'ocr',
        evidence: 'AREA FRAGMENT',
      },
    ],
  })
  assert.equal(weakLocationQuery.canResolveLocation, false)
  assert.equal(weakLocationQuery.query, null)
  console.log('PASS: noisy OCR plus a weak location remains unresolved')

  const menuLocationQuery = buildFoodMapLocationQuery(menuBlockEntities)
  assert.equal(menuBlockEntities.placeName.value, null)
  assert.equal(menuLocationQuery.canResolveLocation, false)
  assert.equal(menuLocationQuery.query, null)
  console.log('PASS: a long menu block cannot become a place-name query')

  const categoryPlaceQuery = buildFoodMapLocationQuery({
    address: { value: null, confidence: 0, source: null, evidence: [] },
    placeName: {
      value: 'Com Tam Huong Que',
      confidence: 0.82,
      source: 'ocr',
      evidence: ['Com Tam Huong Que'],
    },
    phones: [],
    dishNames: [
      {
        value: 'com tam',
        confidence: 0.85,
        source: 'ocr',
        evidence: 'Com Tam Huong Que',
      },
    ],
    priceHints: [],
    locationHints: [
      {
        value: 'District 5',
        type: 'district',
        confidence: 0.76,
        source: 'ocr',
        evidence: 'District 5',
      },
    ],
  })
  assert.equal(categoryPlaceQuery.canResolveLocation, true)
  assert.ok(categoryPlaceQuery.confidence <= 0.74)
  console.log('PASS: place plus dish and location is capped at medium confidence')

  const locationOnlyQuery = buildFoodMapLocationQuery({
    address: { value: null, confidence: 0, source: null, evidence: [] },
    placeName: { value: null, confidence: 0, source: null, evidence: [] },
    phones: [],
    dishNames: [],
    priceHints: [],
    locationHints: [
      {
        value: 'District 7',
        type: 'district',
        confidence: 0.8,
        source: 'ocr',
        evidence: 'District 7',
      },
    ],
  })
  assert.equal(locationOnlyQuery.canResolveLocation, false)
  assert.equal(locationOnlyQuery.query, null)
  console.log('PASS: a district or city alone cannot identify a place')

  for (const format of ['jpeg', 'png', 'webp']) {
    const buffer = await sharp({
      create: {
        width: 80,
        height: 60,
        channels: 3,
        background: '#ffffff',
      },
    })
      .toFormat(format)
      .toBuffer()
    const preprocessed = await preprocessLocalOcrImage({
      image: {
        buffer,
        size: buffer.length,
        mimetype: `image/${format}`,
        originalname: `controlled.${format}`,
      },
    })
    assert.equal(preprocessed.error, undefined)
    assert.ok(preprocessed.prepared.variants.length >= 4)
    assert.ok(
      preprocessed.prepared.variants.some(
        (variant) => variant.label === 'original',
      ),
    )
    assert.ok(
      preprocessed.prepared.variants.some(
        (variant) => variant.label === 'normalized',
      ),
    )
  }
  console.log('PASS: Sharp preprocessing handles JPEG, PNG, and WebP safely')

  const orientedBuffer = await sharp({
    create: {
      width: 120,
      height: 60,
      channels: 3,
      background: '#ffffff',
    },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
  const orientedImage = await preprocessLocalOcrImage({
    image: {
      buffer: orientedBuffer,
      size: orientedBuffer.length,
      mimetype: 'image/jpeg',
      originalname: 'oriented.jpg',
    },
  })
  const orientedNormalized = orientedImage.prepared.variants.find(
    (variant) => variant.label === 'normalized',
  )
  assert.equal(orientedNormalized.width, 60)
  assert.equal(orientedNormalized.height, 120)
  assert.equal(orientedNormalized.autoRotated, true)

  const largeBuffer = await sharp({
    create: {
      width: 2_600,
      height: 120,
      channels: 3,
      background: '#ffffff',
    },
  })
    .jpeg()
    .toBuffer()
  const largeImage = await preprocessLocalOcrImage({
    image: {
      buffer: largeBuffer,
      size: largeBuffer.length,
      mimetype: 'image/jpeg',
      originalname: 'large.jpg',
    },
  })
  const largeNormalized = largeImage.prepared.variants.find(
    (variant) => variant.label === 'normalized',
  )
  assert.ok(largeNormalized.width <= 2_400)
  assert.ok(largeNormalized.height <= 2_400)
  assert.equal(largeNormalized.resized, true)
  console.log('PASS: Sharp preprocessing auto-rotates and bounds large images')

  const gifEvidence = await extractLocalOcrSignals({
    image: {
      buffer: Buffer.from('GIF89a', 'ascii'),
      size: 6,
      mimetype: 'image/gif',
      originalname: 'animated.gif',
    },
  })
  assert.equal(gifEvidence.usable, false)
  assert.equal(gifEvidence.reason, 'unsupported_image')
  assert.match(gifEvidence.warnings[0], /GIF/i)
  console.log('PASS: GIF remains safely unsupported for local OCR')

  const repeatedGarbageEvidence = await extractLocalOcrSignals(
    {
      image: {
        buffer: tinyPng,
        size: tinyPng.length,
        mimetype: 'image/png',
        originalname: 'controlled-noise.png',
      },
    },
    {
      recognizeImage: async () => ({
        data: {
          text: 'ZXQ ZXQ ZXQ ZXQ ZXQ ZXQ ZXQ ZXQ',
          confidence: 99,
        },
      }),
      maxPasses: 1,
    },
  )
  assert.equal(repeatedGarbageEvidence.usable, false)
  assert.equal(repeatedGarbageEvidence.reason, 'low_confidence')
  assert.equal(repeatedGarbageEvidence.text, null)
  assert.ok(repeatedGarbageEvidence.debug.rejectedLines.length >= 1)
  console.log('PASS: repeated OCR garbage is rejected despite high raw confidence')

  const phoneWithGarbageEvidence = await extractLocalOcrSignals(
    {
      image: {
        buffer: tinyPng,
        size: tinyPng.length,
        mimetype: 'image/png',
        originalname: 'mixed-phone-evidence.png',
      },
    },
    {
      recognizeImage: async () => ({
        data: {
          text: 'HOTLINE: 0901.234.567\nZXQ ZXQ ZXQ ZXQ\n@@@ ###',
          confidence: 72,
        },
      }),
      maxPasses: 1,
    },
  )
  assert.equal(phoneWithGarbageEvidence.usable, true)
  assert.match(phoneWithGarbageEvidence.text, /0901234567/)
  assert.doesNotMatch(phoneWithGarbageEvidence.text, /ZXQ/)
  assert.equal(phoneWithGarbageEvidence.strongLines[0].type, 'phone')
  assert.equal(
    phoneWithGarbageEvidence.strongLines[0].clusterType,
    'contact',
  )
  assert.ok(phoneWithGarbageEvidence.debug.rejectedLines.length >= 1)
  console.log('PASS: valid phone is strong while mixed garbage is rejected')

  const contextualContactEvidence = await extractLocalOcrSignals(
    {
      image: {
        buffer: tinyPng,
        size: tinyPng.length,
        mimetype: 'image/png',
        originalname: 'contextual-contact.png',
      },
    },
    {
      recognizeImage: async ({ label }) => ({
        data: {
          text: label.includes('alt')
            ? 'Dien thoai 2821 0720'
            : 'DT: 28210720',
          confidence: 66,
        },
      }),
      maxPasses: 2,
    },
  )
  assert.equal(contextualContactEvidence.strongLines.length, 1)
  assert.equal(
    contextualContactEvidence.strongLines[0].text,
    'Dien thoai 28210720',
  )
  assert.equal(contextualContactEvidence.strongLines[0].supportCount, 2)
  assert.equal(
    contextualContactEvidence.strongLines[0].clusterType,
    'contact',
  )
  assert.ok(
    contextualContactEvidence.strongLines[0].evidenceVariants.length >= 2,
  )
  const contextualContactEntities = extractFoodMapEntities({
    ocrEvidence: contextualContactEvidence,
  })
  assert.equal(contextualContactEntities.phones[0].normalized, '28210720')
  console.log('PASS: contextual local contact variants canonicalize once')

  const storefrontConsensusEvidence = await extractLocalOcrSignals(
    {
      image: {
        buffer: tinyPng,
        size: tinyPng.length,
        mimetype: 'image/png',
        originalname: 'storefront-consensus.png',
      },
    },
    {
      recognizeImage: async ({ label }) => ({
        data: {
          text: label.includes('alt')
            ? '47 Sample Street District 2 Dien thoai 2830 4060\nZXQ ZXQ'
            : '47 Sample Street, District 2, DT: 28304060\n@@@',
          confidence: 65,
        },
      }),
      maxPasses: 2,
    },
  )
  assert.equal(storefrontConsensusEvidence.strongLines.length, 1)
  assert.equal(
    storefrontConsensusEvidence.strongLines[0].clusterType,
    'contact',
  )
  assert.equal(storefrontConsensusEvidence.strongLines[0].supportCount, 2)
  assert.match(storefrontConsensusEvidence.text, /28304060/)
  assert.doesNotMatch(storefrontConsensusEvidence.text, /ZXQ/)
  assert.equal(storefrontConsensusEvidence.lines.length, 1)
  console.log('PASS: noisy storefront contact variants produce one canonical line')

  const randomNumericEvidence = await extractLocalOcrSignals(
    {
      image: {
        buffer: tinyPng,
        size: tinyPng.length,
        mimetype: 'image/png',
        originalname: 'numeric-noise.png',
      },
    },
    {
      recognizeImage: async ({ label }) => ({
        data: {
          text: label.includes('alt')
            ? 'abc 3422724840 xyz'
            : '3422724840',
          confidence: 94,
        },
      }),
      maxPasses: 2,
    },
  )
  assert.equal(randomNumericEvidence.strongLines.length, 0)
  assert.equal(
    randomNumericEvidence.lines.some((line) => line.type === 'phone'),
    false,
  )
  assert.doesNotMatch(randomNumericEvidence.text || '', /3422724840/)
  console.log('PASS: numeric noise without contact context is rejected')

  const addressWithGarbageEvidence = await extractLocalOcrSignals(
    {
      image: {
        buffer: tinyPng,
        size: tinyPng.length,
        mimetype: 'image/png',
        originalname: 'mixed-address-evidence.png',
      },
    },
    {
      recognizeImage: async () => ({
        data: {
          text: '125 Example Road, District 4\nQXZ QXZ QXZ QXZ',
          confidence: 68,
        },
      }),
      maxPasses: 1,
    },
  )
  assert.equal(addressWithGarbageEvidence.usable, true)
  assert.match(addressWithGarbageEvidence.text, /125 Example Road/i)
  assert.doesNotMatch(addressWithGarbageEvidence.text, /QXZ/)
  assert.equal(addressWithGarbageEvidence.strongLines[0].type, 'address')
  console.log('PASS: supported address is strong while garbage is rejected')

  const groupedAddressEvidence = await extractLocalOcrSignals(
    {
      image: {
        buffer: tinyPng,
        size: tinyPng.length,
        mimetype: 'image/png',
        originalname: 'grouped-address.png',
      },
    },
    {
      recognizeImage: async () => ({
        data: {
          text: '125\nExample Road\nDistrict 4',
          confidence: 63,
        },
      }),
      maxPasses: 1,
    },
  )
  assert.ok(
    groupedAddressEvidence.strongLines.some(
      (line) =>
        line.type === 'address' &&
        /125/i.test(line.text) &&
        /Example Road/i.test(line.text) &&
        /District 4/i.test(line.text),
    ),
  )
  assert.equal(groupedAddressEvidence.strongLines[0].clusterType, 'address_admin')
  assert.ok(groupedAddressEvidence.strongLines[0].evidenceVariants.length >= 3)
  console.log('PASS: complementary address fragments group without invented text')

  const weakLocationEvidence = await extractLocalOcrSignals(
    {
      image: {
        buffer: tinyPng,
        size: tinyPng.length,
        mimetype: 'image/png',
        originalname: 'weak-location.png',
      },
    },
    {
      recognizeImage: async () => ({
        data: {
          text: 'District 4',
          confidence: 62,
        },
      }),
      maxPasses: 1,
    },
  )
  assert.equal(weakLocationEvidence.strongLines.length, 0)
  assert.equal(weakLocationEvidence.weakLines.length, 1)
  assert.equal(weakLocationEvidence.weakLines[0].type, 'address')
  const weakLocationEntities = extractFoodMapEntities({
    ocrEvidence: weakLocationEvidence,
  })
  assert.equal(weakLocationEntities.address.value, null)
  assert.equal(weakLocationEntities.status, 'unclear')
  console.log('PASS: location-only fragment remains weak and is not an address')

  const menuOcrEvidence = await extractLocalOcrSignals(
    {
      image: {
        buffer: tinyPng,
        size: tinyPng.length,
        mimetype: 'image/png',
        originalname: 'controlled-menu.png',
      },
    },
    {
      recognizeImage: async ({ label }) => ({
        data: label.includes('top')
          ? {
              text: 'COM GA 35K\nPHO 45K',
              confidence: 64,
            }
          : {
              text:
                'COM GA 35K PHO 45K COM SUON 30K BANH MI 25K RANDOM FRAGMENT RANDOM FRAGMENT RANDOM FRAGMENT RANDOM FRAGMENT',
              confidence: 91,
            },
      }),
      maxPasses: 5,
    },
  )
  assert.equal(menuOcrEvidence.usable, true)
  assert.match(menuOcrEvidence.text, /COM GA/i)
  assert.doesNotMatch(menuOcrEvidence.text, /RANDOM FRAGMENT/)
  assert.ok(menuOcrEvidence.strongLines.length >= 1)
  assert.ok(menuOcrEvidence.debug.rejectedLines.length >= 1)
  assert.equal(menuOcrEvidence.placeName, undefined)
  assert.equal(menuOcrEvidence.dishNames, undefined)
  const menuEvidenceEntities = extractFoodMapEntities({
    ocrEvidence: menuOcrEvidence,
  })
  assert.equal(menuEvidenceEntities.placeName.value, null)
  console.log('PASS: noisy menu block is filtered while bounded menu lines remain')

  const consensusEvidence = await extractLocalOcrSignals(
    {
      image: {
        buffer: tinyPng,
        size: tinyPng.length,
        mimetype: 'image/png',
        originalname: 'consensus.png',
      },
    },
    {
      recognizeImage: async ({ label }) => ({
        data: {
          text: label.includes('alt')
            ? 'RESTAURANT ALPHA CENTRAL'
            : 'RESTAURANT ALPHA',
          confidence: 58,
        },
      }),
      maxPasses: 2,
    },
  )
  assert.equal(consensusEvidence.strongLines.length, 1)
  assert.equal(consensusEvidence.strongLines[0].supportCount, 2)
  assert.equal(
    consensusEvidence.strongLines[0].clusterType,
    'sign_business',
  )
  assert.ok(consensusEvidence.strongLines[0].displayText)
  assert.ok(consensusEvidence.strongLines[0].evidenceVariants.length >= 2)
  assert.equal(
    consensusEvidence.lines.filter((line) => /RESTAURANT ALPHA/i.test(line.text))
      .length,
    1,
  )
  console.log('PASS: fuzzy consensus boosts and deduplicates a useful sign line')

  const localOcrShape = await extractLocalOcrSignals(
    {
      image: {
        buffer: tinyPng,
        size: tinyPng.length,
        mimetype: 'image/png',
        originalname: 'social-food.png',
      },
    },
    {
      recognizeImage: async () => ({
        data: {
          text: [
            'COM TAM THANH TU',
            'COM TAM THANH TU',
            '123 Le Loi, District 1',
            '0909 000 111',
          ].join('\n'),
          confidence: 87,
        },
      }),
    },
  )
  assert.equal(localOcrShape.usable, true)
  assert.equal(localOcrShape.ocrUsable, true)
  assert.equal(localOcrShape.reason, 'usable')
  assert.equal(localOcrShape.lines.length, 3)
  assert.deepEqual(
    [...new Set(localOcrShape.lines.map((line) => line.type))].sort(),
    ['address', 'phone', 'sign'],
  )
  assert.match(localOcrShape.text, /COM TAM THANH TU/)
  console.log('PASS: local OCR evidence normalizes, dedupes, and labels lines')

  const localOcrNoText = await extractLocalOcrSignals(
    {
      image: {
        buffer: tinyPng,
        size: tinyPng.length,
        mimetype: 'image/png',
        originalname: 'blank.png',
      },
    },
    {
      recognizeImage: async () => ({
        data: { text: '', confidence: 95 },
      }),
    },
  )
  assert.equal(localOcrNoText.usable, false)
  assert.equal(localOcrNoText.reason, 'no_text')
  assert.equal(localOcrNoText.text, null)
  console.log('PASS: local OCR no-text image returns safe failure evidence')

  const localOcrTimeout = await extractLocalOcrSignals(
    {
      image: {
        buffer: tinyPng,
        size: tinyPng.length,
        mimetype: 'image/png',
        originalname: 'timeout.png',
      },
    },
    {
      recognizeImage: () => new Promise(() => {}),
      timeoutMs: 1,
      maxPasses: 1,
    },
  )
  assert.equal(localOcrTimeout.usable, false)
  assert.equal(localOcrTimeout.reason, 'timeout')
  console.log('PASS: local OCR timeout returns safe failure evidence')

  const imageResult = await analyzeFoodMapSocialDiscovery({
    image: {
      buffer: tinyPng,
      size: tinyPng.length,
      mimetype: 'image/png',
      originalname: 'social-food.png',
    },
  }, {
    extractLocalOcrSignals: mockOcrSuccess,
  })
  assert.equal(imageResult.status, 'address_found')
  assert.ok(imageResult.confidence >= 0.6)
  assert.ok(imageResult.debug.steps.includes('local_ocr_completed'))
  assert.ok(!imageResult.debug.steps.includes('ocr_deferred_part_3'))
  assert.equal(imageResult.inputSignals.ocrUsable, true)
  assert.match(imageResult.inputSignals.ocrText, /COM TAM THANH TU/)
  assert.equal(imageResult.ocrEvidence.usable, true)
  assert.equal(imageResult.ocrEvidence.lines[1].type, 'address')
  assert.match(imageResult.entities.address.value, /123 Le Loi/i)
  assert.equal(imageResult.locationQuery.canResolveLocation, true)
  assert.match(imageResult.locationQuery.query, /^123 Le Loi/i)
  assert.ok(imageResult.debug.steps.includes('entity_extraction_completed'))
  assert.equal(
    imageResult.textSources.some((source) => source.type === 'ocr'),
    true,
  )
  assertNoPlaceOrDishClaims(imageResult)
  assertStableResponseContract(imageResult)
  console.log('PASS: image input returns OCR entities without DB place or draft claims')

  const lowConfidenceImageResult = await analyzeFoodMapSocialDiscovery(
    {
      image: {
        buffer: tinyPng,
        size: tinyPng.length,
        mimetype: 'image/png',
        originalname: 'noisy.png',
      },
    },
    {
      extractLocalOcrSignals: mockOcrLowConfidence,
    },
  )
  assert.equal(lowConfidenceImageResult.status, 'unclear')
  assert.equal(lowConfidenceImageResult.inputSignals.ocrUsable, false)
  assert.equal(lowConfidenceImageResult.inputSignals.ocrText, null)
  assert.equal(lowConfidenceImageResult.ocrEvidence.reason, 'low_confidence')
  assert.equal(lowConfidenceImageResult.entities.status, 'unclear')
  assert.equal(lowConfidenceImageResult.locationQuery.canResolveLocation, false)
  assert.equal(lowConfidenceImageResult.locationQuery.query, null)
  assert.ok(
    lowConfidenceImageResult.debug.steps.includes(
      'entity_extraction_no_reliable_entities',
    ),
  )
  assertNoPlaceOrDishClaims(lowConfidenceImageResult)
  console.log('PASS: low-confidence OCR remains evidence-only and hidden from input text')

  const timeoutImageResult = await analyzeFoodMapSocialDiscovery(
    {
      image: {
        buffer: tinyPng,
        size: tinyPng.length,
        mimetype: 'image/png',
        originalname: 'timeout.png',
      },
    },
    {
      extractLocalOcrSignals: mockOcrTimeout,
    },
  )
  assert.equal(timeoutImageResult.status, 'unclear')
  assert.equal(timeoutImageResult.ocrEvidence.reason, 'timeout')
  assert.equal(timeoutImageResult.inputSignals.ocrUsable, false)
  assert.equal(timeoutImageResult.entities.status, 'unclear')
  assert.equal(timeoutImageResult.locationQuery.canResolveLocation, false)
  assertNoPlaceOrDishClaims(timeoutImageResult)
  console.log('PASS: OCR timeout is returned as safe Phase 3 evidence failure')

  const hintResult = await analyzeFoodMapSocialDiscovery({
    hint: 'place: Com Tam Thanh Tu',
  })
  assert.equal(hintResult.status, 'place_name_found')
  assert.equal(hintResult.inputSignals.hint, 'place: Com Tam Thanh Tu')
  assert.match(hintResult.entities.placeName.value, /Com Tam Thanh Tu/i)
  assert.equal(hintResult.locationQuery.canResolveLocation, false)
  assert.equal(hintResult.locationQuery.query, null)
  assert.ok(
    hintResult.debug.steps.includes('explicit_hint_noted_for_part_4'),
  )
  assert.ok(hintResult.debug.steps.includes('entity_extraction_completed'))
  assertNoPlaceOrDishClaims(hintResult)
  console.log('PASS: hint input extracts a Phase 4 place name without matching')

  assert.deepEqual(FOOD_MAP_SOCIAL_STATUSES, [
    'address_found',
    'place_name_found',
    'dish_only',
    'place_found_in_foodmap',
    'place_found_not_in_foodmap',
    'dish_identified_only',
    'needs_screenshot_or_hint',
    'unclear',
  ])
  assert.throws(
    () =>
      createFoodMapSocialResponse({
        status: 'invented_status',
        message: 'Invalid',
        inputSignals: {},
      }),
    /Unsupported Food Map social discovery status/,
  )
  console.log('PASS: response statuses remain explicit and validated')

  const testServer = await startTestServer(
    analyzerWith(async () => htmlResponse(metadataHtml), {}, {
      extractLocalOcrSignals: mockOcrLowConfidence,
    }),
  )
  try {
    const emptyResponse = await readJson(
      await fetch(testServer.baseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    )
    assert.equal(emptyResponse.status, 400)
    assert.match(emptyResponse.body.message, /at least one/i)
    console.log('PASS: route rejects requests without an input')

    const invalidUrlResponse = await readJson(
      await fetch(testServer.baseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'file:///etc/passwd' }),
      }),
    )
    assert.equal(invalidUrlResponse.status, 400)
    assert.equal(invalidUrlResponse.body.field, 'url')
    console.log('PASS: route accepts only HTTP or HTTPS URL input')

    const urlResponse = await readJson(
      await fetch(testServer.baseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: 'https://www.facebook.com/reel/example',
        }),
      }),
    )
    assert.equal(urlResponse.status, 200)
    assert.equal(urlResponse.body.status, 'place_name_found')
    assert.ok(urlResponse.body.confidence >= 0.5)
    assert.equal(urlResponse.body.inputSignals.platform, 'facebook')
    assert.equal(urlResponse.body.inputSignals.title, 'Com Tam Thanh Tu')
    assert.match(urlResponse.body.entities.placeName.value, /Com Tam Thanh Tu/i)
    assertNoPlaceOrDishClaims(urlResponse.body)
    console.log('PASS: route returns mocked URL metadata with Phase 4 entities')

    const sourceUrlAliasResponse = await readJson(
      await fetch(testServer.baseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: 'https://www.facebook.com/reel/source-url-alias',
        }),
      }),
    )
    assert.equal(sourceUrlAliasResponse.status, 200)
    assert.equal(
      sourceUrlAliasResponse.body.inputSignals.url,
      'https://www.facebook.com/reel/source-url-alias',
    )
    console.log('PASS: route accepts sourceUrl as a compatibility alias')

    const imageForm = new FormData()
    imageForm.append(
      'image',
      new Blob([tinyPng], { type: 'image/png' }),
      'social-food.png',
    )
    const imageResponse = await readJson(
      await fetch(testServer.baseUrl, {
        method: 'POST',
        body: imageForm,
      }),
    )
    assert.equal(imageResponse.status, 200)
    assert.equal(imageResponse.body.status, 'unclear')
    assert.equal(imageResponse.body.inputSignals.ocrUsable, false)
    assert.equal(imageResponse.body.ocrEvidence.reason, 'low_confidence')
    assert.equal(imageResponse.body.entities.status, 'unclear')
    console.log('PASS: route accepts a supported multipart image and returns OCR evidence')

    const invalidImageForm = new FormData()
    invalidImageForm.append(
      'image',
      new Blob(['not an image'], { type: 'text/plain' }),
      'notes.txt',
    )
    const invalidImageResponse = await readJson(
      await fetch(testServer.baseUrl, {
        method: 'POST',
        body: invalidImageForm,
      }),
    )
    assert.equal(invalidImageResponse.status, 400)
    assert.equal(invalidImageResponse.body.field, 'image')
    console.log('PASS: route still rejects unsupported multipart file types')
  } finally {
    await testServer.close()
  }

  console.log('Food Map social discovery Phase 4 tests passed')
}

await run()
