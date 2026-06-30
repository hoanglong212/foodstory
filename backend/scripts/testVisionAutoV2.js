import assert from 'node:assert/strict'
import path from 'node:path'
import express from 'express'
import { createVisionAutoRouter } from '../routes/visionAutoRoutes.js'
import {
  createManualFrameOcrDiagnostics,
} from './testYoutubeFrameOcrLocal.js'
import { analyzeVisionAutoV2 } from '../services/visionAuto/visionAutoResolverService.js'
import { collectVisionEvidence } from '../services/visionAuto/visionEvidenceCollectorService.js'
import {
  extractYouTubeFrames,
  selectedTimestamps,
} from '../services/visionAuto/youtubeFrameExtractionService.js'
import { getVisionAutoConfig } from '../services/visionAuto/visionAutoConfig.js'
import {
  recoverEmbeddedYoutubeFrameEntities,
} from '../services/visionAuto/youtubeFrameOcrVariantService.js'

const REGRESSION_URL = 'https://www.youtube.com/shorts/9v_yyeReoXY'
const REGRESSION_TITLE =
  'Quán 7 ngày 7 món như thế này không cần suy nghĩ ăn gì | TÚ HIỆU TRƯỞNG OFFICIAL #shorts'

function config(overrides = {}) {
  return {
    enabled: true,
    routeEnabled: true,
    debugLevel: 'summary',
    ocrProvider: 'google_vision',
    ocrFallbackToTesseract: false,
    googleVisionTimeoutMs: 15_000,
    metadataOcrEnabled: false,
    metadataOcrMaxBytes: 3_000_000,
    metadataOcrTimeoutMs: 8_000,
    evidenceValidator: 'rule',
    geminiCandidateExtractionEnabled: false,
    geminiCandidateExtractionTimeoutMs: 20_000,
    geminiCandidateExtractionMaxLines: 80,
    locationProvider: 'disabled',
    googlePlacesTimeoutMs: 8_000,
    frameScanEnabled: false,
    frameScanMaxFrames: 8,
    frameScanTimeoutMs: 30_000,
    frameDownloadTimeoutMs: 30_000,
    frameScanMaxDurationSeconds: 60,
    frameScanTempDir: '',
    frameOcrCropEnabled: true,
    frameOcrMaxCropsPerFrame: 4,
    frameOcrUpscaleEnabled: true,
    speechToTextEnabled: false,
    speechToTextTimeoutMs: 15_000,
    ...overrides,
  }
}

function namedEntity(value = null, confidence = 0, source = null, evidence = []) {
  return {
    value,
    confidence,
    source,
    evidence,
  }
}

function entities(overrides = {}) {
  return {
    placeName: namedEntity(),
    address: namedEntity(),
    phones: [],
    dishNames: [],
    priceHints: [],
    locationHints: [],
    confidence: 0,
    status: 'unclear',
    warnings: [],
    ...overrides,
  }
}

function ocrEvidence(lines, { usable = true } = {}) {
  const normalizedLines = lines.map((line) => ({
    confidence: 0.9,
    tier: 'strong',
    ...line,
  }))
  return {
    text: usable ? normalizedLines.map((line) => line.text).join('\n') : null,
    usable,
    ocrUsable: usable,
    confidence: usable ? 0.9 : 0,
    reason: usable ? 'usable' : 'low_confidence',
    lines: usable ? normalizedLines : [],
    strongLines: usable ? normalizedLines : [],
    weakLines: [],
    warnings: [],
    debug: {
      providerUsed: 'mock',
    },
  }
}

function filteredFrameOcrEvidence(lines = [], overrides = {}) {
  return {
    text: null,
    usable: false,
    ocrUsable: false,
    confidence: 0,
    reason: 'no_line_met_final_selection_threshold',
    lines: [],
    strongLines: [],
    weakLines: [],
    warnings: [],
    debug: {
      providerMode: 'google_vision',
      providerUsed: 'google_vision',
      providerStatus: 'ok',
      fallbackReason: null,
      canonicalClusters: lines.map((line) => ({
        confidence: 0.62,
        quality: 0.55,
        tier: 'rejected',
        type: 'other',
        ...line,
      })),
    },
    ...overrides,
  }
}

function collection(overrides = {}) {
  return {
    metadata: [],
    uploadedOcrEvidence: null,
    thumbnailOcrEvidence: null,
    frameOcrEvidence: [],
    frameTexts: [],
    audioTexts: [],
    warnings: [],
    debug: {},
    ...overrides,
  }
}

function youtubeMetadata(title = REGRESSION_TITLE) {
  return collection({
    metadata: [
      {
        type: 'youtube_title',
        text: title,
        confidence: 0.66,
        source: 'youtube_api',
      },
    ],
  })
}

function clearStorefrontOcr() {
  return ocrEvidence([
    {
      text: 'QUÁN CƠM TẤM HOA SEN',
      type: 'sign',
      confidence: 0.94,
    },
    {
      text: 'Address: 125 Le Loi, Q.1, TP HCM',
      type: 'address',
      confidence: 0.93,
    },
  ])
}

function clearAddressOcr() {
  return ocrEvidence([
    {
      text: 'Address: 65 Duong Lang, Q. Dong Da, Ha Noi',
      type: 'address',
      confidence: 0.94,
    },
  ])
}

function assertStableContract(result) {
  assert.deepEqual(Object.keys(result), [
    'status',
    'confidence',
    'input',
    'evidenceSummary',
    'entities',
    'placeCandidates',
    'bestResult',
    'addPlaceDraft',
    'reason',
    'debug',
  ])
  assert.ok(
    ['matched_place', 'draft_candidate', 'unresolved_best_effort'].includes(
      result.status,
    ),
  )
  assert.equal('nextAction' in result, false)
  assert.doesNotMatch(JSON.stringify(result), /ask_for_hint/i)
}

async function analyzeWithCollection(input, evidence, dependencies = {}) {
  const {
    config: configOverrides,
    ...remainingDependencies
  } = dependencies
  return analyzeVisionAutoV2(input, {
    config: config(configOverrides),
    collectEvidence: async () => evidence,
    ...remainingDependencies,
  })
}

function emptyYouTubeProvider({
  url = 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  title = null,
} = {}) {
  return async () => ({
    platform: 'youtube',
    sourceUrl: url,
    textSources: title
      ? [
          {
            type: 'youtube_title',
            text: title,
            confidence: 0.66,
            source: 'youtube_api',
          },
        ]
      : [],
    mediaSources: [],
    warnings: [],
    debug: {
      provider: 'youtube',
      extractionStatus: 'success',
      videoId: 'dQw4w9WgXcQ',
    },
  })
}

function mockExtractedFrames(timestamps = [2]) {
  return {
    status: timestamps.length ? 'success' : 'failed',
    videoId: 'dQw4w9WgXcQ',
    durationSeconds: 20,
    frames: timestamps.map((timestampSeconds, index) => ({
      timestampSeconds,
      buffer: Buffer.from(`mock-frame-${index + 1}`),
      mimetype: 'image/jpeg',
    })),
    warnings: timestamps.length ? [] : ['youtube_frame_scan_no_frames'],
    binaries: {
      ytDlpAvailable: true,
      ffmpegAvailable: true,
    },
  }
}

async function analyzeFrameScenario({
  url = 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  frameScanner,
  frameVariantBuilder,
  extractOcr = async () => ocrEvidence([], { usable: false }),
  title = null,
  configOverrides = {},
  dependencies = {},
} = {}) {
  return analyzeVisionAutoV2(
    { url },
    {
      config: config({
        frameScanEnabled: true,
        metadataOcrEnabled: false,
        ...configOverrides,
      }),
      collectorOptions: {
        youtubeProvider: emptyYouTubeProvider({ url, title }),
        frameScanner,
        ...(frameVariantBuilder ? { frameVariantBuilder } : {}),
        extractOcr,
      },
      ...dependencies,
    },
  )
}

async function startRouteServer() {
  const app = express()
  app.use(
    '/api/food-map',
    createVisionAutoRouter({
      isRouteEnabled: () => true,
      isServiceEnabled: () => true,
      analyze: async ({ url }) => ({
        status: 'unresolved_best_effort',
        confidence: 0,
        input: { type: 'blog_url', url },
        evidenceSummary: {
          metadata: [],
          ocrLines: [],
          frameEvidence: [],
          frameTexts: [],
          audioTexts: [],
          warnings: [],
        },
        entities: {
          placeName: namedEntity(),
          address: namedEntity(),
          phones: [],
          dishNames: [],
          locationHints: [],
        },
        placeCandidates: [],
        bestResult: null,
        addPlaceDraft: null,
        reason: 'Insufficient reliable evidence.',
        debug: { steps: [], warnings: [] },
      }),
    }),
  )
  app.use((error, _req, res, _next) => {
    res.status(500).json({ error: error?.message || 'test route error' })
  })
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
  })
  const address = server.address()
  return {
    server,
    url: `http://127.0.0.1:${address.port}/api/food-map/vision-auto-v2`,
  }
}

