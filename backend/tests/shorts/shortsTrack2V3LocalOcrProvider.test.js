import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { runShortsTrack2V3LocalOcrProvider } from '../../src/services/shorts/track2-v3/shortsTrack2V3LocalOcrProviderService.js'

const backendRoot = fileURLToPath(new URL('../../', import.meta.url))

function runSerializationFixture(fixtureName, providerName) {
  const fixturePath = path.join(
    backendRoot,
    'tests',
    'shorts',
    'fixtures',
    fixtureName,
  )
  const candidates = process.platform === 'win32'
    ? [
        {
          command: path.resolve(backendRoot, '..', '.venv', 'Scripts', 'python.exe'),
          args: [fixturePath],
        },
        { command: 'python', args: [fixturePath] },
        { command: 'py', args: ['-3', fixturePath] },
      ]
    : [
        { command: 'python3', args: [fixturePath] },
        { command: 'python', args: [fixturePath] },
      ]
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, candidate.args, {
      cwd: backendRoot,
      encoding: 'utf8',
      windowsHide: true,
    })
    if (result.error?.code === 'ENOENT') continue
    return result
  }
  assert.fail(`A Python runtime is required for the ${providerName} serialization contract test.`)
}

describe('Track 2 V3 local OCR provider', () => {
  it('serializes nested numpy-like EasyOCR values as strict JSON', () => {
    const run = runSerializationFixture(
      'runEasyOcrSerializationFixture.py',
      'EasyOCR',
    )

    assert.equal(run.status, 0, run.stderr || run.error?.message)
    const payload = JSON.parse(run.stdout)
    assert.equal(payload.status, 'OK')
    assert.equal(payload.results[0].source, 'local_easyocr')
    assert.equal(payload.results[0].confidence, 0.875)
    assert.deepEqual(payload.results[0].bbox, [
      [10, 20],
      [110, 20],
      [110, 50],
      [10, 50],
    ])
    assert.doesNotMatch(run.stdout, /np\.(?:int|float)|NumpyLike/u)
  })

  it('serializes nested numpy-like PaddleOCR values as strict JSON', () => {
    const run = runSerializationFixture(
      'runPaddleOcrSerializationFixture.py',
      'PaddleOCR',
    )

    assert.equal(run.status, 0, run.stderr || run.error?.message)
    const payload = JSON.parse(run.stdout)
    assert.equal(payload.status, 'OK')
    assert.equal(payload.results[0].source, 'local_paddleocr')
    assert.equal(payload.results[0].confidence, 0.875)
    assert.deepEqual(payload.results[0].bbox, [
      [10, 20],
      [110, 20],
      [110, 50],
      [10, 50],
    ])
    assert.doesNotMatch(run.stdout, /np\.(?:int|float)|NumpyLike|NaN|Infinity/u)
  })

  it('returns PaddleOCR unavailable safely when its package or models are missing', async () => {
    const result = await runShortsTrack2V3LocalOcrProvider({
      selectedImages: [{ cropPath: 'C:\\offline\\paddle-crop.jpg' }],
      config: {
        track2V3LocalOcrEnabled: true,
        track2V3LocalOcrProvider: 'paddleocr',
        track2V3PaddleOcrEnabled: true,
      },
      deps: {
        paddleOcrCommands: [{ command: 'mock-python', prefixArgs: [] }],
        commandRunner: async ({ args }) => args.includes('--probe')
          ? { ok: true, stdout: JSON.stringify({ status: 'OK' }) }
          : {
              ok: true,
              stdout: JSON.stringify({
                status: 'UNAVAILABLE',
                reason: 'PADDLEOCR_MODEL_UNAVAILABLE',
              }),
            },
      },
    })

    assert.equal(result.status, 'UNAVAILABLE')
    assert.equal(result.provider, null)
    assert.deepEqual(result.textBlocks, [])
    assert.ok(result.providerErrors.some((error) =>
      error.code === 'LOCAL_PADDLEOCR_UNAVAILABLE'
    ))
  })

  it('returns provider unavailable safely when EasyOCR and Tesseract are missing', async () => {
    const secret = 'local-ocr-secret-must-not-leak'
    let commandCalls = 0

    const result = await runShortsTrack2V3LocalOcrProvider({
      selectedImages: [
        {
          cropPath: 'C:\\offline\\selected-crop.jpg',
          timestampSeconds: 12,
          variant: 'upper_middle_crop_raw',
        },
      ],
      config: {
        track2V3LocalOcrEnabled: true,
        track2V3LocalOcrProvider: 'auto',
        track2V3EasyOcrEnabled: true,
        track2V3TesseractEnabled: true,
        localOcrTimeoutMs: 5000,
        maxLocalOcrImages: 24,
        localOcrLanguages: 'vi,en',
      },
      deps: {
        commandRunner: async () => {
          commandCalls += 1
          throw new Error(secret)
        },
      },
    })

    assert.ok(commandCalls >= 2)
    assert.equal(result.status, 'UNAVAILABLE')
    assert.equal(result.reason, 'LOCAL_OCR_PROVIDER_UNAVAILABLE')
    assert.equal(result.called, true)
    assert.equal(result.provider, null)
    assert.deepEqual(result.textBlocks, [])
    assert.ok(result.providerErrors.some((error) =>
      error.code === 'LOCAL_OCR_PROVIDER_UNAVAILABLE'
    ))
    assert.doesNotMatch(JSON.stringify(result), new RegExp(secret, 'u'))
  })

  it('does not probe local binaries when local OCR is disabled', async () => {
    let commandCalls = 0
    const result = await runShortsTrack2V3LocalOcrProvider({
      selectedImages: [{ cropPath: 'C:\\offline\\selected-crop.jpg' }],
      config: { track2V3LocalOcrEnabled: false },
      deps: {
        commandRunner: async () => {
          commandCalls += 1
          return { ok: false }
        },
      },
    })

    assert.equal(result.status, 'DISABLED')
    assert.equal(result.called, false)
    assert.equal(commandCalls, 0)
  })

  it('normalizes mocked EasyOCR output without requiring the library', async () => {
    const result = await runShortsTrack2V3LocalOcrProvider({
      selectedImages: [
        {
          cropPath: 'C:\\offline\\easyocr-crop.jpg',
          timestampSeconds: 19.125,
          variant: 'upper_middle_crop_raw',
          preprocessingVariant: 'original',
        },
      ],
      config: {
        track2V3LocalOcrEnabled: true,
        track2V3LocalOcrProvider: 'easyocr',
        localOcrLanguages: 'vi,en',
      },
      deps: {
        easyOcrCommands: [{ command: 'mock-python', prefixArgs: [] }],
        commandRunner: async ({ args }) => {
          if (args.includes('--probe')) {
            return { ok: true, stdout: JSON.stringify({ status: 'OK' }) }
          }
          return {
            ok: true,
            stdout: JSON.stringify({
              status: 'OK',
              results: [{
                source: 'local_easyocr',
                rawText: 'Xe xôi đêm',
                confidence: 0.7,
                bbox: [[10, 20], [110, 20], [110, 50], [10, 50]],
                imagePath: 'C:\\offline\\easyocr-crop.jpg',
                timestampSeconds: 19.125,
                cropVariant: 'upper_middle_crop_raw',
                preprocessingVariant: 'original',
              }],
            }),
          }
        },
      },
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.provider, 'local_easyocr')
    assert.equal(result.textBlocks[0].source, 'local_easyocr')
    assert.equal(result.textBlocks[0].rawText, 'Xe xôi đêm')
    assert.deepEqual(result.textBlocks[0].bbox, [[10, 20], [110, 20], [110, 50], [10, 50]])
    assert.equal(result.textBlocks[0].timestampSeconds, 19.125)
    assert.equal(result.textBlocks[0].cropVariant, 'upper_middle_crop_raw')
    assert.equal(result.textBlocks[0].preprocessingVariant, 'original')
    assert.equal(result.textBlocks[0].forceReviewOnly, true)
    assert.equal(result.textBlocks[0].providerMetadata.lowConfidence, true)
    assert.ok(result.textBlocks[0].providerMetadata.qualityFlags.includes(
      'LOW_PROVIDER_CONFIDENCE'
    ))
  })

  it('normalizes mocked PaddleOCR output and preserves crop metadata', async () => {
    const result = await runShortsTrack2V3LocalOcrProvider({
      selectedImages: [{
        cropPath: 'C:\\offline\\paddle-crop.jpg',
        timestampSeconds: 19.125,
        variant: 'upper_middle_crop_raw',
        preprocessingVariant: 'original',
      }],
      config: {
        track2V3LocalOcrEnabled: true,
        track2V3LocalOcrProvider: 'paddleocr',
        track2V3PaddleOcrEnabled: true,
      },
      deps: {
        paddleOcrCommands: [{ command: 'mock-python', prefixArgs: [] }],
        commandRunner: async ({ args }) => args.includes('--probe')
          ? { ok: true, stdout: JSON.stringify({ status: 'OK' }) }
          : {
              ok: true,
              stdout: JSON.stringify({
                status: 'OK',
                results: [{
                  source: 'local_paddleocr',
                  rawText: 'Xexöiđêm\n1143 3/2 PhuÖng 6 Quân 10\n18h30-00h30',
                  confidence: 0.71,
                  bbox: [[10, 20], [110, 20], [110, 50], [10, 50]],
                  imagePath: 'C:\\offline\\paddle-crop.jpg',
                  timestampSeconds: 19.125,
                  cropVariant: 'upper_middle_crop_raw',
                  preprocessingVariant: 'original',
                }],
              }),
            },
      },
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.provider, 'local_paddleocr')
    assert.equal(result.textBlocks[0].source, 'local_paddleocr')
    assert.equal(result.textBlocks[0].timestampSeconds, 19.125)
    assert.equal(result.textBlocks[0].cropVariant, 'upper_middle_crop_raw')
    assert.equal(result.textBlocks[0].preprocessingVariant, 'original')
    assert.equal(result.textBlocks[0].forceReviewOnly, true)
    assert.equal(result.textBlocks[0].providerMetadata.lowConfidence, true)
  })

  it('collects all available engines in ensemble mode with per-engine diagnostics', async () => {
    const tsv = [
      'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
      '5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t90\t1193',
      '5\t1\t1\t1\t1\t2\t12\t0\t10\t10\t85\t3/2',
      '5\t1\t1\t1\t1\t3\t24\t0\t10\t10\t85\tPhường',
      '5\t1\t1\t1\t1\t4\t36\t0\t10\t10\t85\t6',
    ].join('\n')
    const result = await runShortsTrack2V3LocalOcrProvider({
      selectedImages: [{ cropPath: 'C:\\offline\\ensemble-crop.jpg' }],
      config: {
        track2V3LocalOcrEnabled: true,
        track2V3LocalOcrProvider: 'ensemble',
        track2V3PaddleOcrEnabled: true,
        track2V3EasyOcrEnabled: true,
        track2V3TesseractEnabled: true,
        localOcrTimeoutMs: 5000,
      },
      deps: {
        paddleOcrCommands: [{ command: 'mock-paddle', prefixArgs: [] }],
        easyOcrCommands: [{ command: 'mock-easy', prefixArgs: [] }],
        tesseractCommands: ['mock-tesseract'],
        tesseractPreprocessor: async (image) => ({
          variants: [{ preprocessVariant: 'original', imagePath: image.imagePath }],
          providerErrors: [],
          cleanup: async () => {},
        }),
        commandRunner: async ({ command, args }) => {
          if (args.includes('--probe') || args[0] === '--version') {
            return { ok: true, stdout: args[0] === '--version' ? 'tesseract 5' : '{"status":"OK"}' }
          }
          if (command === 'mock-paddle') {
            return {
              ok: true,
              stdout: JSON.stringify({ status: 'OK', results: [{
                source: 'local_paddleocr',
                rawText: '1143 3/2 PhuÖng 6 Quân 10',
                confidence: 0.8,
              }] }),
            }
          }
          if (command === 'mock-easy') {
            return {
              ok: true,
              stdout: JSON.stringify({ status: 'OK', results: [{
                source: 'local_easyocr',
                rawText: '1143 3/2 Phường 6 Quận 10',
                confidence: 0.75,
              }] }),
            }
          }
          return { ok: true, stdout: tsv }
        },
      },
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.provider, 'local_ocr_ensemble')
    assert.deepEqual(new Set(result.textBlocks.map((block) => block.source)), new Set([
      'local_paddleocr',
      'local_easyocr',
      'local_tesseract',
    ]))
    assert.equal(result.engineRuns.local_paddleocr.imageCountSent, 1)
    assert.equal(result.engineRuns.local_easyocr.imageCountSent, 1)
    assert.equal(result.engineRuns.local_tesseract.imageCountSent, 1)
  })

  it('caps EasyOCR at the first six selected crops by default', async () => {
    let requestPayload = null
    const selectedImages = Array.from({ length: 8 }, (_, index) => ({
      cropPath: `C:\\offline\\selected-${index}.jpg`,
      timestampSeconds: index,
      variant: index % 2 ? 'upper_middle_crop_raw' : 'top_overlay_crop_raw',
    }))

    const result = await runShortsTrack2V3LocalOcrProvider({
      selectedImages,
      config: {
        track2V3LocalOcrEnabled: true,
        track2V3LocalOcrProvider: 'easyocr',
        maxLocalOcrImages: 8,
      },
      deps: {
        easyOcrCommands: [{ command: 'mock-python', prefixArgs: [] }],
        commandRunner: async ({ args, input }) => {
          if (args.includes('--probe')) {
            return { ok: true, stdout: JSON.stringify({ status: 'OK' }) }
          }
          requestPayload = JSON.parse(input)
          return {
            ok: true,
            stdout: JSON.stringify({
              status: 'OK',
              results: requestPayload.images.map(() => ({ rawText: '', confidence: 0 })),
            }),
          }
        },
      },
    })

    assert.equal(requestPayload.images.length, 6)
    assert.deepEqual(
      requestPayload.images.map((image) => image.imagePath),
      selectedImages.slice(0, 6).map((image) => image.cropPath),
    )
    assert.equal(result.imageCount, 6)
  })

  it('returns whitelisted EasyOCR failure details only when debug is enabled', async () => {
    const secret = 'must-not-leak-from-adapter-debug'
    const diagnostics = {
      pythonExecutable: 'C:\\Python312\\python.exe',
      easyocrImportOk: true,
      readerLoadedOk: true,
      imageCountReceived: 1,
      firstImagePathExists: true,
      exceptionClass: 'TypeError',
      exceptionMessage: 'Object is not JSON serializable',
      exitCode: 0,
      ignoredSecret: secret,
    }
    const runProvider = (debugEnabled) => runShortsTrack2V3LocalOcrProvider({
      selectedImages: [{ cropPath: 'C:\\offline\\selected-crop.jpg' }],
      config: {
        track2V3LocalOcrEnabled: true,
        track2V3LocalOcrProvider: 'easyocr',
        localOcrDebugEnabled: debugEnabled,
      },
      deps: {
        easyOcrCommands: [{ command: 'mock-python', prefixArgs: [] }],
        commandRunner: async ({ args }) => args.includes('--probe')
          ? { ok: true, stdout: JSON.stringify({ status: 'OK' }) }
          : {
              ok: true,
              exitCode: 0,
              stdout: JSON.stringify({
                status: 'ERROR',
                reason: 'EASYOCR_EXECUTION_FAILED',
                diagnostics,
              }),
            },
      },
    })

    const debugResult = await runProvider(true)
    const debugError = debugResult.providerErrors.find((error) =>
      error.code === 'LOCAL_EASYOCR_ERROR'
    )
    assert.ok(debugError)
    assert.deepEqual(debugError.details, {
      pythonExecutable: 'C:\\Python312\\python.exe',
      easyocrImportOk: true,
      readerLoadedOk: true,
      imageCountReceived: 1,
      firstImagePathExists: true,
      exceptionClass: 'TypeError',
      exceptionMessage: 'Object is not JSON serializable',
      exitCode: 0,
    })
    assert.doesNotMatch(JSON.stringify(debugResult), new RegExp(secret, 'u'))

    const nonDebugResult = await runProvider(false)
    const nonDebugError = nonDebugResult.providerErrors.find((error) =>
      error.code === 'LOCAL_EASYOCR_ERROR'
    )
    assert.ok(nonDebugError)
    assert.equal('details' in nonDebugError, false)
  })

  it('falls back to mocked Tesseract CLI when EasyOCR is unavailable', async () => {
    const tsv = [
      'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
      '5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t90\t1433/2',
      '5\t1\t1\t1\t1\t2\t12\t0\t10\t10\t80\tPhường',
      '5\t1\t1\t1\t1\t3\t24\t0\t10\t10\t85\t6',
    ].join('\n')
    const result = await runShortsTrack2V3LocalOcrProvider({
      selectedImages: [{ cropPath: 'C:\\offline\\tesseract-crop.jpg' }],
      config: {
        track2V3LocalOcrEnabled: true,
        track2V3LocalOcrProvider: 'auto',
        localOcrLanguages: 'vi,en',
      },
      deps: {
        easyOcrCommands: [{ command: 'missing-python', prefixArgs: [] }],
        commandRunner: async ({ command, args }) => {
          if (command === 'missing-python') return { ok: false, stdout: '' }
          if (command === 'tesseract' && args[0] === '--version') {
            return { ok: true, stdout: 'tesseract 5' }
          }
          return { ok: true, stdout: tsv }
        },
      },
    })

    assert.equal(result.status, 'OK')
    assert.equal(result.provider, 'local_tesseract')
    assert.equal(result.textBlocks[0].source, 'local_tesseract')
    assert.equal(result.textBlocks[0].rawText, '1433/2 Phường 6')
    assert.equal(result.textBlocks[0].providerMetadata.adapter, 'tesseract_cli_multi_psm')
  })
})
