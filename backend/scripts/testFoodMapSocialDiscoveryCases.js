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
  isDescriptiveSocialTitle,
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
  resolveSocialInput,
} from '../services/socialInputResolverService.js'
import {
  parseYouTubeVideoId,
  resolveYouTubeUrl,
} from '../services/socialUrlProviders/youtubeUrlProvider.js'
import {
  runFoodMapEvidenceValidation,
  shouldRunGeminiEvidenceValidation,
  validateFoodMapEvidenceWithGemini,
} from '../services/geminiEvidenceValidationService.js'
import {
  extractTextPlaceSignal,
} from '../services/textPlaceSignalExtractor.js'
import {
  extractLocalOcrSignals,
  preprocessLocalOcrImage,
} from '../services/localOcrService.js'

process.env.FOOD_MAP_EVIDENCE_VALIDATOR = 'rule'

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
  text: 'COM TAM THANH TU\n123 Le Loi, District 1\nĐT: 0909 000 111',
  usable: true,
  ocrUsable: true,
  confidence: 0.87,
  reason: 'usable',
  lines: [
    { text: 'COM TAM THANH TU', confidence: 0.91, type: 'sign' },
    { text: '123 Le Loi, District 1', confidence: 0.84, type: 'address' },
    { text: 'ĐT: 0909 000 111', confidence: 0.86, type: 'phone' },
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
      metadataOcrEnabled: false,
      evidenceValidatorMode: 'rule',
      ...dependencyOverrides,
    })
}

function metadataSignals(overrides = {}) {
  return {
    finalUrl: null,
    platform: 'web',
    title: null,
    description: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    twitterTitle: null,
    twitterDescription: null,
    twitterImage: null,
    canonicalUrl: null,
    siteName: null,
    rawTextSnippet: null,
    jsonLdBusinesses: [],
    extractionStatus: 'success',
    warnings: [],
    ...overrides,
  }
}

const disabledLocationResolution = async () => ({
  status: 'provider_disabled',
  resolvedLocation: null,
  candidates: [],
  confidence: 0,
  reason: 'provider_disabled',
  warnings: [],
})

function rulePipelineDependencies(overrides = {}) {
  return {
    extractFoodMapEntities,
    resolveFoodMapLocation: disabledLocationResolution,
    metadataOcrEnabled: false,
    evidenceValidatorMode: 'rule',
    ...overrides,
  }
}

function geminiValidationResult(overrides = {}) {
  return {
    status: 'validated',
    confidence: 0.9,
    correctedEntities: {
      placeName: null,
      address: null,
      phones: [],
      dishNames: [],
      locationHints: [],
      ...(overrides.correctedEntities || {}),
    },
    rejectedEntities: [],
    canResolveLocation: false,
    recommendedNextAction: 'ask_for_hint',
    warnings: [],
    ...overrides,
    correctedEntities: {
      placeName: null,
      address: null,
      phones: [],
      dishNames: [],
      locationHints: [],
      ...(overrides.correctedEntities || {}),
    },
  }
}

function mockedGeminiDependencies(result, overrides = {}) {
  return rulePipelineDependencies({
    evidenceValidatorMode: 'gemini',
    geminiEvidenceValidationOptions: {
      apiKey: 'mock-gemini-key',
      model: 'mock-gemini-model',
      invokeGemini: async () => result,
    },
    ...overrides,
  })
}

