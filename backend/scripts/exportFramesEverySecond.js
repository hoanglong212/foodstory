import { execFile } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        windowsHide: true,
        timeout: options.timeoutMs || 120_000,
        maxBuffer: 20 * 1024 * 1024,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout
          error.stderr = stderr
          reject(error)
          return
        }

        resolve({ stdout, stderr })
      },
    )
  })
}

function safeName(value) {
  return String(value || 'youtube-debug')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 80)
}

function videoIdFromUrl(url) {
  const text = String(url || '')
  const shorts = text.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/)
  if (shorts) return shorts[1]

  const watch = text.match(/[?&]v=([A-Za-z0-9_-]{11})/)
  if (watch) return watch[1]

  const shortUrl = text.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)
  if (shortUrl) return shortUrl[1]

  return 'youtube-debug'
}

async function main() {
  const url = process.argv[2]
  const label = safeName(process.argv[3] || videoIdFromUrl(url))

  if (!url) {
    console.error('Usage: node scripts/exportFramesEverySecond.js <youtube_url> [label]')
    process.exit(1)
  }

  const outputDir = path.resolve('tmp', 'debug-frames-1fps', label)
  const tempDir = path.join(os.tmpdir(), `foodstory-frame-debug-${Date.now()}`)
  const videoPath = path.join(tempDir, 'source.mp4')

  await mkdir(outputDir, { recursive: true })
  await mkdir(tempDir, { recursive: true })

  console.log('Output folder:')
  console.log(outputDir)
  console.log('')

  try {
    console.log('Downloading video with yt-dlp...')

    await runCommand(
      process.env.YOUTUBE_YT_DLP_PATH || 'yt-dlp',
      [
        '--no-playlist',
        '--max-filesize',
        '80M',
        '-f',
        'bv*[height<=720][ext=mp4]/bv*[height<=720]/best[height<=720]/best',
        '-o',
        videoPath,
        url,
      ],
      { timeoutMs: 120_000 },
    )

    console.log('Exporting 1 frame per second with ffmpeg...')

    await runCommand(
      process.env.YOUTUBE_FFMPEG_PATH || 'ffmpeg',
      [
        '-y',
        '-i',
        videoPath,
        '-t',
        '60',
        '-vf',
        'fps=1',
        '-start_number',
        '0',
        '-q:v',
        '2',
        path.join(outputDir, 'frame-%03d.jpg'),
      ],
      { timeoutMs: 120_000 },
    )

    console.log('')
    console.log('Done.')
    console.log(`Open this folder: ${outputDir}`)
    console.log('')
    console.log('Note:')
    console.log('frame-000.jpg ≈ 0s')
    console.log('frame-001.jpg ≈ 1s')
    console.log('frame-053.jpg ≈ 53s')
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error('Export failed:')
  console.error(error.message)

  if (error.stderr) {
    console.error('')
    console.error('stderr:')
    console.error(String(error.stderr).slice(0, 4000))
  }

  process.exit(1)
})
