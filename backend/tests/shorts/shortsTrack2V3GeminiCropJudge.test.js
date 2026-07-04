import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import {
  SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_ENDPOINT,
  parseShortsTrack2V3GeminiCropJudgeResponse,
  runShortsTrack2V3GeminiCropJudge,
  validateShortsTrack2V3GeminiCropIds,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3GeminiCropJudgeService.js'

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

function jsonResponse(status, value) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(value),
  }
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
    }))

    assert.deepEqual(parsed.selectedCropIds, ['crop-003', 'crop-005'])
    assert.equal(Object.hasOwn(parsed, 'candidateAddress'), false)
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
      config: { track2V3GeminiCropJudgeEnabled: true },
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
})
