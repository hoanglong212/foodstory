import { computed, onBeforeUnmount, ref } from 'vue'
import { adaptVisionAutoResponse } from '../adapters/visionAutoUiAdapter'
import { createVisionAutoRunGuard } from './visionAutoRunGuard'
import {
  createVisionAutoJob,
  getVisionAutoJob,
  cancelVisionAutoJob,
  discoverDishFromVideo,
  isHttpUrl,
  searchPlacesForDish,
  VisionAutoClientInputError,
} from '../services/visionAutoService'

function summarizeUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim())
    const host = parsed.hostname.replace(/^www\./i, '')
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    const compactPart = pathParts.at(-1) || parsed.searchParams.get('v') || ''
    const compactId = compactPart
      ? `${compactPart.slice(0, 8)}${compactPart.length > 8 ? '…' : ''}`
      : ''
    const normalizedHost = host.toLowerCase()
    const platform = normalizedHost.includes('youtube') || normalizedHost === 'youtu.be'
      ? 'YouTube Shorts'
      : normalizedHost.includes('instagram')
        ? 'Instagram'
        : normalizedHost.includes('tiktok')
          ? 'TikTok'
          : normalizedHost.includes('facebook') || normalizedHost.includes('fb.watch')
            ? 'Facebook'
            : 'Food link'
    const icon = platform === 'YouTube Shorts'
      ? 'youtube'
      : platform === 'Instagram'
        ? 'instagram'
        : platform === 'Facebook'
          ? 'facebook'
          : 'send'

    return {
      type: 'url',
      platform,
      icon,
      detail: [host, compactId].filter(Boolean).join(' · '),
    }
  } catch {
    return null
  }
}

function publicErrorMessage(error) {
  const status = Number(error?.response?.status || 0)
  const responseMessage = String(
    error?.response?.data?.message || error?.response?.data?.error || '',
  ).trim()

  if (responseMessage && [400, 422, 429, 502, 503, 504].includes(status)) {
    return responseMessage
  }

  return "We couldn't analyze this source right now."
}

function isCancellation(error) {
  return Boolean(
    error?.code === 'ERR_CANCELED' ||
      error?.name === 'CanceledError' ||
      error?.name === 'AbortError',
  )
}

