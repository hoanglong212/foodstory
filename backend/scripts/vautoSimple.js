import { analyzeYoutubeFoodMapSimple } from '../services/visionAuto/youtubeFrameMapSimpleService.js'

const url = process.argv[2]

if (!url) {
  console.error('Usage: npm run vauto:simple -- "https://www.youtube.com/shorts/..."')
  process.exit(1)
}

const result = await analyzeYoutubeFoodMapSimple({ url })

console.log(JSON.stringify({
  status: result.status,
  confidence: result.confidence,
  reason: result.reason,
  address: result.address,
  phones: result.phones,
  draft: result.draft,
  map: result.map,
  searchQueries: result.searchQueries,
  evidence: result.evidence,
  warnings: result.warnings,
  steps: result.steps,
  debug: result.debug,
}, null, 2))
