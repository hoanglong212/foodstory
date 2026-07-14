import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { terminateVisionAutoProcessTree } from './visionAutoProcessTreeService.js'

const workerPath = fileURLToPath(new URL('../../workers/visionAutoWorker.js', import.meta.url))
const ALLOWED_TYPES = new Set(['ready', 'heartbeat', 'stage', 'result', 'failed'])

export function startVisionAutoWorker({
  jobId,
  sourceUrl,
  deadlineAt,
  maxDurationSec = null,
  fastMetadataEnabled = false,
  onMessage,
  onExit,
  forkImpl = fork,
  parentEnv = process.env,
} = {}) {
  const child = forkImpl(workerPath, [], {
    silent: true,
    windowsHide: true,
    // Do not inherit parent-only CLI flags such as --input-type or --test;
    // they are invalid when Node starts the worker from a file path.
    execArgv: [],
    env: {
      ...parentEnv,
      NODE_ENV: parentEnv.NODE_ENV || 'production',
    },
  })
  // Silent child streams must still be drained or verbose provider output can
  // fill the pipe and stall a long-running OCR job.
  child.stdout?.resume?.()
  child.stderr?.resume?.()
  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    await terminateVisionAutoProcessTree(child.pid)
  }
  child.on('message', (message) => {
    if (!message || !ALLOWED_TYPES.has(message.type) || String(message.jobId) !== String(jobId)) return
    onMessage?.(message)
  })
  child.once('exit', (code, signal) => onExit?.({ code, signal }))
  child.once('disconnect', () => undefined)
  child.send({
    type: 'start',
    jobId,
    sourceUrl,
    canonicalUrl: sourceUrl,
    deadlineAt,
    maxDurationSec,
    fastMetadataEnabled: fastMetadataEnabled === true,
    analysisMode: fastMetadataEnabled ? 'url_fast_then_deep' : 'url_deep_canonical',
    sanitizedConfig: {},
  })
  return {
    pid: child.pid,
    cancel: async () => {
      try { child.send({ type: 'cancel', jobId }) } catch {}
      await close()
    },
    terminate: close,
  }
}
