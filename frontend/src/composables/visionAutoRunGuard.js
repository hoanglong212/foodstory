/** Keeps a superseded Vision Auto request from updating the active map state. */
export function createVisionAutoRunGuard() {
  let currentRunId = 0

  return {
    start() {
      currentRunId += 1
      return currentRunId
    },
    invalidate() {
      currentRunId += 1
      return currentRunId
    },
    isCurrent(runId) {
      return runId === currentRunId
    },
  }
}
