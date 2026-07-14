import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import {
  SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_AGGREGATE_STATUSES,
  SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_ENDPOINT,
  SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES,
  parseShortsTrack2V3GeminiCropJudgeResponse,
  runShortsTrack2V3GeminiCropJudge,
  validateShortsTrack2V3GeminiCropIds,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3GeminiCropJudgeService.js'
import {
  createShortsTrack2V3GeminiRequestScheduler,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3GeminiRequestSchedulerService.js'

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ))
})

async function tempDir() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'track2-v3-gemini-judge-'))
  tempDirs.push(directory)
  return directory
}

async function testCrop(directory, name, color) {
  const cropPath = path.join(directory, `${name}.jpg`)
  await sharp({
    create: { width: 320, height: 180, channels: 3, background: color },
  }).jpeg().toFile(cropPath)
  return cropPath
}

async function noisyTestCrop(directory, name) {
  const cropPath = path.join(directory, `${name}.jpg`)
  const pixels = Buffer.alloc(320 * 180 * 3)
  for (let index = 0; index < pixels.length; index += 1) pixels[index] = index % 251
  await sharp(pixels, { raw: { width: 320, height: 180, channels: 3 } })
    .jpeg({ quality: 95 })
    .toFile(cropPath)
  return cropPath
}

function jsonResponse(status, value, headers = {}) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([key, item]) => [String(key).toLowerCase(), String(item)]),
  )
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => normalizedHeaders.get(String(name).toLowerCase()) || null,
    },
    text: async () => JSON.stringify(value),
  }
}

function cropList(count, cropPath) {
  return Array.from({ length: count }, (_, index) => ({
    cropId: `crop-${String(index + 1).padStart(3, '0')}`,
    path: cropPath,
    frameId: `frame-${index + 1}`,
    timestampSeconds: index,
    regionType: 'middle_crop_raw',
  }))
}

