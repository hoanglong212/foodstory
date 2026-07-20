import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVisionAuto } from './useVisionAuto'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function mountComposable(overrides = {}) {
  let vision
  const defaults = {
    createJob: vi.fn(),
    getJob: vi.fn(),
    cancelJob: vi.fn().mockResolvedValue({ data: {} }),
    discoverDish: vi.fn(),
    searchDishPlaces: vi.fn(),
  }
  const dependencies = { ...defaults, ...overrides }
  const wrapper = mount(defineComponent({
    setup() {
      vision = useVisionAuto(dependencies)
      return () => h('div')
    },
  }))
  return { vision, wrapper, dependencies }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useVisionAuto lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('rejects an invalid URL without creating a job', async () => {
    const { vision, wrapper, dependencies } = mountComposable()
    vision.setUrl('youtube.com/shorts/example')

    await expect(vision.submit()).resolves.toBeNull()

    expect(vision.state.value).toBe('idle')
    expect(vision.inputError.value).toContain('http:// or https://')
    expect(dependencies.createJob).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('moves through polling stages until a terminal result', async () => {
    const createJob = vi.fn().mockResolvedValue({ data: { jobId: 'job-1', status: 'queued' } })
    const getJob = vi.fn()
      .mockResolvedValueOnce({ data: { jobId: 'job-1', status: 'fast_analysis' } })
      .mockResolvedValueOnce({ data: { jobId: 'job-1', status: 'deep_analysis' } })
      .mockResolvedValueOnce({ data: {
        jobId: 'job-1',
        status: 'completed',
        result: { status: 'not_found', reason: 'no_resolver_match' },
      } })
    const { vision, wrapper } = mountComposable({ createJob, getJob })
    vision.setUrl('https://www.youtube.com/shorts/example')

    const submission = vision.submit()
    expect(vision.state.value).toBe('analyzing')
    expect(vision.hasSubmittedSource.value).toBe(true)
    await flushMicrotasks()

    await vi.advanceTimersByTimeAsync(1500)
    expect(vision.state.value).toBe('fast_analysis')
    await vi.advanceTimersByTimeAsync(1500)
    expect(vision.state.value).toBe('deep_analysis')
    await vi.advanceTimersByTimeAsync(1500)

    await expect(submission).resolves.toMatchObject({ state: 'not_found' })
    expect(vision.state.value).toBe('not_found')
    expect(getJob).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
    wrapper.unmount()
  })

  it('aborts polling and requests backend cancellation', async () => {
    const createJob = vi.fn().mockResolvedValue({ data: { jobId: 'job-cancel', status: 'queued' } })
    const cancelJob = vi.fn().mockResolvedValue({ data: {} })
    const { vision, wrapper } = mountComposable({ createJob, cancelJob })
    vision.setUrl('https://example.com/video')

    const submission = vision.submit()
    await flushMicrotasks()
    const signal = createJob.mock.calls[0][0].signal
    vision.cancel()

    expect(signal.aborted).toBe(true)
    expect(cancelJob).toHaveBeenCalledWith('job-cancel')
    expect(vision.state.value).toBe('idle')
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(1500)
    await expect(submission).resolves.toBeNull()
    wrapper.unmount()
  })

  it('rejects a stale late job and keeps the newer run authoritative', async () => {
    const first = deferred()
    const second = deferred()
    const createJob = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const cancelJob = vi.fn().mockResolvedValue({ data: {} })
    const { vision, wrapper } = mountComposable({ createJob, cancelJob })
    vision.setUrl('https://example.com/first')
    const oldRun = vision.submit()
    vision.setUrl('https://example.com/second')
    const newRun = vision.submit()

    second.resolve({ data: {
      jobId: 'job-new',
      status: 'completed',
      result: { status: 'not_found', reason: 'no_resolver_match' },
    } })
    await expect(newRun).resolves.toMatchObject({ state: 'not_found' })

    first.resolve({ data: {
      jobId: 'job-old',
      status: 'completed',
      result: { status: 'matched_place' },
    } })
    await expect(oldRun).resolves.toBeNull()

    expect(cancelJob).toHaveBeenCalledWith('job-old')
    expect(vision.state.value).toBe('not_found')
    expect(vision.result.value.state).toBe('not_found')
    wrapper.unmount()
  })

  it('retry starts a distinct run and reset clears all public state', async () => {
    const createJob = vi.fn()
      .mockResolvedValueOnce({ data: { jobId: 'job-1', status: 'completed', result: { status: 'not_found', reason: 'no_resolver_match' } } })
      .mockResolvedValueOnce({ data: { jobId: 'job-2', status: 'completed', result: { status: 'not_found', reason: 'analysis_timeout' } } })
    const { vision, wrapper } = mountComposable({ createJob })
    vision.setUrl('https://example.com/video')

    await vision.submit()
    const firstSignal = createJob.mock.calls[0][0].signal
    await vision.retry()
    const secondSignal = createJob.mock.calls[1][0].signal

    expect(secondSignal).not.toBe(firstSignal)
    expect(vision.result.value.reason).toBe('analysis_timeout')
    vision.reset()
    expect(vision.state.value).toBe('idle')
    expect(vision.url.value).toBe('')
    expect(vision.result.value).toBeNull()
    expect(vision.errorMessage.value).toBe('')
    expect(vision.elapsedSeconds.value).toBe(0)
    expect(vision.hasSubmittedSource.value).toBe(false)
    wrapper.unmount()
  })

  it('disposes the active controller and elapsed timer on component unmount', async () => {
    const createJob = vi.fn().mockResolvedValue({ data: { jobId: 'job-unmount', status: 'queued' } })
    const cancelJob = vi.fn().mockResolvedValue({ data: {} })
    const { vision, wrapper } = mountComposable({ createJob, cancelJob })
    vision.setUrl('https://example.com/video')
    const submission = vision.submit()
    await flushMicrotasks()
    const signal = createJob.mock.calls[0][0].signal

    wrapper.unmount()

    expect(signal.aborted).toBe(true)
    expect(cancelJob).toHaveBeenCalledWith('job-unmount')
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(1500)
    await expect(submission).resolves.toBeNull()
  })

  it('preserves dish candidates returned by the dish-first endpoint', async () => {
    const dishCandidates = [{ dishName: 'Banh xeo', confidence: 0.82 }]
    const discoverDish = vi.fn().mockResolvedValue({ data: { status: 'dish_candidates', dishCandidates } })
    const { vision, wrapper } = mountComposable({ discoverDish })
    vision.setUrl('https://www.youtube.com/shorts/example')

    await expect(vision.submitDishDiscovery()).resolves.toEqual({ status: 'dish_candidates', dishCandidates })
    expect(vision.state.value).toBe('dish_candidates')
    expect(vision.result.value.dishCandidates).toEqual(dishCandidates)
    expect(vi.getTimerCount()).toBe(0)
    wrapper.unmount()
  })
})
