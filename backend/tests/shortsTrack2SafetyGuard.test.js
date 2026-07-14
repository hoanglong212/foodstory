import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { evaluateTrack2InferenceSafety } from '../src/services/shortsTrack2SafetyGuardService.js'

function evaluate(metadata, overrides = {}) {
  return evaluateTrack2InferenceSafety({
    metadata,
    ocrCandidateExtraction: { status: 'NO_CANDIDATES', candidates: [] },
    asrCandidateExtraction: { status: 'NO_CANDIDATES', candidates: [] },
    ...overrides,
  })
}

describe('shortsTrack2SafetyGuard', () => {
  it('generic/list title "Top mon ngon Quan 5" returns BLOCKED', () => {
    const result = evaluate({ title: 'Top mon ngon Quan 5' })

    assert.equal(result.status, 'BLOCKED')
    assert.ok(result.flags.includes('GENERIC_LIST_TITLE'))
  })

  it('"Tong hop quan ngon Binh Thanh" returns BLOCKED', () => {
    const result = evaluate({ title: 'Tong hop quan ngon Binh Thanh' })

    assert.equal(result.status, 'BLOCKED')
    assert.ok(result.flags.includes('MULTI_PLACE_LIKELY'))
  })

  it('"food tour" returns BLOCKED', () => {
    const result = evaluate({ title: 'Food tour Quan 1' })

    assert.equal(result.status, 'BLOCKED')
    assert.equal(result.reason, 'MULTI_PLACE_OR_LIST_VIDEO')
  })

  it('"phan 1" returns BLOCKED or NEEDS_REVIEW', () => {
    const result = evaluate({ title: 'Quan Com Ba Hoa Quan 5 phan 1' })

    assert.ok(['BLOCKED', 'NEEDS_REVIEW'].includes(result.status))
  })

  it('multi-place description returns NEEDS_REVIEW', () => {
    const result = evaluate({
      title: 'Quan Com Ba Hoa Quan 5',
      description: '- Quan A\n- Quan B',
    })

    assert.equal(result.status, 'NEEDS_REVIEW')
    assert.ok(result.flags.includes('DESCRIPTION_HAS_MULTIPLE_PLACES'))
  })

  it('OCR NEEDS_REVIEW returns BLOCKED/NEEDS_REVIEW', () => {
    const result = evaluate({ title: 'Quan Com Ba Hoa Quan 5' }, {
      ocrCandidateExtraction: { status: 'NEEDS_REVIEW', candidates: [] },
    })

    assert.equal(result.status, 'NEEDS_REVIEW')
    assert.ok(result.flags.includes('OCR_NEEDS_REVIEW'))
  })

  it('ASR NEEDS_REVIEW returns BLOCKED/NEEDS_REVIEW', () => {
    const result = evaluate({ title: 'Quan Com Ba Hoa Quan 5' }, {
      asrCandidateExtraction: { status: 'NEEDS_REVIEW', candidates: [] },
    })

    assert.equal(result.status, 'NEEDS_REVIEW')
    assert.ok(result.flags.includes('ASR_NEEDS_REVIEW'))
  })

  it('specific single place title + area returns OK', () => {
    const result = evaluate({ title: 'Quan Com Ba Hoa Quan 5' })

    assert.equal(result.status, 'OK')
  })

  it('dish-only title returns BLOCKED', () => {
    const result = evaluate({ title: 'bun bo hue' })

    assert.equal(result.status, 'BLOCKED')
    assert.ok(result.flags.includes('DISH_ONLY_SIGNAL'))
  })

  it('area-only title returns BLOCKED', () => {
    const result = evaluate({ title: 'Quan 5' })

    assert.equal(result.status, 'BLOCKED')
    assert.ok(result.flags.includes('AREA_ONLY_SIGNAL'))
  })
})
