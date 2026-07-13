import { spawn } from 'node:child_process'

function validPid(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) < 2 ** 31
}

/** Terminates an owned worker tree without interpolating a shell command. */
export function terminateVisionAutoProcessTree(pid, { timeoutMs = 4_000, spawnImpl = spawn } = {}) {
  if (!validPid(pid)) return Promise.resolve({ attempted: false, killed: false, reason: 'invalid_pid' })
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value) } }
    const timer = setTimeout(() => finish({ attempted: true, killed: false, reason: 'timeout' }), Math.max(250, timeoutMs))
    const command = process.platform === 'win32' ? 'taskkill' : 'kill'
    const args = process.platform === 'win32' ? ['/PID', String(pid), '/T', '/F'] : ['-TERM', String(pid)]
    let child
    try { child = spawnImpl(command, args, { shell: false, windowsHide: true, stdio: 'ignore' }) } catch { finish({ attempted: true, killed: false, reason: 'spawn_failed' }); return }
    child.once('error', () => finish({ attempted: true, killed: false, reason: 'spawn_failed' }))
    child.once('close', (code) => finish({ attempted: true, killed: Number(code) === 0 || Number(code) === 128, exitCode: Number.isFinite(Number(code)) ? Number(code) : null }))
  })
}

export { validPid as isValidVisionAutoProcessPid }
