import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
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
  detectSocialPlatform,
  extractSocialUrlSignals,
  isPrivateIpAddress,
} from '../services/socialUrlExtractionService.js'
import {
  extractTextPlaceSignal,
} from '../services/textPlaceSignalExtractor.js'

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

function analyzerWith(fetchImpl, overrides = {}) {
  return (input) =>
    analyzeFoodMapSocialDiscovery(input, {
      extractSocialUrlSignals: extractorWith(fetchImpl, overrides),
    })
}

function assertNoPlaceOrDishClaims(result) {
  assert.equal(result.place.name, null)
  assert.equal(result.place.existsInFoodMap, false)
  assert.equal(result.place.matchedFoodMapPlace, null)
  assert.equal(result.dishFallback.broadDish, null)
  assert.equal(result.dishFallback.possibleDish, null)
  assert.deepEqual(result.dishFallback.topCandidates, [])
  assert.equal(result.addPlaceDraft, null)
}

function assertStableResponseContract(result) {
  assert.deepEqual(Object.keys(result), [
    'status',
    'confidence',
    'message',
    'inputSignals',
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
  assert.equal(successResponse.status, 'unclear')
  assert.equal(successResponse.confidence, 0.2)
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
  assertNoPlaceOrDishClaims(successResponse)
  assertStableResponseContract(successResponse)
  console.log('PASS: URL metadata success populates the stable response contract')

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

  const imageResult = await analyzeFoodMapSocialDiscovery({
    image: {
      buffer: tinyPng,
      size: tinyPng.length,
      mimetype: 'image/png',
      originalname: 'social-food.png',
    },
  })
  assert.equal(imageResult.status, 'unclear')
  assert.equal(imageResult.confidence, 0)
  assert.ok(imageResult.debug.steps.includes('ocr_deferred_part_3'))
  assertNoPlaceOrDishClaims(imageResult)
  console.log('PASS: image input still makes no OCR, place, or dish claim')

  const hintResult = await analyzeFoodMapSocialDiscovery({
    hint: 'place: Com Tam Thanh Tu',
  })
  assert.equal(hintResult.status, 'unclear')
  assert.equal(hintResult.inputSignals.hint, 'place: Com Tam Thanh Tu')
  assert.ok(
    hintResult.debug.steps.includes('explicit_hint_noted_for_part_4'),
  )
  assertNoPlaceOrDishClaims(hintResult)
  console.log('PASS: hint input remains unverified and contract-compatible')

  assert.deepEqual(FOOD_MAP_SOCIAL_STATUSES, [
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
    analyzerWith(async () => htmlResponse(metadataHtml)),
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
    assert.equal(urlResponse.body.status, 'unclear')
    assert.equal(urlResponse.body.confidence, 0.2)
    assert.equal(urlResponse.body.inputSignals.platform, 'facebook')
    assert.equal(urlResponse.body.inputSignals.title, 'Com Tam Thanh Tu')
    console.log('PASS: route returns mocked public URL metadata without live access')

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
    console.log('PASS: route still accepts a supported multipart image')

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

  console.log('Food Map social discovery Part 2 tests passed: 20')
}

await run()
