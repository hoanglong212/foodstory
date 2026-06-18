import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import http from 'node:http'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'

process.env.FOOD_MAP_SOCIAL_OCR_TIMEOUT_MS ||= '20000'
process.env.FOOD_MAP_SOCIAL_OCR_MAX_PASSES ||= '16'

const fixtureDirectory = fileURLToPath(
  new URL('./fixtures/social-ocr/', import.meta.url),
)
const supportedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const fixtureNames = readdirSync(fixtureDirectory)
  .filter((filename) => supportedExtensions.has(extname(filename).toLowerCase()))
  .sort()

function compactSnippet(value, length = 360) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length <= length ? text : `${text.slice(0, length).trim()}...`
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function validVietnamesePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  const local = digits.startsWith('84') ? `0${digits.slice(2)}` : digits
  return /^0[35789]\d{8}$/.test(local) || /^02\d{8,9}$/.test(local)
}

function hasStreetAddress(value) {
  return /\b\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\s+[\p{L}]{2,}/iu.test(
    String(value || ''),
  )
}

function cleanPlaceName(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  const normalized = normalizeText(text)
  const tokens = normalized.split(' ').filter(Boolean)
  if (!text || text.length > 80 || tokens.length > 9) return false
  if ((text.match(/\b\d{1,3}\s*(?:k|vnd|đ|d)\b/giu) || []).length >= 2) {
    return false
  }
  if (tokens.length >= 4 && new Set(tokens).size / tokens.length <= 0.65) {
    return false
  }
  return true
}

async function startServer() {
  const {
    createFoodMapSocialDiscoveryRouter,
  } = await import('../routes/foodMapSocialDiscoveryRoutes.js')
  const app = express()
  app.use(express.json())
  app.use('/api/food-map', createFoodMapSocialDiscoveryRouter())
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
    url: `http://127.0.0.1:${address.port}/api/food-map/social-discovery`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

async function postImage({ endpoint, filename }) {
  const extension = extname(filename).toLowerCase()
  const mimetype = {
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  }[extension]
  const buffer = readFileSync(join(fixtureDirectory, filename))
  const form = new FormData()
  form.append('image', new Blob([buffer], { type: mimetype }), filename)
  form.append('hint', 'Real OCR smoke-test image')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90_000)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    return {
      httpStatus: response.status,
      body: await response.json(),
    }
  } finally {
    clearTimeout(timer)
  }
}

function assertNoResolutionSideEffects(result) {
  assert.equal(result.place.name, null)
  assert.equal(result.place.address, null)
  assert.equal(result.place.existsInFoodMap, false)
  assert.equal(result.place.matchedFoodMapPlace, null)
  assert.equal(result.dishFallback.broadDish, null)
  assert.equal(result.dishFallback.possibleDish, null)
  assert.equal(result.dishFallback.cuisine, null)
  assert.deepEqual(result.dishFallback.topCandidates, [])
  assert.equal(result.addPlaceDraft, null)
  assert.equal(result.matchedPlace, undefined)
  assert.equal(result.placeId, undefined)
  assert.equal(result.coordinates, undefined)
  assert.equal(result.matched_place, undefined)
}

function assertResponseContract(result) {
  assert.ok(result.inputSignals)
  assert.ok(result.ocrEvidence)
  assert.ok(result.entities)
  assert.ok(result.locationQuery)
  assert.equal(result.ocrEvidence.debug?.implemented, true)
  assert.equal(result.ocrEvidence.debug?.engine, 'tesseract.js')
  assert.notEqual(result.ocrEvidence.reason, 'timeout')
  assert.ok(Array.isArray(result.ocrEvidence.lines))
  assert.ok(Array.isArray(result.ocrEvidence.strongLines))
  assert.ok(Array.isArray(result.ocrEvidence.weakLines))
  assert.equal(
    typeof result.ocrEvidence.debug?.lineFiltering?.rejectedCount,
    'number',
  )
  assert.equal(typeof result.ocrEvidence.usable, 'boolean')
  assert.equal(typeof result.locationQuery.canResolveLocation, 'boolean')
  assert.equal(typeof result.locationQuery.confidence, 'number')
  assert.ok(Array.isArray(result.locationQuery.warnings))
  assert.deepEqual(Object.keys(result.locationQuery.components), [
    'address',
    'placeName',
    'phones',
    'dishNames',
    'locationHints',
    'priceHints',
  ])
}