async function main() {
  const descriptive = await analyzeWithCollection(
    { url: REGRESSION_URL },
    youtubeMetadata(),
  )
  assert.equal(descriptive.status, 'unresolved_best_effort')
  assert.equal(descriptive.entities.placeName.value, null)
  assert.deepEqual(descriptive.entities.locationHints, [])
  assert.doesNotMatch(
    JSON.stringify(descriptive.entities.locationHints),
    /quan 7/i,
  )
  assert.equal(descriptive.reason, 'insufficient_strong_place_evidence')
  assertStableContract(descriptive)
  assert.equal(descriptive.debug.geminiCandidateExtractionStatus, 'disabled')
  assert.equal(descriptive.debug.geminiCandidateAcceptedCount, 0)
  assert.equal(descriptive.debug.geminiCandidateRejectedCount, 0)
  assert.equal(
    descriptive.debug.geminiCandidateExtractionSkipReason,
    'feature_disabled',
  )
  console.log('PASS 1-3: descriptive YouTube title stays unresolved without fake place or district')

  for (const [label, title] of [
    ['cadence/count', 'Quán này 1 tuần 7 món'],
    ['first-person review', 'Mình ăn thử quán này thấy khá ngon'],
    ['social metadata', 'Review món này hôm nay #shorts'],
  ]) {
    const weakMetadataOnly = await analyzeFrameScenario({
      frameScanner: async () => mockExtractedFrames([]),
      title,
    })
    assert.equal(weakMetadataOnly.status, 'unresolved_best_effort')
    assert.equal(weakMetadataOnly.addPlaceDraft, null)
    assert.equal(
      weakMetadataOnly.reason,
      'insufficient_strong_place_evidence',
    )
    assert.equal(weakMetadataOnly.entities.placeName.value, null)
    console.log(`PASS weak metadata: ${label} remains unresolved`)
  }

  const titlePlaceWithLocationOnly = await analyzeWithCollection(
    { url: 'https://www.youtube.com/shorts/titleOnly01' },
    youtubeMetadata('Quán Hoa Mai tại Quận 7'),
    {
      extractEntities: () =>
        entities({
          placeName: namedEntity(
            'Quán Hoa Mai',
            0.84,
            'title',
            ['Quán Hoa Mai tại Quận 7'],
          ),
          locationHints: [
            {
              value: 'Quận 7',
              type: 'district',
              confidence: 0.82,
              source: 'title',
              evidence: 'Quán Hoa Mai tại Quận 7',
            },
          ],
          confidence: 0.84,
          status: 'place_name_found',
        }),
      validateEntities: async ({ candidateEntities }) => ({
        entities: candidateEntities,
        validation: {
          status: 'rule_only',
          requested: false,
          applied: false,
          canResolveLocation: false,
          warnings: [],
        },
      }),
    },
  )
  assert.equal(titlePlaceWithLocationOnly.status, 'unresolved_best_effort')
  assert.equal(titlePlaceWithLocationOnly.addPlaceDraft, null)
  assert.equal(
    titlePlaceWithLocationOnly.reason,
    'insufficient_strong_place_evidence',
  )
  console.log('PASS weak metadata: title place plus location hint cannot create a draft')

  const dishDistrict = await analyzeWithCollection(
    { url: 'https://example.com/food-post' },
    collection(),
    {
      extractEntities: () =>
        entities({
          placeName: namedEntity(
            'Cơm tấm Quận 7',
            0.82,
            'title',
            ['Cơm tấm Quận 7'],
          ),
          dishNames: [
            {
              value: 'Cơm tấm',
              confidence: 0.8,
              source: 'title',
              evidence: 'Cơm tấm Quận 7',
            },
          ],
          locationHints: [
            {
              value: 'Quận 7',
              type: 'district',
              confidence: 0.8,
              source: 'title',
              evidence: 'Cơm tấm Quận 7',
            },
          ],
        }),
    },
  )
  assert.equal(dishDistrict.entities.placeName.value, null)
  assert.equal(dishDistrict.status, 'unresolved_best_effort')
  console.log('PASS 4: dish plus district cannot become a place name')

  const clearImage = await analyzeWithCollection(
    {
      image: {
        buffer: Buffer.from('mock-image'),
        mimetype: 'image/png',
        originalname: 'storefront.png',
      },
    },
    collection({ uploadedOcrEvidence: clearStorefrontOcr() }),
  )
  assert.equal(clearImage.status, 'draft_candidate')
  assert.ok(clearImage.addPlaceDraft)
  assert.match(clearImage.entities.placeName.value || '', /hoa sen/i)
  assertStableContract(clearImage)
  console.log('PASS 5: clear uploaded storefront OCR creates a review-only draft')

  const clearAddress = await analyzeWithCollection(
    {
      image: {
        buffer: Buffer.from('mock-address'),
        mimetype: 'image/png',
        originalname: 'address.png',
      },
    },
    collection({ uploadedOcrEvidence: clearAddressOcr() }),
  )
  assert.equal(clearAddress.status, 'draft_candidate')
  assert.ok(clearAddress.entities.address.value)
  console.log('PASS 6: clear address OCR creates a review-only draft')

  const noisy = await analyzeWithCollection(
    {
      image: {
        buffer: Buffer.from('mock-noise'),
        mimetype: 'image/png',
        originalname: 'noise.png',
      },
    },
    collection({
      uploadedOcrEvidence: ocrEvidence(
        [{ text: 'ZXQ 1111 ////', type: 'other', confidence: 0.1 }],
        { usable: false },
      ),
    }),
  )
  assert.equal(noisy.status, 'unresolved_best_effort')
  assert.equal(noisy.entities.placeName.value, null)
  console.log('PASS 7: noisy OCR remains unresolved')

  const staleCandidate = entities({
    placeName: namedEntity(
      'Unsafe Candidate',
      0.85,
      'title',
      ['Unsafe Candidate'],
    ),
    confidence: 0.85,
    status: 'place_name_found',
  })
  const geminiRejected = await analyzeWithCollection(
    { url: 'https://example.com/review' },
    collection({
      metadata: [
        {
          type: 'title',
          text: 'Unsafe Candidate',
          confidence: 0.6,
          source: 'web',
        },
      ],
    }),
    {
      config: { evidenceValidator: 'gemini' },
      extractEntities: () => staleCandidate,
      validatorOptions: {
        runValidator: async () => ({
          provider: 'gemini',
          mode: 'gemini',
          requested: true,
          applied: true,
          status: 'rejected',
          confidence: 0.9,
          rejectedEntities: [
            {
              field: 'placeName',
              value: 'Unsafe Candidate',
              reason: 'Unsupported by evidence.',
            },
          ],
          canResolveLocation: false,
          warnings: [],
          entities: staleCandidate,
        }),
      },
    },
  )
  assert.equal(geminiRejected.entities.placeName.value, null)
  assert.equal(geminiRejected.status, 'unresolved_best_effort')
  console.log('PASS 8: Gemini rejection removes stale entities')

  const providerFailure = await analyzeWithCollection(
    { url: 'https://www.youtube.com/watch?v=example12345' },
    youtubeMetadata('Nhà Hàng Hoa Sen Official'),
    {
      config: { evidenceValidator: 'gemini' },
      extractEntities: () =>
        entities({
          placeName: namedEntity(
            'Nhà Hàng Hoa Sen',
            0.8,
            'title',
            ['Nhà Hàng Hoa Sen Official'],
          ),
          confidence: 0.8,
          status: 'place_name_found',
        }),
      validatorOptions: {
        runValidator: async () => {
          throw new Error('mock provider failure')
        },
      },
    },
  )
  assert.equal(providerFailure.status, 'unresolved_best_effort')
  assert.equal(providerFailure.entities.placeName.value, null)
  console.log('PASS 9: Gemini provider error fails closed for risky social evidence')

  const resolvedCandidate = {
    name: 'Hoa Sen',
    formattedAddress: '125 Le Loi, District 1, Ho Chi Minh City',
    phone: null,
    lat: 10.77,
    lng: 106.7,
    placeId: 'mock-place-1',
    source: 'google',
    confidence: 0.86,
    matchReasons: ['address_similarity', 'place_name_similarity'],
  }
  const placesStrong = await analyzeWithCollection(
    {
      image: {
        buffer: Buffer.from('mock-place'),
        mimetype: 'image/png',
        originalname: 'place.png',
      },
    },
    collection({ uploadedOcrEvidence: clearStorefrontOcr() }),
    {
      config: { locationProvider: 'google' },
      placeResolverOptions: {
        resolveLocation: async () => ({
          status: 'resolved',
          resolvedLocation: resolvedCandidate,
          candidates: [resolvedCandidate],
          confidence: 0.86,
          reason: 'single_highest_ranked_candidate',
          warnings: [],
        }),
      },
    },
  )
  assert.equal(placesStrong.status, 'matched_place')
  assert.equal(placesStrong.bestResult.placeId, 'mock-place-1')
  console.log('PASS 10: strong Places match returns matched_place')

  const secondCandidate = {
    ...resolvedCandidate,
    name: 'Hoa Sen 2',
    placeId: 'mock-place-2',
    confidence: 0.79,
  }
  const placesAmbiguous = await analyzeWithCollection(
    {
      image: {
        buffer: Buffer.from('mock-ambiguous'),
        mimetype: 'image/png',
        originalname: 'ambiguous.png',
      },
    },
    collection({ uploadedOcrEvidence: clearStorefrontOcr() }),
    {
      config: { locationProvider: 'google' },
      placeResolverOptions: {
        resolveLocation: async () => ({
          status: 'multiple_candidates',
          resolvedLocation: null,
          candidates: [resolvedCandidate, secondCandidate],
          confidence: 0.86,
          reason: 'candidate_ambiguity_requires_user_choice',
          warnings: [],
        }),
      },
    },
  )
  assert.equal(placesAmbiguous.status, 'draft_candidate')
  assert.equal(placesAmbiguous.placeCandidates.length, 2)
  console.log('PASS 11: ambiguous Places results remain review-only')

  const placesNotFound = await analyzeWithCollection(
    {
      image: {
        buffer: Buffer.from('mock-not-found'),
        mimetype: 'image/png',
        originalname: 'not-found.png',
      },
    },
    collection({ uploadedOcrEvidence: clearStorefrontOcr() }),
    {
      config: { locationProvider: 'google' },
      placeResolverOptions: {
        resolveLocation: async () => ({
          status: 'not_found',
          resolvedLocation: null,
          candidates: [],
          confidence: 0,
          reason: 'no_provider_candidates',
          warnings: [],
        }),
      },
    },
  )
  assert.equal(placesNotFound.status, 'unresolved_best_effort')
  assert.equal(placesNotFound.addPlaceDraft, null)
  console.log('PASS 12: Places no-result returns unresolved_best_effort')

  let disabledFrameCalls = 0
  const frameDisabled = await analyzeVisionAutoV2(
    { url: REGRESSION_URL },
    {
      config: config({
        frameScanEnabled: false,
        metadataOcrEnabled: false,
      }),
      collectorOptions: {
        youtubeProvider: emptyYouTubeProvider({
          url: REGRESSION_URL,
          title: REGRESSION_TITLE,
        }),
        frameScanner: async () => {
          disabledFrameCalls += 1
          return mockExtractedFrames()
        },
      },
    },
  )
  assert.equal(disabledFrameCalls, 0)
  assert.equal(frameDisabled.status, 'unresolved_best_effort')
  assert.equal(frameDisabled.entities.placeName.value, null)
  assert.ok(
    frameDisabled.debug.warnings.includes('youtube_frame_scan_disabled'),
  )
  console.log('PASS 13: disabled frame scan is skipped and weak metadata stays unresolved')

  let nonYouTubeFrameCalls = 0
  const nonYouTubeFrameScan = await analyzeVisionAutoV2(
    { url: 'https://example.com/food-post' },
    {
      config: config({
        frameScanEnabled: true,
        metadataOcrEnabled: false,
      }),
      collectorOptions: {
        blogProvider: async () => ({
          platform: 'web',
          sourceUrl: 'https://example.com/food-post',
          textSources: [],
          mediaSources: [],
          warnings: [],
          debug: { extractionStatus: 'success' },
        }),
        frameScanner: async () => {
          nonYouTubeFrameCalls += 1
          return mockExtractedFrames()
        },
      },
    },
  )
  assert.equal(nonYouTubeFrameCalls, 0)
  assert.equal(nonYouTubeFrameScan.status, 'unresolved_best_effort')
  assert.ok(
    nonYouTubeFrameScan.debug.warnings.includes(
      'youtube_frame_scan_not_youtube',
    ),
  )
  console.log('PASS 13b: enabled frame scan skips non-YouTube input')

  const promoThumbnailStillScansFrames = await analyzeVisionAutoV2(
    { url: 'https://www.youtube.com/shorts/promoThumb1' },
    {
      config: config({
        frameScanEnabled: true,
        metadataOcrEnabled: true,
      }),
      collectorOptions: {
        youtubeProvider: async () => ({
          platform: 'youtube',
          sourceUrl: 'https://www.youtube.com/shorts/promoThumb1',
          textSources: [],
          mediaSources: [
            {
              type: 'thumbnail',
              url: 'https://i.ytimg.com/vi/promoThumb1/hqdefault.jpg',
              source: 'youtube_thumbnail',
            },
          ],
          warnings: [],
          debug: {
            provider: 'youtube',
            extractionStatus: 'success',
            videoId: 'promoThumb1',
          },
        }),
        downloadImage: async () => ({
          status: 'success',
          buffer: Buffer.from('mock-thumbnail'),
          contentType: 'image/jpeg',
          warnings: [],
        }),
        frameScanner: async () => mockExtractedFrames([2]),
        frameVariantBuilder: async ({ frame }) => [
          { label: 'full', buffer: frame.buffer, mimetype: 'image/jpeg' },
        ],
        extractOcr: async ({ image }) =>
          image.originalname === 'vision-auto-metadata-image'
            ? ocrEvidence([
                {
                  text: 'hơn 200 món siêu đa dạng tại Quận 11',
                  type: 'address',
                  confidence: 0.92,
                },
              ])
            : clearAddressOcr(),
      },
    },
  )
  assert.equal(promoThumbnailStillScansFrames.status, 'draft_candidate')
  assert.equal(
    promoThumbnailStillScansFrames.entities.address.source,
    'youtube_frame_ocr',
  )
  assert.equal(promoThumbnailStillScansFrames.debug.frameCount, 1)
  console.log('PASS 13c: promotional thumbnail OCR cannot suppress frame scanning')

  const ytDlpMissing = await analyzeFrameScenario({
    frameScanner: (options) =>
      extractYouTubeFrames(options, {
        runCommand: async (command) => {
          if (command === 'yt-dlp') {
            const error = new Error('mock missing binary')
            error.code = 'ENOENT'
            throw error
          }
          return { stdout: 'ffmpeg version mock' }
        },
      }),
  })
  assert.equal(ytDlpMissing.status, 'unresolved_best_effort')
  assert.ok(
    ytDlpMissing.debug.warnings.includes(
      'youtube_frame_scan_binary_missing',
    ),
  )
  console.log('PASS 14: missing yt-dlp fails closed')

  const ffmpegMissing = await analyzeFrameScenario({
    frameScanner: (options) =>
      extractYouTubeFrames(options, {
        runCommand: async (command) => {
          if (command === 'ffmpeg') {
            const error = new Error('mock missing binary')
            error.code = 'ENOENT'
            throw error
          }
          return { stdout: 'yt-dlp mock' }
        },
      }),
  })
  assert.equal(ffmpegMissing.status, 'unresolved_best_effort')
  assert.ok(
    ffmpegMissing.debug.warnings.includes(
      'youtube_frame_scan_binary_missing',
    ),
  )
  console.log('PASS 15: missing ffmpeg fails closed')

  const frameTimeout = await analyzeFrameScenario({
    frameScanner: async () => {
      const error = new Error('mock command output with secret token')
      error.code = 'youtube_frame_scan_timeout'
      throw error
    },
  })
  assert.equal(frameTimeout.status, 'unresolved_best_effort')
  assert.ok(
    frameTimeout.debug.warnings.includes('youtube_frame_scan_timeout'),
  )
  assert.doesNotMatch(JSON.stringify(frameTimeout), /secret token/i)
  console.log('PASS 16: frame extraction timeout is bounded and secret-safe')

  const durationExceeded = await analyzeFrameScenario({
    frameScanner: (options) =>
      extractYouTubeFrames(options, {
        runCommand: async (command, args) => {
          if (command === 'yt-dlp' && args.includes('--skip-download')) {
            return { stdout: '120\n' }
          }
          return { stdout: `${command} mock` }
        },
      }),
  })
  assert.equal(durationExceeded.status, 'unresolved_best_effort')
  assert.ok(
    durationExceeded.debug.warnings.includes(
      'youtube_frame_scan_duration_exceeded',
    ),
  )
  console.log('PASS 17: overlong YouTube video is skipped safely')

  const noFrames = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([]),
  })
  assert.equal(noFrames.status, 'unresolved_best_effort')
  assert.ok(
    noFrames.debug.warnings.includes('youtube_frame_scan_no_frames'),
  )
  console.log('PASS 18: empty frame extraction stays unresolved')

  const noisyFrames = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([2]),
    extractOcr: async () =>
      ocrEvidence([
        {
          text: 'MAY MIENB',
          type: 'other',
          confidence: 0.92,
        },
      ]),
  })
  assert.equal(noisyFrames.status, 'unresolved_best_effort')
  assert.equal(noisyFrames.entities.placeName.value, null)
  assert.equal(noisyFrames.addPlaceDraft, null)
  console.log('PASS 19: noisy frame OCR cannot create a fake place')

  const clearFrameAddress = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([2]),
    extractOcr: async () => clearAddressOcr(),
  })
  assert.equal(clearFrameAddress.status, 'draft_candidate')
  assert.equal(
    clearFrameAddress.entities.address.source,
    'youtube_frame_ocr',
  )
  assert.ok(clearFrameAddress.evidenceSummary.frameEvidence.length > 0)
  console.log('PASS 20: clear frame address creates a review-only draft')

  let cropOptions = null
  const boardFrameEvidence = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([5]),
    frameVariantBuilder: async (options) => {
      cropOptions = options
      return [
        {
          label: 'full',
          buffer: Buffer.from('full-frame'),
          mimetype: 'image/jpeg',
        },
        {
          label: 'center',
          buffer: Buffer.from('center-crop'),
          mimetype: 'image/jpeg',
        },
      ]
    },
    extractOcr: async ({ image }) =>
      image.sourceCrop === 'center'
        ? filteredFrameOcrEvidence([
            {
              text: '273/17 Tôn Thất Hiệp',
              type: 'address',
              confidence: 0.61,
            },
            {
              text: 'ĐT: 076.737.4469 - 078.992.5033',
              type: 'phone',
              confidence: 0.6,
            },
            {
              text: '1 TUẦN 7 MÓN',
              type: 'sign',
              confidence: 0.82,
            },
          ])
        : filteredFrameOcrEvidence([
            {
              text: 'NÀY TIỆN THIỆT',
              type: 'sign',
              confidence: 0.86,
            },
          ]),
  })
  assert.equal(cropOptions.cropEnabled, true)
  assert.equal(cropOptions.maxCropsPerFrame, 4)
  assert.equal(cropOptions.upscaleEnabled, true)
  assert.equal(boardFrameEvidence.status, 'draft_candidate')
  assert.equal(
    boardFrameEvidence.entities.address.value,
    '273/17 Tôn Thất Hiệp',
  )
  assert.equal(
    boardFrameEvidence.entities.address.source,
    'youtube_frame_ocr',
  )
  assert.deepEqual(
    boardFrameEvidence.entities.phones.map((item) => item.value),
    ['076.737.4469', '078.992.5033'],
  )
  assert.ok(
    boardFrameEvidence.entities.phones.every(
      (item) => item.source === 'youtube_frame_ocr',
    ),
  )
  assert.equal(boardFrameEvidence.entities.placeName.value, null)
  assert.equal(
    boardFrameEvidence.reason,
    'clear_address_or_contact_from_youtube_frame',
  )
  assert.doesNotMatch(
    JSON.stringify(boardFrameEvidence.entities.placeName),
    /mùi cà ri|1 tuần 7 món/i,
  )
  console.log('PASS 20a: filtered frame OCR preserves a slash address')
  console.log('PASS 20b: filtered frame OCR preserves both separated phones')
  console.log('PASS 20c: frame address and phones create a place-name-free draft')

  const mixedFrameLine =
    '27 3/17 Tôn Thất Hiệp ĐT 076.737.4469 078.99250331 TUAN 7 MÓN'
  const recoveredMixed = recoverEmbeddedYoutubeFrameEntities(mixedFrameLine)
  assert.deepEqual(
    recoveredMixed.addressCandidates,
    ['273/17 Tôn Thất Hiệp'],
  )
  assert.deepEqual(
    recoveredMixed.phones,
    ['076.737.4469', '078.992.5033'],
  )
  assert.deepEqual(
    recoverEmbeddedYoutubeFrameEntities('12 3/4 Nguyễn Trãi')
      .addressCandidates,
    ['123/4 Nguyễn Trãi'],
  )
  assert.deepEqual(
    recoverEmbeddedYoutubeFrameEntities('2 73/17 Tôn Thất Hiệp')
      .addressCandidates,
    ['273/17 Tôn Thất Hiệp'],
  )

  const mixedFrameEvidence = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([12]),
    frameVariantBuilder: async ({ frame }) => [
      {
        label: 'center',
        buffer: frame.buffer,
        mimetype: 'image/jpeg',
      },
    ],
    extractOcr: async () =>
      filteredFrameOcrEvidence([
        {
          text: mixedFrameLine,
          type: 'menu',
          confidence: 0.7,
        },
      ]),
  })
  assert.equal(mixedFrameEvidence.status, 'draft_candidate')
  assert.equal(
    mixedFrameEvidence.entities.address.value,
    '273/17 Tôn Thất Hiệp',
  )
  assert.equal(
    mixedFrameEvidence.entities.address.source,
    'youtube_frame_ocr',
  )
  assert.deepEqual(
    mixedFrameEvidence.entities.phones.map((item) => item.value),
    ['076.737.4469', '078.992.5033'],
  )
  assert.equal(mixedFrameEvidence.entities.placeName.value, null)
  assert.equal(
    mixedFrameEvidence.entities.address.evidence[0],
    mixedFrameLine,
  )
  assert.equal(
    mixedFrameEvidence.reason,
    'clear_address_or_contact_from_youtube_frame',
  )
  console.log('PASS 20c1: mixed menu OCR recovers address and phone entities')

  let mixedTimeoutAttempt = 0
  const mixedEvidenceBeforeTimeout = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([12, 18]),
    frameVariantBuilder: async ({ frame }) => [
      {
        label: 'full',
        buffer: frame.buffer,
        mimetype: 'image/jpeg',
      },
    ],
    extractOcr: async () => {
      mixedTimeoutAttempt += 1
      if (mixedTimeoutAttempt === 1) {
        return filteredFrameOcrEvidence([
          {
            text: mixedFrameLine,
            type: 'menu',
            confidence: 0.7,
          },
        ])
      }
      const error = new Error('mock timeout with command output')
      error.code = 'youtube_frame_scan_timeout'
      throw error
    },
  })
  assert.equal(mixedEvidenceBeforeTimeout.status, 'draft_candidate')
  assert.equal(
    mixedEvidenceBeforeTimeout.entities.address.value,
    '273/17 Tôn Thất Hiệp',
  )
  assert.ok(
    mixedEvidenceBeforeTimeout.debug.warnings.includes(
      'youtube_frame_scan_timeout',
    ),
  )
  assert.doesNotMatch(
    JSON.stringify(mixedEvidenceBeforeTimeout),
    /command output/i,
  )
  console.log('PASS 20c1b: later timeout does not erase recovered frame evidence')

  const laterBoardFrame = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([2, 5, 8, 12, 18]),
    frameVariantBuilder: async ({ frame }) => [
      {
        label: 'full',
        buffer: frame.buffer,
        mimetype: 'image/jpeg',
      },
      {
        label: 'center',
        buffer: frame.buffer,
        mimetype: 'image/jpeg',
      },
    ],
    extractOcr: async ({ image }) =>
      image.frameIndex === 5 && image.sourceCrop === 'center'
        ? filteredFrameOcrEvidence([
            {
              text: '273/17 Tôn Thất Hiệp',
              type: 'address',
              confidence: 0.6,
            },
          ])
        : filteredFrameOcrEvidence([]),
  })
  assert.equal(laterBoardFrame.status, 'draft_candidate')
  assert.equal(
    laterBoardFrame.entities.address.value,
    '273/17 Tôn Thất Hiệp',
  )
  console.log('PASS 20c2: crop scheduling reaches later sampled frames')

  let boundedCropAttempts = 0
  await analyzeFrameScenario({
    frameScanner: async () =>
      mockExtractedFrames([2, 5, 8, 12, 18, 24, 30, 45]),
    frameVariantBuilder: async ({ frame }) =>
      ['full', 'center', 'upper_center', 'middle', 'lower_center'].map(
        (label) => ({
          label,
          buffer: frame.buffer,
          mimetype: 'image/jpeg',
        }),
      ),
    extractOcr: async () => {
      boundedCropAttempts += 1
      return filteredFrameOcrEvidence([])
    },
  })
  assert.equal(boundedCropAttempts, 40)
  console.log('PASS 20c3: total frame OCR attempts remain bounded')

  const addressOnlyFrame = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([5]),
    frameVariantBuilder: async ({ frame }) => [
      {
        label: 'center',
        buffer: frame.buffer,
        mimetype: 'image/jpeg',
      },
    ],
    extractOcr: async () =>
      filteredFrameOcrEvidence([
        {
          text: '273/17 Tôn Thất Hiệp',
          type: 'address',
          confidence: 0.58,
        },
      ]),
  })
  assert.equal(addressOnlyFrame.status, 'draft_candidate')
  assert.equal(
    addressOnlyFrame.entities.address.value,
    '273/17 Tôn Thất Hiệp',
  )
  assert.equal(addressOnlyFrame.entities.placeName.value, null)
  console.log('PASS 20d: address-only frame OCR can create a review-only draft')

  const phoneOnlyFrame = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([5]),
    frameVariantBuilder: async ({ frame }) => [
      {
        label: 'center',
        buffer: frame.buffer,
        mimetype: 'image/jpeg',
      },
    ],
    extractOcr: async () =>
      filteredFrameOcrEvidence([
        {
          text: 'ĐT: 076.737.4469 - 078.992.5033',
          type: 'phone',
          confidence: 0.64,
        },
      ]),
  })
  assert.equal(phoneOnlyFrame.status, 'unresolved_best_effort')
  assert.equal(phoneOnlyFrame.entities.address.value, null)
  assert.equal(phoneOnlyFrame.entities.placeName.value, null)
  assert.equal(phoneOnlyFrame.entities.phones.length, 2)
  console.log('PASS 20e: phone-only frame evidence remains unresolved')

  const subtitleOnlyFrame = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([5]),
    extractOcr: async () =>
      ocrEvidence([
        {
          text: 'QUÁN CÓ MÙI',
          type: 'sign',
          confidence: 0.91,
        },
        {
          text: 'NÀY LÀ TRUYỀN MIỆNG NHAU',
          type: 'sign',
          confidence: 0.9,
        },
      ]),
  })
  assert.equal(subtitleOnlyFrame.status, 'unresolved_best_effort')
  assert.equal(subtitleOnlyFrame.entities.placeName.value, null)
  console.log('PASS 20f: subtitle-only frames cannot create place names')

  const menuOnlyFrame = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([5]),
    extractOcr: async () =>
      ocrEvidence([
        {
          text: '1 TUẦN 7 MÓN',
          type: 'sign',
          confidence: 0.93,
        },
        {
          text: 'BÚN RIÊU',
          type: 'sign',
          confidence: 0.9,
        },
        {
          text: 'MÌ VỊT TIỀM',
          type: 'sign',
          confidence: 0.88,
        },
      ]),
  })
  assert.equal(menuOnlyFrame.status, 'unresolved_best_effort')
  assert.equal(menuOnlyFrame.entities.placeName.value, null)
  console.log('PASS 20g: schedule and menu lines do not create a place name')

  const curryHeadingFrame = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([5]),
    extractOcr: async () =>
      ocrEvidence([
        {
          text: 'MÙI CÀ RI',
          type: 'sign',
          confidence: 0.94,
        },
      ]),
  })
  assert.equal(curryHeadingFrame.status, 'unresolved_best_effort')
  assert.equal(curryHeadingFrame.entities.placeName.value, null)
  console.log('PASS 20h: a dish-like menu heading cannot become placeName')

  const subtitleAndAddressFrame = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([5]),
    extractOcr: async () =>
      ocrEvidence([
        {
          text: 'NÀY TIỆN THIỆT',
          type: 'sign',
          confidence: 0.93,
        },
        {
          text: '273/17 Tôn Thất Hiệp',
          type: 'address',
          confidence: 0.66,
        },
      ]),
  })
  assert.equal(subtitleAndAddressFrame.status, 'draft_candidate')
  assert.equal(
    subtitleAndAddressFrame.entities.address.value,
    '273/17 Tôn Thất Hiệp',
  )
  assert.equal(subtitleAndAddressFrame.entities.placeName.value, null)
  console.log('PASS 20i: subtitle noise is ignored while frame address survives')

  assert.doesNotMatch(
    JSON.stringify(boardFrameEvidence),
    /rawCandidateCount|topRawCandidates|recoveredEntities|sourceCrop|center-crop|temp(?:orary)?[\\/]/i,
  )
  console.log('PASS 20j: public Vision Auto output excludes raw crop diagnostics')

  const clearFramePlace = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([2]),
    extractOcr: async () =>
      ocrEvidence([
        {
          text: 'NHA HANG HOA SEN',
          type: 'sign',
          confidence: 0.94,
        },
        {
          text: 'Address: 125 Le Loi, Q.1, TP HCM',
          type: 'address',
          confidence: 0.93,
        },
      ]),
  })
  assert.equal(clearFramePlace.status, 'draft_candidate')
  assert.equal(
    clearFramePlace.entities.placeName.source,
    'youtube_frame_ocr',
  )
  assert.equal(clearFramePlace.entities.address.source, 'youtube_frame_ocr')
  console.log('PASS 21: clear frame place and address create a review-only draft')

  const singleFrameAddress = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([2]),
    extractOcr: async () =>
      ocrEvidence([
        {
          text: '65 Duong Lang',
          type: 'address',
          confidence: 0.7,
        },
      ]),
  })
  const repeatedFrameAddress = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([2, 5]),
    extractOcr: async () =>
      ocrEvidence([
        {
          text: '65 Duong Lang',
          type: 'address',
          confidence: 0.7,
        },
      ]),
  })
  assert.ok(
    repeatedFrameAddress.entities.address.confidence >
      singleFrameAddress.entities.address.confidence,
  )
  assert.equal(
    repeatedFrameAddress.evidenceSummary.frameEvidence[0].supportCount,
    2,
  )
  console.log('PASS 22: repeated frame evidence receives a bounded confidence boost')

  const frameDerivedCandidate = entities({
    placeName: namedEntity(
      'NHA HANG MAY MIENB',
      0.86,
      'youtube_frame_ocr',
      ['NHA HANG MAY MIENB'],
    ),
    confidence: 0.86,
    status: 'place_name_found',
  })
  const rejectedFrameEntity = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([2]),
    extractOcr: async () =>
      ocrEvidence([
        {
          text: 'NHA HANG MAY MIENB',
          type: 'sign',
          confidence: 0.92,
        },
      ]),
    configOverrides: {
      evidenceValidator: 'gemini',
    },
    dependencies: {
      extractEntities: () => frameDerivedCandidate,
      validatorOptions: {
        runValidator: async () => ({
          provider: 'gemini',
          mode: 'gemini',
          requested: true,
          applied: true,
          status: 'rejected',
          confidence: 0.9,
          rejectedEntities: [
            {
              field: 'placeName',
              value: 'NHA HANG MAY MIENB',
              reason: 'No reliable business identity.',
            },
          ],
          canResolveLocation: false,
          warnings: [],
          entities: frameDerivedCandidate,
        }),
      },
    },
  })
  assert.equal(rejectedFrameEntity.entities.placeName.value, null)
  assert.equal(rejectedFrameEntity.status, 'unresolved_best_effort')
  console.log('PASS 23: Gemini rejection removes stale frame-derived entities')

  const noisyRegressionFrames = await analyzeVisionAutoV2(
    { url: REGRESSION_URL },
    {
      config: config({
        frameScanEnabled: true,
        metadataOcrEnabled: false,
      }),
      collectorOptions: {
        youtubeProvider: emptyYouTubeProvider({
          url: REGRESSION_URL,
          title: REGRESSION_TITLE,
        }),
        frameScanner: async () => mockExtractedFrames([2]),
        extractOcr: async () =>
          ocrEvidence([
            {
              text: 'MAY MIENB',
              type: 'other',
              confidence: 0.91,
            },
          ]),
      },
    },
  )
  assert.equal(noisyRegressionFrames.status, 'unresolved_best_effort')
  assert.equal(noisyRegressionFrames.entities.placeName.value, null)
  assert.doesNotMatch(
    JSON.stringify(noisyRegressionFrames.entities.locationHints),
    /quan 7/i,
  )
  console.log('PASS 24: regression URL remains safe with mocked noisy frames')

  const cleanupCalls = []
  const successfulExtraction = await extractYouTubeFrames(
    {
      url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      maxFrames: 1,
      maxDurationSeconds: 60,
      timeoutMs: 5_000,
    },
    {
      runCommand: async (command, args) => {
        if (command === 'yt-dlp' && args.includes('--skip-download')) {
          return { stdout: '20\n' }
        }
        return { stdout: `${command} mock` }
      },
      makeDirectory: async () => {},
      makeTempDirectory: async () => 'C:\\mock\\frame-success',
      listDirectory: async () => ['video.mp4'],
      statFile: async () => ({
        isFile: () => true,
        size: 1_024,
      }),
      readFrameFile: async () => Buffer.from('mock-jpeg'),
      removeDirectory: async (directory) => {
        cleanupCalls.push(directory)
      },
    },
  )
  assert.equal(successfulExtraction.frames.length, 1)
  assert.equal(successfulExtraction.durationSource, 'metadata')
  assert.equal(successfulExtraction.metadataDurationSeconds, 20)
  assert.deepEqual(cleanupCalls, ['C:\\mock\\frame-success'])

  const ffprobeCleanupCalls = []
  const ffprobeResolvedExtraction = await extractYouTubeFrames(
    {
      url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      maxFrames: 1,
      maxDurationSeconds: 60,
      timeoutMs: 5_000,
    },
    {
      runCommand: async (command, args) => {
        if (command === 'yt-dlp' && args.includes('--skip-download')) {
          return {
            stdout:
              '{"duration":null,"duration_string":null,"approx_duration":null}',
          }
        }
        if (command === 'ffprobe' && args.includes('-show_entries')) {
          return { stdout: '26.0\n' }
        }
        return { stdout: `${command} mock` }
      },
      makeDirectory: async () => {},
      makeTempDirectory: async () => 'C:\\mock\\frame-ffprobe-success',
      listDirectory: async () => ['video.mp4'],
      statFile: async () => ({
        isFile: () => true,
        size: 1_024,
      }),
      readFrameFile: async () => Buffer.from('mock-jpeg'),
      removeDirectory: async (directory) => {
        ffprobeCleanupCalls.push(directory)
      },
    },
  )
  assert.equal(ffprobeResolvedExtraction.frames.length, 1)
  assert.equal(ffprobeResolvedExtraction.metadataDurationSeconds, null)
  assert.equal(ffprobeResolvedExtraction.durationSeconds, 26)
  assert.equal(ffprobeResolvedExtraction.durationSource, 'ffprobe')
  assert.equal(ffprobeResolvedExtraction.frameScanSkippedReason, null)
  assert.ok(
    ffprobeResolvedExtraction.warnings.includes(
      'youtube_metadata_duration_unavailable',
    ),
  )
  assert.ok(
    ffprobeResolvedExtraction.warnings.includes(
      'youtube_duration_resolved_by_ffprobe',
    ),
  )
  assert.deepEqual(ffprobeCleanupCalls, [
    'C:\\mock\\frame-ffprobe-success',
  ])

  const ffprobeUnavailableExtraction = await extractYouTubeFrames(
    {
      url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      maxFrames: 1,
      maxDurationSeconds: 60,
      timeoutMs: 5_000,
    },
    {
      runCommand: async (command, args) => {
        if (command === 'yt-dlp' && args.includes('--skip-download')) {
          return {
            stdout:
              '{"duration":null,"duration_string":null,"approx_duration":null}',
          }
        }
        if (command === 'ffprobe' && args.includes('-show_entries')) {
          throw new Error(
            'raw command output C:\\mock\\private-video.mp4 secret-cookie',
          )
        }
        return { stdout: `${command} mock` }
      },
      makeDirectory: async () => {},
      makeTempDirectory: async () => 'C:\\mock\\frame-ffprobe-unavailable',
      listDirectory: async () => ['video.mp4'],
      statFile: async () => ({
        isFile: () => true,
        size: 1_024,
      }),
      readFrameFile: async () => Buffer.from('mock-jpeg'),
      removeDirectory: async () => {},
    },
  )
  assert.equal(ffprobeUnavailableExtraction.status, 'skipped')
  assert.equal(ffprobeUnavailableExtraction.frames.length, 0)
  assert.equal(ffprobeUnavailableExtraction.metadataDurationSeconds, null)
  assert.equal(ffprobeUnavailableExtraction.durationSeconds, null)
  assert.equal(ffprobeUnavailableExtraction.durationSource, 'unavailable')
  assert.equal(
    ffprobeUnavailableExtraction.frameScanSkippedReason,
    'youtube_frame_scan_skipped_duration_unavailable',
  )
  assert.ok(
    ffprobeUnavailableExtraction.warnings.includes(
      'youtube_frame_scan_skipped_duration_unavailable',
    ),
  )
  assert.doesNotMatch(
    JSON.stringify(ffprobeUnavailableExtraction),
    /raw command output|private-video|secret-cookie|C:\\mock/i,
  )

  const ffprobeOverlongExtraction = await extractYouTubeFrames(
    {
      url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      maxFrames: 1,
      maxDurationSeconds: 60,
      timeoutMs: 5_000,
    },
    {
      runCommand: async (command, args) => {
        if (command === 'yt-dlp' && args.includes('--skip-download')) {
          return {
            stdout:
              '{"duration":null,"duration_string":null,"approx_duration":null}',
          }
        }
        if (command === 'ffprobe' && args.includes('-show_entries')) {
          return { stdout: '120\n' }
        }
        return { stdout: `${command} mock` }
      },
      makeDirectory: async () => {},
      makeTempDirectory: async () => 'C:\\mock\\frame-ffprobe-overlong',
      listDirectory: async () => ['video.webm'],
      statFile: async () => ({
        isFile: () => true,
        size: 1_024,
      }),
      readFrameFile: async () => Buffer.from('mock-jpeg'),
      removeDirectory: async () => {},
    },
  )
  assert.equal(ffprobeOverlongExtraction.status, 'skipped')
  assert.equal(ffprobeOverlongExtraction.frames.length, 0)
  assert.equal(ffprobeOverlongExtraction.durationSeconds, 120)
  assert.equal(ffprobeOverlongExtraction.durationSource, 'ffprobe')
  assert.equal(
    ffprobeOverlongExtraction.frameScanSkippedReason,
    'youtube_frame_scan_skipped_duration_too_long',
  )
  assert.ok(
    ffprobeOverlongExtraction.warnings.includes(
      'youtube_frame_scan_skipped_duration_too_long',
    ),
  )

  const durationDiagnostics = await collectVisionEvidence(
    {
      input: {
        type: 'youtube_url',
        platform: 'youtube',
        url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      },
      config: config({
        frameScanEnabled: true,
        frameScanMaxFrames: 1,
      }),
    },
    {
      youtubeProvider: emptyYouTubeProvider(),
      frameScanner: async () => ffprobeUnavailableExtraction,
    },
  )
  assert.equal(durationDiagnostics.debug.frameMetadataDurationSeconds, null)
  assert.equal(durationDiagnostics.debug.frameDurationSeconds, null)
  assert.equal(durationDiagnostics.debug.frameDurationSource, 'unavailable')
  assert.equal(
    durationDiagnostics.debug.frameScanSkippedReason,
    'youtube_frame_scan_skipped_duration_unavailable',
  )
  assert.equal(durationDiagnostics.debug.frameBinaries.ffprobeAvailable, true)
  assert.doesNotMatch(
    JSON.stringify(durationDiagnostics),
    /raw command output|private-video|secret-cookie|C:\\mock/i,
  )
  console.log(
    'PASS 25a: null metadata duration falls back to bounded ffprobe diagnostics',
  )

  const cleanupFailure = await extractYouTubeFrames(
    {
      url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      maxFrames: 1,
      maxDurationSeconds: 60,
      timeoutMs: 5_000,
    },
    {
      runCommand: async (command, args) => {
        if (command === 'yt-dlp' && args.includes('--skip-download')) {
          return { stdout: '20\n' }
        }
        return { stdout: `${command} mock` }
      },
      makeDirectory: async () => {},
      makeTempDirectory: async () => 'C:\\mock\\frame-cleanup-fail',
      listDirectory: async () => ['video.mp4'],
      statFile: async () => ({
        isFile: () => true,
        size: 1_024,
      }),
      readFrameFile: async () => Buffer.from('mock-jpeg'),
      removeDirectory: async () => {
        throw new Error('mock cleanup failure with local path')
      },
    },
  )
  assert.ok(
    cleanupFailure.warnings.includes('youtube_frame_scan_cleanup_failed'),
  )
  assert.doesNotMatch(JSON.stringify(cleanupFailure), /local path/i)
  console.log('PASS 25: temp files are cleaned on success and cleanup failures are bounded')

  const timedOutExtractionAttempts = []
  const timedOutExtractionCleanupCalls = []
  const partialTimedOutExtraction = await extractYouTubeFrames(
    {
      url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      maxFrames: 60,
      maxDurationSeconds: 60,
      timeoutMs: 30_000,
      mode: 'dense_1fps',
    },
    {
      runCommand: async (command, args) => {
        if (command === 'yt-dlp' && args.includes('--skip-download')) {
          return { stdout: '55\n' }
        }
        if (command === 'ffmpeg' && args.includes('-ss')) {
          const timestamp = Number(args[args.indexOf('-ss') + 1])
          timedOutExtractionAttempts.push(timestamp)
          if (timedOutExtractionAttempts.length > 18) {
            const error = new Error('mock frame timeout with secret path')
            error.code = 'youtube_frame_scan_timeout'
            throw error
          }
          return { stdout: 'mock frame extracted' }
        }
        return { stdout: `${command} mock` }
      },
      makeDirectory: async () => {},
      makeTempDirectory: async () => 'C:\\mock\\frame-timeout-coverage',
      listDirectory: async () => ['video.mp4'],
      statFile: async () => ({
        isFile: () => true,
        size: 1_024,
      }),
      readFrameFile: async () => Buffer.from('mock-jpeg'),
      removeDirectory: async (directory) => {
        timedOutExtractionCleanupCalls.push(directory)
      },
    },
  )
  const partialTimedOutTimestamps = partialTimedOutExtraction.frames.map(
    (frame) => frame.timestampSeconds,
  )
  assert.equal(partialTimedOutExtraction.status, 'success')
  assert.equal(partialTimedOutExtraction.frames.length, 18)
  assert.ok(
    partialTimedOutExtraction.warnings.includes(
      'youtube_frame_scan_timeout',
    ),
  )
  assert.deepEqual(
    partialTimedOutTimestamps.slice(0, 10),
    [1, 2, 3, 4, 5, 54, 53, 52, 51, 50],
  )
  assert.ok(partialTimedOutTimestamps.some((value) => value <= 5))
  assert.ok(partialTimedOutTimestamps.some((value) => value >= 50))
  assert.ok(
    partialTimedOutTimestamps.some((value) => value >= 20 && value <= 35),
  )
  assert.equal(
    partialTimedOutTimestamps.every((value, index) => value === index + 1),
    false,
  )
  assert.deepEqual(timedOutExtractionCleanupCalls, [
    'C:\\mock\\frame-timeout-coverage',
  ])
  assert.doesNotMatch(
    JSON.stringify(partialTimedOutExtraction),
    /secret path|C:\\mock/i,
  )
  console.log('PASS 25b: dense timeout extraction keeps broad timestamp coverage')

  const debugDirectories = []
  const debugFrames = []
  const emptyFrameDiagnostics = createManualFrameOcrDiagnostics({
    keepDebugFrames: true,
    videoId: 'dQw4w9WgXcQ',
    configuredProvider: 'google_vision',
    debugFrameRoot: path.join(
      process.cwd(),
      'tmp',
      'vision-frame-debug',
    ),
    frameScanner: async () => mockExtractedFrames([2]),
    extractOcr: async () => ({
      text: null,
      usable: false,
      ocrUsable: false,
      confidence: 0,
      reason: 'no_text',
      lines: [],
      strongLines: [],
      weakLines: [],
      warnings: [],
      debug: {
        providerMode: 'google_vision',
        providerUsed: 'google_vision',
        providerStatus: 'empty',
        fallbackReason: null,
      },
    }),
    makeDirectory: async (directory) => {
      debugDirectories.push(directory)
    },
    writeFrame: async (fileName, buffer) => {
      debugFrames.push({ fileName, buffer })
    },
    now: () => new Date('2026-06-20T12:34:56.000Z'),
  })
  await emptyFrameDiagnostics.collectorOptions.frameScanner({})
  await emptyFrameDiagnostics.collectorOptions.extractOcr(
    {
      image: {
        buffer: Buffer.from('mock-frame'),
        mimetype: 'image/jpeg',
        originalname: 'vision-auto-youtube-frame.jpg',
      },
    },
    { provider: 'google_vision' },
  )
  const emptyFrameSnapshot = emptyFrameDiagnostics.snapshot()
  assert.equal(debugDirectories.length, 1)
  assert.equal(debugFrames.length, 1)
  assert.match(
    emptyFrameSnapshot.debugFrameDir,
    /^backend\/tmp\/vision-frame-debug\/dQw4w9WgXcQ-2026-06-20T12-34-56-000Z$/,
  )
  assert.equal(emptyFrameSnapshot.ocr.providerMode, 'google_vision')
  assert.equal(emptyFrameSnapshot.ocr.providerUsed, 'google_vision')
  assert.equal(emptyFrameSnapshot.ocr.frameAttempts, 1)
  assert.equal(emptyFrameSnapshot.ocr.frameSuccesses, 0)
  assert.equal(emptyFrameSnapshot.ocr.outcomes.providerReturnedEmpty, 1)
  assert.deepEqual(emptyFrameSnapshot.ocr.providerWarnings, [])
  assert.ok(
    emptyFrameSnapshot.warningCodes.includes(
      'frame_ocr_provider_returned_empty',
    ),
  )

  const failedFrameDiagnostics = createManualFrameOcrDiagnostics({
    keepDebugFrames: false,
    configuredProvider: 'google_vision',
    frameScanner: async () => mockExtractedFrames([2]),
    extractOcr: async () => ({
      text: null,
      usable: false,
      ocrUsable: false,
      confidence: 0,
      reason: 'provider_unavailable',
      lines: [],
      strongLines: [],
      weakLines: [],
      warnings: ['provider failed with secret token'],
      debug: {
        providerMode: 'google_vision',
        providerUsed: 'google_vision',
        providerStatus: 'error',
        fallbackReason: null,
      },
    }),
  })
  await failedFrameDiagnostics.collectorOptions.frameScanner({})
  await failedFrameDiagnostics.collectorOptions.extractOcr(
    {
      image: {
        buffer: Buffer.from('mock-frame'),
        mimetype: 'image/jpeg',
        originalname: 'vision-auto-youtube-frame.jpg',
      },
    },
    { provider: 'google_vision' },
  )
  const failedFrameSnapshot = failedFrameDiagnostics.snapshot()
  assert.equal(failedFrameSnapshot.debugFrameDir, null)
  assert.equal(failedFrameSnapshot.ocr.outcomes.providerFailed, 1)
  assert.deepEqual(
    failedFrameSnapshot.ocr.providerWarnings,
    ['provider_warning'],
  )
  assert.ok(
    failedFrameSnapshot.warningCodes.includes('frame_ocr_provider_failed'),
  )
  assert.ok(failedFrameSnapshot.warningCodes.includes('frame_ocr_failed'))
  assert.doesNotMatch(
    JSON.stringify(failedFrameSnapshot),
    /secret token/i,
  )

  const fallbackFrameDiagnostics = createManualFrameOcrDiagnostics({
    keepDebugFrames: false,
    configuredProvider: 'google_vision',
    frameScanner: async () => mockExtractedFrames([2]),
    extractOcr: async () => ({
      ...clearAddressOcr(),
      debug: {
        providerMode: 'google_vision',
        providerUsed: 'tesseract',
        providerStatus: 'success',
        fallbackReason: 'error',
      },
    }),
  })
  await fallbackFrameDiagnostics.collectorOptions.frameScanner({})
  await fallbackFrameDiagnostics.collectorOptions.extractOcr(
    {
      image: {
        buffer: Buffer.from('mock-frame'),
        mimetype: 'image/jpeg',
        originalname: 'vision-auto-youtube-frame.jpg',
      },
    },
    { provider: 'google_vision' },
  )
  const fallbackFrameSnapshot = fallbackFrameDiagnostics.snapshot()
  assert.equal(fallbackFrameSnapshot.ocr.providerUsed, 'tesseract')
  assert.equal(fallbackFrameSnapshot.ocr.fallbackUsed, true)
  assert.equal(fallbackFrameSnapshot.ocr.frameSuccesses, 1)
  assert.ok(
    fallbackFrameSnapshot.ocr.providerWarnings.includes(
      'google_vision_failed',
    ),
  )

  const rawCandidateDiagnostics = createManualFrameOcrDiagnostics({
    keepDebugFrames: false,
    configuredProvider: 'google_vision',
    frameScanner: async () => mockExtractedFrames([5]),
    extractOcr: async () =>
      filteredFrameOcrEvidence([
        {
          text: mixedFrameLine,
          type: 'menu',
          confidence: 0.7,
        },
        ...Array.from({ length: 20 }, (_, index) => ({
          text: `NOISE CANDIDATE ${index + 1}`,
          type: 'other',
          confidence: 0.2,
        })),
      ]),
  })
  await rawCandidateDiagnostics.collectorOptions.frameScanner({})
  await rawCandidateDiagnostics.collectorOptions.extractOcr(
    {
      image: {
        buffer: Buffer.from('mock-center-crop'),
        mimetype: 'image/jpeg',
        originalname: 'vision-auto-youtube-frame.jpg',
        frameIndex: 1,
        timestampSeconds: 5,
        sourceCrop: 'center',
      },
    },
    { provider: 'google_vision' },
  )
  const rawCandidateSnapshot = rawCandidateDiagnostics.snapshot()
  assert.equal(rawCandidateSnapshot.ocr.frames.length, 1)
  assert.equal(rawCandidateSnapshot.ocr.frames[0].sourceCrops[0], 'center')
  assert.ok(rawCandidateSnapshot.ocr.frames[0].rawCandidateCount <= 16)
  assert.ok(
    rawCandidateSnapshot.ocr.frames[0].topRawCandidates.length <= 8,
  )
  assert.deepEqual(
    rawCandidateSnapshot.ocr.frames[0].keptLines,
    [
      '273/17 Tôn Thất Hiệp',
      'ĐT: 076.737.4469',
      'ĐT: 078.992.5033',
    ],
  )
  assert.deepEqual(
    rawCandidateSnapshot.ocr.frames[0].recoveredEntities,
    {
      addressCandidates: ['273/17 Tôn Thất Hiệp'],
      phones: ['076.737.4469', '078.992.5033'],
    },
  )
  assert.doesNotMatch(
    JSON.stringify(rawCandidateSnapshot),
    /raw provider payload|mock-center-crop/i,
  )
  console.log('PASS 25c: manual frame OCR diagnostics are bounded, local-only, and provider-aware')

  const speechFailure = await analyzeVisionAutoV2(
    { url: 'https://www.youtube.com/shorts/speechFail1' },
    {
      config: config({
        speechToTextEnabled: true,
        metadataOcrEnabled: false,
      }),
      collectorOptions: {
        youtubeProvider: async () => ({
          platform: 'youtube',
          sourceUrl: 'https://www.youtube.com/shorts/speechFail1',
          textSources: [],
          mediaSources: [],
          warnings: [],
          debug: {
            provider: 'youtube',
            extractionStatus: 'success',
            videoId: 'speechFail1',
          },
        }),
        speechTranscriber: async () => {
          throw new Error('speech provider failed')
        },
      },
    },
  )
  assert.equal(speechFailure.status, 'unresolved_best_effort')
  assert.ok(speechFailure.debug.warnings.includes('speech_to_text_failed'))
  console.log('PASS 26: Speech-to-Text provider failure is bounded and unresolved')

  const denseShort = selectedTimestamps(55, 60, 'dense_1fps')
  assert.equal(denseShort.length, 54)
  assert.deepEqual(
    denseShort.slice(0, 18),
    [1, 2, 3, 4, 5, 54, 53, 52, 51, 50, 10, 15, 20, 25, 30, 35, 40, 45],
  )
  assert.deepEqual(
    [...denseShort].sort((left, right) => left - right),
    Array.from({ length: 54 }, (_, index) => index + 1),
  )
  const denseLong = selectedTimestamps(180, 60, 'dense_1fps')
  assert.equal(denseLong.length, 60)
  assert.deepEqual(denseLong.slice(0, 5), [1, 2, 3, 4, 5])
  assert.ok(denseLong.slice(0, 10).some((value) => value >= 175))
  assert.ok(denseLong.some((value) => value >= 80 && value <= 100))
  assert.ok(denseLong.every((value) => value >= 1 && value <= 179))
  const longSample = selectedTimestamps(180, 12, 'sampled')
  assert.equal(longSample.length, 12)
  assert.deepEqual(longSample.slice(0, 4), [1, 2, 3, 4])
  assert.ok(longSample.some((value) => value >= 176))
  assert.ok(longSample.some((value) => value > 4 && value < 176))
  console.log('PASS 26a: dense and sampled timestamps cover full video windows')

  const boundedConfig = getVisionAutoConfig({
    OCR_PROVIDER: 'tesseract',
    OCR_FALLBACK_TO_TESSERACT: 'true',
    GOOGLE_VISION_TIMEOUT_MS: '15000',
    YOUTUBE_FRAME_SCAN_MODE: 'dense_1fps',
    YOUTUBE_FRAME_SCAN_MAX_FRAMES: '60',
    YOUTUBE_FRAME_SCAN_MAX_DURATION_SECONDS: '180',
    YOUTUBE_FRAME_SCAN_TIMEOUT_MS: '180000',
    YOUTUBE_FRAME_DOWNLOAD_TIMEOUT_MS: '180000',
  })
  assert.equal(boundedConfig.ocrProvider, 'google_vision')
  assert.equal(boundedConfig.ocrFallbackToTesseract, false)
  assert.equal(boundedConfig.googleVisionTimeoutMs, 15_000)
  assert.equal(boundedConfig.frameScanMaxFrames, 60)
  assert.equal(boundedConfig.frameScanMaxDurationSeconds, 180)
  assert.equal(boundedConfig.frameDownloadTimeoutMs, 180_000)
  console.log('PASS 26b: Vision Auto config is Google Vision-only and supports 180s scans')

  let forcedOcrOptions = null
  await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([2]),
    frameVariantBuilder: async ({ frame }) => [
      { label: 'full', buffer: frame.buffer, mimetype: 'image/jpeg' },
    ],
    configOverrides: {
      ocrProvider: 'tesseract',
      ocrFallbackToTesseract: true,
    },
    extractOcr: async (_request, options) => {
      forcedOcrOptions = options
      return ocrEvidence([], { usable: false })
    },
  })
  assert.deepEqual(forcedOcrOptions, {
    provider: 'google_vision',
    fallbackToTesseract: false,
  })
  console.log('PASS 26c: collector cannot fall back to Tesseract')

  const labeledMetadataWinsOverFrameVariants = await analyzeVisionAutoV2(
    { url: 'https://www.youtube.com/shorts/metadataWins1' },
    {
      config: config({
        frameScanEnabled: true,
        metadataOcrEnabled: false,
      }),
      collectorOptions: {
        youtubeProvider: async () => ({
          platform: 'youtube',
          sourceUrl: 'https://www.youtube.com/shorts/metadataWins1',
          textSources: [
            {
              type: 'youtube_description',
              text: 'Địa chỉ: 134 Trần Phú, Ngô Quyền, Hải Phòng',
              confidence: 0.88,
              source: 'youtube_api',
            },
          ],
          mediaSources: [],
          warnings: [],
          debug: {
            provider: 'youtube',
            extractionStatus: 'success',
            videoId: 'metadataWins1',
          },
        }),
        frameScanner: async () => mockExtractedFrames([8, 9]),
        frameVariantBuilder: async ({ frame }) => [
          { label: 'full', buffer: frame.buffer, mimetype: 'image/jpeg' },
        ],
        extractOcr: async ({ image }) =>
          ocrEvidence([
            {
              text:
                image.frameIndex === 1
                  ? '184 TRẦN PHÚ'
                  : '134 TRẦN PHÚ',
              type: 'address',
              confidence: 0.9,
            },
          ]),
      },
    },
  )
  assert.equal(labeledMetadataWinsOverFrameVariants.status, 'draft_candidate')
  assert.equal(
    labeledMetadataWinsOverFrameVariants.entities.address.value,
    '134 Trần Phú, Ngô Quyền, Hải Phòng',
  )
  assert.equal(
    labeledMetadataWinsOverFrameVariants.entities.address.source,
    'youtube_description',
  )
  assert.equal('candidates' in labeledMetadataWinsOverFrameVariants, false)
  console.log('PASS 26c1: labeled description address outranks OCR variants')

  const damagedOcrLine =
    'D 819 CALMETTE NGUYỄN THÁI BÌNH QUẬN 1 TP.HCM'
  const damagedFrameOptions = {
    frameScanner: async () => mockExtractedFrames([18]),
    frameVariantBuilder: async ({ frame }) => [
      { label: 'full', buffer: frame.buffer, mimetype: 'image/jpeg' },
    ],
    extractOcr: async () =>
      ocrEvidence([
        {
          text: damagedOcrLine,
          type: 'address',
          confidence: 0.86,
        },
      ]),
  }
  const repairedDamagedAddress = await analyzeFrameScenario({
    ...damagedFrameOptions,
    dependencies: {
      validatorOptions: {
        geminiOptions: {
          ocrAddressRepairOptions: {
            apiKey: 'mock-key',
            model: 'mock-model',
            invokeGemini: async () =>
              JSON.stringify({
                address: '19 Calmette, Nguyễn Thái Bình, Quận 1, TP.HCM',
                confidence: 0.82,
                reason: 'Damaged address label merged into the house number.',
                needsVerification: true,
              }),
          },
        },
      },
    },
  })
  assert.equal(repairedDamagedAddress.status, 'draft_candidate')
  assert.equal(
    repairedDamagedAddress.entities.address.value,
    '19 Calmette, Nguyễn Thái Bình, Quận 1, TP.HCM',
  )
  assert.equal(
    repairedDamagedAddress.entities.address.source,
    'gemini_ocr_repair',
  )
  assert.equal(repairedDamagedAddress.entities.address.reviewRequired, true)
  assert.equal(repairedDamagedAddress.debug.geminiOcrRepairStatus, 'applied')

  const rejectedDamagedAddress = await analyzeFrameScenario({
    ...damagedFrameOptions,
    dependencies: {
      validatorOptions: {
        geminiOptions: {
          ocrAddressRepairOptions: { apiKey: '' },
        },
      },
    },
  })
  assert.equal(rejectedDamagedAddress.status, 'unresolved_best_effort')
  assert.equal(rejectedDamagedAddress.entities.address.value, null)
  assert.equal(rejectedDamagedAddress.addPlaceDraft, null)
  assert.doesNotMatch(JSON.stringify(rejectedDamagedAddress), /"address":"819 Calmette/i)
  console.log('PASS 26d: damaged OCR is repaired with support or rejected safely')

  const multipleFrameAddresses = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([8, 20, 34]),
    frameVariantBuilder: async ({ frame }) => [
      { label: 'full', buffer: frame.buffer, mimetype: 'image/jpeg' },
    ],
    extractOcr: async ({ image }) => {
      const values = [
        '66 Lãnh Binh Thăng, Q.11',
        '259 Tạ Uyên, Q.11',
        '101 Thái Phiên, Q.11',
      ]
      return ocrEvidence([
        {
          text: values[image.frameIndex - 1],
          type: 'address',
          confidence: 0.88,
        },
      ])
    },
  })
  assert.equal(multipleFrameAddresses.status, 'multi_candidate')
  assert.equal(multipleFrameAddresses.addPlaceDraft, null)
  assert.equal(multipleFrameAddresses.reviewRequired, true)
  assert.equal(multipleFrameAddresses.candidates.length, 3)
  assert.deepEqual(
    multipleFrameAddresses.candidates.map((item) => item.timestampSeconds),
    [8, 20, 34],
  )
  assert.ok(
    multipleFrameAddresses.candidates.every(
      (item) => item.source === 'youtube_frame_ocr',
    ),
  )
  console.log('PASS 26e: distinct timestamped addresses return multi_candidate')

  const apartmentFrameAddress = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([42]),
    frameVariantBuilder: async ({ frame }) => [
      { label: 'full', buffer: frame.buffer, mimetype: 'image/jpeg' },
    ],
    extractOcr: async () =>
      ocrEvidence([
        {
          text:
            'Lô G1 Chung Cư 18B Nguyễn Đình Chiểu Đa Kao Quận 1',
          type: 'address',
          confidence: 0.95,
        },
      ]),
  })
  assert.equal(apartmentFrameAddress.status, 'draft_candidate')
  assert.equal(
    apartmentFrameAddress.entities.address.value,
    'Lô G1 Chung Cư 18B Nguyễn Đình Chiểu, Đa Kao, Quận 1',
  )
  assert.equal(
    apartmentFrameAddress.addPlaceDraft.address,
    'Lô G1 Chung Cư 18B Nguyễn Đình Chiểu, Đa Kao, Quận 1',
  )
  assert.equal(
    apartmentFrameAddress.entities.address.source,
    'youtube_frame_ocr',
  )
  assert.equal(apartmentFrameAddress.entities.address.reviewRequired, true)
  assert.equal(apartmentFrameAddress.addPlaceDraft.reviewRequired, true)
  console.log('PASS 26e1: apartment-style frame address creates a clean draft')

  for (const [rawAddress, expectedAddress] of [
    [
      'Block A Nguyễn Đình Chiểu Đa Kao Quận 1',
      'Block A Nguyễn Đình Chiểu, Đa Kao, Quận 1',
    ],
    [
      'Lô G1 Nguyễn Đình Chiểu Đa Kao Quận 1',
      'Lô G1 Nguyễn Đình Chiểu, Đa Kao, Quận 1',
    ],
    [
      'Chung Cư 18B Nguyễn Đình Chiểu Đa Kao Quận 1',
      'Chung Cư 18B Nguyễn Đình Chiểu, Đa Kao, Quận 1',
    ],
    [
      'Cư xá Nguyễn Đình Chiểu Đa Kao Quận 1',
      'Cư xá Nguyễn Đình Chiểu, Đa Kao, Quận 1',
    ],
  ]) {
    const prefixAddress = await analyzeFrameScenario({
      frameScanner: async () => mockExtractedFrames([43]),
      frameVariantBuilder: async ({ frame }) => [
        { label: 'full', buffer: frame.buffer, mimetype: 'image/jpeg' },
      ],
      extractOcr: async () =>
        ocrEvidence([
          {
            text: rawAddress,
            type: 'address',
            confidence: 0.95,
          },
        ]),
    })
    assert.equal(prefixAddress.status, 'draft_candidate')
    assert.equal(prefixAddress.entities.address.value, expectedAddress)
    assert.equal(prefixAddress.entities.address.source, 'youtube_frame_ocr')
  }
  console.log('PASS 26e1b: block, lot, apartment, and cư xá prefixes are supported')

  const apartmentMultiCandidate = await analyzeFrameScenario({
    frameScanner: async () => mockExtractedFrames([42, 68]),
    frameVariantBuilder: async ({ frame }) => [
      { label: 'full', buffer: frame.buffer, mimetype: 'image/jpeg' },
    ],
    extractOcr: async ({ image }) =>
      ocrEvidence([
        {
          text:
            image.frameIndex === 1
              ? 'Lô G1 Chung Cư 18B Nguyễn Đình Chiểu Đa Kao Quận 1'
              : '66 Lãnh Binh Thăng, Q.11',
          type: 'address',
          confidence: 0.95,
        },
      ]),
  })
  assert.equal(apartmentMultiCandidate.status, 'multi_candidate')
  assert.equal(apartmentMultiCandidate.addPlaceDraft, null)
  assert.ok(
    apartmentMultiCandidate.candidates.some(
      (item) =>
        item.address ===
        'Lô G1 Chung Cư 18B Nguyễn Đình Chiểu, Đa Kao, Quận 1',
    ),
  )
  console.log('PASS 26e2: apartment address remains available in multi-candidate output')

  const noisyMultipleFrameAddresses = await analyzeFrameScenario({
    url: 'https://www.youtube.com/shorts/LZ_63pQ-IpQ',
    title: 'Ăn vặt quanh Quận 3',
    frameScanner: async () => mockExtractedFrames([56, 58, 104, 132]),
    frameVariantBuilder: async ({ frame }) => [
      { label: 'full', buffer: frame.buffer, mimetype: 'image/jpeg' },
    ],
    extractOcr: async ({ image }) => {
      const linesByFrame = [
        [
          {
            text:
              '20/29 Cư Xã Đường sắt COM TAM DI MAI 20/29 Cư Xã Đường sắt Lý Thái Tổ P1, 08 COM TAM DI MAI 20/29 Cư Xã Đường sắt Lý Thái Tổ P1, 08',
            type: 'address',
            confidence: 0.9,
          },
          {
            text:
              'COM TAM DI MAI 20/29 Cư Xã Đường sắt Lý Thái Tổ P1,08',
            type: 'address',
            confidence: 0.88,
          },
        ],
        [
          {
            text: '290/129 Cư Xã Đường sắt',
            type: 'address',
            confidence: 0.91,
          },
        ],
        [
          {
            text: 'THỊT XIÊN NƯỚNG 9K 26 Lê Quý Dân Phường 7 Quãng',
            type: 'address',
            confidence: 0.89,
          },
        ],
        [
          {
            text: '212147 Nguyễn Thiện Thuật Phường 3 Quận',
            type: 'address',
            confidence: 0.92,
          },
        ],
      ]
      return ocrEvidence(linesByFrame[image.frameIndex - 1])
    },
  })
  assert.equal(noisyMultipleFrameAddresses.status, 'multi_candidate')
  assert.equal(
    noisyMultipleFrameAddresses.input.url,
    'https://www.youtube.com/shorts/LZ_63pQ-IpQ',
  )
  assert.equal(noisyMultipleFrameAddresses.addPlaceDraft, null)
  assert.equal(noisyMultipleFrameAddresses.reviewRequired, true)
  assert.equal(noisyMultipleFrameAddresses.candidates.length, 2)

  const firstCleanCandidate = noisyMultipleFrameAddresses.candidates.find(
    (item) => item.timestampSeconds === 56,
  )
  assert.equal(
    firstCleanCandidate.address,
    '20/29 Cư Xã Đường sắt, Lý Thái Tổ P1',
  )
  assert.equal(firstCleanCandidate.placeName, 'Cơm Tấm Dì Mai')
  assert.equal(firstCleanCandidate.dishHint, 'cơm tấm')
  assert.equal(firstCleanCandidate.reviewRequired, true)
  assert.ok(
    firstCleanCandidate.evidence.some((value) =>
      /COM TAM DI MAI/i.test(value),
    ),
  )
  assert.ok(
    firstCleanCandidate.evidence.some((value) => /290\/129/.test(value)),
  )

  const secondCleanCandidate = noisyMultipleFrameAddresses.candidates.find(
    (item) => item.timestampSeconds === 104,
  )
  assert.equal(secondCleanCandidate.address, '26 Lê Quý Đôn, Phường 7')
  assert.equal(secondCleanCandidate.dishHint, 'thịt xiên nướng')
  assert.equal(secondCleanCandidate.locationHint, 'Quận 3')
  assert.equal(secondCleanCandidate.reviewRequired, true)
  assert.ok(
    noisyMultipleFrameAddresses.candidates.every(
      (item) =>
        !item.address.includes('COM TAM DI MAI 20/29') &&
        !item.address.includes('290/129') &&
        !item.address.includes('212147'),
    ),
  )
  assert.doesNotMatch(
    JSON.stringify(noisyMultipleFrameAddresses.candidates),
    /"address":"[^"]*20\/29[^"]*20\/29/i,
  )
  console.log('PASS 26e3: noisy frame OCR candidates are compact and review-only')

  let geminiCandidatePrompt = ''
  const geminiExtractedMultiCandidate = await analyzeFrameScenario({
    title: 'Top quán ăn vặt Quận 11 nên thử',
    frameScanner: async () => mockExtractedFrames([12, 20, 28, 36]),
    frameVariantBuilder: async ({ frame }) => [
      { label: 'full', buffer: frame.buffer, mimetype: 'image/jpeg' },
    ],
    extractOcr: async ({ image }) => {
      const linesByFrame = [
        'Top 5 quán ăn vặt Quận 11 giá rẻ',
        'BÚN BÒ CÔ LAN 23/5 Nguyễn Thị Nhỏ P.9 Q.11',
        'MÌ VỊT 45/9 Lò Siêu P.16 Q.11',
        'CƠM TẤM 10 Đường Dình Nghệ P.8 Q.11',
      ]
      return ocrEvidence([
        {
          text: linesByFrame[image.frameIndex - 1],
          type: 'other',
          confidence: 0.84,
        },
      ])
    },
    configOverrides: {
      geminiOcrAddressRepairEnabled: false,
      geminiCandidateExtractionEnabled: true,
    },
    dependencies: {
      extractEntities: () => entities(),
      geminiCandidateOptions: {
        apiKey: 'mock-key',
        model: 'gemini-2.5-flash',
        invokeGemini: async ({ prompt }) => {
          geminiCandidatePrompt = prompt
          return JSON.stringify({
            status: 'extracted',
            candidates: [
              {
                placeName: 'Bún Bò Cô Lan',
                dishHint: 'bún bò',
                address: '23/5 Nguyễn Thị Nhỏ P.9 Q.11',
                phone: null,
                timestampSeconds: 20,
                evidenceText:
                  'BÚN BÒ CÔ LAN 23/5 Nguyễn Thị Nhỏ P.9 Q.11',
                confidence: 0.78,
                reason: 'OCR line contains place-like food text and address.',
                reviewRequired: true,
              },
              {
                placeName: 'Mì Vịt',
                dishHint: 'mì vịt',
                address: '45/9 Lò Siêu P.16 Q.11',
                phone: null,
                timestampSeconds: 28,
                evidenceText: 'MÌ VỊT 45/9 Lò Siêu P.16 Q.11',
                confidence: 0.74,
                reason: 'OCR line contains a supported address.',
                reviewRequired: true,
              },
            ],
            rejected: [],
            warnings: [],
          })
        },
      },
    },
  })
  assert.equal(geminiExtractedMultiCandidate.status, 'multi_candidate')
  assert.equal(geminiExtractedMultiCandidate.addPlaceDraft, null)
  assert.equal(geminiExtractedMultiCandidate.candidates.length, 2)
  assert.ok(
    geminiExtractedMultiCandidate.candidates.every(
      (item) => item.source === 'gemini_ocr_candidate_extraction',
    ),
  )
  assert.deepEqual(
    geminiExtractedMultiCandidate.candidates.map((item) => item.timestampSeconds),
    [20, 28],
  )
  assert.equal(
    geminiExtractedMultiCandidate.debug.geminiCandidateExtractionStatus,
    'success',
  )
  assert.equal(
    geminiExtractedMultiCandidate.debug.geminiCandidateAcceptedCount,
    2,
  )
  assert.equal(
    geminiExtractedMultiCandidate.debug.geminiCandidateRejectedCount,
    0,
  )
  assert.equal(
    geminiExtractedMultiCandidate.debug.geminiCandidateExtractionSkipReason,
    null,
  )
  assert.match(
    geminiCandidatePrompt,
    /BÚN BÒ CÔ LAN 23\/5 Nguyễn Thị Nhỏ P\.9 Q\.11/,
  )
  assert.doesNotMatch(
    JSON.stringify(geminiExtractedMultiCandidate),
    /mock-key|raw provider payload/i,
  )
  console.log('PASS 26e4: Gemini extracts review-only candidates from list-style frame OCR')

  let groupedLocalCandidateGeminiCalls = 0
  const duplicateLocalCandidateGate = await analyzeWithCollection(
    { url: 'https://www.youtube.com/shorts/groupedGate1' },
    collection({
      frameOcrEvidence: [
        {
          source: 'youtube_frame_ocr',
          timestampSeconds: 10,
          lines: [
            {
              text: 'Quán A 20/29 Cư Xá Đường Sắt P.1 Q.8',
              type: 'other',
              confidence: 0.84,
            },
          ],
          confidence: 0.84,
        },
        {
          source: 'youtube_frame_ocr',
          timestampSeconds: 18,
          lines: [
            {
              text: 'Quán A 290/129 Cư Xá Đường Sắt P.1 Q.8',
              type: 'other',
              confidence: 0.84,
            },
          ],
          confidence: 0.84,
        },
        {
          source: 'youtube_frame_ocr',
          timestampSeconds: 26,
          lines: [
            {
              text: 'Quán B 45/9 Đường số 2 P.2 Q.8',
              type: 'other',
              confidence: 0.84,
            },
          ],
          confidence: 0.84,
        },
      ],
    }),
    {
      config: {
        geminiOcrAddressRepairEnabled: false,
        geminiCandidateExtractionEnabled: true,
      },
      extractEntities: () => entities(),
      validateEntities: async () => ({
        entities: entities({
          addressCandidates: [
            {
              address: '20/29 Cư Xá Đường Sắt P.1 Q.8',
              confidence: 0.82,
              source: 'youtube_frame_ocr',
              timestampSeconds: 10,
              evidence: ['Quán A 20/29 Cư Xá Đường Sắt P.1 Q.8'],
              reviewRequired: true,
            },
            {
              address: '290/129 Cư Xá Đường Sắt P.1 Q.8',
              confidence: 0.81,
              source: 'youtube_frame_ocr',
              timestampSeconds: 18,
              evidence: ['Quán A 290/129 Cư Xá Đường Sắt P.1 Q.8'],
              reviewRequired: true,
            },
          ],
        }),
        validation: {
          status: 'rule_only',
          requested: false,
          applied: false,
          warnings: [],
          canResolveLocation: null,
          rejectedEntities: [],
        },
      }),
      geminiCandidateOptions: {
        apiKey: 'mock-key',
        model: 'gemini-2.5-flash',
        invokeGemini: async () => {
          groupedLocalCandidateGeminiCalls += 1
          return JSON.stringify({
            status: 'extracted',
            candidates: [
              {
                placeName: 'Quán B',
                dishHint: null,
                address: '45/9 Đường số 2 P.2 Q.8',
                phone: null,
                timestampSeconds: 26,
                evidenceText: 'Quán B 45/9 Đường số 2 P.2 Q.8',
                confidence: 0.76,
                reason: 'OCR line has a distinct address group.',
                reviewRequired: true,
              },
            ],
            rejected: [],
            warnings: [],
          })
        },
      },
    },
  )
  assert.equal(groupedLocalCandidateGeminiCalls, 1)
  assert.equal(
    duplicateLocalCandidateGate.debug.geminiCandidateExtractionStatus,
    'success',
  )
  assert.equal(
    duplicateLocalCandidateGate.debug.geminiCandidateAcceptedCount,
    1,
  )
  assert.equal(
    duplicateLocalCandidateGate.debug.geminiCandidateRejectedCount,
    0,
  )
  console.log('PASS 26e4b: duplicate local address groups do not block Gemini candidate extraction')

  let skippedGeminiProviderCalls = 0
  const skippedGeminiCandidateExtraction = await analyzeWithCollection(
    { url: 'https://www.youtube.com/shorts/skipGate1' },
    collection({
      frameOcrEvidence: [
        {
          source: 'youtube_frame_ocr',
          timestampSeconds: 20,
          lines: [
            {
              text: 'BÚN BÒ CÔ LAN 23/5 Nguyễn Thị Nhỏ P.9 Q.11',
              type: 'other',
              confidence: 0.84,
            },
          ],
          confidence: 0.84,
        },
      ],
    }),
    {
      config: {
        geminiOcrAddressRepairEnabled: false,
        geminiCandidateExtractionEnabled: true,
      },
      extractEntities: () => entities(),
      geminiCandidateOptions: {
        apiKey: 'mock-key',
        model: 'gemini-2.5-flash',
        invokeGemini: async () => {
          skippedGeminiProviderCalls += 1
          return '{}'
        },
      },
    },
  )
  assert.equal(skippedGeminiCandidateExtraction.status, 'unresolved_best_effort')
  assert.equal(skippedGeminiProviderCalls, 0)
  assert.equal(
    skippedGeminiCandidateExtraction.debug.geminiCandidateExtractionStatus,
    'skipped_gate',
  )
  assert.equal(
    skippedGeminiCandidateExtraction.debug.geminiCandidateExtractionSkipReason,
    'insufficient_frame_texts',
  )
  assert.equal(
    skippedGeminiCandidateExtraction.debug.geminiCandidateAcceptedCount,
    0,
  )
  assert.equal(
    skippedGeminiCandidateExtraction.debug.geminiCandidateRejectedCount,
    0,
  )
  console.log('PASS 26e5: Gemini candidate extraction is skipped without enough frame OCR signal')

  const missingGeminiCandidateKey = await analyzeFrameScenario({
    title: 'Review nhiều địa chỉ trong video',
    frameScanner: async () => mockExtractedFrames([20, 28]),
    frameVariantBuilder: async ({ frame }) => [
      { label: 'full', buffer: frame.buffer, mimetype: 'image/jpeg' },
    ],
    extractOcr: async ({ image }) => {
      const linesByFrame = [
        'Quán A 23/5 Nguyễn Thị Nhỏ P.9 Q.11',
        'Quán B 45/9 Lò Siêu P.16 Q.11',
      ]
      return ocrEvidence([
        {
          text: linesByFrame[image.frameIndex - 1],
          type: 'other',
          confidence: 0.84,
        },
      ])
    },
    configOverrides: {
      geminiOcrAddressRepairEnabled: false,
      geminiCandidateExtractionEnabled: true,
    },
    dependencies: {
      extractEntities: () => entities(),
      geminiCandidateOptions: {
        apiKey: '',
        model: 'gemini-2.5-flash',
      },
    },
  })
  assert.equal(
    missingGeminiCandidateKey.debug.geminiCandidateExtractionStatus,
    'missing_api_key',
  )
  assert.equal(
    missingGeminiCandidateKey.debug.geminiCandidateExtractionSkipReason,
    null,
  )
  assert.equal(missingGeminiCandidateKey.debug.geminiCandidateAcceptedCount, 0)
  assert.equal(missingGeminiCandidateKey.debug.geminiCandidateRejectedCount, 0)
  console.log('PASS 26e6: Gemini candidate missing API key is observable and bounded')

  const noAcceptedGeminiCandidate = await analyzeFrameScenario({
    title: 'Review nhiều địa chỉ trong video',
    frameScanner: async () => mockExtractedFrames([20, 28]),
    frameVariantBuilder: async ({ frame }) => [
      { label: 'full', buffer: frame.buffer, mimetype: 'image/jpeg' },
    ],
    extractOcr: async ({ image }) => {
      const linesByFrame = [
        'Quán A 23/5 Nguyễn Thị Nhỏ P.9 Q.11',
        'Quán B 45/9 Lò Siêu P.16 Q.11',
      ]
      return ocrEvidence([
        {
          text: linesByFrame[image.frameIndex - 1],
          type: 'other',
          confidence: 0.84,
        },
      ])
    },
    configOverrides: {
      geminiOcrAddressRepairEnabled: false,
      geminiCandidateExtractionEnabled: true,
    },
    dependencies: {
      extractEntities: () => entities(),
      geminiCandidateOptions: {
        apiKey: 'mock-key',
        model: 'gemini-2.5-flash',
        invokeGemini: async () =>
          JSON.stringify({
            status: 'extracted',
            candidates: [
              {
                placeName: 'Top quán',
                dishHint: null,
                address: null,
                phone: null,
                timestampSeconds: 20,
                evidenceText: 'Quán A 23/5 Nguyễn Thị Nhỏ P.9 Q.11',
                confidence: 0.4,
                reason: 'Missing address field must be rejected.',
                reviewRequired: true,
              },
            ],
            rejected: [],
            warnings: [],
          }),
      },
    },
  })
  assert.equal(
    noAcceptedGeminiCandidate.debug.geminiCandidateExtractionStatus,
    'no_accepted_candidates',
  )
  assert.equal(noAcceptedGeminiCandidate.debug.geminiCandidateAcceptedCount, 0)
  assert.equal(noAcceptedGeminiCandidate.debug.geminiCandidateRejectedCount, 1)
  assert.equal(noAcceptedGeminiCandidate.addPlaceDraft, null)
  console.log('PASS 26e7: Gemini candidate rejection count is observable')

  for (const weakText of [
    'TỔNG HỢP TẤT TẦN TẬT QUÁN NGON',
    'một quán chuyên',
    'thêm 3 quán',
    'toàn quán',
    'HOP TẤT TẦN TẬT QUÁN NGON',
    'QUẬN H',
    'GO VAP P.2',
    '171 Cô Bắc P. Bắc Q 1 8h00-13h00 NghiT7 GH',
  ]) {
    const weakAddress = await analyzeFrameScenario({
      frameScanner: async () => mockExtractedFrames([5]),
      frameVariantBuilder: async ({ frame }) => [
        { label: 'full', buffer: frame.buffer, mimetype: 'image/jpeg' },
      ],
      extractOcr: async () =>
        ocrEvidence([
          { text: weakText, type: 'address', confidence: 0.94 },
        ]),
    })
    assert.equal(weakAddress.status, 'unresolved_best_effort')
    assert.equal(weakAddress.entities.address.value, null)
    assert.equal(weakAddress.addPlaceDraft, null)
  }
  console.log('PASS 26f: promotional and location-only OCR cannot become addresses')

  const secret = 'AIzaSyMockSecretVisionAutoKey'
  const secretSafe = await analyzeVisionAutoV2(
    { url: 'https://www.youtube.com/shorts/secretSafe1' },
    {
      config: config({
        metadataOcrEnabled: false,
        evidenceValidator: 'gemini',
      }),
      collectorOptions: {
        youtubeProvider: async () => {
          const error = new Error(`provider failed with key ${secret}`)
          error.code = 'provider_failed'
          throw error
        },
      },
      validatorOptions: {
        runValidator: async () => {
          throw new Error(`Gemini key ${secret}`)
        },
      },
    },
  )
  assert.doesNotMatch(JSON.stringify(secretSafe), new RegExp(secret))
  assertStableContract(secretSafe)
  console.log('PASS 27: API keys and provider errors never appear in public debug')

  const routeServer = await startRouteServer()
  try {
    const validForm = new FormData()
    validForm.append('url', 'https://example.com/post')
    const validResponse = await fetch(routeServer.url, {
      method: 'POST',
      body: validForm,
    })
    assert.equal(validResponse.status, 200)

    const hintForm = new FormData()
    hintForm.append('url', 'https://example.com/post')
    hintForm.append('hint', 'restaurant name')
    const hintResponse = await fetch(routeServer.url, {
      method: 'POST',
      body: hintForm,
    })
    assert.equal(hintResponse.status, 400)
    assert.equal((await hintResponse.json()).field, 'hint')
  } finally {
    await new Promise((resolve) => routeServer.server.close(resolve))
  }
  console.log('PASS route: guarded v2 endpoint rejects hints in auto mode')

  console.log('Vision Auto v2 mocked tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
