import '../config/env.js'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'

import { track2V3TesseractCommandCandidates } from '../src/services/shorts/track2-v3/shortsTrack2V3BinaryResolverService.js'

function check(label, command, args) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { windowsHide: true, timeout: 10000 },
      (error, stdout, stderr) => {
        resolve({
          command: label,
          configuredPath: command,
          args,
          ok: !error,
          error: error?.message || null,
          stdout: String(stdout || '').slice(0, 300),
          stderr: String(stderr || '').slice(0, 300),
        })
      },
    )
  })
}

function firstExisting(candidates = []) {
  return candidates.find((candidate) => candidate && existsSync(candidate)) || null
}

const ytDlpBin = process.env.TRACK2_YTDLP_BIN || process.env.YOUTUBE_YT_DLP_PATH || 'yt-dlp'
const ffmpegBin = process.env.TRACK2_FFMPEG_BIN || process.env.YOUTUBE_FFMPEG_PATH || 'ffmpeg'
const ffprobeBin = process.env.TRACK2_FFPROBE_BIN || process.env.YOUTUBE_FFPROBE_PATH || 'ffprobe'
const tesseractBin = firstExisting(
  track2V3TesseractCommandCandidates({ env: process.env }),
) || 'tesseract'

console.log('cwd:', process.cwd())
console.log('PATH:', process.env.PATH)

console.log(await check('yt-dlp', ytDlpBin, ['--version']))
console.log(await check('ffmpeg', ffmpegBin, ['-version']))
console.log(await check('ffprobe', ffprobeBin, ['-version']))
console.log(await check('tesseract', tesseractBin, ['--version']))
