import { execFile } from 'node:child_process'

function check(command, args) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { windowsHide: true, timeout: 10000 },
      (error, stdout, stderr) => {
        resolve({
          command,
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

console.log('cwd:', process.cwd())
console.log('PATH:', process.env.PATH)

console.log(await check('yt-dlp', ['--version']))
console.log(await check('ffmpeg', ['-version']))
console.log(await check('ffprobe', ['-version']))
