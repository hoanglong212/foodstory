import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateMetrics,
  candidateMatchesExpected,
  classifyPilotCase,
  labelledCasesFromCsv,
  parseOptions,
  reclassifyStoredCase,
  resultsCsv,
} from '../scripts/runVisionDishPilot.js'

function labelledCsv(rowCount = 10) {
  return [
    'case_id,video_url,expected_dish',
    ...Array.from({ length: rowCount }, (_, index) =>
      `pilot_${String(index + 1).padStart(2, '0')},`
        + `https://www.youtube.com/shorts/AbCdEf${String(index).padStart(5, '0')},`
        + `${index === 0 ? '"Cao L\u1EA7u"' : '"Fixture Dish"'}`,
    ),
  ].join('\n')
}

test('pilot harness reads labelled cases without rewriting ground-truth text', () => {
  const cases = labelledCasesFromCsv(labelledCsv())
  assert.equal(cases.length, 10)
  assert.equal(cases[0].caseId, 'pilot_01')
  assert.equal(cases[0].expectedDish, 'Cao L\u1EA7u')
})

test('pilot harness enforces a 10 to 15 case formative sample', () => {
  assert.throws(() => labelledCasesFromCsv(labelledCsv(9)), /10-15 cases/u)
  assert.throws(() => labelledCasesFromCsv(labelledCsv(16)), /10-15 cases/u)
})

test('dish correctness uses normalized complete-token labels and returned aliases only', () => {
  assert.equal(candidateMatchesExpected({ dishName: 'cao l\u1EA7u' }, 'Cao L\u1EA7u'), true)
  assert.equal(candidateMatchesExpected({ dishName: 'B\u00FAn \u0111\u1EADu' }, 'Bun dau'), true)
  assert.equal(
    candidateMatchesExpected(
      { dishName: 'VIETNAMESE CREPE- B\u00C1NH X\u00C8O' },
      'b\u00E1nh x\u00E8o',
    ),
    true,
  )
  assert.equal(candidateMatchesExpected({ dishName: 'Photographic menu' }, 'pho'), false)
  assert.equal(
    candidateMatchesExpected(
      { dishName: 'Vietnamese noodle dish', aliases: ['Cao Lau'] },
      'Cao L\u1EA7u',
    ),
    true,
  )
  assert.equal(
    candidateMatchesExpected({ dishName: 'M\u00EC Qu\u1EA3ng' }, 'Cao L\u1EA7u'),
    false,
  )
})

test('pilot can recalculate correctness without replacing preserved raw output', () => {
  const raw = {
    request: {
      method: 'POST',
      body: { sourceUrl: 'https://www.youtube.com/watch?v=VhquFhlJ5Ds' },
    },
    response: {
      status: 200,
      statusText: 'OK',
      contentType: 'application/json',
      rawBody: '{"status":"dish_candidates"}',
      parsedBody: {
        status: 'dish_candidates',
        dishCandidates: [
          {
            dishName: 'VIETNAMESE CREPE- B\u00C1NH X\u00C8O',
            aliases: [],
            reviewRequired: true,
          },
        ],
      },
    },
    transportError: null,
  }
  const item = reclassifyStoredCase(
    {
      caseId: 'V10',
      videoUrl: 'https://www.youtube.com/watch?v=VhquFhlJ5Ds',
      expectedDish: 'b\u00E1nh x\u00E8o',
      endToEndMs: 3_560,
      raw,
    },
    {
      caseId: 'V10',
      videoUrl: 'https://www.youtube.com/watch?v=VhquFhlJ5Ds',
      expectedDish: 'b\u00E1nh x\u00E8o',
    },
  )
  assert.equal(item.top1Correct, true)
  assert.equal(item.top3Correct, true)
  assert.equal(item.raw, raw)
})