function resolvedYouTubeEvidence({
  title,
  thumbnailText = null,
  warnings = [],
} = {}) {
  const textSources = [
    title
      ? {
          type: 'youtube_title',
          text: title,
          confidence: 0.66,
          source: 'youtube_api',
        }
      : null,
    thumbnailText
      ? {
          type: 'thumbnail_ocr',
          text: thumbnailText,
          confidence: 0.42,
          source: 'youtube_thumbnail',
        }
      : null,
  ].filter(Boolean)
  return {
    inputType: 'youtube_url',
    sourceUrl: 'https://www.youtube.com/shorts/test-video',
    platform: 'youtube',
    textSources,
    mediaSources: [],
    warnings,
    debug: {
      provider: 'youtube',
      extractionStatus: 'success',
      metadataOcrStatus: thumbnailText ? 'usable' : 'not_available',
      videoId: 'test-video',
      urlEvidence: {
        platform: 'youtube',
        provider: 'youtube',
        resolvedInputType: 'youtube_url',
        extractionStatus: 'success',
        videoId: 'test-video',
        title: title || null,
        description: null,
        channelTitle: 'Test Channel',
        publishedAt: null,
        ogTitle: null,
        ogDescription: null,
        jsonLdEvidence: [],
        thumbnailUrl: null,
        thumbnailOcrStatus: thumbnailText ? 'usable' : 'not_available',
        warnings,
      },
    },
    mediaOcrEvidence: thumbnailText
      ? {
          text: thumbnailText,
          usable: true,
          ocrUsable: true,
          confidence: 0.42,
          reason: 'usable',
          lines: [],
          strongLines: [],
          weakLines: [],
          warnings: [],
          debug: { provider: 'mock' },
        }
      : null,
  }
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
  assert.deepEqual(Object.keys(entities).slice(0, 9), [
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
  if (Object.hasOwn(entities, 'extractorUsed')) {
    assert.equal(typeof entities.extractorUsed, 'string')
    assert.equal(typeof entities.mergeDebug, 'object')
  }
}

function assertLocationQueryContract(locationQuery) {
  assert.deepEqual(Object.keys(locationQuery), [
    'query',
    'canResolveLocation',
    'confidence',
    'score',
    'reason',
    'strategy',
    'components',
    'evidence',
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
  assert.equal(typeof locationQuery.score, 'number')
  assert.equal(typeof locationQuery.reason, 'string')
  assert.equal(typeof locationQuery.strategy, 'string')
  assert.ok(Array.isArray(locationQuery.components.phones))
  assert.ok(Array.isArray(locationQuery.components.dishNames))
  assert.ok(Array.isArray(locationQuery.components.locationHints))
  assert.ok(Array.isArray(locationQuery.components.priceHints))
  assert.ok(Array.isArray(locationQuery.evidence))
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
    'locationResolution',
    'nextAction',
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
  assert.equal(typeof result.locationResolution.status, 'string')
  assert.ok(Array.isArray(result.locationResolution.candidates))
  assert.equal(typeof result.nextAction.type, 'string')
  assert.equal(typeof result.nextAction.message, 'string')
  assert.equal(typeof result.nextAction.payload, 'object')
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

  const youtubeVideoId = 'UElkbCq1pw8'
  assert.equal(
    parseYouTubeVideoId(
      `https://www.youtube.com/shorts/${youtubeVideoId}?si=abc`,
    ),
    youtubeVideoId,
  )
  assert.equal(
    detectSocialPlatform(
      `https://www.youtube.com/shorts/${youtubeVideoId}?si=abc`,
    ),
    'youtube',
  )
  assert.equal(
    parseYouTubeVideoId(
      `https://www.youtube.com/watch?v=${youtubeVideoId}&t=10`,
    ),
    youtubeVideoId,
  )
  assert.equal(
    parseYouTubeVideoId(`https://youtu.be/${youtubeVideoId}`),
    youtubeVideoId,
  )
  assert.equal(
    parseYouTubeVideoId(
      `https://m.youtube.com/watch?v=${youtubeVideoId}`,
    ),
    youtubeVideoId,
  )
  console.log('PASS: YouTube watch, mobile, short, and youtu.be IDs parse safely')

  const firstClassHint = await resolveSocialInput(
    { hint: 'Quán cháo lòng Mộc Quận 5' },
    { metadataOcrEnabled: false },
  )
  const firstClassHintSource = firstClassHint.textSources.find(
    (source) => source.type === 'user_hint',
  )
  assert.deepEqual(firstClassHintSource, {
    type: 'user_hint',
    text: 'Quán cháo lòng Mộc Quận 5',
    confidence: 0.95,
    source: 'user_hint',
  })
  console.log('PASS: user hint becomes a first-class text source')

  const hintAddressResult = await analyzeFoodMapSocialDiscovery(
    {
      hint: '65 Đường Láng, Đống Đa, Hà Nội',
    },
    rulePipelineDependencies(),
  )
  assert.equal(hintAddressResult.entities.address.source, 'hint')
  assert.match(hintAddressResult.entities.address.value, /Đường Láng/i)
  assert.ok(
    hintAddressResult.entities.address.evidence.some((item) =>
      /Đống Đa/i.test(item),
    ),
  )
  assert.ok(
    hintAddressResult.entities.locationHints.some((item) =>
      /Ha Noi|Hà Nội/i.test(item.value),
    ),
  )
  assert.equal(hintAddressResult.locationQuery.canResolveLocation, true)
  assert.match(hintAddressResult.locationQuery.query, /Đường Láng/i)
  console.log('PASS: hint-only address produces evidence-backed location query')

  const weakSocialMetadata = async ({ url }) =>
    metadataSignals({
      finalUrl: url,
      platform: 'instagram',
      ogTitle: 'cháo',
    })
  const weakUrlStrongHint = await analyzeFoodMapSocialDiscovery(
    {
      url: 'https://www.instagram.com/reel/public-example',
      hint: 'Quán cháo lòng Mộc Quận 5',
    },
    rulePipelineDependencies({
      extractSocialUrlSignals: weakSocialMetadata,
    }),
  )
  assert.equal(
    weakUrlStrongHint.textSources.some(
      (source) =>
        source.type === 'user_hint' &&
        source.source === 'user_hint' &&
        source.confidence === 0.95,
    ),
    true,
  )
  assert.ok(
    weakUrlStrongHint.entities.dishNames.some((item) =>
      /cháo/i.test(item.value),
    ),
  )
  assert.ok(
    weakUrlStrongHint.entities.locationHints.some((item) =>
      /quan 5|quận 5/i.test(item.value),
    ),
  )
  assert.equal(weakUrlStrongHint.entities.placeName.source, 'hint')
  assert.equal(weakUrlStrongHint.locationQuery.canResolveLocation, true)
  assert.match(weakUrlStrongHint.locationQuery.query, /quan 5|quận 5/i)
  assert.ok(weakUrlStrongHint.debug.warnings.includes('weak_url_metadata'))
  assert.equal(weakUrlStrongHint.debug.urlEvidence.platform, 'instagram')
  assert.equal(
    weakUrlStrongHint.debug.urlEvidence.provider,
    'generic_social',
  )
  assert.equal(
    weakUrlStrongHint.debug.urlEvidence.resolvedInputType,
    'generic_social_url',
  )
  assert.equal(weakUrlStrongHint.debug.urlEvidence.ogTitle, 'cháo')
  console.log('PASS: strong hint rescues weak one-word social metadata')

  const weakUrlOnly = await analyzeFoodMapSocialDiscovery(
    {
      url: 'https://www.instagram.com/reel/weak-public-example',
    },
    rulePipelineDependencies({
      extractSocialUrlSignals: weakSocialMetadata,
    }),
  )
  assert.equal(weakUrlOnly.status, 'dish_only')
  assert.equal(weakUrlOnly.locationQuery.canResolveLocation, false)
  assert.equal(weakUrlOnly.nextAction.type, 'ask_for_hint')
  assert.equal(weakUrlOnly.place.existsInFoodMap, false)
  console.log('PASS: weak one-word URL evidence remains dish-only and asks for a hint')

  const dishOnlyHint = await analyzeFoodMapSocialDiscovery(
    { hint: 'cháo' },
    rulePipelineDependencies(),
  )
  assert.equal(dishOnlyHint.status, 'dish_only')
  assert.equal(dishOnlyHint.locationQuery.canResolveLocation, false)
  assert.notEqual(dishOnlyHint.nextAction.type, 'focus_existing_place')
  assert.notEqual(dishOnlyHint.nextAction.type, 'review_draft_place')
  console.log('PASS: vague dish-only hint cannot resolve or claim a place')

  let missingKeyApiCalls = 0
  const missingYoutubeKey = await resolveYouTubeUrl(
    {
      url: `https://www.youtube.com/shorts/${youtubeVideoId}`,
    },
    {
      apiKey: '',
      extractUrlSignals: async ({ url }) =>
        metadataSignals({
          finalUrl: url,
          platform: 'youtube',
          extractionStatus: 'blocked',
        }),
      fetchYouTubeApi: async () => {
        missingKeyApiCalls += 1
        return { items: [] }
      },
      fetchOEmbed: async () => ({
        title: 'Public food short',
        author_name: 'Public channel',
        thumbnail_url: 'https://images.example.test/youtube-thumb.jpg',
      }),
    },
  )
  assert.equal(missingKeyApiCalls, 0)
  assert.ok(missingYoutubeKey.warnings.includes('youtube_api_key_missing'))
  assert.equal(missingYoutubeKey.debug.videoId, youtubeVideoId)
  assert.ok(
    missingYoutubeKey.textSources.some(
      (source) =>
        source.type === 'youtube_title' &&
        source.source === 'youtube_oembed',
    ),
  )
  console.log('PASS: missing YouTube API key is explicit and uses mocked fallback')

  let youtubeOEmbedCalls = 0
  const mockedYoutube = await resolveYouTubeUrl(
    {
      url: `https://m.youtube.com/watch?v=${youtubeVideoId}`,
    },
    {
      apiKey: 'mock-youtube-key',
      extractUrlSignals: async ({ url }) =>
        metadataSignals({
          finalUrl: url,
          platform: 'youtube',
          extractionStatus: 'blocked',
          ogTitle: 'Fallback title',
        }),
      fetchYouTubeApi: async ({ videoId }) => ({
        items: [
          {
            snippet: {
              title: `Food short ${videoId}`,
              description: 'A public description with Quận 3 context',
              channelTitle: 'Public Food Channel',
              thumbnails: {
                high: {
                  url: 'https://images.example.test/youtube-thumb.jpg',
                },
              },
            },
          },
        ],
      }),
      fetchOEmbed: async () => {
        youtubeOEmbedCalls += 1
        return {}
      },
    },
  )
  assert.equal(youtubeOEmbedCalls, 0)
  assert.ok(
    mockedYoutube.textSources.some(
      (source) =>
        source.type === 'youtube_title' &&
        source.source === 'youtube_api' &&
        /Food short/.test(source.text),
    ),
  )
  assert.ok(
    mockedYoutube.textSources.some(
      (source) =>
        source.type === 'youtube_description' &&
        source.source === 'youtube_api' &&
        /public description/i.test(source.text),
    ),
  )
  assert.ok(
    mockedYoutube.textSources.some(
      (source) =>
        source.type === 'youtube_channel' &&
        source.text === 'Public Food Channel',
    ),
  )
  assert.ok(
    !mockedYoutube.warnings.includes('youtube_api_key_missing'),
  )
  assert.equal(
    mockedYoutube.mediaSources[0].url,
    'https://images.example.test/youtube-thumb.jpg',
  )
  console.log('PASS: mocked YouTube API snippet becomes bounded evidence')

  const youtubeHttpCase = async ({
    apiStatus = 200,
    apiPayload = { items: [] },
    apiBody = null,
    apiError = null,
  }) =>
    resolveYouTubeUrl(
      {
        url: `https://www.youtube.com/shorts/${youtubeVideoId}`,
      },
      {
        apiKey: 'mock-configured-key',
        extractUrlSignals: async ({ url }) =>
          metadataSignals({
            finalUrl: url,
            platform: 'youtube',
            extractionStatus: 'blocked',
          }),
        fetchImpl: async (requestUrl) => {
          const parsed = new URL(requestUrl)
          if (parsed.hostname === 'www.googleapis.com') {
            if (apiError) throw apiError
            return new Response(
              apiBody === null ? JSON.stringify(apiPayload) : apiBody,
              {
                status: apiStatus,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          return new Response(
            JSON.stringify({
              title: 'Fallback public title',
              author_name: 'Fallback public channel',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        },
      },
    )

  const emptyYoutubeItems = await youtubeHttpCase({
    apiPayload: { items: [] },
  })
  assert.ok(
    emptyYoutubeItems.warnings.includes(
      'youtube_video_not_found_or_unavailable',
    ),
  )
  assert.ok(
    emptyYoutubeItems.textSources.some(
      (source) => source.source === 'youtube_oembed',
    ),
  )

  const forbiddenYoutube = await youtubeHttpCase({
    apiStatus: 403,
    apiPayload: {
      error: {
        code: 403,
        errors: [{ reason: 'accessNotConfigured' }],
      },
    },
  })
  assert.ok(
    forbiddenYoutube.warnings.includes(
      'youtube_api_forbidden_or_disabled',
    ),
  )

  const quotaYoutube = await youtubeHttpCase({
    apiStatus: 403,
    apiPayload: {
      error: {
        code: 403,
        errors: [{ reason: 'quotaExceeded' }],
      },
    },
  })
  assert.ok(quotaYoutube.warnings.includes('youtube_quota_exceeded'))

  const invalidKeyYoutube = await youtubeHttpCase({
    apiStatus: 400,
    apiPayload: {
      error: {
        code: 400,
        errors: [{ reason: 'keyInvalid' }],
      },
    },
  })
  assert.ok(invalidKeyYoutube.warnings.includes('youtube_api_key_invalid'))

  const timeoutError = new Error('timeout')
  timeoutError.name = 'AbortError'
  const timeoutYoutube = await youtubeHttpCase({
    apiError: timeoutError,
  })
  assert.ok(timeoutYoutube.warnings.includes('youtube_api_timeout'))

  const malformedYoutube = await youtubeHttpCase({
    apiBody: 'not-json',
  })
  assert.ok(
    malformedYoutube.warnings.includes('youtube_api_invalid_response'),
  )

  const fetchFailureYoutube = await youtubeHttpCase({
    apiError: new Error('network unavailable'),
  })
  assert.ok(
    fetchFailureYoutube.warnings.includes('youtube_api_fetch_failed'),
  )
  console.log('PASS: YouTube API failures map to bounded warnings with fallback')

  const downloadedMediaUrls = []
  const youtubeThumbnailInput = await resolveSocialInput(
    {
      url: `https://www.youtube.com/shorts/${youtubeVideoId}`,
    },
    {
      extractUrlSignals: async ({ url }) =>
        metadataSignals({
          finalUrl: url,
          platform: 'youtube',
          extractionStatus: 'blocked',
        }),
      providerOptions: {
        apiKey: 'mock-youtube-key',
        fetchYouTubeApi: async () => ({
          items: [
            {
              snippet: {
                title: 'Public food short',
                description: 'Public description',
                channelTitle: 'Public Food Channel',
                thumbnails: {
                  maxres: {
                    url: 'https://images.example.test/youtube-thumb.jpg',
                  },
                },
              },
            },
          ],
        }),
        fetchOEmbed: async () => {
          throw new Error('oEmbed should not be needed')
        },
      },
      downloadMedia: async ({ url }) => {
        downloadedMediaUrls.push(url)
        return {
          status: 'success',
          finalUrl: url,
          buffer: tinyPng,
          contentType: 'image/png',
          warnings: [],
        }
      },
      extractMetadataOcr: async () => ({
        text: 'PHỞ MỘC\nQuận 3',
        usable: true,
        ocrUsable: true,
        confidence: 0.91,
        reason: 'usable',
        lines: [],
        strongLines: [],
        weakLines: [],
        warnings: [],
        debug: { provider: 'mock' },
      }),
      metadataOcrEnabled: true,
    },
  )
  assert.deepEqual(downloadedMediaUrls, [
    'https://images.example.test/youtube-thumb.jpg',
  ])
  assert.equal(
    youtubeThumbnailInput.textSources.some(
      (source) =>
        source.type === 'thumbnail_ocr' &&
        source.source === 'youtube_thumbnail',
    ),
    true,
  )
  assert.equal(
    youtubeThumbnailInput.debug.urlEvidence.thumbnailOcrStatus,
    'usable',
  )
  assert.equal(
    youtubeThumbnailInput.debug.urlEvidence.thumbnailUrl,
    'https://images.example.test/youtube-thumb.jpg',
  )
  assert.equal(
    youtubeThumbnailInput.debug.urlEvidence.videoId,
    youtubeVideoId,
  )
  const youtubePublicDebug = await analyzeFoodMapSocialDiscovery(
    {
      url: `https://www.youtube.com/shorts/${youtubeVideoId}`,
    },
    rulePipelineDependencies({
      resolveSocialInput: async () => youtubeThumbnailInput,
    }),
  )
  assert.equal(youtubePublicDebug.debug.urlEvidence.videoId, youtubeVideoId)
  assert.equal(
    youtubePublicDebug.debug.urlEvidence.channelTitle,
    'Public Food Channel',
  )
  console.log('PASS: thumbnail OCR uses only mocked image bytes, never video content')

  const failedThumbnailInput = await resolveSocialInput(
    {
      url: `https://youtube.com/shorts/${youtubeVideoId}`,
    },
    {
      extractUrlSignals: async ({ url }) =>
        metadataSignals({
          finalUrl: url,
          platform: 'youtube',
          extractionStatus: 'blocked',
        }),
      providerOptions: {
        apiKey: 'mock-configured-key',
        fetchYouTubeApi: async () => ({
          items: [
            {
              snippet: {
                title: 'Public food short',
                description: 'Public description',
                channelTitle: 'Public channel',
                thumbnails: {
                  high: {
                    url: 'https://images.example.test/youtube-thumb.jpg',
                  },
                },
              },
            },
          ],
        }),
      },
      downloadMedia: async ({ url }) => ({
        status: 'success',
        finalUrl: url,
        buffer: tinyPng,
        contentType: 'image/png',
        warnings: [],
      }),
      extractMetadataOcr: async () => {
        throw new Error('mock OCR failure')
      },
      metadataOcrEnabled: true,
      metadataOcrTimeoutMs: 50,
    },
  )
  assert.ok(failedThumbnailInput.warnings.includes('thumbnail_ocr_failed'))
  assert.equal(
    failedThumbnailInput.debug.urlEvidence.thumbnailOcrStatus,
    'failed',
  )
  assert.ok(
    failedThumbnailInput.textSources.some(
      (source) => source.type === 'youtube_title',
    ),
  )
  console.log('PASS: thumbnail OCR failure does not fail YouTube resolution')

  const secretValue = ['mock', 'youtube', 'secret'].join('-')
  const secretSafeYoutube = await resolveSocialInput(
    {
      url: `https://youtu.be/${youtubeVideoId}`,
    },
    {
      extractUrlSignals: async ({ url }) =>
        metadataSignals({
          finalUrl: url,
          platform: 'youtube',
          extractionStatus: 'blocked',
        }),
      providerOptions: {
        apiKey: secretValue,
        fetchYouTubeApi: async () => {
          const error = new Error(`request failed for ${secretValue}`)
          error.status = 403
          error.reasons = ['accessNotConfigured']
          throw error
        },
        fetchOEmbed: async () => ({
          title: 'Fallback public title',
          author_name: 'Fallback public channel',
        }),
      },
      metadataOcrEnabled: false,
    },
  )
  assert.doesNotMatch(JSON.stringify(secretSafeYoutube), new RegExp(secretValue))
  assert.equal(secretSafeYoutube.debug.urlEvidence.videoId, youtubeVideoId)
  console.log('PASS: YouTube key never reaches bounded output or debug')

  const cadenceReviewTitle = isDescriptiveSocialTitle('7 ngày ăn thử')
  assert.equal(cadenceReviewTitle.isDescriptive, true)
  assert.ok(cadenceReviewTitle.reasons.includes('cadence_count_phrase'))
  assert.ok(
    cadenceReviewTitle.reasons.includes('first_person_review_language'),
  )
  assert.ok(cadenceReviewTitle.confidence >= 0.7)

  const rankedDistrictTitle = isDescriptiveSocialTitle(
    'Top 10 quán ngon Quận 7',
  )
  assert.equal(rankedDistrictTitle.isDescriptive, true)
  assert.ok(rankedDistrictTitle.reasons.includes('cadence_count_phrase'))
  assert.ok(
    rankedDistrictTitle.reasons.includes('no_distinctive_proper_noun'),
  )
  const rankedDistrictEntities = extractFoodMapEntities({
    inputSignals: {
      title: 'Top 10 quán ngon Quận 7',
    },
  })
  assert.equal(rankedDistrictEntities.placeName.value, null)
  assert.ok(
    rankedDistrictEntities.locationHints.some(
      (item) => normalizeForAssert(item.value) === 'quan 7',
    ),
  )
  assert.ok(
    rankedDistrictEntities.warnings.includes('cadence_count_phrase'),
  )
  assert.ok(
    rankedDistrictEntities.warnings.includes(
      'no_distinctive_proper_noun',
    ),
  )

  for (const distinctiveTitle of [
    'Phở Bà Huyện - 123 Lê Lợi',
    'Quán ốc số 7 Nguyễn Trãi',
    'Bún bò Huế ngon nhất Đà Nẵng',
  ]) {
    assert.equal(
      isDescriptiveSocialTitle(distinctiveTitle).isDescriptive,
      false,
    )
  }
  assert.deepEqual(isDescriptiveSocialTitle(null), {
    isDescriptive: false,
    reasons: [],
    confidence: 0,
  })
  console.log('PASS: descriptive social title classifier preserves distinctive names')

  const lowConfidenceTitleEntities = extractFoodMapEntities({
    inputSignals: {
      title: 'Quán Mộc Official',
    },
  })
  assert.equal(lowConfidenceTitleEntities.placeName.value, 'Quán Mộc Official')
  assert.ok(lowConfidenceTitleEntities.placeName.confidence < 0.4)
  assert.ok(
    lowConfidenceTitleEntities.warnings.includes(
      'low_confidence_social_content_metadata',
    ),
  )
  console.log('PASS: borderline social metadata lowers title place confidence')

  const descriptiveReviewTitle =
    'Quán 7 ngày 7 món như thế này không cần suy nghĩ ăn gì | TÚ HIỆU TRƯỞNG OFFICIAL #shorts'
  const descriptiveResolvedInput = resolvedYouTubeEvidence({
    title: descriptiveReviewTitle,
    thumbnailText: 'MAY MIỆNB',
  })
  const descriptiveRuleEntities = extractFoodMapEntities({
    inputSignals: { title: descriptiveReviewTitle },
    ocrEvidence: descriptiveResolvedInput.mediaOcrEvidence,
    textSources: descriptiveResolvedInput.textSources,
  })
  const descriptiveDraftQuery = buildFoodMapLocationQuery({
    entities: descriptiveRuleEntities,
  })
  assert.equal(descriptiveRuleEntities.placeName.value, null)
  assert.ok(
    descriptiveRuleEntities.warnings.includes('cadence_count_phrase'),
  )
  assert.ok(
    descriptiveRuleEntities.warnings.includes('social_content_metadata'),
  )
  assert.equal(
    descriptiveRuleEntities.locationHints.some(
      (item) => normalizeForAssert(item.value) === 'quan 7',
    ),
    false,
  )
  assert.ok(
    descriptiveRuleEntities.warnings.includes(
      'venue_number_not_district',
    ),
  )
  assert.equal(descriptiveDraftQuery.canResolveLocation, false)
  assert.equal(descriptiveDraftQuery.query, null)
  assert.equal(
    shouldRunGeminiEvidenceValidation({
      inputType: 'youtube_url',
      platform: 'youtube',
      urlEvidence: descriptiveResolvedInput.debug.urlEvidence,
      textSources: descriptiveResolvedInput.textSources,
      ocrEvidence: descriptiveResolvedInput.mediaOcrEvidence,
      ruleEntities: descriptiveRuleEntities,
      draftLocationQuery: descriptiveDraftQuery,
    }),
    false,
  )
  console.log('PASS: descriptive venue numbers do not become district evidence')

  const rejectedDescriptiveTitle = await analyzeFoodMapSocialDiscovery(
    {
      url: 'https://www.youtube.com/shorts/test-video',
    },
    mockedGeminiDependencies(
      geminiValidationResult({
        status: 'insufficient_evidence',
        confidence: 0.2,
        correctedEntities: {
          placeName: 'Quán 7 ngày',
          locationHints: ['quan 7'],
        },
        rejectedEntities: [
          {
            field: 'placeName',
            value: 'Quán 7 ngày',
            reason:
              'descriptive review phrase, not a distinctive business name',
          },
          {
            field: 'locationHints',
            value: 'quan 7',
            reason: 'Quán 7 is not evidence for Quận 7',
          },
        ],
        canResolveLocation: false,
        recommendedNextAction: 'ask_for_hint',
      }),
      {
        resolveSocialInput: async () => descriptiveResolvedInput,
      },
    ),
  )
  assert.equal(rejectedDescriptiveTitle.entities.placeName.value, null)
  assert.equal(
    rejectedDescriptiveTitle.entities.locationHints.some(
      (item) => normalizeForAssert(item.value) === 'quan 7',
    ),
    false,
  )
  assert.equal(
    rejectedDescriptiveTitle.locationQuery.canResolveLocation,
    false,
  )
  assert.equal(rejectedDescriptiveTitle.locationQuery.query, null)
  assert.equal(rejectedDescriptiveTitle.nextAction.type, 'ask_for_hint')
  assert.equal(
    rejectedDescriptiveTitle.debug.evidenceValidation.status,
    'insufficient_evidence',
  )
  assert.equal(
    rejectedDescriptiveTitle.debug.evidenceValidation.rejectedEntities.length,
    2,
  )
  console.log('PASS: Gemini validator rejects descriptive YouTube false positives')

  const dishDistrictRejected = await analyzeFoodMapSocialDiscovery(
    {
      hint: 'cháo lòng quận 5',
    },
    mockedGeminiDependencies(
      geminiValidationResult({
        status: 'corrected',
        confidence: 0.85,
        correctedEntities: {
          dishNames: ['cháo'],
          locationHints: ['quan 5'],
        },
        rejectedEntities: [
          {
            field: 'placeName',
            value: 'cháo lòng quận 5',
            reason: 'dish and district phrase without a distinctive name',
          },
        ],
        canResolveLocation: false,
        recommendedNextAction: 'ask_for_hint',
      }),
    ),
  )
  assert.equal(dishDistrictRejected.entities.placeName.value, null)
  assert.ok(
    dishDistrictRejected.entities.dishNames.some(
      (item) => normalizeForAssert(item.value) === 'chao',
    ),
  )
  assert.ok(
    dishDistrictRejected.entities.locationHints.some(
      (item) => normalizeForAssert(item.value) === 'quan 5',
    ),
  )
  assert.equal(dishDistrictRejected.locationQuery.canResolveLocation, false)
  assert.equal(dishDistrictRejected.nextAction.type, 'ask_for_hint')
  console.log('PASS: Gemini validator keeps dish/location but rejects fake place name')

  const namedPlaceValidated = await analyzeFoodMapSocialDiscovery(
    {
      hint: 'Quán cháo lòng Cô Ba Quận 5',
    },
    mockedGeminiDependencies(
      geminiValidationResult({
        status: 'corrected',
        confidence: 0.92,
        correctedEntities: {
          placeName: 'Quán cháo lòng Cô Ba',
          dishNames: ['cháo'],
          locationHints: ['quan 5'],
        },
        canResolveLocation: true,
        recommendedNextAction: 'none',
      }),
    ),
  )
  assert.match(namedPlaceValidated.entities.placeName.value, /Cô Ba/i)
  assert.equal(namedPlaceValidated.entities.placeName.source, 'hint')
  assert.equal(namedPlaceValidated.locationQuery.canResolveLocation, true)
  assert.equal(namedPlaceValidated.nextAction.type, 'none')
  console.log('PASS: Gemini validator preserves evidence-backed named place')

  const clearAddressValidated = await analyzeFoodMapSocialDiscovery(
    {
      hint: '65 Đường Láng, Đống Đa, Hà Nội',
    },
    mockedGeminiDependencies(
      geminiValidationResult({
        status: 'validated',
        confidence: 0.94,
        correctedEntities: {
          address: '65 Đường Láng, Đống Đa, Hà Nội',
          locationHints: ['ha noi'],
        },
        canResolveLocation: true,
        recommendedNextAction: 'none',
      }),
    ),
  )
  assert.match(clearAddressValidated.entities.address.value, /Đường Láng/i)
  assert.equal(clearAddressValidated.locationQuery.canResolveLocation, true)
  assert.equal(clearAddressValidated.locationQuery.strategy, 'address')
  console.log('PASS: Gemini validator preserves clear evidence-backed address')

  const clearAddressProviderFailure = await analyzeFoodMapSocialDiscovery(
    {
      hint: '65 Đường Láng, Đống Đa, Hà Nội',
    },
    rulePipelineDependencies({
      evidenceValidatorMode: 'gemini',
      geminiEvidenceValidationOptions: {
        apiKey: 'mock-gemini-key',
        model: 'mock-gemini-model',
        invokeGemini: async () => {
          const error = new Error('mocked provider failure')
          error.code = 'api_fetch_failed'
          throw error
        },
      },
    }),
  )
  assert.match(
    clearAddressProviderFailure.entities.address.value,
    /Đường Láng/i,
  )
  assert.equal(
    clearAddressProviderFailure.locationQuery.canResolveLocation,
    true,
  )
  assert.equal(
    clearAddressProviderFailure.debug.evidenceValidation.warnings.includes(
      'evidence_validation_failed_closed',
    ),
    false,
  )
  console.log('PASS: Gemini failure does not suppress a clear address hint')

  const uploadedOcrProviderFailure =
    await analyzeFoodMapSocialDiscovery(
      {
        image: {
          buffer: tinyPng,
          size: tinyPng.length,
          mimetype: 'image/png',
          originalname: 'mock-upload.png',
        },
      },
      rulePipelineDependencies({
        extractOcrSignals: mockOcrSuccess,
        evidenceValidatorMode: 'gemini',
        geminiEvidenceValidationOptions: {
          apiKey: 'mock-gemini-key',
          model: 'mock-gemini-model',
          invokeGemini: async () => {
            const error = new Error('mocked provider failure')
            error.code = 'api_fetch_failed'
            throw error
          },
        },
      }),
    )
  assert.match(
    uploadedOcrProviderFailure.entities.address.value,
    /123 Le Loi/i,
  )
  assert.equal(
    uploadedOcrProviderFailure.locationQuery.canResolveLocation,
    true,
  )
  assert.equal(
    uploadedOcrProviderFailure.debug.evidenceValidation.warnings.includes(
      'evidence_validation_failed_closed',
    ),
    false,
  )
  console.log('PASS: Gemini failure does not suppress strong uploaded OCR')

  let lowRiskGeminiCalls = 0
  const clearAddressRuleEntities = extractFoodMapEntities({
    inputSignals: {
      hint: '65 Đường Láng, Đống Đa, Hà Nội',
    },
    textSources: [
      {
        type: 'user_hint',
        text: '65 Đường Láng, Đống Đa, Hà Nội',
        confidence: 0.95,
        source: 'user_hint',
      },
    ],
  })
  const lowRiskHybrid = await runFoodMapEvidenceValidation(
    {
      inputType: 'youtube_url',
      platform: 'youtube',
      urlEvidence: {},
      textSources: [],
      ocrEvidence: {},
      ruleEntities: clearAddressRuleEntities,
      draftLocationQuery: buildFoodMapLocationQuery({
        entities: clearAddressRuleEntities,
      }),
    },
    {
      mode: 'hybrid',
      geminiOptions: {
        apiKey: 'mock-gemini-key',
        model: 'mock-gemini-model',
        invokeGemini: async () => {
          lowRiskGeminiCalls += 1
          return geminiValidationResult()
        },
      },
    },
  )
  assert.equal(lowRiskGeminiCalls, 0)
  assert.equal(lowRiskHybrid.status, 'skipped_low_risk')
  console.log('PASS: hybrid validator skips clear address evidence')

  const riskyRuleEntities = {
    ...descriptiveRuleEntities,
    placeName: {
      value: 'Quán 7 ngày',
      confidence: 0.65,
      source: 'title',
      evidence: [descriptiveReviewTitle],
    },
    locationHints: [
      {
        value: 'quan 7',
        type: 'district',
        confidence: 0.7,
        source: 'title',
        evidence: descriptiveReviewTitle,
      },
    ],
  }
  const riskyValidationInput = {
    inputType: 'youtube_url',
    platform: 'youtube',
    urlEvidence: descriptiveResolvedInput.debug.urlEvidence,
    textSources: descriptiveResolvedInput.textSources,
    ocrEvidence: descriptiveResolvedInput.mediaOcrEvidence,
    ruleEntities: riskyRuleEntities,
    draftLocationQuery: buildFoodMapLocationQuery({
      entities: riskyRuleEntities,
    }),
  }
  const geminiRequestBodies = []
  const compatibilityValidation =
    await validateFoodMapEvidenceWithGemini(riskyValidationInput, {
      apiKey: 'mock-gemini-key',
      model: 'mock-gemini-model',
      fetchImpl: async (_url, options) => {
        geminiRequestBodies.push(JSON.parse(options.body))
        if (geminiRequestBodies.length === 1) {
          return new Response(
            JSON.stringify({
              error: {
                code: 400,
                status: 'INVALID_ARGUMENT',
                message:
                  'Invalid value at generation_config.response_format.text.mime_type',
              },
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify(
                        geminiValidationResult({
                          status: 'insufficient_evidence',
                        }),
                      ),
                    },
                  ],
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      },
    })
  assert.equal(compatibilityValidation.ok, true)
  assert.equal(geminiRequestBodies.length, 2)
  assert.ok(
    geminiRequestBodies[0].generationConfig.responseFormat,
  )
  assert.equal(
    geminiRequestBodies[1].generationConfig.responseMimeType,
    'application/json',
  )
  const geminiSystemInstruction =
    geminiRequestBodies[0].systemInstruction.parts[0].text
  for (const category of [
    'cadence_count_phrase',
    'first_person_review_language',
    'social_content_metadata',
    'no_distinctive_proper_noun',
  ]) {
    assert.match(geminiSystemInstruction, new RegExp(category))
  }
  assert.doesNotMatch(
    geminiSystemInstruction,
    /Cô Ba|Phở Mộc|Quán 7 ngày|Đường Láng|Behavior examples/u,
  )
  assert.ok(
    compatibilityValidation.result.warnings.includes(
      'gemini_structured_output_compatibility_fallback',
    ),
  )
  console.log('PASS: Gemini structured output retries with compatible fields')

  const invalidGeminiJson = await runFoodMapEvidenceValidation(
    riskyValidationInput,
    {
      mode: 'gemini',
      geminiOptions: {
        apiKey: 'mock-gemini-key',
        model: 'mock-gemini-model',
        invokeGemini: async () => 'not-json',
      },
    },
  )
  assert.equal(invalidGeminiJson.applied, false)
  assert.equal(invalidGeminiJson.status, 'fallback')
  assert.ok(
    invalidGeminiJson.warnings.includes(
      'gemini_json_parse_failed',
    ),
  )
  assert.ok(
    invalidGeminiJson.warnings.includes(
      'evidence_validation_failed_closed',
    ),
  )
  assert.equal(invalidGeminiJson.canResolveLocation, false)
  assert.equal(invalidGeminiJson.recommendedNextAction, 'ask_for_hint')
  assert.equal(invalidGeminiJson.entities.placeName.value, null)
  assert.equal(
    invalidGeminiJson.entities.locationHints.some(
      (item) => normalizeForAssert(item.value) === 'quan 7',
    ),
    false,
  )
  const invalidGeminiPipeline = await analyzeFoodMapSocialDiscovery(
    {
      url: 'https://www.youtube.com/shorts/test-video',
    },
    rulePipelineDependencies({
      resolveSocialInput: async () => descriptiveResolvedInput,
      evidenceValidatorMode: 'gemini',
      geminiEvidenceValidationOptions: {
        apiKey: 'mock-gemini-key',
        model: 'mock-gemini-model',
        invokeGemini: async () => 'not-json',
      },
    }),
  )
  assert.equal(invalidGeminiPipeline.status, 'unclear')
  assert.equal(invalidGeminiPipeline.entities.placeName.value, null)
  assert.equal(
    invalidGeminiPipeline.entities.locationHints.some(
      (item) => normalizeForAssert(item.value) === 'quan 7',
    ),
    false,
  )
  assert.equal(
    invalidGeminiPipeline.locationQuery.canResolveLocation,
    false,
  )
  assert.equal(invalidGeminiPipeline.nextAction.type, 'ask_for_hint')
  assert.ok(
    invalidGeminiPipeline.entities.warnings.includes(
      'cadence_count_phrase',
    ),
  )

  const geminiTimeoutError = new Error('timeout')
  geminiTimeoutError.name = 'AbortError'
  const timedOutGemini = await runFoodMapEvidenceValidation(
    riskyValidationInput,
    {
      mode: 'gemini',
      geminiOptions: {
        apiKey: 'mock-gemini-key',
        model: 'mock-gemini-model',
        invokeGemini: async () => {
          throw geminiTimeoutError
        },
      },
    },
  )
  assert.equal(timedOutGemini.applied, false)
  assert.ok(
    timedOutGemini.warnings.includes('gemini_api_timeout'),
  )
  assert.ok(
    timedOutGemini.warnings.includes(
      'evidence_validation_failed_closed',
    ),
  )
  assert.equal(timedOutGemini.entities.placeName.value, null)
  assert.equal(timedOutGemini.canResolveLocation, false)

  const missingGeminiKey = await runFoodMapEvidenceValidation(
    riskyValidationInput,
    {
      mode: 'gemini',
      geminiOptions: {
        apiKey: '',
        model: 'mock-gemini-model',
      },
    },
  )
  assert.equal(missingGeminiKey.applied, false)
  assert.ok(missingGeminiKey.warnings.includes('gemini_api_key_missing'))
  assert.equal(missingGeminiKey.canResolveLocation, false)

  const missingGeminiModel = await runFoodMapEvidenceValidation(
    riskyValidationInput,
    {
      mode: 'gemini',
      geminiOptions: {
        apiKey: 'mock-gemini-key',
        model: '',
      },
    },
  )
  assert.ok(missingGeminiModel.warnings.includes('gemini_model_missing'))
  assert.equal(missingGeminiModel.modelConfigured, false)

  for (const [code, warning, status] of [
    ['api_key_invalid', 'gemini_api_key_invalid', 401],
    ['model_not_found', 'gemini_model_not_found', 404],
    ['api_forbidden', 'gemini_api_forbidden', 403],
    ['quota_exceeded', 'gemini_quota_exceeded', 429],
    ['api_fetch_failed', 'gemini_api_fetch_failed', null],
    ['api_invalid_response', 'gemini_api_invalid_response', 502],
    [
      'schema_validation_failed',
      'gemini_schema_validation_failed',
      null,
    ],
  ]) {
    const categorizedFailure = await runFoodMapEvidenceValidation(
      riskyValidationInput,
      {
        mode: 'gemini',
        geminiOptions: {
          apiKey: 'mock-gemini-key',
          model: 'mock-gemini-model',
          invokeGemini: async () => {
            const error = new Error('mocked categorized failure')
            error.code = code
            error.status = status
            throw error
          },
        },
      },
    )
    assert.ok(categorizedFailure.warnings.includes(warning))
    assert.equal(categorizedFailure.httpStatus, status)
    assert.equal(categorizedFailure.entities.placeName.value, null)
  }
  console.log('PASS: Gemini provider failures use bounded warning categories')

  const inventedGeminiEntity = await runFoodMapEvidenceValidation(
    riskyValidationInput,
    {
      mode: 'gemini',
      geminiOptions: {
        apiKey: 'mock-gemini-key',
        model: 'mock-gemini-model',
        invokeGemini: async () =>
          geminiValidationResult({
            status: 'corrected',
            correctedEntities: {
              placeName: 'Invented Palace',
              locationHints: ['District 99'],
            },
            canResolveLocation: true,
            recommendedNextAction: 'none',
          }),
      },
    },
  )
  assert.equal(inventedGeminiEntity.entities.placeName.value, null)
  assert.deepEqual(inventedGeminiEntity.entities.locationHints, [])
  console.log('PASS: unsupported Gemini corrections cannot create entities')

  const geminiSecret = ['mock', 'gemini', 'secret'].join('-')
  const secretSafeGemini = await runFoodMapEvidenceValidation(
    riskyValidationInput,
    {
      mode: 'gemini',
      geminiOptions: {
        apiKey: geminiSecret,
        model: 'mock-gemini-model',
        invokeGemini: async ({ apiKey }) => {
          assert.equal(apiKey, geminiSecret)
          throw new Error(`provider rejected ${apiKey}`)
        },
      },
    },
  )
  assert.doesNotMatch(
    JSON.stringify(secretSafeGemini),
    new RegExp(geminiSecret),
  )
  assert.ok(
    secretSafeGemini.warnings.includes('gemini_api_fetch_failed'),
  )
  assert.ok(
    secretSafeGemini.warnings.includes(
      'evidence_validation_failed_closed',
    ),
  )
  assert.equal(secretSafeGemini.entities.placeName.value, null)
  assert.equal(secretSafeGemini.keyConfigured, true)
  assert.equal(secretSafeGemini.modelConfigured, true)
  console.log('PASS: Gemini provider failures fail closed without key leakage')

  let blockedMediaDownloads = 0
  const blockedSocial = await analyzeFoodMapSocialDiscovery(
    {
      url: 'https://www.instagram.com/reel/blocked-public-example',
    },
    rulePipelineDependencies({
      resolveSocialInput: (input) =>
        resolveSocialInput(input, {
          extractUrlSignals: async ({ url }) =>
            metadataSignals({
              finalUrl: url,
              platform: 'instagram',
              extractionStatus: 'blocked',
              warnings: ['Public metadata was blocked.'],
            }),
          downloadMedia: async () => {
            blockedMediaDownloads += 1
            throw new Error('No media should be available')
          },
          metadataOcrEnabled: true,
        }),
    }),
  )
  assert.equal(blockedMediaDownloads, 0)
  assert.equal(blockedSocial.status, 'needs_screenshot_or_hint')
  assert.equal(blockedSocial.nextAction.type, 'ask_for_hint')
  assert.ok(
    blockedSocial.debug.warnings.includes('metadata_blocked_or_empty'),
  )
  assert.equal(
    blockedSocial.debug.urlEvidence.thumbnailOcrStatus,
    'not_available',
  )
  console.log('PASS: blocked social metadata is explainable and asks for a hint')

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

  const timeoutResponse = await analyzerWith(
    async () => {
      const error = new Error('timed out')
      error.name = 'AbortError'
      throw error
    },
    {},
    {
      socialProviderOptions: {
        apiKey: '',
        fetchOEmbed: async () => {
          throw new Error('mocked oEmbed unavailable')
        },
      },
    },
  )({ url: 'https://www.youtube.com/watch?v=timeout' })
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

  const compactDistrictAddressEntities = extractFoodMapEntities({
    ocrEvidence: {
      text: '43 TTĐ, Q1',
      usable: true,
      confidence: 0.82,
      lines: [
        {
          text: '43 TTĐ, Q1',
          confidence: 0.82,
          type: 'sign',
        },
      ],
    },
  })
  assert.equal(compactDistrictAddressEntities.status, 'address_found')
  assert.equal(compactDistrictAddressEntities.address.value, '43 TTĐ, Q1')
  assert.ok(
    compactDistrictAddressEntities.locationHints.some(
      (location) =>
        location.type === 'district' &&
        normalizeForAssert(location.value) === 'q1',
    ),
  )

  const streetWithoutAdminEntities = extractFoodMapEntities({
    ocrEvidence: {
      text: '65 Đường Láng',
      usable: true,
      confidence: 0.82,
      lines: [
        {
          text: '65 Đường Láng',
          confidence: 0.82,
          type: 'sign',
        },
      ],
    },
  })
  assert.equal(streetWithoutAdminEntities.status, 'address_found')
  assert.equal(streetWithoutAdminEntities.address.value, '65 Đường Láng')
  assert.deepEqual(
    streetWithoutAdminEntities.address.evidence,
    ['65 Đường Láng'],
  )

  const abbreviatedStreetEntities = extractFoodMapEntities({
    ocrEvidence: {
      text: '12 Đ. Hoa Mai, Q.2',
      usable: true,
      confidence: 0.8,
      lines: [
        {
          text: '12 Đ. Hoa Mai, Q.2',
          confidence: 0.8,
          type: 'address',
        },
      ],
    },
  })
  assert.equal(abbreviatedStreetEntities.status, 'address_found')
  assert.equal(abbreviatedStreetEntities.address.value, '12 Đ. Hoa Mai, Q.2')
  console.log('PASS: generalized Vietnamese street and district forms are extracted')

  const mixedDishAddressEntities = extractFoodMapEntities({
    ocrEvidence: {
      text: 'Bun Bo Hue 65 Duong Lang',
      usable: true,
      confidence: 0.84,
      lines: [
        {
          text: 'Bun Bo Hue 65 Duong Lang',
          confidence: 0.84,
          type: 'sign',
        },
      ],
    },
  })
  assert.equal(mixedDishAddressEntities.status, 'address_found')
  assert.equal(mixedDishAddressEntities.address.value, '65 Duong Lang')
  assert.equal(mixedDishAddressEntities.placeName.value, null)
  assert.ok(
    mixedDishAddressEntities.dishNames.some(
      (dish) => normalizeForAssert(dish.value) === 'bun bo',
    ),
  )
  assert.equal(
    mixedDishAddressEntities.dishNames[0].evidence,
    'Bun Bo Hue 65 Duong Lang',
  )

  const mixedPlaceAddressEntities = extractFoodMapEntities({
    ocrEvidence: {
      text: 'Quán Ăn Hương Việt - 27 Đường Số 5, Q.3',
      usable: true,
      confidence: 0.84,
      lines: [
        {
          text: 'Quán Ăn Hương Việt - 27 Đường Số 5, Q.3',
          confidence: 0.84,
          type: 'address',
        },
      ],
    },
  })
  assert.equal(mixedPlaceAddressEntities.status, 'address_found')
  assert.equal(
    mixedPlaceAddressEntities.address.value,
    '27 Đường Số 5, Q.3',
  )
  assert.equal(
    mixedPlaceAddressEntities.placeName.value,
    'Quán Ăn Hương Việt',
  )
  assert.deepEqual(
    mixedPlaceAddressEntities.placeName.evidence,
    ['Quán Ăn Hương Việt - 27 Đường Số 5, Q.3'],
  )
  console.log('PASS: mixed food, place, and address lines split into evidence-backed entities')

  for (const venueLabel of ['Quán', 'Tiệm', 'Nhà hàng', 'Cửa hàng', 'Quầy']) {
    const venueNumberEntities = extractFoodMapEntities({
      inputSignals: {
        title: `${venueLabel} 17`,
      },
    })
    assert.equal(
      venueNumberEntities.locationHints.some(
        (item) => item.type === 'district',
      ),
      false,
    )
    assert.ok(
      venueNumberEntities.warnings.includes(
        'venue_number_not_district',
      ),
    )
  }
  console.log('PASS: venue words followed by bare numbers never imply districts')

  const ambiguousQuanEntities = extractFoodMapEntities({
    inputSignals: {
      title: 'Quan 17',
    },
  })
  assert.deepEqual(ambiguousQuanEntities.locationHints, [])
  assert.ok(
    ambiguousQuanEntities.warnings.includes('ambiguous_quan_token'),
  )
  console.log('PASS: unaccented quan plus a number remains ambiguous')

  for (const districtText of ['Quận 7', 'Q.7', 'quận Bình Thạnh']) {
    const explicitDistrictEntities = extractFoodMapEntities({
      inputSignals: {
        hint: districtText,
      },
    })
    assert.ok(
      explicitDistrictEntities.locationHints.some(
        (item) => item.type === 'district',
      ),
    )
  }
  console.log('PASS: explicit numeric and named district forms remain location evidence')

  const numberedVenueWithAddressEntities = extractFoodMapEntities({
    ocrEvidence: {
      text: 'Quán 79\n12 Đường Hoa Mai, Q.2',
      usable: true,
      confidence: 0.88,
      lines: [
        {
          text: 'Quán 79',
          confidence: 0.9,
          type: 'sign',
        },
        {
          text: '12 Đường Hoa Mai, Q.2',
          confidence: 0.86,
          type: 'address',
        },
      ],
    },
  })
  assert.equal(numberedVenueWithAddressEntities.placeName.value, 'Quán 79')
  assert.equal(
    numberedVenueWithAddressEntities.address.value,
    '12 Đường Hoa Mai, Q.2',
  )
  assert.equal(
    numberedVenueWithAddressEntities.locationHints.some(
      (item) => normalizeForAssert(item.value) === 'quan 79',
    ),
    false,
  )
  assert.ok(
    numberedVenueWithAddressEntities.locationHints.some(
      (item) => normalizeForAssert(item.value) === 'q 2',
    ),
  )
  assert.ok(
    numberedVenueWithAddressEntities.warnings.includes(
      'venue_number_not_district',
    ),
  )
  assert.equal(
    buildFoodMapLocationQuery(numberedVenueWithAddressEntities)
      .canResolveLocation,
    true,
  )
  console.log('PASS: a numbered venue and a separate address retain distinct roles')

  const legacyLandlineEntities = extractFoodMapEntities({
    ocrEvidence: {
      text: 'ĐT: (08) 38 369 145',
      usable: true,
      confidence: 0.84,
      lines: [
        {
          text: 'ĐT: (08) 38 369 145',
          confidence: 0.84,
          type: 'phone',
        },
      ],
    },
  })
  assert.equal(legacyLandlineEntities.phones[0].value, '(08) 38 369 145')
  assert.equal(legacyLandlineEntities.phones[0].normalized, '0838369145')
  assert.equal(
    legacyLandlineEntities.phones[0].evidence,
    'ĐT: (08) 38 369 145',
  )

  const unsupportedNumericEntities = extractFoodMapEntities({
    ocrEvidence: {
      text: '0901234567',
      usable: true,
      confidence: 0.92,
      lines: [
        {
          text: '0901234567',
          confidence: 0.92,
          type: 'phone',
        },
      ],
    },
  })
  assert.deepEqual(unsupportedNumericEntities.phones, [])
  assert.equal(unsupportedNumericEntities.status, 'unclear')
  console.log('PASS: phone formats require reusable contact or place context')

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

  const phoneOnlyLocationQuery = buildFoodMapLocationQuery(phoneEntities)
  assert.equal(phoneOnlyLocationQuery.canResolveLocation, false)
  assert.equal(phoneOnlyLocationQuery.query, null)
  assert.ok(phoneOnlyLocationQuery.score < 10)
  assert.equal(phoneOnlyLocationQuery.reason, 'phone_only_needs_context')
  assert.equal(phoneOnlyLocationQuery.strategy, 'insufficient_evidence')
  assert.ok(
    phoneOnlyLocationQuery.warnings.some((warning) =>
      /phone evidence needs place, address, or strong location context/i.test(
        warning,
      ),
    ),
  )
  console.log('PASS: phone-only OCR evidence requires additional context')

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
  assert.equal(phoneLocationQuery.reason, 'phone_location_supported')
  assert.match(phoneLocationQuery.query, /^0964050030/)
  assert.match(phoneLocationQuery.query, /Ho Chi Minh City/i)
  console.log('PASS: normalized Vietnamese phone plus city forms a safe query')

  const phonePlaceQuery = buildFoodMapLocationQuery({
    ...phoneEntities,
    placeName: {
      value: 'Hoa Sen Kitchen',
      confidence: 0.82,
      source: 'ocr',
      evidence: ['Hoa Sen Kitchen'],
    },
  })
  assert.equal(phonePlaceQuery.canResolveLocation, true)
  assert.equal(phonePlaceQuery.reason, 'place_phone_supported')
  assert.match(phonePlaceQuery.query, /Hoa Sen Kitchen/i)
  assert.match(phonePlaceQuery.query, /0964050030/)
  console.log('PASS: clean place name plus phone forms a safe query')

  const addressPhoneQuery = buildFoodMapLocationQuery({
    ...addressEntities,
    phones: phoneEntities.phones,
  })
  assert.equal(addressPhoneQuery.canResolveLocation, true)
  assert.equal(addressPhoneQuery.reason, 'address_phone_supported')
  assert.ok(addressPhoneQuery.score >= 18)
  console.log('PASS: address plus phone remains strong location evidence')

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
  assert.match(locationLabelAddressQuery.reason, /phone/i)
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
  assert.equal(categoryPlaceQuery.strategy, 'place_dish_location_hint')
  assert.ok(categoryPlaceQuery.score >= 10)
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

  const validLookingNumericNoiseEvidence = await extractLocalOcrSignals(
    {
      image: {
        buffer: tinyPng,
        size: tinyPng.length,
        mimetype: 'image/png',
        originalname: 'valid-looking-numeric-noise.png',
      },
    },
    {
      recognizeImage: async () => ({
        data: {
          text: '0901234567',
          confidence: 96,
        },
      }),
      maxPasses: 1,
    },
  )
  assert.equal(validLookingNumericNoiseEvidence.strongLines.length, 0)
  assert.equal(validLookingNumericNoiseEvidence.usable, false)
  console.log('PASS: valid-looking standalone digits are not treated as contact evidence')

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
            'ĐT: 0909 000 111',
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
  assert.match(imageResult.locationQuery.query, /123 Le Loi/i)
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