export function useVisionAuto({
  createJob = createVisionAutoJob,
  getJob = getVisionAutoJob,
  cancelJob = cancelVisionAutoJob,
  discoverDish = discoverDishFromVideo,
  searchDishPlaces = searchPlacesForDish,
} = {}) {
  const inputMode = ref('menu')
  const state = ref('idle')
  const url = ref('')
  const inputError = ref('')
  const errorMessage = ref('')
  const result = ref(null)
  const elapsedSeconds = ref(0)
  const hasSubmittedSource = ref(false)

  let controller = null
  let elapsedTimer = 0
  let pollDelayCancel = null
  const runGuard = createVisionAutoRunGuard()
  let startedAt = 0
  let activeJobId = ''

  const isAnalyzing = computed(() => ['analyzing', 'fast_analysis', 'deep_analysis', 'resolving', 'dish_analyzing', 'dish_searching'].includes(state.value))
  const hasValidUrl = computed(() => isHttpUrl(url.value))
  const canAnalyze = computed(() => !isAnalyzing.value && hasValidUrl.value)
  const sourceSummary = computed(() => summarizeUrl(url.value))
  const analyzingCopy = computed(() => {
    if (state.value === 'dish_searching') return 'Finding places that serve this dish'
    if (state.value === 'dish_analyzing') return 'Identifying the dish from the video'
    if (elapsedSeconds.value >= 35) {
      return 'Still working — some videos take longer to analyze'
    }
    if (elapsedSeconds.value >= 35) return 'Still working — some videos take longer to analyze'
    return state.value === 'resolving' ? 'Checking possible places' : state.value === 'deep_analysis' ? 'Looking more closely at the video' : state.value === 'fast_analysis' ? 'Checking the video details' : 'Preparing analysis'
  })

  function stopElapsedTimer() {
    window.clearInterval(elapsedTimer)
    elapsedTimer = 0
  }

  function startElapsedTimer() {
    stopElapsedTimer()
    startedAt = Date.now()
    elapsedSeconds.value = 0
    elapsedTimer = window.setInterval(() => {
      elapsedSeconds.value = Math.floor((Date.now() - startedAt) / 1000)
    }, 500)
  }

  function waitForNextPoll(signal) {
    return new Promise((resolve) => {
      let timer = 0
      const finish = () => {
        window.clearTimeout(timer)
        signal?.removeEventListener('abort', finish)
        if (pollDelayCancel === finish) pollDelayCancel = null
        resolve()
      }
      timer = window.setTimeout(finish, 1500)
      signal?.addEventListener('abort', finish, { once: true })
      pollDelayCancel = finish
    })
  }

  function clearResult() {
    result.value = null
    errorMessage.value = ''
    state.value = 'idle'
  }

  function openLink() {
    inputError.value = ''
    inputMode.value = 'link'
  }

  function backToMenu() {
    inputError.value = ''
    inputMode.value = 'menu'
  }

  function setUrl(nextUrl) {
    const nextValue = String(nextUrl || '').slice(0, 2_000)
    if (nextValue !== url.value && nextValue.trim()) {
      hasSubmittedSource.value = false
    }
    url.value = nextValue
    inputError.value = ''
  }

  function clearUrl() {
    url.value = ''
    hasSubmittedSource.value = false
    inputError.value = ''
  }

  function cancel() {
    runGuard.invalidate()
    controller?.abort()
    pollDelayCancel?.()
    if (activeJobId) cancelJob(activeJobId).catch(() => undefined)
    activeJobId = ''
    controller = null
    stopElapsedTimer()
    if (isAnalyzing.value) {
      clearResult()
    }
  }

  async function submit() {
    const hasUrl = Boolean(url.value.trim())
    if (!hasUrl) {
      inputError.value = 'Paste one public video link to analyze.'
      return null
    }
    if (hasUrl && !hasValidUrl.value) {
      inputError.value = 'Paste a complete public link that starts with http:// or https://.'
      return null
    }

    controller?.abort()
    const requestController = new AbortController()
    controller = requestController
    const requestId = runGuard.start()
    inputError.value = ''
    errorMessage.value = ''
    result.value = null
    state.value = 'analyzing'
    hasSubmittedSource.value = true
    startElapsedTimer()
    let submittedJobId = ''

    try {
      const created = await createJob({ url: url.value.trim(), signal: requestController.signal })
      const jobId = created?.data?.jobId || ''
      if (!jobId) throw new Error('Vision Auto job did not start.')
      submittedJobId = jobId
      if (!runGuard.isCurrent(requestId) || requestController.signal.aborted) {
        cancelJob(jobId).catch(() => undefined)
        return null
      }
      activeJobId = jobId
      let job = created.data
      while (!['completed', 'not_found', 'failed', 'cancelled', 'timed_out'].includes(job.status)) {
        await waitForNextPoll(requestController.signal)
        if (!runGuard.isCurrent(requestId) || requestController.signal.aborted) return null
        job = (await getJob(jobId, { signal: requestController.signal })).data
        state.value = job.status === 'fast_analysis' || job.status === 'deep_analysis' || job.status === 'resolving' ? job.status : 'analyzing'
      }
      if (!runGuard.isCurrent(requestId)) return null
      const adapted = adaptVisionAutoResponse(job.result || { status: job.status === 'timed_out' ? 'not_found' : 'error', reason: job.status === 'timed_out' ? 'analysis_timeout' : 'service_failure' })
      result.value = adapted
      state.value = adapted.state
      return adapted
    } catch (error) {
      if (!runGuard.isCurrent(requestId) || requestController.signal.aborted || isCancellation(error)) {
        return null
      }

      if (error instanceof VisionAutoClientInputError) {
        inputError.value = error.message
        state.value = 'idle'
        return null
      }

      if (import.meta.env?.DEV) {
        console.warn('Vision Auto request failed', {
          status: error?.response?.status,
          code: error?.code,
        })
      }
      errorMessage.value = publicErrorMessage(error)
      state.value = 'error'
      return null
    } finally {
      if (runGuard.isCurrent(requestId)) {
        stopElapsedTimer()
        controller = null
        if (activeJobId === submittedJobId) activeJobId = ''
      }
    }
  }

  async function submitDishDiscovery() {
    if (!url.value.trim() || !hasValidUrl.value) {
      inputError.value = 'Paste a complete public YouTube link that starts with http:// or https://.'
      return null
    }
    controller?.abort()
    const requestController = new AbortController()
    controller = requestController
    const requestId = runGuard.start()
    inputError.value = ''
    errorMessage.value = ''
    result.value = null
    state.value = 'dish_analyzing'
    hasSubmittedSource.value = true
    startElapsedTimer()
    try {
      const response = await discoverDish({ url: url.value.trim(), signal: requestController.signal })
      if (!runGuard.isCurrent(requestId)) return null
      result.value = response.data
      state.value = response.data?.status || 'dish_not_identified'
      return response.data
    } catch (error) {
      if (!runGuard.isCurrent(requestId) || requestController.signal.aborted || isCancellation(error)) return null
      if (error instanceof VisionAutoClientInputError) {
        inputError.value = error.message
        state.value = 'idle'
        return null
      }
      errorMessage.value = publicErrorMessage(error)
      state.value = 'error'
      return null
    } finally {
      if (runGuard.isCurrent(requestId)) {
        stopElapsedTimer()
        controller = null
      }
    }
  }

  async function selectDish(candidate, origin = null) {
    if (!candidate?.dishName) return null
    controller?.abort()
    const requestController = new AbortController()
    controller = requestController
    const requestId = runGuard.start()
    state.value = 'dish_searching'
    errorMessage.value = ''
    startElapsedTimer()
    try {
      const response = await searchDishPlaces({
        dishName: candidate.dishName,
        aliases: candidate.aliases || [],
        origin,
        signal: requestController.signal,
      })
      if (!runGuard.isCurrent(requestId)) return null
      result.value = {
        ...(result.value || {}),
        ...response.data,
        dishCandidates: result.value?.dishCandidates || [],
      }
      state.value = response.data?.status || 'dish_places_not_found'
      return result.value
    } catch (error) {
      if (!runGuard.isCurrent(requestId) || requestController.signal.aborted || isCancellation(error)) return null
      errorMessage.value = publicErrorMessage(error)
      state.value = 'error'
      return null
    } finally {
      if (runGuard.isCurrent(requestId)) {
        stopElapsedTimer()
        controller = null
      }
    }
  }

  function retry() {
    return submit()
  }

  function reset() {
    cancel()
    clearResult()
    clearUrl()
    inputMode.value = 'menu'
    elapsedSeconds.value = 0
  }

  function dispose() {
    cancel()
  }

  onBeforeUnmount(dispose)

  return {
    inputMode,
    state,
    url,
    inputError,
    errorMessage,
    result,
    elapsedSeconds,
    hasSubmittedSource,
    isAnalyzing,
    hasValidUrl,
    canAnalyze,
    sourceSummary,
    analyzingCopy,
    openLink,
    backToMenu,
    setUrl,
    clearUrl,
    clearResult,
    cancel,
    submit,
    submitDishDiscovery,
    selectDish,
    retry,
    reset,
    dispose,
  }
}