test('pilot classification keeps raw failures and does not infer a location', () => {
  const response = {
    ok: false,
    status: 429,
    statusText: 'Too Many Requests',
    headers: new Headers({ 'content-type': 'application/json' }),
  }
  const item = classifyPilotCase({
    labelledCase: {
      caseId: 'pilot_01',
      videoUrl: 'https://www.youtube.com/shorts/AbCdEf12345',
      expectedDish: 'Cao L\u1EA7u',
    },
    response,
    parsedBody: { code: 'dish_provider_quota', error: 'Provider unavailable.' },
    rawBody: '{"code":"dish_provider_quota","error":"Provider unavailable."}',
    elapsedMs: 1_234.4,
  })

  assert.equal(item.technicalFailure, true)
  assert.equal(item.noResult, false)
  assert.equal(item.top1Correct, false)
  assert.equal(item.endToEndMs, 1_234)
  assert.equal(item.raw.response.rawBody.includes('dish_provider_quota'), true)
  assert.equal('restaurant' in item, false)
  assert.equal('location' in item, false)
})

test('pilot metrics use all labelled cases as the primary denominator', () => {
  const metrics = calculateMetrics([
    {
      top1Correct: true,
      top3Correct: true,
      noResult: false,
      reviewRequired: true,
      technicalFailure: false,
      endToEndMs: 1_000,
    },
    {
      top1Correct: false,
      top3Correct: false,
      noResult: false,
      reviewRequired: false,
      technicalFailure: true,
      endToEndMs: 3_000,
    },
  ])
  assert.equal(metrics.top1DishAccuracyPercent, 50)
  assert.equal(metrics.top3DishAccuracyPercent, 50)
  assert.equal(metrics.reviewRequiredRatePercent, 50)
  assert.equal(metrics.technicalFailureRatePercent, 50)
  assert.equal(metrics.medianEndToEndMs, 2_000)
  assert.equal(metrics.maximumEndToEndMs, 3_000)
})

test('pilot CSV output contains the requested outcome and latency columns', () => {
  const csv = resultsCsv([
    {
      caseId: 'pilot_01',
      videoUrl: 'https://www.youtube.com/shorts/AbCdEf12345',
      expectedDish: 'Cao L\u1EA7u',
      returnedTop1: 'cao l\u1EA7u',
      returnedTop3: ['cao l\u1EA7u'],
      top1Correct: true,
      top3Correct: true,
      terminalState: 'dish_candidates',
      technicalFailure: false,
      noResult: false,
      reviewRequired: true,
      resultStatus: 'review_required',
      endToEndMs: 1_234,
      endToEndSeconds: 1.234,
      httpStatus: 200,
      providerOrMediaError: '',
    },
  ])
  assert.match(csv, /top_1_correct,top_3_correct,terminal_state,technical_failure/u)
  assert.match(csv, /dish_candidates,no,no,yes,review_required,1234,1\.234,200/u)
})

test('pilot endpoint rejects embedded credentials', () => {
  assert.throws(
    () => parseOptions(['--endpoint', 'https://user:secret@example.com/api']),
    /credential-free/u,
  )
})

test('quota-safe retry options are bounded and cannot conflict with summarize-only', () => {
  const options = parseOptions([
    '--retry-technical-failures',
    '--quota-backoff-ms',
    '70000',
    '--max-attempts',
    '2',
    '--retry-case-id',
    'V03',
  ])
  assert.equal(options.retryTechnicalFailures, true)
  assert.equal(options.quotaBackoffMs, 70_000)
  assert.equal(options.maxAttempts, 2)
  assert.deepEqual(options.retryCaseIds, ['V03'])
  assert.throws(
    () => parseOptions(['--retry-technical-failures', '--summarize-only']),
    /cannot be combined/u,
  )
  assert.equal(
    parseOptions(['--finalize-interrupted-retry']).finalizeInterruptedRetry,
    true,
  )
  assert.throws(
    () => parseOptions(['--retry-case-id', 'V03']),
    /requires --retry-technical-failures/u,
  )
})
