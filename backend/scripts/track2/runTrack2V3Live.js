import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { runShortsTrack2V3Pipeline } from '../../src/services/shorts/track2-v3/shortsTrack2V3PipelineService.js'

const envPath = fileURLToPath(new URL('../../.env', import.meta.url))
dotenv.config({ path: envPath })

const url = process.argv[2]

if (!url) {
  console.error('Usage: node scripts/track2/runTrack2V3Live.js <youtube-shorts-url>')
  process.exitCode = 1
} else {
  const result = await runShortsTrack2V3Pipeline({ url, sourceUrl: url })
  console.log(JSON.stringify(result, null, 2))
}
