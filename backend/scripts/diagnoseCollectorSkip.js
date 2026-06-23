import 'dotenv/config'
import { collectVisionEvidence } from '../services/visionAuto/visionEvidenceCollectorService.js'
import { getVisionAutoConfig } from '../services/visionAuto/visionAutoConfig.js'

const url = String(process.argv[2] || '').trim()
if (!url) {
  console.error('Usage: node scripts/diagnoseCollectorSkip.js <youtube_url>')
  process.exitCode = 1
} else {
  const config = { ...getVisionAutoConfig(), enabled: true }
  const result = await collectVisionEvidence({
    input: { type: 'youtube_url', url, platform: 'youtube' },
    config,
  })
  console.log(
    JSON.stringify(
      {
        debug: result.debug,
        warnings: result.warnings,
        metadata: result.metadata,
        thumbnailOcrEvidence: result.thumbnailOcrEvidence,
      },
      null,
      2,
    ),
  )
}