describe('Track 2 V3 Gemini crop judge', () => {
  it('keeps the feature disabled by default without calling Gemini', async () => {
    let calls = 0
    const result = await runShortsTrack2V3GeminiCropJudge({
      config: { track2V3GeminiCropJudgeEnabled: false },
      deps: { geminiCropJudgeInteract: async () => { calls += 1 } },
    })

    assert.equal(result.status, 'DISABLED')
    assert.equal(result.called, false)
    assert.equal(calls, 0)
  })

  it('skips safely when GEMINI_API_KEY is missing', async () => {
    const directory = await tempDir()
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: [{ cropId: 'crop-001', path: 'all-crops/crop-001.jpg' }],
      outputDir: directory,
      config: { track2V3GeminiCropJudgeEnabled: true },
      env: {},
    })

    assert.equal(result.status, 'UNAVAILABLE')
    assert.equal(result.called, false)
    assert.equal(result.reason, 'GEMINI_CROP_JUDGE_PROVIDER_UNAVAILABLE')
    assert.equal(result.errors[0].code, 'GEMINI_CROP_JUDGE_PROVIDER_UNAVAILABLE')
    assert.ok(await fs.stat(result.resultPath))
  })

  it('parses JSON crop IDs while ignoring any non-selection fields', () => {
    const parsed = parseShortsTrack2V3GeminiCropJudgeResponse(JSON.stringify({
      hasLikelyAddressCrop: true,
      selectedCropIds: ['crop-003', 'crop-003', 'crop-005'],
      reason: 'Likely location strip.',
      candidateAddress: 'must never become evidence',
      address: '123 Fake Street',
    }))

    assert.deepEqual(parsed.selectedCropIds, ['crop-003', 'crop-005'])
    assert.equal(Object.hasOwn(parsed, 'candidateAddress'), false)
    assert.equal(Object.hasOwn(parsed, 'address'), false)
    assert.equal(Object.hasOwn(parsed, 'reason'), false)
  })

  it('parses fenced Interactions output_text and model-output steps', () => {
    const fromOutputText = parseShortsTrack2V3GeminiCropJudgeResponse({
      output_text: '```json\n{"selectedCropIds":["crop-010"]}\n```',
    })
    const fromSteps = parseShortsTrack2V3GeminiCropJudgeResponse({
      steps: [{
        type: 'model_output',
        content: [{ type: 'text', text: '{"selectedCropIds":["crop-011"]}' }],
      }],
    })

    assert.deepEqual(fromOutputText.selectedCropIds, ['crop-010'])
    assert.deepEqual(fromSteps.selectedCropIds, ['crop-011'])
  })

  it('rejects unknown IDs, deduplicates IDs, and enforces the crop cap', () => {
    const validated = validateShortsTrack2V3GeminiCropIds({
      selectedCropIds: ['crop-001', 'missing-crop', 'crop-001', 'crop-002'],
      availableCrops: [
        { cropId: 'crop-001', path: 'one.jpg' },
        { cropId: 'crop-002', path: 'two.jpg' },
      ],
      maxSelectedCrops: 1,
    })

    assert.deepEqual(validated.validCropIds, ['crop-001'])
    assert.deepEqual(validated.rejectedCropIds, ['missing-crop', 'crop-002'])
    assert.deepEqual(validated.selectedCrops.map((crop) => crop.cropId), ['crop-001'])
  })

  it('writes paged artifacts and returns only validated original crop metadata', async () => {
    const directory = await tempDir()
    const firstPath = await testCrop(directory, 'first', { r: 80, g: 20, b: 20 })
    const secondPath = await testCrop(directory, 'second', { r: 20, g: 80, b: 20 })
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: [
        {
          cropId: 'crop-001',
          path: firstPath,
          frameId: 'frame-4',
          timestampSeconds: 4.25,
          regionType: 'middle_crop_raw',
        },
        {
          cropId: 'crop-002',
          path: secondPath,
          frameId: 'frame-5',
          timestampSeconds: 5.5,
          regionType: 'lower_middle_crop_raw',
        },
      ],
      outputDir: directory,
      config: {
        track2V3GeminiCropJudgeEnabled: true,
        geminiCropJudgeMaxPages: 6,
        geminiCropJudgeMaxSelectedCrops: 8,
      },
      env: {},
      deps: {
        geminiCropJudgeInteract: async ({ cropIds }) => ({
          selectedCropIds: [cropIds[1], 'crop-999'],
        }),
      },
    })

    assert.equal(result.called, true)
    assert.deepEqual(result.selectedCropIds, ['crop-002'])
    assert.deepEqual(result.rejectedCropIds, ['crop-999'])
    assert.equal(result.selectedCrops[0].cropPath, secondPath)
    assert.equal(result.contactSheetPaths.length, 1)
    assert.ok(await fs.stat(result.contactSheetPaths[0]))
    assert.ok(await fs.stat(result.resultPath))
  })

  it('sends the Interactions text and JPEG image schema without a data URL prefix', async () => {
    const directory = await tempDir()
    const cropPath = await testCrop(directory, 'schema', { r: 25, g: 35, b: 45 })
    const apiKey = 'test-api-key-must-not-be-logged'
    let requestUrl = null
    let requestOptions = null
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: [{ cropId: 'crop-001', path: cropPath }],
      outputDir: directory,
      config: { track2V3GeminiCropJudgeEnabled: true },
      env: { GEMINI_API_KEY: apiKey },
      deps: {
        fetch: async (url, options) => {
          requestUrl = url
          requestOptions = options
          return jsonResponse(200, {
            output_text: '```json\n{"selectedCropIds":["crop-001"]}\n```',
          })
        },
      },
    })

    const body = JSON.parse(requestOptions.body)
    assert.equal(requestUrl, SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_ENDPOINT)
    assert.equal(body.model, 'gemini-3.5-flash')
    assert.equal(body.store, false)
    assert.deepEqual(body.input[0], {
      type: 'text',
      text: body.input[0].text,
    })
    assert.match(body.input[0].text, /selecting image crops for OCR/iu)
    assert.equal(body.input[1].type, 'image')
    assert.equal(body.input[1].mime_type, 'image/jpeg')
    assert.ok(body.input[1].data.length > 0)
    assert.equal(body.input[1].data.startsWith('data:'), false)
    assert.equal(Object.hasOwn(body, 'contents'), false)
    assert.equal(Object.hasOwn(body, 'generationConfig'), false)
    assert.deepEqual(result.selectedCropIds, ['crop-001'])
    const persisted = await fs.readFile(result.resultPath, 'utf8')
    assert.equal(persisted.includes(apiKey), false)
    assert.equal(persisted.includes(body.input[1].data), false)
  })

  it('persists sanitized Google HTTP 400 diagnostics without API keys or image data', async () => {
    const directory = await tempDir()
    const cropPath = await testCrop(directory, 'http-400', { r: 70, g: 40, b: 10 })
    const apiKey = 'secret-http-400-api-key'
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: [{ cropId: 'crop-001', path: cropPath }],
      outputDir: directory,
      config: { track2V3GeminiCropJudgeEnabled: true },
      env: { GEMINI_API_KEY: apiKey },
      deps: {
        fetch: async () => jsonResponse(400, {
          error: {
            code: 400,
            status: 'INVALID_ARGUMENT',
            message: `Invalid image input ${apiKey}`,
            details: [{
              fieldViolations: [{ field: 'input[1].mime_type', description: 'Invalid MIME type.' }],
            }],
          },
        }),
      },
    })

    assert.equal(result.status, 'ERROR')
    assert.equal(result.reason, 'GEMINI_CROP_JUDGE_REQUEST_FAILED')
    assert.equal(result.errors[0].httpStatus, 400)
    assert.equal(result.errors[0].googleErrorStatus, 'INVALID_ARGUMENT')
    assert.equal(result.errors[0].googleErrorCode, 400)
    assert.equal(result.errors[0].googleErrorMessage, 'Invalid image input [REDACTED]')
    assert.deepEqual(result.errors[0].fieldViolations, [{
      field: 'input[1].mime_type',
      description: 'Invalid MIME type.',
    }])
    assert.equal(result.errors[0].endpointType, 'INTERACTIONS')
    assert.equal(result.errors[0].model, 'gemini-3.5-flash')
    assert.ok(result.errors[0].imageBytes > 0)
    assert.ok(result.errors[0].base64Length > result.errors[0].imageBytes)
    assert.ok(result.errors[0].requestBodyApproxBytes > result.errors[0].base64Length)
    const persisted = await fs.readFile(result.resultPath, 'utf8')
    assert.equal(persisted.includes(apiKey), false)
    assert.equal(persisted.includes('data:image/'), false)
  })

  it('classifies request aborts as sanitized Crop Judge timeouts', async () => {
    const directory = await tempDir()
    const cropPath = await testCrop(directory, 'timeout', { r: 15, g: 25, b: 35 })
    const error = new Error('This operation was aborted')
    error.name = 'AbortError'
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: [{ cropId: 'crop-001', path: cropPath }],
      outputDir: directory,
      config: {
        track2V3GeminiCropJudgeEnabled: true,
        geminiCropJudgeMaxAttempts: 1,
      },
      env: { GEMINI_API_KEY: 'timeout-test-key' },
      deps: { fetch: async () => { throw error } },
    })

    assert.equal(result.errors[0].code, 'GEMINI_CROP_JUDGE_TIMEOUT')
    assert.equal(result.errors[0].httpStatus, null)
    assert.equal(result.errors[0].transportErrorMessage, 'This operation was aborted')
  })

  it('recompresses an oversized page and skips it safely when it still exceeds limits', async () => {
    const directory = await tempDir()
    const cropPath = await noisyTestCrop(directory, 'oversized')
    let calls = 0
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: [{ cropId: 'crop-001', path: cropPath }],
      outputDir: directory,
      config: {
        track2V3GeminiCropJudgeEnabled: true,
        geminiCropJudgeMaxImageBytes: 1024,
        geminiCropJudgeMaxRequestBytes: 1024,
        geminiCropJudgeJpegQuality: 80,
      },
      env: {},
      deps: {
        geminiCropJudgeInteract: async () => {
          calls += 1
          return { selectedCropIds: [] }
        },
      },
    })

    assert.equal(calls, 0)
    assert.equal(result.called, false)
    assert.equal(result.status, 'ERROR')
    assert.equal(result.errors[0].code, 'GEMINI_CROP_JUDGE_REQUEST_TOO_LARGE')
    assert.equal(result.pageArtifacts[0].recompressed, true)
    assert.equal(result.pageArtifacts[0].sendable, false)
    assert.ok(result.pageArtifacts[0].sentBytes <= result.pageArtifacts[0].originalBytes)
    assert.match(result.pageArtifacts[0].sentPagePath, /-gemini\.jpg$/u)
    assert.ok(await fs.stat(path.join(directory, result.pageArtifacts[0].sentPagePath)))
  })

  it('bounds scheduler concurrency globally within one process', async () => {
    const scheduler = createShortsTrack2V3GeminiRequestScheduler({ maxConcurrency: 2 })
    let active = 0
    let maximum = 0
    const values = await Promise.all(Array.from({ length: 6 }, (_, index) =>
      scheduler.schedule(async () => {
        active += 1
        maximum = Math.max(maximum, active)
        await new Promise((resolve) => setTimeout(resolve, 15))
        active -= 1
        return index
      })
    ))

    assert.equal(maximum <= 2, true)
    assert.deepEqual(values.map((item) => item.value), [0, 1, 2, 3, 4, 5])
    assert.equal(scheduler.diagnostics().maxObservedConcurrency <= 2, true)
  })

  it('coalesces concurrent duplicate request identities within one scheduler lifecycle', async () => {
    const scheduler = createShortsTrack2V3GeminiRequestScheduler({ maxConcurrency: 1 })
    let providerCalls = 0
    const task = async () => {
      providerCalls += 1
      await new Promise((resolve) => setTimeout(resolve, 15))
      return { selectedCropIds: ['crop-001'] }
    }

    const [first, second] = await Promise.all([
      scheduler.dedupe('same-page', task),
      scheduler.dedupe('same-page', task),
    ])

    assert.equal(providerCalls, 1)
    assert.deepEqual(first.selectedCropIds, ['crop-001'])
    assert.deepEqual(second.selectedCropIds, ['crop-001'])
    assert.equal([first.dedupHit, second.dedupHit].filter(Boolean).length, 1)
    assert.equal(scheduler.diagnostics().dedupHitCount, 1)
  })

  it('retries HTTP 429 once and preserves selected crops from the successful response', async () => {
    const directory = await tempDir()
    const imagePath = await testCrop(directory, 'rate-limit', { r: 20, g: 30, b: 40 })
    let calls = 0
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: [{ cropId: 'crop-001', path: imagePath }],
      outputDir: directory,
      config: {
        track2V3GeminiCropJudgeEnabled: true,
        geminiCropJudgeMaxAttempts: 2,
        geminiCropJudgeRetryBaseDelayMs: 5,
        geminiCropJudgeRetryMaxDelayMs: 10,
      },
      env: {},
      deps: {
        sleep: async () => {},
        random: () => 0,
        geminiCropJudgeInteract: async () => {
          calls += 1
          if (calls === 1) {
            const error = new Error('GEMINI_CROP_JUDGE_HTTP_429')
            error.diagnostics = { httpStatus: 429 }
            throw error
          }
          return { selectedCropIds: ['crop-001'] }
        },
      },
    })

    assert.equal(calls, 2)
    assert.deepEqual(result.selectedCropIds, ['crop-001'])
    assert.equal(result.geminiCropJudgeRetryCount, 1)
    assert.equal(result.geminiCropJudgeRateLimitCount, 1)
    assert.equal(result.pageResults[0].attemptCount, 2)
    assert.equal(
      result.pageResults[0].attempts[0].providerErrorClass,
      SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.RATE_LIMITED,
    )
  })

  it('respects bounded Retry-After diagnostics without sleeping in real time', async () => {
    const directory = await tempDir()
    const imagePath = await testCrop(directory, 'retry-after', { r: 30, g: 40, b: 50 })
    const delays = []
    let calls = 0
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: [{ cropId: 'crop-001', path: imagePath }],
      outputDir: directory,
      config: {
        track2V3GeminiCropJudgeEnabled: true,
        geminiCropJudgeMaxAttempts: 2,
        geminiCropJudgeRetryBaseDelayMs: 5,
        geminiCropJudgeRetryMaxDelayMs: 5000,
      },
      env: { GEMINI_API_KEY: 'retry-after-test-key' },
      deps: {
        sleep: async (ms) => { delays.push(ms) },
        fetch: async () => {
          calls += 1
          if (calls === 1) {
            return jsonResponse(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }, {
              'Retry-After': '2',
            })
          }
          return jsonResponse(200, { output_text: '{"selectedCropIds":["crop-001"]}' })
        },
      },
    })

    assert.deepEqual(delays, [2000])
    assert.equal(result.pageResults[0].attempts[0].retryAfterPresent, true)
    assert.equal(result.pageResults[0].attempts[0].retryAfterUsed, true)
    assert.equal(result.pageResults[0].attempts[0].retryAfterMs, 2000)
    assert.equal(result.geminiCropJudgeBackoffMs, 2000)
    assert.deepEqual(result.selectedCropIds, ['crop-001'])
  })

  it('retries a provider timeout and succeeds within the page lifecycle budget', async () => {
    const directory = await tempDir()
    const imagePath = await testCrop(directory, 'timeout-success', { r: 40, g: 50, b: 60 })
    let calls = 0
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: [{ cropId: 'crop-001', path: imagePath }],
      outputDir: directory,
      config: {
        track2V3GeminiCropJudgeEnabled: true,
        geminiCropJudgeMaxAttempts: 2,
        geminiCropJudgeRetryBaseDelayMs: 1,
        geminiCropJudgeRetryMaxDelayMs: 1,
      },
      env: {},
      deps: {
        sleep: async () => {},
        geminiCropJudgeInteract: async () => {
          calls += 1
          if (calls === 1) throw new Error('GEMINI_CROP_JUDGE_TIMEOUT')
          return { selectedCropIds: ['crop-001'] }
        },
      },
    })

    assert.equal(calls, 2)
    assert.equal(result.geminiCropJudgeTimeoutCount, 1)
    assert.equal(result.geminiCropJudgeRetryCount, 1)
    assert.deepEqual(result.selectedCropIds, ['crop-001'])
  })

  it('stops retries when the total page budget is exhausted', async () => {
    const directory = await tempDir()
    const imagePath = await testCrop(directory, 'budget-exhausted', { r: 50, g: 60, b: 70 })
    let fakeNow = 1000
    let calls = 0
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: [{ cropId: 'crop-001', path: imagePath }],
      outputDir: directory,
      config: {
        track2V3GeminiCropJudgeEnabled: true,
        geminiCropJudgeTimeoutMs: 1000,
        geminiCropJudgeMaxAttempts: 5,
        geminiCropJudgeRetryBaseDelayMs: 700,
        geminiCropJudgeRetryMaxDelayMs: 700,
      },
      env: {},
      deps: {
        now: () => fakeNow,
        sleep: async (ms) => { fakeNow += ms },
        random: () => 0,
        geminiCropJudgeInteract: async () => {
          calls += 1
          const error = new Error('GEMINI_CROP_JUDGE_HTTP_429')
          error.diagnostics = { httpStatus: 429 }
          throw error
        },
      },
    })

    assert.equal(calls, 2)
    assert.equal(result.status, 'ERROR')
    assert.equal(result.geminiCropJudgeTotalAttemptCount, 2)
    assert.equal(result.geminiCropJudgeRateLimitCount, 2)
    assert.equal(result.geminiCropJudgeRetryCount, 1)
  })

  it('opens a circuit breaker after terminal quota exhaustion and skips remaining pages', async () => {
    const directory = await tempDir()
    const imagePath = await testCrop(directory, 'quota-circuit', { r: 55, g: 65, b: 75 })
    let calls = 0
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: cropList(48 * 5, imagePath),
      outputDir: directory,
      config: {
        track2V3GeminiCropJudgeEnabled: true,
        geminiCropJudgeMaxPages: 5,
        geminiCropJudgeMaxAttempts: 1,
      },
      env: {},
      deps: {
        geminiCropJudgeInteract: async () => {
          calls += 1
          const error = new Error('GEMINI_CROP_JUDGE_HTTP_429')
          error.diagnostics = {
            httpStatus: 429,
            googleErrorMessage: 'You exceeded your current quota for free_tier_requests',
          }
          throw error
        },
      },
    })

    assert.equal(calls, 1)
    assert.equal(result.status, 'ERROR')
    assert.equal(result.geminiCropJudgeCircuitBreakerTripped, true)
    assert.equal(result.geminiCropJudgeCircuitBreakerReason, 'GEMINI_QUOTA_EXHAUSTED')
    assert.equal(result.geminiCropJudgeSkippedPageCount, 4)
    assert.equal(result.pageResults.length, 1)
  })

  it('does not blindly retry authentication or client failures', async () => {
    const directory = await tempDir()
    const imagePath = await testCrop(directory, 'auth-failure', { r: 60, g: 70, b: 80 })
    let calls = 0
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: [{ cropId: 'crop-001', path: imagePath }],
      outputDir: directory,
      config: {
        track2V3GeminiCropJudgeEnabled: true,
        geminiCropJudgeMaxAttempts: 5,
      },
      env: {},
      deps: {
        geminiCropJudgeInteract: async () => {
          calls += 1
          const error = new Error('GEMINI_CROP_JUDGE_HTTP_401')
          error.diagnostics = { httpStatus: 401 }
          throw error
        },
      },
    })

    assert.equal(calls, 1)
    assert.equal(result.geminiCropJudgeRetryCount, 0)
    assert.equal(
      result.errors[0].providerErrorClass,
      SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.PROVIDER_CLIENT_ERROR,
    )
  })

  it('retains successful page selections when four of six pages succeed', async () => {
    const directory = await tempDir()
    const imagePath = await testCrop(directory, 'partial-pages', { r: 70, g: 80, b: 90 })
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: cropList(48 * 6, imagePath),
      outputDir: directory,
      config: {
        track2V3GeminiCropJudgeEnabled: true,
        geminiCropJudgeMaxPages: 6,
        geminiCropJudgeMaxSelectedCrops: 8,
        geminiCropJudgeMaxAttempts: 1,
      },
      env: {},
      deps: {
        geminiCropJudgeInteract: async ({ pageNumber, cropIds }) => {
          if (pageNumber >= 5) {
            const error = new Error('GEMINI_CROP_JUDGE_HTTP_400')
            error.diagnostics = { httpStatus: 400 }
            throw error
          }
          return { selectedCropIds: [cropIds[0]] }
        },
      },
    })

    assert.equal(
      result.geminiCropJudgeAggregateStatus,
      SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_AGGREGATE_STATUSES.PARTIAL_PAGE_SUCCESS,
    )
    assert.equal(result.geminiCropJudgeSuccessfulPageCount, 4)
    assert.equal(result.geminiCropJudgeFailedPageCount, 2)
    assert.equal(result.geminiCropJudgePartialSuccess, true)
    assert.equal(result.selectedCropIds.length, 4)
    assert.equal(result.pageResults.filter((page) => page.status === 'ERROR').length, 2)
  })

  it('classifies all failed pages as a complete provider failure', async () => {
    const directory = await tempDir()
    const imagePath = await testCrop(directory, 'all-fail', { r: 80, g: 90, b: 100 })
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: [{ cropId: 'crop-001', path: imagePath }],
      outputDir: directory,
      config: {
        track2V3GeminiCropJudgeEnabled: true,
        geminiCropJudgeMaxAttempts: 1,
      },
      env: {},
      deps: {
        geminiCropJudgeInteract: async () => {
          const error = new Error('GEMINI_CROP_JUDGE_HTTP_500')
          error.diagnostics = { httpStatus: 500 }
          throw error
        },
      },
    })

    assert.equal(
      result.geminiCropJudgeAggregateStatus,
      SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_AGGREGATE_STATUSES.COMPLETE_PROVIDER_FAILURE,
    )
    assert.equal(result.status, 'ERROR')
    assert.equal(result.geminiCropJudgeServerErrorCount, 1)
  })

  it('does not turn five no-address responses plus one failed page into negative visual evidence', async () => {
    const directory = await tempDir()
    const imagePath = await testCrop(directory, 'partial-no-address', { r: 90, g: 100, b: 110 })
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: cropList(48 * 6, imagePath),
      outputDir: directory,
      config: {
        track2V3GeminiCropJudgeEnabled: true,
        geminiCropJudgeMaxPages: 6,
        geminiCropJudgeMaxAttempts: 1,
      },
      env: {},
      deps: {
        geminiCropJudgeInteract: async ({ pageNumber }) => {
          if (pageNumber === 6) {
            const error = new Error('GEMINI_CROP_JUDGE_HTTP_500')
            error.diagnostics = { httpStatus: 500 }
            throw error
          }
          return { selectedCropIds: [] }
        },
      },
    })

    assert.equal(
      result.geminiCropJudgeAggregateStatus,
      SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_AGGREGATE_STATUSES.PARTIAL_PAGE_SUCCESS,
    )
    assert.notEqual(
      result.geminiCropJudgeAggregateStatus,
      SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_AGGREGATE_STATUSES.NO_LIKELY_ADDRESS_CROP,
    )
    assert.equal(result.reason, 'GEMINI_CROP_JUDGE_PARTIAL_PAGE_SUCCESS')
  })

  it('uses no-likely-address only when every requested page succeeds with no selected crop', async () => {
    const directory = await tempDir()
    const imagePath = await testCrop(directory, 'no-address-complete', { r: 100, g: 110, b: 120 })
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: cropList(49, imagePath),
      outputDir: directory,
      config: {
        track2V3GeminiCropJudgeEnabled: true,
        geminiCropJudgeMaxAttempts: 1,
      },
      env: {},
      deps: {
        geminiCropJudgeInteract: async () => ({ selectedCropIds: [] }),
      },
    })

    assert.equal(
      result.geminiCropJudgeAggregateStatus,
      SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_AGGREGATE_STATUSES.NO_LIKELY_ADDRESS_CROP,
    )
    assert.equal(result.geminiCropJudgeSuccessfulPageCount, 2)
    assert.equal(result.geminiCropJudgeFailedPageCount, 0)
    assert.deepEqual(result.selectedCropIds, [])
  })

  it('treats a successful provider response with the wrong schema as non-retryable', async () => {
    const directory = await tempDir()
    const imagePath = await testCrop(directory, 'schema-invalid', { r: 110, g: 120, b: 130 })
    let calls = 0
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: [{ cropId: 'crop-001', path: imagePath }],
      outputDir: directory,
      config: {
        track2V3GeminiCropJudgeEnabled: true,
        geminiCropJudgeMaxAttempts: 4,
      },
      env: {},
      deps: {
        geminiCropJudgeInteract: async () => {
          calls += 1
          return { output_text: '{"address":"123 Fake Street"}' }
        },
      },
    })

    assert.equal(calls, 1)
    assert.equal(result.geminiCropJudgeRetryCount, 0)
    assert.equal(
      result.errors[0].providerErrorClass,
      SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES.RESPONSE_SCHEMA_INVALID,
    )
    assert.deepEqual(result.selectedCropIds, [])
  })

  it('reports queue and concurrency diagnostics without creating direct candidates or address evidence', async () => {
    const directory = await tempDir()
    const imagePath = await testCrop(directory, 'queue-diagnostics', { r: 120, g: 130, b: 140 })
    const result = await runShortsTrack2V3GeminiCropJudge({
      allCrops: cropList(49, imagePath),
      outputDir: directory,
      config: {
        track2V3GeminiCropJudgeEnabled: true,
        geminiCropJudgeMaxConcurrency: 1,
        geminiCropJudgeMaxAttempts: 1,
      },
      env: {},
      deps: {
        geminiCropJudgeInteract: async ({ cropIds }) => ({ selectedCropIds: [cropIds[0]] }),
      },
    })

    assert.equal(result.geminiCropJudgeRequestedPageCount, 2)
    assert.equal(result.geminiCropJudgeTotalAttemptCount, 2)
    assert.equal(result.geminiCropJudgeMaxObservedConcurrency <= 1, true)
    assert.equal(result.geminiCropJudgeQueueWaitMs >= 0, true)
    assert.equal(result.geminiCropJudgeProviderRuntimeMs >= 0, true)
    assert.equal(Object.hasOwn(result, 'candidates'), false)
    assert.equal(Object.hasOwn(result, 'addressEvidence'), false)
  })

})
