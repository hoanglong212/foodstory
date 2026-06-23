import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  extractOcrEvidenceWithProvider,
  runOcrProvider,
} from '../services/ocrProviders/index.js'
import {
  runGoogleVisionOcrProvider,
} from '../services/ocrProviders/googleVisionOcrProvider.js'
import {
  selectFinalOcrEvidence,
} from '../services/foodMapOcrEvidenceSelector.js'
import {
  extractFoodMapEntitiesHybrid,
} from '../services/groqEntityExtractionService.js'
import {
  buildFoodMapLocationQuery,
} from '../services/foodMapLocationQueryService.js'
import {
  rankLocationCandidate,
  resolveFoodMapLocation,
} from '../services/foodMapLocationResolutionService.js'
import {
  createFoodMapDraftPlace,
  integrateResolvedFoodMapPlace,
} from '../services/foodMapDraftPlaceService.js'
import {
  scoreDuplicateFoodMapPlace,
} from '../services/foodMapDuplicatePlaceService.js'
import {
  buildFoodMapNextAction,
} from '../services/foodMapNextActionService.js'
import {
  analyzeFoodMapSocialDiscovery,
} from '../services/foodMapSocialDiscoveryService.js'

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBASUY42YAAAAASUVORK5CYII=',
  'base64',
)
const image = {
  buffer: tinyPng,
  mimetype: 'image/png',
  originalname: 'generic-image.png',
}

function normalizedProviderResult(provider = 'tesseract') {
  return {
    provider,
    rawText: 'RESTAURANT SAMPLE',
    lines: [
      {
        text: 'RESTAURANT SAMPLE',
        confidence: 0.9,
        box: null,
        sourcePass: 'test_pass',
      },
    ],
    debug: {
      durationMs: 1,
      passesRun: 1,
      providerStatus: 'success',
    },
    evidence: {
      text: 'RESTAURANT SAMPLE',
      usable: true,
      ocrUsable: true,
      confidence: 0.9,
      reason: 'usable',
      lines: [
        {
          text: 'RESTAURANT SAMPLE',
          confidence: 0.9,
          type: 'sign',
          tier: 'strong',
          quality: 0.85,
          supportCount: 2,
        },
      ],
      strongLines: [
        {
          text: 'RESTAURANT SAMPLE',
          confidence: 0.9,
          type: 'sign',
          tier: 'strong',
          quality: 0.85,
          supportCount: 2,
        },
      ],
      weakLines: [],
      warnings: [],
      debug: { canonicalClusters: [] },
    },
  }
}

function entity(value, confidence = 0.8, evidence = value ? [value] : []) {
  return {
    value: value || null,
    confidence: value ? confidence : 0,
    source: value ? 'ocr' : null,
    evidence,
  }
}

function arrayEntity(value, confidence = 0.8, extras = {}) {
  return {
    value,
    confidence,
    source: 'ocr',
    evidence: value,
    ...extras,
  }
}

