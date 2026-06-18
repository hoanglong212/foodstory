import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { analyzeFoodMapDiscovery } from '../services/foodMapDiscoveryService.js'
import {
  extractPlaceCandidate,
  findExternalPlace,
} from '../services/externalPlaceDiscoveryService.js'
import { findFoodMapMatch } from '../services/foodMapExistenceService.js'
import {
  assessOcrOutput,
  extractTextFromImage,
  terminateOcrWorker,
} from '../services/ocrService.js'

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)
const ocrFixture = readFileSync(
  fileURLToPath(
    new URL('./fixtures/ocr-com-tam-thanh-tu.png', import.meta.url),
  ),
)
const uploadedImage = {
  buffer: tinyPng,
  size: tinyPng.length,
  mimetype: 'image/png',
  originalname: 'food-map-test.png',
}

function dependencies(overrides = {}) {
  return {
    embedUploadedImage: async () => ({
      embedding: [1, 0, 0],
      food_score: 0.91,
    }),
    extractTextFromImage: async () => ({
      text: null,
      confidence: 0,
      lines: [],
      ocrUsable: false,
      reason: 'no_text',
      debug: { rawText: '', cleanedText: '' },
    }),
    embedClipHint: async () => [1, 0, 0],
    rankVisualCandidates: async () => ({ ranked: [], selected: [] }),
    findExternalPlace,
    findFoodMapMatch: async () => ({ match: null, candidates: [] }),
    ...overrides,
  }
}

