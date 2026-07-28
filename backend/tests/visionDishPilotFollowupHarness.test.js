import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateFollowupMetrics,
  combinedResultsCsv,
  parseFollowupOptions,
} from '../scripts/runVisionDishPilotFollowup.js'

function observation(overrides = {}) {
  return {
    returnedTop1: '',
    returnedTop3: [],
    top1Correct: false,
    top3Correct: false,
    terminalState: 'http_429',
    technicalFailure: true,
    noResult: false,
    reviewRequired: false,
    resultStatus: 'technical_failure',
    endToEndMs: 5_000,
    httpStatus: 429,
    providerOrMediaError: 'dish_provider_quota',
    ...overrides,
  }
}

test('follow-up options enforce long delays and exponential-backoff inputs', () => {
  const options = parseFollowupOptions([])
  assert.equal(options.betweenCaseDelayMs, 90_000)
  assert.equal(options.initialBackoffMs, 75_000)
  assert.equal(options.maxAttempts, 3)
  assert.equal(options.stopAfterQuotaFailures, 3)
  assert.throws(
    () => parseFollowupOptions(['--between-case-delay-ms', '3000']),
    /30000 to 600000/u,
  )
  assert.equal(
    parseFollowupOptions(['--resume-run-id', '20260728T075128Z']).resumeRunId,
    '20260728T075128Z',
  )
  assert.throws(
    () => parseFollowupOptions(['--resume-run-id', 'not-a-timestamp']),
    /timestamp ID format/u,
  )
})

test('follow-up metrics keep the full eight-case denominator', () => {
  const cases = Array.from({ length: 8 }, (_, index) => ({
    rerun: {
      attempts: index < 2 ? [{}] : [],
      terminalObservation: index === 0
        ? observation({
            returnedTop1: 'Phở gà',
            returnedTop3: ['Phở gà'],
            top1Correct: true,
            top3Correct: true,
            terminalState: 'dish_candidates',
            technicalFailure: false,
            reviewRequired: true,
            resultStatus: 'review_required',
            httpStatus: 200,
          })
        : index === 1
          ? observation()
          : null,
      endToEndMs: index < 2 ? (index + 1) * 1_000 : null,
    },
  }))
  const metrics = calculateFollowupMetrics(cases)
  assert.equal(metrics.requestedCases, 8)
  assert.equal(metrics.attemptedCases, 2)
  assert.equal(metrics.completedProviderResponses, 1)
  assert.equal(metrics.top1AccuracyPercent, 12.5)
  assert.equal(metrics.remainingHttp429, 1)
  assert.equal(metrics.reviewRequired, 1)
  assert.equal(metrics.medianEndToEndMs, 1_500)
  assert.equal(metrics.maximumEndToEndMs, 2_000)
})

test('combined CSV displays first-run and rerun independently', () => {
  const firstRun = observation()
  const rerun = observation({
    returnedTop1: 'Phở gà',
    returnedTop3: ['Phở gà'],
    top1Correct: true,
    top3Correct: true,
    terminalState: 'dish_candidates',
    technicalFailure: false,
    reviewRequired: true,
    resultStatus: 'review_required',
    httpStatus: 200,
    providerOrMediaError: '',
  })
  const csv = combinedResultsCsv({
    cases: [{
      caseId: 'V03',
      expectedDish: 'phở gà',
      firstRun,
      rerun: {
        attempts: [rerun],
        terminalObservation: rerun,
        endToEndMs: 8_000,
      },
    }],
  })
  assert.match(csv, /first_run_top_1,first_run_top_3/u)
  assert.match(csv, /rerun_top_1,rerun_top_3/u)
  assert.match(csv, /V03,phở gà,,,no,no,http_429,429,yes/u)
  assert.match(csv, /1,Phở gà,Phở gà,yes,yes,dish_candidates,200,no/u)
})
