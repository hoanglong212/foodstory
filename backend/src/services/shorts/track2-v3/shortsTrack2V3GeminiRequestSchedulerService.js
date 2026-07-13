function boundedInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

class ShortsTrack2V3GeminiGlobalRequestGate {
  constructor() {
    this.activeCount = 0
    this.queue = []
    this.maxObservedConcurrency = 0
  }

  schedule(task, { maxConcurrency = 1, now = Date.now, onStart = null } = {}) {
    if (typeof task !== 'function') throw new TypeError('Gemini scheduler task must be a function')
    const concurrency = boundedInteger(maxConcurrency, 1, { min: 1, max: 16 })
    const enqueuedAt = now()

    return new Promise((resolve, reject) => {
      this.queue.push({
        task,
        maxConcurrency: concurrency,
        now,
        onStart,
        enqueuedAt,
        resolve,
        reject,
      })
      this.#drain()
    })
  }

  #drain() {
    while (this.queue.length) {
      const next = this.queue[0]
      if (this.activeCount >= next.maxConcurrency) return
      this.queue.shift()
      this.activeCount += 1
      this.maxObservedConcurrency = Math.max(this.maxObservedConcurrency, this.activeCount)
      const startedAt = next.now()
      const queueWaitMs = Math.max(0, startedAt - next.enqueuedAt)
      if (typeof next.onStart === 'function') next.onStart(this.activeCount)

      Promise.resolve()
        .then(() => next.task())
        .then((value) => {
          next.resolve({
            value,
            queueWaitMs,
            executionMs: Math.max(0, next.now() - startedAt),
            concurrencyAtStart: this.activeCount,
            globalMaxObservedConcurrency: this.maxObservedConcurrency,
          })
        })
        .catch((error) => {
          try {
            error.geminiSchedulerDiagnostics = {
              queueWaitMs,
              executionMs: Math.max(0, next.now() - startedAt),
              concurrencyAtStart: this.activeCount,
              globalMaxObservedConcurrency: this.maxObservedConcurrency,
            }
          } catch {
            // Preserve the original provider error when it cannot be annotated.
          }
          next.reject(error)
        })
        .finally(() => {
          this.activeCount = Math.max(0, this.activeCount - 1)
          this.#drain()
        })
    }
  }
}

const sharedGlobalGeminiRequestGate = new ShortsTrack2V3GeminiGlobalRequestGate()

export function createShortsTrack2V3GeminiRequestScheduler({
  maxConcurrency = 1,
  globalGate = sharedGlobalGeminiRequestGate,
  now = Date.now,
} = {}) {
  const concurrency = boundedInteger(maxConcurrency, 1, { min: 1, max: 16 })
  const memo = new Map()
  let dedupHitCount = 0
  let queueWaitMs = 0
  let requestExecutionMs = 0
  let maxObservedConcurrency = 0

  async function schedule(task) {
    try {
      const scheduled = await globalGate.schedule(task, {
        maxConcurrency: concurrency,
        now,
        onStart: (activeCount) => {
          maxObservedConcurrency = Math.max(maxObservedConcurrency, Number(activeCount || 0))
        },
      })
      queueWaitMs += Number(scheduled.queueWaitMs || 0)
      requestExecutionMs += Number(scheduled.executionMs || 0)
      return scheduled
    } catch (error) {
      const diagnostics = error?.geminiSchedulerDiagnostics || {}
      queueWaitMs += Number(diagnostics.queueWaitMs || 0)
      requestExecutionMs += Number(diagnostics.executionMs || 0)
      throw error
    }
  }

  async function dedupe(key, task) {
    const memoKey = String(key || '').trim()
    if (!memoKey) return { ...(await task()), dedupHit: false }
    if (memo.has(memoKey)) {
      dedupHitCount += 1
      return { ...(await memo.get(memoKey)), dedupHit: true }
    }

    const promise = Promise.resolve().then(task)
    memo.set(memoKey, promise)
    try {
      return { ...(await promise), dedupHit: false }
    } catch (error) {
      if (memo.get(memoKey) === promise) memo.delete(memoKey)
      throw error
    }
  }

  return {
    schedule,
    dedupe,
    clearMemo() {
      memo.clear()
    },
    diagnostics() {
      return {
        maxConcurrency: concurrency,
        queueWaitMs,
        requestExecutionMs,
        maxObservedConcurrency,
        dedupHitCount,
        memoizedRequestCount: memo.size,
      }
    },
  }
}

export default {
  createShortsTrack2V3GeminiRequestScheduler,
}
