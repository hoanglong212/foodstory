import 'dotenv/config'
import { extractYouTubeFrames } from '../services/visionAuto/youtubeFrameExtractionService.js'

const url = String(process.argv[2] || '').trim()
if (!url) {
  console.error('Usage: node scripts/diagnoseFrameExtractionDirect.js <youtube_url>')
  process.exitCode = 1
} else {
  const result = await extractYouTubeFrames({
    url,
    maxFrames: 8,
    maxDurationSeconds: 60,
    timeoutMs: 30_000,
  })
  console.log(
    JSON.stringify(
      {
        status: result.status,
        videoId: result.videoId,
        metadataDurationSeconds: result.metadataDurationSeconds,
        durationSeconds: result.durationSeconds,
        durationSource: result.durationSource,
        frameScanSkippedReason: result.frameScanSkippedReason,
        frameCount: result.frames.length,
        warnings: result.warnings,
        binaries: result.binaries,
      },
      null,
      2,
    ),
  )
}