async function run() {
  const newPlaceResult = await analyzeFoodMapDiscovery(
    {
      file: uploadedImage,
      hint: 'Com Tam Thanh Tu',
    },
    dependencies(),
  )
  assert.equal(
    newPlaceResult.status,
    'external_place_found_not_in_foodmap',
    'uploaded image with a strong place hint should produce an external place',
  )
  assert.match(newPlaceResult.suggestedDraft.name, /Com Tam Thanh Tu/i)
  assert.equal(newPlaceResult.suggestedDraft.dish_name, '')
  assert.equal(newPlaceResult.suggestedDraft.latitude, null)
  assert.equal(newPlaceResult.suggestedDraft.longitude, null)
  console.log('PASS: uploaded image and new place hint create a map draft')

  const existingRestaurant = {
    sourceType: 'restaurant',
    sourceId: 89,
    name: 'Banh Mi Hoi An Phuong',
    dishName: null,
    category: 'Banh Mi',
    district: 'District 1',
    address: '78 Le Loi',
    latitude: 10.7745,
    longitude: 106.7001,
    confidence: 0.96,
    matchLevel: 'strong',
    evidence: ['exact_name'],
  }
  const existingPlaceResult = await analyzeFoodMapDiscovery(
    {
      file: uploadedImage,
      hint: 'Banh Mi Hoi An Phuong',
    },
    dependencies({
      findFoodMapMatch: async () => ({
        match: existingRestaurant,
        candidates: [existingRestaurant],
      }),
    }),
  )
  assert.equal(
    existingPlaceResult.status,
    'external_place_found_in_foodmap',
  )
  assert.equal(existingPlaceResult.foodMapMatch.sourceType, 'restaurant')
  console.log('PASS: existing place hint returns the restaurant marker')

  const dishOnlyResult = await analyzeFoodMapDiscovery(
    { file: uploadedImage },
    dependencies({
      rankVisualCandidates: async () => ({
        ranked: [
          {
            sourceType: 'recipe',
            sourceId: 4,
            title: 'Com tam suon trung',
            category: 'Broken Rice',
            confidence: 0.82,
            duplicateImageCount: 1,
          },
        ],
        selected: [],
      }),
    }),
  )
  assert.equal(
    dishOnlyResult.status,
    'external_place_not_found_dish_identified',
  )
  assert.equal(dishOnlyResult.suggestedDraft.category, 'Broken Rice')
  console.log('PASS: food image without place evidence falls back to dish')

  let garbageOcrPlaceSignal = null
  const foodOnlyResult = await analyzeFoodMapDiscovery(
    { file: uploadedImage },
    dependencies({
      embedUploadedImage: async () => ({
        embedding: [1, 0, 0],
        food_score: 0.94,
        dish_predictions: [
          {
            dish_name: 'Cơm tấm',
            category: 'Broken Rice',
            score: 0.31,
          },
        ],
      }),
      extractTextFromImage: async () =>
        assessOcrOutput({
          rawText: 'àI$ ] Lại si : 7 _',
          confidence: 0.31,
        }),
      findExternalPlace: async (signals) => {
        garbageOcrPlaceSignal = signals.ocrText
        return null
      },
    }),
  )
  assert.equal(
    foodOnlyResult.status,
    'external_place_not_found_dish_identified',
  )
  assert.equal(foodOnlyResult.visualUnderstanding.dishName, 'Cơm tấm')
  assert.equal(foodOnlyResult.visualUnderstanding.category, 'Broken Rice')
  assert.equal(foodOnlyResult.visualUnderstanding.ocrText, null)
  assert.equal(foodOnlyResult.visualUnderstanding.ocrUsable, false)
  assert.equal(foodOnlyResult.visualUnderstanding.ocrConfidence, 0.31)
  assert.equal(garbageOcrPlaceSignal, '')
  assert.equal(
    foodOnlyResult.debug.ocr.rawText,
    'àI$ ] Lại si : 7 _',
  )
  assert.ok(
    !foodOnlyResult.suggestedDraft.notes.includes('àI$'),
    'garbage OCR must not appear in the user-facing draft',
  )
  assert.deepEqual(foodOnlyResult.actions, [
    'add_to_food_map',
    'edit_before_add',
    'add_hint',
    'upload_screenshot',
  ])
  console.log('PASS: unusable OCR does not block visual cơm tấm fallback')

  const weakDishResult = await analyzeFoodMapDiscovery(
    { file: uploadedImage },
    dependencies({
      embedUploadedImage: async () => ({
        embedding: [1, 0, 0],
        food_score: 0.9,
        dish_predictions: [
          {
            dish_name: 'Cơm tấm',
            category: 'Broken Rice',
            score: 0.12,
          },
        ],
      }),
    }),
  )
  assert.equal(
    weakDishResult.status,
    'external_place_not_found_unclear',
  )
  console.log('PASS: weak visual dish scores do not create a dish claim')

  const urlResult = await analyzeFoodMapDiscovery(
    { sourceUrl: 'https://www.tiktok.com/example' },
    dependencies(),
  )
  assert.equal(urlResult.status, 'url_extraction_failed')
  assert.equal(
    urlResult.message,
    'I could not read this URL directly yet. Please upload a screenshot or image from the video instead.',
  )
  console.log('PASS: URL-only input returns the screenshot fallback')

  const hintOnlyResult = await analyzeFoodMapDiscovery(
    { hint: 'Com Tam Thanh Tu' },
    dependencies(),
  )
  assert.equal(
    hintOnlyResult.status,
    'external_place_found_not_in_foodmap',
  )
  assert.equal(hintOnlyResult.suggestedDraft.name, 'Com Tam Thanh Tu')
  console.log('PASS: a strong hint can discover a place without an image')

  const blankResult = await analyzeFoodMapDiscovery(
    { file: uploadedImage },
    dependencies({
      embedUploadedImage: async () => ({
        embedding: [0, 0, 0],
        food_score: 0.05,
      }),
    }),
  )
  assert.equal(blankResult.status, 'unclear')
  console.log('PASS: blank or non-food image stays unclear')

  let readableOcrPlaceSignal = null
  const readableScreenshotResult = await analyzeFoodMapDiscovery(
    { file: uploadedImage },
    dependencies({
      extractTextFromImage: async () =>
        assessOcrOutput({
          rawText: 'COM TAM THANH TU',
          confidence: 0.91,
        }),
      findExternalPlace: async (signals) => {
        readableOcrPlaceSignal = signals.ocrText
        return {
          name: 'Com Tam Thanh Tu',
          category: 'Broken Rice',
          address: null,
          district: null,
          latitude: null,
          longitude: null,
          confidence: 0.84,
          source: 'ocr_or_hint',
        }
      },
    }),
  )
  assert.equal(
    readableScreenshotResult.status,
    'external_place_found_not_in_foodmap',
  )
  assert.equal(readableScreenshotResult.visualUnderstanding.ocrUsable, true)
  assert.equal(readableOcrPlaceSignal, 'COM TAM THANH TU')
  console.log('PASS: reliable screenshot OCR participates in place discovery')

  const garbageAssessment = assessOcrOutput({
    rawText: 'àI$ ] Lại si : 7 _',
    confidence: 0.31,
  })
  assert.equal(garbageAssessment.ocrUsable, false)
  assert.equal(garbageAssessment.text, null)
  assert.equal(garbageAssessment.reason, 'low_confidence')
  assert.equal(garbageAssessment.debug.rawText, 'àI$ ] Lại si : 7 _')
  const symbolAssessment = assessOcrOutput({
    rawText: '$ ] : 7 _',
    confidence: 0.92,
  })
  assert.equal(symbolAssessment.ocrUsable, false)
  assert.ok(
    ['mostly_symbols', 'too_short'].includes(symbolAssessment.reason),
  )
  console.log('PASS: low-confidence OCR garbage is debug-only')

  const ocrResult = await extractTextFromImage(ocrFixture)
  assert.equal(ocrResult.ocrUsable, true)
  assert.equal(typeof ocrResult.text, 'string')
  assert.equal(typeof ocrResult.confidence, 'number')
  assert.ok(Array.isArray(ocrResult.lines))
  assert.match(ocrResult.text, /COM TAM THANH TU/i)
  console.log('PASS: OCR extracts visible place text from a sample image')

  const extractedCandidate = extractPlaceCandidate({
    ocrText: 'Order now\nCOM TAM THANH TU\n0900 000 000',
  })
  assert.equal(extractedCandidate.name, 'COM TAM THANH TU')
  console.log('PASS: OCR place-name extraction recognizes a food shop line')

  const exactMatchResult = await findFoodMapMatch(
    { name: 'Banh Mi Hoi An Phuong', category: 'Banh Mi' },
    { rows: [existingRestaurant] },
  )
  assert.equal(exactMatchResult.match.sourceType, 'restaurant')

  const categoryOnlyResult = await findFoodMapMatch(
    { name: 'A Completely Different Shop', category: 'Banh Mi' },
    { rows: [existingRestaurant] },
  )
  assert.equal(categoryOnlyResult.match, null)
  console.log('PASS: Food Map matching requires place-name evidence')

  console.log('Food Map discovery Phase 2 tests passed: 13')
}

try {
  await run()
} finally {
  await terminateOcrWorker()
}