async function run() {
  let tesseractCalls = 0
  const defaultProvider = await runOcrProvider(
    { image },
    {
      provider: 'tesseract',
      tesseractProvider: async () => {
        tesseractCalls += 1
        return normalizedProviderResult()
      },
    },
  )
  assert.equal(defaultProvider.debug.providerUsed, 'tesseract')
  assert.equal(tesseractCalls, 1)
  console.log('PASS: OCR provider selection defaults safely to Tesseract')

  const unavailableFallback = await runOcrProvider(
    { image },
    {
      provider: 'hybrid',
      fallbackToTesseract: true,
      googleVisionProvider: async () => ({
        provider: 'google_vision',
        rawText: '',
        lines: [],
        debug: {
          durationMs: 1,
          providerStatus: 'missing_credentials',
          feature: 'document_text_detection',
        },
      }),
      tesseractProvider: async () => normalizedProviderResult(),
    },
  )
  assert.equal(unavailableFallback.debug.providerUsed, 'tesseract')
  assert.equal(
    unavailableFallback.debug.fallbackReason,
    'missing_credentials',
  )
  assert.equal(unavailableFallback.debug.attemptedProvider, 'google_vision')
  console.log('PASS: unavailable Google Vision falls back to Tesseract')

  const normalizedVision = await runGoogleVisionOcrProvider(
    { image },
    {
      credentialsAvailable: true,
      client: {
        documentTextDetection: async () => [
          {
            fullTextAnnotation: {
              text: 'SAMPLE SIGN\n0901 234 567\n',
              pages: [
                {
                  blocks: [
                    {
                      paragraphs: [
                        {
                          words: [
                            {
                              confidence: 0.93,
                              boundingBox: {
                                vertices: [
                                  { x: 1, y: 2 },
                                  { x: 3, y: 2 },
                                  { x: 3, y: 4 },
                                  { x: 1, y: 4 },
                                ],
                              },
                              symbols: [
                                { text: 'S' },
                                { text: 'A' },
                                { text: 'M' },
                                { text: 'P' },
                                { text: 'L' },
                                {
                                  text: 'E',
                                  property: {
                                    detectedBreak: { type: 'SPACE' },
                                  },
                                },
                              ],
                            },
                            {
                              confidence: 0.91,
                              boundingBox: {
                                vertices: [
                                  { x: 4, y: 2 },
                                  { x: 7, y: 2 },
                                  { x: 7, y: 4 },
                                  { x: 4, y: 4 },
                                ],
                              },
                              symbols: [
                                { text: 'S' },
                                { text: 'I' },
                                { text: 'G' },
                                {
                                  text: 'N',
                                  property: {
                                    detectedBreak: {
                                      type: 'LINE_BREAK',
                                    },
                                  },
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
  )
  assert.deepEqual(Object.keys(normalizedVision), [
    'provider',
    'rawText',
    'lines',
    'debug',
  ])
  assert.deepEqual(Object.keys(normalizedVision.lines[0]), [
    'text',
    'confidence',
    'box',
    'sourcePass',
  ])
  assert.equal(normalizedVision.provider, 'google_vision')
  assert.equal(normalizedVision.lines[0].text, 'SAMPLE SIGN')
  assert.equal(normalizedVision.lines[0].confidence, 0.92)
  assert.deepEqual(normalizedVision.lines[0].box, [
    [1, 2],
    [7, 2],
    [7, 4],
    [1, 4],
  ])
  assert.equal(normalizedVision.debug.providerStatus, 'ok')
  assert.equal(
    normalizedVision.debug.feature,
    'document_text_detection',
  )
  console.log('PASS: Google Vision output normalizes full-text lines and boxes')

  const missingCredentials = await runGoogleVisionOcrProvider(
    { image },
    {
      credentialsAvailable: false,
    },
  )
  assert.equal(missingCredentials.debug.providerStatus, 'missing_credentials')
  assert.equal(
    JSON.stringify(missingCredentials.debug).includes(
      'GOOGLE_APPLICATION_CREDENTIALS',
    ),
    false,
  )
  assert.equal(
    JSON.stringify(missingCredentials.debug).includes('service-account'),
    false,
  )
  console.log('PASS: missing Vision credentials return bounded safe debug')

  const originalCredentialPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  const originalCloudProject = process.env.GOOGLE_CLOUD_PROJECT
  process.env.GOOGLE_APPLICATION_CREDENTIALS =
    './secrets/does-not-exist.json'
  delete process.env.GOOGLE_CLOUD_PROJECT
  const missingCredentialFile = await runGoogleVisionOcrProvider({ image })
  if (originalCredentialPath === undefined) {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS
  } else {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = originalCredentialPath
  }
  if (originalCloudProject === undefined) {
    delete process.env.GOOGLE_CLOUD_PROJECT
  } else {
    process.env.GOOGLE_CLOUD_PROJECT = originalCloudProject
  }
  assert.equal(
    missingCredentialFile.debug.providerStatus,
    'missing_credentials',
  )
  assert.doesNotMatch(
    JSON.stringify(missingCredentialFile.debug),
    /does-not-exist|secrets/i,
  )
  console.log('PASS: missing credential files do not reach the Google client')

  const emptyVision = await runGoogleVisionOcrProvider(
    { image },
    {
      credentialsAvailable: true,
      client: {
        documentTextDetection: async () => [
          {
            fullTextAnnotation: {
              text: '',
              pages: [],
            },
          },
        ],
      },
    },
  )
  assert.equal(emptyVision.debug.providerStatus, 'empty')
  assert.deepEqual(emptyVision.lines, [])

  const textDetectionVision = await runGoogleVisionOcrProvider(
    { image },
    {
      credentialsAvailable: true,
      feature: 'text_detection',
      client: {
        textDetection: async () => [
          {
            textAnnotations: [
              {
                description: 'SAMPLE SIGN\nDistrict 1\n',
              },
            ],
          },
        ],
      },
    },
  )
  assert.equal(textDetectionVision.debug.feature, 'text_detection')
  assert.deepEqual(
    textDetectionVision.lines.map((line) => line.text),
    ['SAMPLE SIGN', 'District 1'],
  )
  assert.equal(textDetectionVision.lines[0].confidence, null)

  const directTimeout = await runGoogleVisionOcrProvider(
    { image },
    {
      credentialsAvailable: true,
      timeoutMs: 1,
      client: {
        documentTextDetection: () => new Promise(() => {}),
      },
    },
  )
  assert.equal(directTimeout.debug.providerStatus, 'timeout')

  const timeoutFallback = await runOcrProvider(
    { image },
    {
      provider: 'google_vision',
      fallbackToTesseract: true,
      googleVisionProvider: async () => ({
        provider: 'google_vision',
        rawText: '',
        lines: [],
        debug: {
          durationMs: 10,
          providerStatus: 'timeout',
          feature: 'document_text_detection',
        },
      }),
      tesseractProvider: async () => normalizedProviderResult(),
    },
  )
  assert.equal(timeoutFallback.debug.providerUsed, 'tesseract')
  assert.equal(timeoutFallback.debug.fallbackReason, 'timeout')
  console.log('PASS: Vision timeout safely falls back to Tesseract')

  const noFallback = await runOcrProvider(
    { image },
    {
      provider: 'google_vision',
      fallbackToTesseract: false,
      googleVisionProvider: async () => ({
        provider: 'google_vision',
        rawText: '',
        lines: [],
        debug: {
          durationMs: 1,
          providerStatus: 'missing_credentials',
          feature: 'document_text_detection',
        },
      }),
      tesseractProvider: async () => {
        throw new Error('Tesseract should not run.')
      },
    },
  )
  assert.equal(noFallback.debug.providerUsed, 'google_vision')
  assert.equal(noFallback.debug.providerStatus, 'missing_credentials')
  console.log('PASS: Vision can return provider-unavailable without fallback')

  const tesseractEvidence = await extractOcrEvidenceWithProvider(
    { image },
    {
      provider: 'tesseract',
      tesseractProvider: async () => normalizedProviderResult(),
    },
  )
  assert.equal(tesseractEvidence.debug.providerUsed, 'tesseract')
  assert.equal(tesseractEvidence.text, 'RESTAURANT SAMPLE')
  console.log('PASS: Tesseract provider preserves the existing evidence pipeline')

  const providerSources = [
    '../services/ocrProviders/index.js',
    '../services/ocrProviders/tesseractOcrProvider.js',
    '../services/ocrProviders/googleVisionOcrProvider.js',
    '../services/foodMapOcrEvidenceSelector.js',
  ]
    .map((relativePath) =>
      readFileSync(
        fileURLToPath(new URL(relativePath, import.meta.url)),
        'utf8',
      ),
    )
    .join('\n')
  assert.doesNotMatch(
    providerSources,
    /originalname\s*\.(?:includes|match)|filename\s*\.(?:includes|match)/i,
  )
  assert.doesNotMatch(providerSources, /if\s*\([^)]*QUYNH/i)
  console.log('PASS: OCR layers contain no filename or fixture-specific branches')

  const entityExtractorSource = readFileSync(
    fileURLToPath(
      new URL(
        '../services/foodMapEntityExtractionService.js',
        import.meta.url,
      ),
    ),
    'utf8',
  )
  assert.doesNotMatch(
    entityExtractorSource,
    /originalname\s*\.(?:includes|match)|filename\s*\.(?:includes|match)/i,
  )
  assert.doesNotMatch(
    entityExtractorSource,
    /Đường Láng|Duong Lang|TTĐ|Bún Bò Huế|Bun Bo Hue|Hương Việt/i,
  )
  console.log('PASS: entity extraction uses patterns instead of fixture-specific values')

  const selection = selectFinalOcrEvidence({
    provider: 'test',
    strongLines: [
      {
        text: '125 Example Road, District 4',
        confidence: 0.88,
        quality: 0.8,
        supportCount: 2,
        type: 'address',
        tier: 'strong',
      },
      {
        text: 'Delivery available all day, call DT 0901 234 567 for orders',
        confidence: 0.88,
        quality: 0.72,
        supportCount: 1,
        type: 'phone',
        tier: 'strong',
      },
      {
        text: 'HOTLINE 0901 234 567',
        confidence: 0.84,
        quality: 0.76,
        supportCount: 2,
        type: 'phone',
        tier: 'strong',
      },
      {
        text: 'RESTAURANT SAMPLE',
        confidence: 0.82,
        quality: 0.78,
        supportCount: 2,
        type: 'sign',
        tier: 'strong',
      },
      {
        text: 'PHO BO',
        confidence: 0.75,
        quality: 0.7,
        supportCount: 2,
        type: 'sign',
        tier: 'strong',
      },
    ],
    weakLines: [
      {
        text: 'District 4',
        confidence: 0.6,
        quality: 0.45,
        supportCount: 1,
        type: 'address',
        tier: 'weak',
      },
      {
        text: 'to le xa random background words repeated repeated repeated',
        confidence: 0.9,
        quality: 0.2,
        supportCount: 1,
        type: 'other',
        tier: 'weak',
      },
    ],
  })
  assert.equal(selection.selectedContacts[0].text, 'ĐT: 0901234567')
  assert.match(selection.selectedAddressCandidates[0].text, /Example Road/i)
  assert.equal(
    selection.selectedAddressCandidates.some((line) =>
      /^District 4$/i.test(line.text),
    ),
    false,
  )
  assert.match(selection.finalText, /RESTAURANT SAMPLE/)
  assert.match(selection.finalText, /PHO BO/)
  assert.doesNotMatch(selection.finalText, /random background/)
  assert.ok(selection.finalText.split('\n').length <= 6)
  console.log('PASS: final OCR evidence is concise and prioritizes clean evidence')

  const fakePhoneSelection = selectFinalOcrEvidence({
    strongLines: [],
    weakLines: [
      {
        text: '3422724840',
        confidence: 0.99,
        quality: 0.4,
        supportCount: 1,
        type: 'other',
        tier: 'weak',
      },
    ],
  })
  assert.equal(fakePhoneSelection.selectedContacts.length, 0)
  assert.equal(fakePhoneSelection.finalText, null)
  console.log('PASS: unsupported numeric noise is not promoted as a phone')

  const validLookingNumericNoise = selectFinalOcrEvidence({
    strongLines: [
      {
        text: '0901234567',
        confidence: 0.95,
        quality: 0.8,
        supportCount: 2,
        type: 'phone',
        tier: 'strong',
      },
    ],
  })
  assert.equal(validLookingNumericNoise.selectedContacts.length, 0)
  assert.equal(validLookingNumericNoise.finalText, null)

  const generalizedContactSelection = selectFinalOcrEvidence({
    strongLines: [
      {
        text: 'ĐT: (08) 38 369 145',
        confidence: 0.86,
        quality: 0.78,
        supportCount: 1,
        type: 'phone',
        tier: 'strong',
      },
    ],
  })
  assert.equal(
    generalizedContactSelection.selectedContacts[0].text,
    'ĐT: 0838369145',
  )

  const generalizedAddressSelection = selectFinalOcrEvidence({
    strongLines: [
      {
        text: '43 TTĐ, Q1',
        confidence: 0.84,
        quality: 0.76,
        supportCount: 1,
        type: 'address',
        tier: 'strong',
      },
      {
        text: '65 Đường Láng',
        confidence: 0.84,
        quality: 0.76,
        supportCount: 1,
        type: 'sign',
        tier: 'strong',
      },
    ],
  })
  assert.equal(generalizedAddressSelection.selectedAddressCandidates.length, 2)
  assert.ok(
    generalizedAddressSelection.selectedAddressCandidates.some((line) =>
      /43 TTĐ, Q1/.test(line.text),
    ),
  )
  assert.ok(
    generalizedAddressSelection.selectedAddressCandidates.some((line) =>
      /65 Đường Láng/.test(line.text),
    ),
  )
  assert.match(generalizedAddressSelection.finalText, /65 Đường Láng/)
  console.log('PASS: OCR selection uses generalized phone and address context')

  const ruleMode = await extractFoodMapEntitiesHybrid(
    {
      inputSignals: { hint: 'place: Sample Cafe' },
      textSources: [],
      ocrEvidence: {},
    },
    { mode: 'rule' },
  )
  assert.equal(ruleMode.extractorUsed, 'rule')
  assert.match(ruleMode.placeName.value, /Sample Cafe/i)
  console.log('PASS: rule entity mode works without a Groq API key')

  const groqUnavailable = await extractFoodMapEntitiesHybrid(
    {
      inputSignals: { hint: 'place: Sample Cafe' },
      textSources: [],
      ocrEvidence: {},
    },
    {
      mode: 'hybrid',
      groqOptions: {
        invokeGroq: async () => {
          const error = new Error('missing')
          error.code = 'missing_api_key'
          throw error
        },
      },
    },
  )
  assert.equal(groqUnavailable.extractorUsed, 'rule_fallback')
  assert.match(groqUnavailable.placeName.value, /Sample Cafe/i)
  console.log('PASS: unavailable Groq falls back to rule extraction')

  const invalidJson = await extractFoodMapEntitiesHybrid(
    {
      inputSignals: { hint: 'place: Sample Cafe' },
      textSources: [],
      ocrEvidence: {},
    },
    {
      mode: 'hybrid',
      groqOptions: { invokeGroq: async () => '{not-json' },
    },
  )
  assert.equal(invalidJson.extractorUsed, 'rule_fallback')
  assert.equal(invalidJson.mergeDebug.groqStatus, 'invalid_json')
  console.log('PASS: invalid Groq JSON falls back safely')

  const hallucination = await extractFoodMapEntitiesHybrid(
    {
      inputSignals: { description: 'Food review in District 1' },
      textSources: [],
      ocrEvidence: {},
    },
    {
      mode: 'groq',
      groqOptions: {
        invokeGroq: async () =>
          JSON.stringify({
            placeName: {
              value: 'Invented Venue',
              confidence: 0.99,
              evidence: ['Not in the supplied evidence'],
            },
            address: { value: null, confidence: 0, evidence: [] },
            phones: [],
            dishNames: [],
            priceHints: [],
            locationHints: [],
            warnings: [],
          }),
      },
    },
  )
  assert.equal(hallucination.placeName.value, null)
  console.log('PASS: evidence-less Groq hallucinations are rejected')

  const mismatchedValue = await extractFoodMapEntitiesHybrid(
    {
      inputSignals: {},
      textSources: [],
      ocrEvidence: {
        strongLines: [
          {
            text: 'LOTUS KITCHEN',
            confidence: 0.68,
            type: 'sign',
          },
        ],
      },
    },
    {
      mode: 'groq',
      groqOptions: {
        invokeGroq: async () =>
          JSON.stringify({
            placeName: {
              value: 'Invented Venue',
              confidence: 0.99,
              evidence: ['LOTUS KITCHEN'],
            },
            address: { value: null, confidence: 0, evidence: [] },
            phones: [],
            dishNames: [],
            priceHints: [],
            locationHints: [],
            warnings: [],
          }),
      },
    },
  )
  assert.equal(mismatchedValue.placeName.value, null)
  console.log('PASS: Groq values must agree with their quoted evidence')

  const groqEnhancement = await extractFoodMapEntitiesHybrid(
    {
      inputSignals: {},
      textSources: [],
      ocrEvidence: {
        strongLines: [
          {
            text: 'LOTUS KITCHEN',
            confidence: 0.68,
            type: 'sign',
          },
        ],
      },
    },
    {
      mode: 'hybrid',
      groqOptions: {
        invokeGroq: async () =>
          JSON.stringify({
            placeName: {
              value: 'Lotus Kitchen',
              confidence: 0.78,
              evidence: ['LOTUS KITCHEN'],
            },
            address: { value: null, confidence: 0, evidence: [] },
            phones: [],
            dishNames: [],
            priceHints: [],
            locationHints: [],
            warnings: [],
          }),
      },
    },
  )
  assert.equal(groqEnhancement.extractorUsed, 'hybrid')
  assert.equal(groqEnhancement.placeName.value, 'Lotus Kitchen')
  console.log('PASS: Groq can enhance an evidence-backed sign')

  const baseEntities = {
    address: entity(null),
    placeName: entity(null),
    phones: [],
    dishNames: [],
    priceHints: [],
    locationHints: [],
  }
  const addressPhoneQuery = buildFoodMapLocationQuery({
    ...baseEntities,
    address: entity('125 Example Road, District 4', 0.88),
    phones: [
      {
        ...arrayEntity('0901234567', 0.88),
        normalized: '0901234567',
      },
    ],
  })
  assert.equal(addressPhoneQuery.canResolveLocation, true)
  assert.ok(addressPhoneQuery.score >= 10)
  assert.doesNotMatch(addressPhoneQuery.query, /rejected/i)

  const phoneOnlyQuery = buildFoodMapLocationQuery({
    ...baseEntities,
    phones: [
      {
        ...arrayEntity('0901234567', 0.85),
        normalized: '0901234567',
        evidence: 'ĐT: 0901234567',
      },
    ],
  })
  assert.equal(phoneOnlyQuery.canResolveLocation, false)
  assert.equal(phoneOnlyQuery.query, null)
  assert.ok(phoneOnlyQuery.score < 10)
  assert.equal(phoneOnlyQuery.reason, 'phone_only_needs_context')
  assert.equal(phoneOnlyQuery.strategy, 'insufficient_evidence')
  assert.ok(
    phoneOnlyQuery.warnings.some((warning) =>
      /phone evidence needs place, address, or strong location context/i.test(
        warning,
      ),
    ),
  )

  const phoneLocationQuery = buildFoodMapLocationQuery({
    ...baseEntities,
    phones: [
      {
        ...arrayEntity('0901234567', 0.85),
        normalized: '0901234567',
      },
    ],
    locationHints: [
      arrayEntity('District 1, HCM', 0.78, { type: 'district' }),
    ],
  })
  assert.equal(phoneLocationQuery.canResolveLocation, true)
  assert.equal(phoneLocationQuery.reason, 'phone_location_supported')
  assert.ok(phoneLocationQuery.score >= 10)

  const phonePlaceQuery = buildFoodMapLocationQuery({
    ...baseEntities,
    placeName: entity('Sample Kitchen', 0.78),
    phones: [
      {
        ...arrayEntity('0901234567', 0.85),
        normalized: '0901234567',
      },
    ],
  })
  assert.equal(phonePlaceQuery.canResolveLocation, true)
  assert.equal(phonePlaceQuery.reason, 'place_phone_supported')
  assert.ok(phonePlaceQuery.score >= 10)

  const placeDishLocationQuery = buildFoodMapLocationQuery({
    ...baseEntities,
    placeName: entity('Sample Kitchen', 0.78),
    dishNames: [arrayEntity('pho bo', 0.7)],
    locationHints: [
      arrayEntity('District 1', 0.7, { type: 'district' }),
    ],
  })
  assert.equal(placeDishLocationQuery.canResolveLocation, true)
  assert.equal(placeDishLocationQuery.strategy, 'place_dish_location_hint')

  const dishOnlyQuery = buildFoodMapLocationQuery({
    ...baseEntities,
    dishNames: [arrayEntity('pho bo', 0.8)],
  })
  assert.equal(dishOnlyQuery.canResolveLocation, false)
  assert.equal(dishOnlyQuery.reason, 'dish_only_not_enough_for_location')

  const locationOnlyQuery = buildFoodMapLocationQuery({
    ...baseEntities,
    locationHints: [
      arrayEntity('District 1', 0.6, { type: 'district' }),
    ],
  })
  assert.equal(locationOnlyQuery.canResolveLocation, false)
  assert.equal(
    locationOnlyQuery.reason,
    'weak_location_only_not_enough_for_location',
  )

  const noisyQuery = buildFoodMapLocationQuery(baseEntities)
  assert.equal(noisyQuery.canResolveLocation, false)
  assert.equal(noisyQuery.query, null)

  let resolutionCalls = 0
  let integrationCalls = 0
  const gatedPipeline = await analyzeFoodMapSocialDiscovery(
    { image },
    {
      extractOcrSignals: async () => ({
        text: 'PHO BO',
        usable: true,
        ocrUsable: true,
        confidence: 0.8,
        reason: 'usable',
        lines: [
          {
            text: 'PHO BO',
            confidence: 0.8,
            type: 'sign',
          },
        ],
        strongLines: [
          {
            text: 'PHO BO',
            confidence: 0.8,
            type: 'sign',
          },
        ],
        weakLines: [],
        warnings: [],
        debug: {},
      }),
      extractFoodMapEntities: async () => ({
        ...baseEntities,
        dishNames: [arrayEntity('pho bo', 0.8)],
        confidence: 0.8,
        status: 'dish_only',
        warnings: [],
        extractorUsed: 'rule',
        mergeDebug: {},
      }),
      resolveFoodMapLocation: async () => {
        resolutionCalls += 1
        return {}
      },
      integrateResolvedFoodMapPlace: async () => {
        integrationCalls += 1
        return {}
      },
    },
  )
  assert.equal(resolutionCalls, 0)
  assert.equal(integrationCalls, 0)
  assert.equal(gatedPipeline.nextAction.type, 'explore_dish_nearby')

  let phoneResolutionCalls = 0
  const phoneOnlyPipeline = await analyzeFoodMapSocialDiscovery(
    { image },
    {
      extractOcrSignals: async () => ({
        text: 'ĐT: 0901234567',
        usable: true,
        ocrUsable: true,
        confidence: 0.85,
        reason: 'usable',
        lines: [
          {
            text: 'ĐT: 0901234567',
            confidence: 0.85,
            type: 'phone',
          },
        ],
        strongLines: [
          {
            text: 'ĐT: 0901234567',
            confidence: 0.85,
            type: 'phone',
          },
        ],
        weakLines: [],
        warnings: [],
        debug: {},
      }),
      extractFoodMapEntities: async () => ({
        ...baseEntities,
        phones: [
          {
            ...arrayEntity('0901234567', 0.85),
            normalized: '0901234567',
            evidence: 'ĐT: 0901234567',
          },
        ],
        confidence: 0.595,
        status: 'unclear',
        warnings: [],
        extractorUsed: 'rule',
        mergeDebug: {},
      }),
      resolveFoodMapLocation: async () => {
        phoneResolutionCalls += 1
        return {}
      },
    },
  )
  assert.equal(phoneResolutionCalls, 0)
  assert.equal(phoneOnlyPipeline.locationQuery.canResolveLocation, false)
  assert.equal(phoneOnlyPipeline.locationQuery.query, null)
  assert.equal(phoneOnlyPipeline.nextAction.type, 'ask_for_hint')
  console.log('PASS: location query gate follows explicit evidence scoring')

  const providerDisabled = await resolveFoodMapLocation({
    locationQuery: addressPhoneQuery,
  })
  assert.equal(providerDisabled.status, 'provider_disabled')

  const missingKey = await resolveFoodMapLocation(
    { locationQuery: addressPhoneQuery },
    { provider: 'google', apiKey: '' },
  )
  assert.equal(missingKey.status, 'missing_api_key')

  const singleResolution = await resolveFoodMapLocation(
    {
      locationQuery: addressPhoneQuery,
      entities: baseEntities,
    },
    {
      provider: 'google',
      apiKey: 'test',
      fetchCandidates: async () => [
        {
          id: 'place-1',
          displayName: { text: 'Sample Kitchen' },
          formattedAddress: '125 Example Road, District 4',
          nationalPhoneNumber: '0901 234 567',
          location: { latitude: 10.7, longitude: 106.6 },
          types: ['restaurant'],
        },
      ],
    },
  )
  assert.equal(singleResolution.status, 'resolved')
  assert.equal(singleResolution.resolvedLocation.placeId, 'place-1')

  const multipleResolution = await resolveFoodMapLocation(
    {
      locationQuery: placeDishLocationQuery,
      entities: baseEntities,
    },
    {
      provider: 'google',
      apiKey: 'test',
      fetchCandidates: async () => [
        {
          id: 'place-1',
          displayName: { text: 'Sample Kitchen One' },
          formattedAddress: 'District 1',
          location: { latitude: 10.7, longitude: 106.6 },
        },
        {
          id: 'place-2',
          displayName: { text: 'Sample Kitchen Two' },
          formattedAddress: 'District 1',
          location: { latitude: 10.71, longitude: 106.61 },
        },
      ],
    },
  )
  assert.equal(multipleResolution.status, 'multiple_candidates')

  const notFound = await resolveFoodMapLocation(
    { locationQuery: addressPhoneQuery },
    {
      provider: 'google',
      apiKey: 'test',
      fetchCandidates: async () => [],
    },
  )
  assert.equal(notFound.status, 'not_found')

  const weakSingleCandidate = await resolveFoodMapLocation(
    { locationQuery: addressPhoneQuery },
    {
      provider: 'google',
      apiKey: 'test',
      fetchCandidates: async () => [
        {
          id: 'weak-place',
          displayName: { text: 'Unrelated Result' },
        },
      ],
    },
  )
  assert.equal(weakSingleCandidate.status, 'multiple_candidates')
  assert.equal(weakSingleCandidate.resolvedLocation, null)

  const timeout = await resolveFoodMapLocation(
    { locationQuery: addressPhoneQuery },
    {
      provider: 'google',
      apiKey: 'test',
      fetchCandidates: async () => {
        const error = new Error('timeout')
        error.name = 'AbortError'
        throw error
      },
    },
  )
  assert.equal(timeout.status, 'error')
  assert.equal(timeout.reason, 'provider_timeout')

  const phoneRank = rankLocationCandidate(
    {
      name: 'Different Name',
      formattedAddress: 'Different Address',
      phone: '0901 234 567',
      placeId: 'phone-match',
      lat: 10,
      lng: 106,
      rawTypes: [],
    },
    {
      locationQuery: addressPhoneQuery,
      entities: baseEntities,
    },
  )
  assert.ok(phoneRank.matchReasons.includes('phone_match'))
  console.log('PASS: location resolution handles disabled, ranked, ambiguous, and error states')

  const existingIntegration = await integrateResolvedFoodMapPlace(
    {
      locationResolution: singleResolution,
      entities: baseEntities,
      locationQuery: {
        ...addressPhoneQuery,
        confidence: 0.9,
      },
    },
    {
      findDuplicate: async () => ({
        match: { id: 7, name: 'Sample Kitchen', confidence: 0.9 },
      }),
    },
  )
  assert.equal(existingIntegration.action, 'focus_existing_place')

  const providerIdDuplicate = scoreDuplicateFoodMapPlace(
    {
      name: 'Sample Kitchen',
      placeId: 'provider-place-1',
      phone: '0901 234 567',
      lat: 10.7,
      lng: 106.6,
    },
    {
      name: 'Different display variant',
      providerPlaceId: 'provider-place-1',
      phone: '0901234567',
      lat: 10.8,
      lng: 106.7,
    },
  )
  assert.equal(providerIdDuplicate.confidence, 1)
  assert.ok(
    providerIdDuplicate.matchReasons.includes('same_provider_place_id'),
  )

  const draftIntegration = await integrateResolvedFoodMapPlace(
    {
      locationResolution: {
        ...singleResolution,
        confidence: 0.9,
      },
      entities: {
        ...baseEntities,
        dishNames: [arrayEntity('pho bo', 0.8)],
      },
      locationQuery: {
        ...addressPhoneQuery,
        confidence: 0.9,
      },
      sourceType: 'image',
    },
    {
      findDuplicate: async () => ({ match: null }),
      createDraft: async () => ({
        id: 11,
        status: 'pending',
        suggestedName: 'Sample Kitchen',
      }),
    },
  )
  assert.equal(draftIntegration.action, 'review_draft_place')
  assert.equal(draftIntegration.draftPlace.status, 'pending')

  const lowConfidenceIntegration = await integrateResolvedFoodMapPlace(
    {
      locationResolution: {
        ...singleResolution,
        confidence: 0.5,
      },
      locationQuery: {
        ...addressPhoneQuery,
        confidence: 0.5,
      },
      entities: baseEntities,
    },
  )
  assert.equal(lowConfidenceIntegration.action, 'none')

  const ambiguousIntegration = await integrateResolvedFoodMapPlace({
    locationResolution: multipleResolution,
    locationQuery: placeDishLocationQuery,
    entities: baseEntities,
  })
  assert.equal(ambiguousIntegration.action, 'none')

  let insertSql = ''
  const createdDraft = await createFoodMapDraftPlace(
    {
      sourceType: 'image',
      resolvedLocation: singleResolution.resolvedLocation,
      entities: {
        ...baseEntities,
        dishNames: [arrayEntity('pho bo', 0.8)],
      },
      confidence: 0.85,
      evidence: { safe: true },
    },
    {
      database: {
        execute: async (sql) => {
          insertSql = sql
          return [{ insertId: 19 }]
        },
      },
    },
  )
  assert.match(insertSql, /INSERT INTO draft_places/i)
  assert.doesNotMatch(insertSql, /INSERT INTO (?:restaurants|food_spots)/i)
  assert.equal(createdDraft.id, 19)
  console.log('PASS: resolved places match existing data or create review-only drafts')

  assert.equal(
    buildFoodMapNextAction({
      integration: existingIntegration,
    }).type,
    'focus_existing_place',
  )
  assert.equal(
    buildFoodMapNextAction({
      integration: draftIntegration,
    }).type,
    'review_draft_place',
  )
  assert.equal(
    buildFoodMapNextAction({
      locationResolution: multipleResolution,
    }).type,
    'choose_candidate',
  )
  assert.equal(
    buildFoodMapNextAction({
      entities: {
        status: 'dish_only',
        dishNames: [{ value: 'pho bo' }],
      },
      locationQuery: dishOnlyQuery,
    }).type,
    'explore_dish_nearby',
  )
  assert.equal(
    buildFoodMapNextAction({
      entities: {
        status: 'unclear',
        phones: [{ value: '0901234567' }],
        dishNames: [],
      },
      locationQuery: phoneOnlyQuery,
    }).type,
    'ask_for_hint',
  )
  assert.equal(
    buildFoodMapNextAction({
      imageProvided: true,
      ocrEvidence: { usable: false },
      locationQuery: noisyQuery,
      entities: { status: 'unclear', dishNames: [] },
    }).type,
    'ask_for_clearer_image',
  )
  console.log('PASS: UX nextAction values cover safe fallback outcomes')

  console.log('Food Map social discovery architecture tests passed')
}

await run()
