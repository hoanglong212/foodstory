import 'dotenv/config'

import { getVisionAutoConfig } from '../services/visionAuto/visionAutoConfig.js'
import { resolveVisionAutoInput } from '../services/visionAuto/visionAutoResolverService.js'
import { collectVisionEvidence } from '../services/visionAuto/visionEvidenceCollectorService.js'

const url = process.argv[2]

if (!url) {
  console.error('Usage: node scripts/debugVisionCollectionReal.js <youtube_url>')
  process.exit(1)
}

const config = getVisionAutoConfig()
const input = resolveVisionAutoInput({ url })

console.log('===== CONFIG =====')
console.dir(
  {
    enabled: config.enabled,
    debugLevel: config.debugLevel,
    metadataOcrEnabled: config.metadataOcrEnabled,
    frameScanEnabled: config.frameScanEnabled,
    frameScanMode: config.frameScanMode,
    frameScanDebugTimestamps: config.frameScanDebugTimestamps,
    frameScanMaxFrames: config.frameScanMaxFrames,
    frameScanTimeoutMs: config.frameScanTimeoutMs,
    frameDownloadTimeoutMs: config.frameDownloadTimeoutMs,
    frameScanMaxDurationSeconds: config.frameScanMaxDurationSeconds,
    frameOcrCropEnabled: config.frameOcrCropEnabled,
    frameOcrMaxCropsPerFrame: config.frameOcrMaxCropsPerFrame,
    ocrProvider: config.ocrProvider,
    locationProvider: config.locationProvider,
  },
  { depth: 10 },
)

console.log('')
console.log('===== INPUT =====')
console.dir(input, { depth: 10 })

const startedAt = Date.now()
const collection = await collectVisionEvidence({ input, config })

console.log('')
console.log('===== COLLECTION DEBUG =====')
console.log('Duration:', `${Date.now() - startedAt}ms`)
console.dir(collection.debug, { depth: 30 })

console.log('')
console.log('===== WARNINGS =====')
console.dir(collection.warnings, { depth: 20 })

console.log('')
console.log('===== METADATA =====')
console.dir(collection.metadata, { depth: 20 })

console.log('')
console.log('===== THUMBNAIL OCR =====')
console.dir(
  collection.thumbnailOcrEvidence
    ? {
        usable: collection.thumbnailOcrEvidence.usable,
        text: collection.thumbnailOcrEvidence.text,
        lines: collection.thumbnailOcrEvidence.lines,
        rawText: collection.thumbnailOcrEvidence.debug?.rawText,
      }
    : null,
  { depth: 20 },
)

console.log('')
console.log('===== FRAME TEXTS =====')
console.dir(collection.frameTexts, { depth: 20 })

console.log('')
console.log('===== FRAME OCR EVIDENCE =====')
console.dir(
  (collection.frameOcrEvidence || []).map((frame) => ({
    timestampSeconds: frame.timestampSeconds,
    confidence: frame.confidence,
    sourceCrop: frame.sourceCrop,
    text: frame.text,
    lines: frame.lines,
    warnings: frame.warnings,
  })),
  { depth: 30 },
)
