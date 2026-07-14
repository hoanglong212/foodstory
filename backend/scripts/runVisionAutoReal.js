import 'dotenv/config'
import { analyzeVisionAutoV2 } from '../services/visionAuto/visionAutoResolverService.js'

const url = process.argv[2]

if (!url) {
  console.error('Usage: node scripts/runVisionAutoReal.js <youtube_url>')
  process.exit(1)
}

const startedAt = Date.now()

try {
  const result = await analyzeVisionAutoV2({ url })

  console.log('===== VISION AUTO REAL TEST =====')
  console.log('URL:', url)
  console.log('Duration:', `${Date.now() - startedAt}ms`)
  console.log('')

  console.log('===== RESULT =====')
  console.dir(
    {
      status: result.status,
      confidence: result.confidence,
      reason: result.reason,
      warnings: result.warnings,
      steps: result.steps,
      bestResult: result.bestResult,
      addPlaceDraft: result.addPlaceDraft,
      entities: result.entities,
      debug: result.debug,
    },
    { depth: 30 },
  )
} catch (error) {
  console.error('REAL TEST FAILED')
  console.error(error)
  process.exit(1)
}