function assertLocationQueryInvariant(result) {
  const locationQuery = result.locationQuery
  const components = locationQuery.components
  const hasAddress = hasStreetAddress(components.address)
  const hasPhone = components.phones.some(validVietnamesePhone)
  const hasPlaceAndLocation =
    cleanPlaceName(components.placeName) &&
    components.locationHints.some((hint) => normalizeText(hint))

  if (locationQuery.canResolveLocation) {
    assert.equal(typeof locationQuery.query, 'string')
    assert.ok(locationQuery.query.trim())
    assert.ok(
      hasAddress || hasPhone || hasPlaceAndLocation,
      'Resolvable query must have address, phone, or place plus location evidence.',
    )
  } else {
    assert.equal(locationQuery.query, null)
  }
}

function summarize({ filename, httpStatus, body }) {
  return {
    filename,
    httpStatus,
    status: body.status,
    ocr: {
      usable: body.ocrEvidence?.usable === true,
      confidence: body.ocrEvidence?.confidence || 0,
      reason: body.ocrEvidence?.reason || null,
      text: compactSnippet(body.ocrEvidence?.text),
      strongLines:
        body.ocrEvidence?.strongLines?.map((line) => ({
          text: compactSnippet(line.text, 140),
          type: line.type,
          clusterType: line.clusterType,
          quality: line.quality,
          supportCount: line.supportCount,
          variantCount: line.evidenceVariants?.length || 0,
        })) || [],
      weakLines:
        body.ocrEvidence?.weakLines?.map((line) => ({
          text: compactSnippet(line.text, 140),
          type: line.type,
          clusterType: line.clusterType,
          quality: line.quality,
          supportCount: line.supportCount,
          variantCount: line.evidenceVariants?.length || 0,
        })) || [],
      rejectedCount:
        body.ocrEvidence?.debug?.lineFiltering?.rejectedCount || 0,
      lineTypes: (body.ocrEvidence?.lines || []).map((line) => line.type),
      selectedPass: body.ocrEvidence?.debug?.selectedPass || null,
      selectedVariant: body.ocrEvidence?.debug?.selectedVariant || null,
      selectedQualityScore:
        body.ocrEvidence?.debug?.selectedQualityScore || 0,
      preprocessingVariants:
        body.ocrEvidence?.debug?.image?.variants?.map(
          (variant) => variant.label,
        ) || [],
    },
    entities: {
      status: body.entities?.status || null,
      confidence: body.entities?.confidence || 0,
      address: body.entities?.address?.value || null,
      placeName: body.entities?.placeName?.value || null,
      phones: body.entities?.phones?.map((phone) => phone.normalized) || [],
      dishNames: body.entities?.dishNames?.map((dish) => dish.value) || [],
      locationHints:
        body.entities?.locationHints?.map((location) => location.value) || [],
      priceHints: body.entities?.priceHints?.map((price) => price.value) || [],
    },
    locationQuery: body.locationQuery,
    scopeClean:
      body.place?.name === null &&
      body.place?.matchedFoodMapPlace === null &&
      body.dishFallback?.possibleDish === null &&
      body.addPlaceDraft === null &&
      body.placeId === undefined &&
      body.coordinates === undefined,
  }
}

async function run() {
  assert.ok(fixtureNames.length > 0, 'No real OCR smoke-test images were found.')

  const server = await startServer()
  const summaries = []

  try {
    for (const filename of fixtureNames) {
      const response = await postImage({
        endpoint: server.url,
        filename,
      })
      assert.equal(response.httpStatus, 200)
      assertResponseContract(response.body)
      assertNoResolutionSideEffects(response.body)
      assertLocationQueryInvariant(response.body)
      summaries.push(
        summarize({
          filename,
          httpStatus: response.httpStatus,
          body: response.body,
        }),
      )
    }
  } finally {
    await server.close()
    const { terminateLocalOcrWorkers } = await import('../services/localOcrService.js')
    await terminateLocalOcrWorkers()
  }

  console.log(JSON.stringify({ summaries }, null, 2))
  console.log('Real social OCR smoke test passed')
}

await run()
