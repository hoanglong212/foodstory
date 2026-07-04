import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  assertShortsTrack2V3AuditSafe,
  buildShortsTrack2V3AuditSummary,
  parseShortsTrack2V3AuditFixture,
  runShortsTrack2V3AuditCases,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3AuditService.js'
import { loadTrack2V3AuditFixture } from '../../scripts/track2/track2V3AuditFixtureLoader.js'
import {
  buildMetadataCandidatesFromEvidence,
  extractMetadataEvidence,
} from '../../src/services/shorts/track2-v3/shortsTrack2V3MetadataEvidenceService.js'

const backendRoot = fileURLToPath(new URL('../../', import.meta.url))
const groupedFixtureNames = [
  'metadata-address-cases.json',
  'visual-screen-address-cases.json',
  'place-hint-cases.json',
  'negative-cases.json',
  'regression-safety-cases.json',
]

function assertFixtureEvidenceAttribution(item, fixtureName = 'fixture') {
  const notes = String(item?.notes || '')
  const metadataAttributed = /\b(?:search snippet|metadata|youtube description|description contains)\b/iu.test(notes)
  const visualFullAddressExpectation = item?.expectedEvidenceSource === 'visual_ocr' &&
    ['overlay_full_address', 'visual_screen_pinned_address'].includes(item?.category)
  if (metadataAttributed && visualFullAddressExpectation && item?.manualVisualConfirmation !== true) {
    throw new Error(
      `${fixtureName}:${item?.id || '(missing id)'} cannot attribute metadata/search evidence to visual OCR without manualVisualConfirmation`,
    )
  }
}

function fixtureCase(id, category, mustNotResolve = false) {
  return {
    id,
    url: `https://www.youtube.com/shorts/${id}`,
    category,
    expected: {
      mustNotResolve,
    },
  }
}

function result(resolution, overrides = {}) {
  return {
    track: 'TRACK_2_V3',
    resolution,
    reason: `${resolution}_REASON`,
    metrics: {
      ocrTextBlockCount: overrides.ocrTextBlockCount ?? 0,
      evidenceCount: overrides.evidenceCount ?? 0,
      candidateCount: overrides.candidateCount ?? 0,
      rawCandidateCount: overrides.rawCandidateCount ?? overrides.candidateCount ?? 0,
      keptCandidateCount: overrides.keptCandidateCount ?? overrides.candidateCount ?? 0,
      droppedCandidateCount: overrides.droppedCandidateCount ?? 0,
      weakCandidateCount: overrides.weakCandidateCount ?? overrides.droppedCandidateCount ?? 0,
      addressAnchoredCandidateCount: overrides.addressAnchoredCandidateCount ?? overrides.candidateCount ?? 0,
      candidateQualityGateRan: overrides.candidateQualityGateRan ?? true,
      ocrBoostRan: Boolean(overrides.ocrBoostRan),
    },
    debug: {
      bestOcrSnippets: overrides.bestOcrSnippets || [],
      droppedCandidateReasons: overrides.droppedCandidateReasons || {},
    },
    providerErrors: overrides.providerErrors || [],
    candidates: overrides.candidates || [],
    selectedImages: overrides.selectedImages || [],
    selectorDiagnosticsPath: overrides.selectorDiagnosticsPath || null,
    contactSheetPath: overrides.contactSheetPath || null,
    generatedCropCount: overrides.generatedCropCount ?? 0,
    selectedCropIds: overrides.selectedCropIds || [],
    cropRegionCounts: overrides.cropRegionCounts || {},
    selectorDiagnosis: overrides.selectorDiagnosis || 'UNKNOWN',
    adaptiveFrameSamplingEnabled: Boolean(overrides.adaptiveFrameSamplingEnabled),
    adaptiveFrameSamplingRan: Boolean(overrides.adaptiveFrameSamplingRan),
    adaptiveFrameCount: overrides.adaptiveFrameCount ?? 0,
    adaptiveCropCount: overrides.adaptiveCropCount ?? 0,
    adaptiveSelectedCropIds: overrides.adaptiveSelectedCropIds || [],
    ocrTextBlockCountFromAdaptiveFrames:
      overrides.ocrTextBlockCountFromAdaptiveFrames ?? 0,
    ocrSnippetsFromAdaptiveFrames: overrides.ocrSnippetsFromAdaptiveFrames || [],
    candidateCountFromAdaptiveFrames: overrides.candidateCountFromAdaptiveFrames ?? 0,
    adaptiveSamplingReason: overrides.adaptiveSamplingReason || null,
    geminiCropJudgeEnabled: Boolean(overrides.geminiCropJudgeEnabled),
    geminiCropJudgeCalled: Boolean(overrides.geminiCropJudgeCalled),
    geminiCropJudgeProvider: overrides.geminiCropJudgeProvider || null,
    geminiCropJudgeSelectedCropIds: overrides.geminiCropJudgeSelectedCropIds || [],
    geminiCropJudgeRejectedCropIds: overrides.geminiCropJudgeRejectedCropIds || [],
    geminiCropJudgeContactSheetPaths: overrides.geminiCropJudgeContactSheetPaths || [],
    geminiCropJudgeResultPath: overrides.geminiCropJudgeResultPath || null,
    geminiCropJudgeErrors: overrides.geminiCropJudgeErrors || [],
    ocrTextBlockCountFromGeminiSelectedCrops:
      overrides.ocrTextBlockCountFromGeminiSelectedCrops ?? 0,
    ocrSnippetsFromGeminiSelectedCrops: overrides.ocrSnippetsFromGeminiSelectedCrops || [],
    candidateCountFromGeminiSelectedCrops:
      overrides.candidateCountFromGeminiSelectedCrops ?? 0,
  }
}

describe('Track 2 V3 audit summary', () => {
  it('keeps valid, uniquely identified grouped fixture arrays alongside the old fixture', async () => {
    const groupedRoot = path.join(backendRoot, 'tests', 'fixtures', 'track2-v3')
    const ids = new Set()
    const urls = new Map()

    await fs.access(path.join(backendRoot, 'tests', 'fixtures', 'track2-v3-audit-cases.json'))
    for (const fixtureName of groupedFixtureNames) {
      const raw = await fs.readFile(path.join(groupedRoot, fixtureName), 'utf8')
      const sourceCases = JSON.parse(raw)
      assert.ok(Array.isArray(sourceCases), `${fixtureName} must contain a JSON array`)
      sourceCases.forEach((item) => assertFixtureEvidenceAttribution(item, fixtureName))
      const fixture = parseShortsTrack2V3AuditFixture(sourceCases)

      for (const item of fixture.cases) {
        assert.ok(item.id, `${fixtureName} case requires id`)
        assert.ok(item.url, `${fixtureName} case requires url`)
        assert.ok(item.category, `${fixtureName} case requires category`)
        assert.ok(item.expectedOutcome, `${fixtureName} case requires expectedOutcome`)
        assert.ok(item.expectedSafety, `${fixtureName} case requires expectedSafety`)
        assert.equal(ids.has(item.id), false, `duplicate grouped fixture id: ${item.id}`)
        ids.add(item.id)
        const existing = urls.get(item.url)
        assert.equal(
          existing,
          undefined,
          `duplicate grouped fixture URL: ${item.url} (${existing || 'unknown'} and ${fixtureName}:${item.id})`,
        )
        urls.set(item.url, `${fixtureName}:${item.id}`)
      }
    }
  })

  it('rejects metadata or search-snippet notes classified as visual full-address evidence without confirmation', () => {
    const misclassified = {
      id: 'misclassified-metadata-as-visual',
      category: 'overlay_full_address',
      expectedEvidenceSource: 'visual_ocr',
      notes: 'Search snippet mentions a full street address.',
    }

    assert.throws(
      () => assertFixtureEvidenceAttribution(misclassified, 'synthetic-fixture.json'),
      /cannot attribute metadata\/search evidence to visual OCR/u,
    )
    assert.doesNotThrow(() => assertFixtureEvidenceAttribution({
      ...misclassified,
      manualVisualConfirmation: true,
    }, 'synthetic-fixture.json'))
  })

  it('keeps the Chợ Lớn Food Story case only in the YouTube-description metadata group', async () => {
    const groupedRoot = path.join(backendRoot, 'tests', 'fixtures', 'track2-v3')
    const groupedCases = []
    for (const fixtureName of groupedFixtureNames) {
      const cases = JSON.parse(await fs.readFile(path.join(groupedRoot, fixtureName), 'utf8'))
      groupedCases.push(...cases.map((item) => ({ ...item, fixtureName })))
    }
    const matches = groupedCases.filter((item) => item.url.endsWith('/O0my07TFvxI'))

    assert.equal(matches.length, 1)
    assert.equal(matches[0].fixtureName, 'metadata-address-cases.json')
    assert.equal(matches[0].id, 'cho-lon-food-story-event-q5')
    assert.equal(matches[0].category, 'metadata_single_address')
    assert.equal(matches[0].expectedOutcome, 'METADATA_REVIEW_CANDIDATE')
    assert.equal(matches[0].expectedEvidenceSource, 'youtube_description')
    assert.equal(matches[0].canAutoResolve, false)
  })

  it('loads one grouped fixture through the audit runner fixture path option', async () => {
    const requested = 'backend/tests/fixtures/track2-v3/negative-cases.json'
    const loaded = await loadTrack2V3AuditFixture({
      backendRoot,
      argv: ['--fixture', requested],
      env: {},
      cwd: path.resolve(backendRoot, '..'),
    })

    assert.equal(path.basename(loaded.fixturePath), 'negative-cases.json')
    assert.equal(loaded.fixture.cases.length, 3)
    assert.ok(loaded.fixture.cases.every((item) => item.category === 'nonfood_address_like'))
  })

  it('retains the hard OCR unsupported house-number safety regression', async () => {
    const fixturePath = path.join(
      backendRoot,
      'tests',
      'fixtures',
      'track2-v3',
      'regression-safety-cases.json',
    )
    const fixture = parseShortsTrack2V3AuditFixture(await fs.readFile(fixturePath, 'utf8'))
    const safetyCase = fixture.cases.find((item) => item.id === 'xoh-hard-ocr-safety')

    assert.ok(safetyCase)
    assert.ok(safetyCase.expectedSafety.unsupportedHouseNumbers.includes('1433/2'))
  })

  it('classifies the confirmed visible-address crop miss as a selector review need', async () => {
    const fixturePath = path.join(
      backendRoot,
      'tests',
      'fixtures',
      'track2-v3',
      'visual-screen-address-cases.json',
    )
    const fixture = parseShortsTrack2V3AuditFixture(await fs.readFile(fixturePath, 'utf8'))
    assert.equal(fixture.cases.length, 1)
    assert.equal(fixture.cases[0].expectedOutcome, 'SELECTOR_MISSED_VISIBLE_ADDRESS')
    assert.equal(fixture.cases[0].requiresManualFrameValidation, false)

    const summary = buildShortsTrack2V3AuditSummary(fixture.cases.map((item) => ({
      case: item,
      result: result('UNRESOLVED', {
        bestOcrSnippets: ['generic visual text'],
        selectedImages: [{ cropPath: 'selected-crops/crop-001.jpg' }],
        selectorDiagnosticsPath: 'tmp/audit/case/selector-diagnostics.json',
        contactSheetPath: 'tmp/audit/case/contact-sheets/all-crops-contact-sheet.jpg',
        generatedCropCount: 8,
        selectedCropIds: ['crop-001'],
        cropRegionCounts: { upper_middle_crop_raw: 4, middle_crop_raw: 4 },
        selectorDiagnosis: 'SELECTED_CROPS_NO_ADDRESS_ANCHOR',
      }),
    })))

    assert.equal(summary.manualValidationCaseCount, 0)
    assert.equal(summary.expectedOutcomePassCount, 1)
    assert.equal(summary.expectedOutcomeFailCount, 0)
    assert.equal(summary.cases[0].caseClosureStatus, 'NEEDS_SELECTOR_REVIEW')
    assert.equal(summary.cases[0].expectedOutcomeEvaluated, true)
    assert.equal(summary.cases[0].selectorDiagnosticsPath, 'tmp/audit/case/selector-diagnostics.json')
    assert.equal(summary.cases[0].contactSheetPath, 'tmp/audit/case/contact-sheets/all-crops-contact-sheet.jpg')
    assert.ok(summary.cases[0].generatedCropCount >= summary.cases[0].selectedImageCount)
    assert.deepEqual(summary.cases[0].selectedCropIds, ['crop-001'])
    assert.equal(summary.cases[0].selectorDiagnosis, 'SELECTED_CROPS_NO_ADDRESS_ANCHOR')
  })

  it('includes Gemini crop judge selection and OCR fallback audit fields', () => {
    const summary = buildShortsTrack2V3AuditSummary([{
      case: {
        id: 'gemini_crop_judge_audit',
        url: 'https://example.test/gemini-crop-judge-audit',
        category: 'visual_screen_address',
        expectedOutcome: 'CANDIDATES_REVIEW_ONLY',
        expectedSafety: { mustNotAutoResolve: true },
      },
      result: result('CANDIDATES', {
        candidateCount: 1,
        candidates: [{
          type: 'OCR_ADDRESS_FRAGMENT',
          displayText: '1169 Đ. Ba Tháng Hai, P. Minh Phụng, Q.11',
          addressFragment: '1169 Đ. Ba Tháng Hai, P. Minh Phụng, Q.11',
          canAutoResolve: false,
          riskFlags: ['REVIEW_ONLY', 'GEMINI_CROP_JUDGE_SELECTED'],
        }],
        geminiCropJudgeEnabled: true,
        geminiCropJudgeCalled: true,
        geminiCropJudgeProvider: 'gemini',
        geminiCropJudgeSelectedCropIds: ['crop-101'],
        geminiCropJudgeRejectedCropIds: ['crop-999'],
        geminiCropJudgeContactSheetPaths: ['tmp/case/gemini-crop-judge/contact-sheet-page-01.jpg'],
        geminiCropJudgeResultPath: 'tmp/case/gemini-crop-judge/result.json',
        geminiCropJudgeErrors: [],
        ocrTextBlockCountFromGeminiSelectedCrops: 2,
        ocrSnippetsFromGeminiSelectedCrops: [
          '1169 Đ. Ba Tháng Hai, P. Minh Phụng, Q.11',
        ],
        candidateCountFromGeminiSelectedCrops: 1,
      }),
    }])

    const audited = summary.cases[0]
    assert.equal(audited.geminiCropJudgeEnabled, true)
    assert.equal(audited.geminiCropJudgeCalled, true)
    assert.equal(audited.geminiCropJudgeProvider, 'gemini')
    assert.deepEqual(audited.geminiCropJudgeSelectedCropIds, ['crop-101'])
    assert.deepEqual(audited.geminiCropJudgeRejectedCropIds, ['crop-999'])
    assert.equal(audited.geminiCropJudgeContactSheetPaths.length, 1)
    assert.equal(audited.geminiCropJudgeResultPath, 'tmp/case/gemini-crop-judge/result.json')
    assert.deepEqual(audited.geminiCropJudgeErrors, [])
    assert.equal(audited.ocrTextBlockCountFromGeminiSelectedCrops, 2)
    assert.deepEqual(audited.ocrSnippetsFromGeminiSelectedCrops, [
      '1169 Đ. Ba Tháng Hai, P. Minh Phụng, Q.11',
    ])
    assert.equal(audited.candidateCountFromGeminiSelectedCrops, 1)
    assert.equal(audited.canAutoResolve, false)
  })

  it('includes adaptive frame sampling audit fields', () => {
    const summary = buildShortsTrack2V3AuditSummary([{
      case: {
        id: 'adaptive_frame_sampling_audit',
        url: 'https://example.test/adaptive-frame-sampling-audit',
        category: 'visual_screen_address',
        expectedOutcome: 'CANDIDATES_REVIEW_ONLY',
        expectedSafety: { mustNotAutoResolve: true },
      },
      result: result('CANDIDATES', {
        candidates: [{
          type: 'OCR_ADDRESS_FRAGMENT',
          displayText: '221 Phan Văn Khe, Quận 6, TP HCM',
          addressFragment: '221 Phan Văn Khe, Quận 6, TP HCM',
          canAutoResolve: false,
          riskFlags: ['REVIEW_ONLY', 'ADAPTIVE_FRAME_SAMPLING'],
        }],
        adaptiveFrameSamplingEnabled: true,
        adaptiveFrameSamplingRan: true,
        adaptiveFrameCount: 4,
        adaptiveCropCount: 24,
        adaptiveSelectedCropIds: ['adaptive-crop-001', 'adaptive-crop-007'],
        ocrTextBlockCountFromAdaptiveFrames: 3,
        ocrSnippetsFromAdaptiveFrames: ['221 Phan Văn Khe, Quận 6, TP HCM'],
        candidateCountFromAdaptiveFrames: 1,
        adaptiveSamplingReason: 'SELECTED_CROPS_NO_ADDRESS_ANCHOR',
      }),
    }])

    const audited = summary.cases[0]
    assert.equal(audited.adaptiveFrameSamplingEnabled, true)
    assert.equal(audited.adaptiveFrameSamplingRan, true)
    assert.equal(audited.adaptiveFrameCount, 4)
    assert.equal(audited.adaptiveCropCount, 24)
    assert.deepEqual(audited.adaptiveSelectedCropIds, [
      'adaptive-crop-001',
      'adaptive-crop-007',
    ])
    assert.equal(audited.ocrTextBlockCountFromAdaptiveFrames, 3)
    assert.deepEqual(audited.ocrSnippetsFromAdaptiveFrames, [
      '221 Phan Văn Khe, Quận 6, TP HCM',
    ])
    assert.equal(audited.candidateCountFromAdaptiveFrames, 1)
    assert.equal(audited.adaptiveSamplingReason, 'SELECTED_CROPS_NO_ADDRESS_ANCHOR')
    assert.equal(audited.canAutoResolve, false)
  })

  it('preserves allowlisted Gemini HTTP diagnostics in the audit report', () => {
    const summary = buildShortsTrack2V3AuditSummary([{
      case: {
        id: 'gemini_crop_judge_http_error',
        url: 'https://example.test/gemini-crop-judge-http-error',
        category: 'visual_screen_address',
      },
      result: result('UNRESOLVED', {
        geminiCropJudgeEnabled: true,
        geminiCropJudgeCalled: true,
        geminiCropJudgeErrors: [{
          provider: 'gemini',
          code: 'GEMINI_CROP_JUDGE_HTTP_400',
          message: 'Gemini crop judge failed safely for one contact-sheet page.',
          httpStatus: 400,
          googleErrorStatus: 'INVALID_ARGUMENT',
          googleErrorCode: 400,
          googleErrorMessage: 'Invalid image input.',
          fieldViolations: [{ field: 'input[1]', description: 'Invalid image.' }],
          endpointType: 'INTERACTIONS',
          model: 'gemini-3.5-flash',
          pagePath: 'gemini-crop-judge/contact-sheet-page-01.jpg',
          imageBytes: 1234,
          base64Length: 1648,
          requestBodyApproxBytes: 2200,
          mimeType: 'image/jpeg',
        }],
      }),
    }])

    const error = summary.cases[0].geminiCropJudgeErrors[0]
    assert.equal(error.httpStatus, 400)
    assert.equal(error.googleErrorStatus, 'INVALID_ARGUMENT')
    assert.equal(error.googleErrorCode, 400)
    assert.equal(error.googleErrorMessage, 'Invalid image input.')
    assert.deepEqual(error.fieldViolations, [{
      field: 'input[1]',
      description: 'Invalid image.',
    }])
    assert.equal(error.endpointType, 'INTERACTIONS')
    assert.equal(error.model, 'gemini-3.5-flash')
    assert.equal(error.pagePath, 'gemini-crop-judge/contact-sheet-page-01.jpg')
    assert.equal(error.imageBytes, 1234)
    assert.equal(error.base64Length, 1648)
    assert.equal(error.requestBodyApproxBytes, 2200)
    assert.equal(error.mimeType, 'image/jpeg')
  })

  it('accepts the Phase 3.2 audit fixture format', async () => {
    const fixturePath = path.join(backendRoot, 'tests', 'fixtures', 'track2-v3-audit-cases.json')
    const fixture = parseShortsTrack2V3AuditFixture(await fs.readFile(fixturePath, 'utf8'))

    assert.equal(fixture.version, 'track2-v3-offline-audit-v1.2')
    assert.ok(fixture.cases.length > 1)
    assert.ok(fixture.cases.every((item) => item.id && item.url && item.category))
    assert.ok(fixture.cases.every((item) => item.expectedOutcome))
    assert.ok(fixture.cases.every((item) => item.expectedSafety.mustNotAutoResolve))
  })

  it('continues after one mocked audit case fails', async () => {
    const cases = [
      fixtureCase('continue_001', 'overlay_full_address'),
      fixtureCase('continue_002', 'hard_ocr'),
      fixtureCase('continue_003', 'no_address_expected'),
    ]
    const calls = []
    const entries = await runShortsTrack2V3AuditCases(cases, async (item) => {
      calls.push(item.id)
      if (item.id === 'continue_002') throw new Error('mock provider failure')
      return result('UNRESOLVED')
    })

    assert.deepEqual(calls, ['continue_001', 'continue_002', 'continue_003'])
    assert.equal(entries.length, 3)
    assert.equal(entries[1].result.reason, 'AUDIT_CASE_FAILED')
    assert.equal(entries[2].result.resolution, 'UNRESOLVED')
  })

  it('aggregates mocked V3 results by resolution and category', () => {
    const summary = buildShortsTrack2V3AuditSummary([
      {
        case: fixtureCase('track2_001', 'OCR_ONLY'),
        result: result('CANDIDATES', {
          candidateCount: 2,
          rawCandidateCount: 3,
          keptCandidateCount: 2,
          droppedCandidateCount: 1,
          weakCandidateCount: 1,
          addressAnchoredCandidateCount: 2,
          droppedCandidateReasons: {
            INTRO_OR_CAPTION_ONLY: 1,
          },
          evidenceCount: 3,
          ocrTextBlockCount: 4,
          ocrBoostRan: true,
          candidates: [{ type: 'OCR_ADDRESS_FRAGMENT', displayText: '123 D. Test' }],
        }),
      },
      {
        case: fixtureCase('track2_002', 'MULTI_PLACE', true),
        result: result('NEEDS_REVIEW', {
          candidateCount: 1,
          rawCandidateCount: 1,
          keptCandidateCount: 1,
          evidenceCount: 2,
          ocrTextBlockCount: 2,
        }),
      },
      {
        case: fixtureCase('track2_003', 'NO_EVIDENCE'),
        result: result('UNRESOLVED', {
          rawCandidateCount: 1,
          keptCandidateCount: 0,
          droppedCandidateCount: 1,
          weakCandidateCount: 1,
          addressAnchoredCandidateCount: 0,
          droppedCandidateReasons: {
            WEAK_NO_EVIDENCE_CANDIDATE: 1,
          },
          providerErrors: [{ code: 'PROVIDER_UNAVAILABLE' }],
        }),
      },
    ])

    assert.equal(summary.total, 3)
    assert.equal(summary.totalCases, 3)
    assert.deepEqual(summary.byResolution, {
      CANDIDATES: 1,
      NEEDS_REVIEW: 1,
      UNRESOLVED: 1,
    })
    assert.equal(summary.byFailureCategory.REVIEW_ONLY_CANDIDATE, 2)
    assert.equal(summary.byFailureCategory.PROVIDER_ERROR, 1)
    assert.equal(summary.candidatesCount, 1)
    assert.equal(summary.needsReviewCount, 1)
    assert.equal(summary.unresolvedCount, 1)
    assert.equal(summary.falseResolvedCount, 0)
    assert.equal(summary.providerErrorCount, 1)
    assert.equal(summary.ocrTextBlockTotal, 6)
    assert.equal(summary.evidenceTotal, 5)
    assert.equal(summary.candidateTotal, 3)
    assert.equal(summary.rawCandidateTotal, 5)
    assert.equal(summary.keptCandidateTotal, 3)
    assert.equal(summary.droppedCandidateTotal, 2)
    assert.equal(summary.weakCandidateTotal, 2)
    assert.equal(summary.addressAnchoredCandidateTotal, 3)
    assert.equal(summary.droppedCandidateReasons.INTRO_OR_CAPTION_ONLY, 1)
    assert.equal(summary.droppedCandidateReasons.WEAK_NO_EVIDENCE_CANDIDATE, 1)
    assert.equal(summary.byCategory.OCR_ONLY.candidateTotal, 2)
    assert.equal(summary.byCategory.OCR_ONLY.droppedCandidateTotal, 1)
    assert.equal(summary.byCategory.MULTI_PLACE.needsReviewCount, 1)
    assert.equal(summary.byCategory.NO_EVIDENCE.providerErrorCount, 1)
    assert.equal(summary.byCategory.NO_EVIDENCE.droppedCandidateTotal, 1)
    assert.equal(summary.candidateCountByCategory.OCR_ONLY, 2)
    assert.equal(summary.droppedCandidateCountByCategory.NO_EVIDENCE, 1)
    assert.equal(summary.cases[2].droppedCandidateReasons.WEAK_NO_EVIDENCE_CANDIDATE, 1)
    assert.equal(summary.cases[0].ocrBoostRan, true)
    assert.doesNotThrow(() => assertShortsTrack2V3AuditSafe(summary))
  })

  it('flags any Phase 7 RESOLVED output as false resolved', () => {
    const summary = buildShortsTrack2V3AuditSummary([
      {
        case: fixtureCase('track2_004', 'GENERIC_LIST', true),
        result: result('RESOLVED', {
          candidateCount: 1,
          evidenceCount: 1,
          ocrTextBlockCount: 1,
        }),
      },
    ])

    assert.equal(summary.resolvedCount, 1)
    assert.equal(summary.falseResolvedCount, 1)
    assert.equal(summary.byCategory.GENERIC_LIST.falseResolvedCount, 1)
    assert.throws(
      () => assertShortsTrack2V3AuditSafe(summary),
      /falseResolveCount=1/u,
    )
  })

  it('keeps the hard OCR safety case review-only without inventing an unsupported house number', () => {
    const forbiddenHouseNumber = '1433/2'
    const noisyAlternatives = ['11433/2', '433/2']
    assert.equal(noisyAlternatives.includes(forbiddenHouseNumber), false)

    const auditCase = {
      id: 'hard_ocr_safety_mock',
      url: 'https://www.youtube.com/shorts/mockHardOcr01',
      category: 'hard_ocr',
      expectedResolution: 'ANY',
      expectedSafety: {
        mustNotResolve: true,
        mustNotAutoResolve: true,
        mustNotContainUnsupportedHouseNumber: true,
        unsupportedHouseNumbers: [forbiddenHouseNumber],
      },
    }
    const summary = buildShortsTrack2V3AuditSummary([{
      case: auditCase,
      result: result('CANDIDATES', {
        candidateCount: 1,
        candidates: [{
          type: 'OCR_PLACE_PLUS_PARTIAL_ADDRESS',
          displayText: 'Night cart - 11433/2 Phường 6 Quận 10',
          addressFragment: '11433/2 Phường 6 Quận 10',
          riskFlags: ['REVIEW_ONLY', 'LOW_CONFIDENCE_OCR'],
          canAutoResolve: false,
          houseNumberAlternatives: noisyAlternatives,
          houseNumberConflict: false,
        }],
        bestOcrSnippets: ['Night cart 11433/2 Phường 6 Quận 10'],
      }),
    }])
    const audited = summary.cases[0]

    assert.equal(audited.candidates.some((candidate) =>
      candidate.addressFragment === `1433/2 Phường 6 Quận 10`
    ), false)
    assert.equal(audited.houseNumberAlternatives.includes(forbiddenHouseNumber), false)
    assert.equal(audited.unsupportedHouseNumberFound, false)
    assert.equal(audited.canAutoResolve, false)
    assert.ok(audited.riskFlags.includes('REVIEW_ONLY'))
    assert.ok(audited.riskFlags.includes('LOW_CONFIDENCE_OCR'))
    assert.doesNotThrow(() => assertShortsTrack2V3AuditSafe(summary))
  })

  it('preserves disabled provider boundaries in the report summary', () => {
    const summary = buildShortsTrack2V3AuditSummary([{
      case: fixtureCase('provider_boundary_mock', 'metadata_only', true),
      result: {
        ...result('UNRESOLVED'),
        googleVisionCalled: false,
        placesCalled: false,
        geminiCalled: false,
        asrCalled: false,
      },
    }])
    const audited = summary.cases[0]

    assert.equal(audited.googleVisionCalled, false)
    assert.equal(audited.placesCalled, false)
    assert.equal(audited.geminiCalled, false)
    assert.equal(audited.asrCalled, false)
    assert.equal(summary.providerBoundaryViolationCount, 0)
  })

  it('diagnoses metadata evidence when notes mention metadata but visual OCR has no address anchors', () => {
    const summary = buildShortsTrack2V3AuditSummary([{
      case: {
        id: 'metadata_needed_mock',
        url: 'https://www.youtube.com/shorts/metadataNeeded01',
        category: 'overlay_full_address',
        expectedResolution: 'ANY',
        expectedOutcome: 'METADATA_NEEDED',
        notes: 'Search snippet mentions a full address, but visual OCR is only a food title.',
      },
      result: result('UNRESOLVED', {
        bestOcrSnippets: ['BÁNH XÈO HƯƠNG VỊ MIỀN TRUNG'],
      }),
    }])
    const audited = summary.cases[0]

    assert.equal(audited.caseClosureStatus, 'NEEDS_METADATA_EVIDENCE')
    assert.equal(audited.evidenceSourceHint, 'metadata')
    assert.notEqual(audited.caseClosureStatus, 'NEEDS_PARSER_RELAXATION')
    assert.equal(audited.expectedOutcomeSatisfied, true)
  })

  it('closes multi-location metadata as review candidates with metadata evidence attribution', () => {
    const evidence = extractMetadataEvidence({
      description: [
        'Location 1: Xe nước mía',
        '230 Cống Quỳnh, Phường Phạm Ngũ Lão, Quận 1',
        'Location 2: Bánh Mì Bà Huynh',
        '197a Đ. Nguyễn Trãi, Phường Nguyễn Cư Trinh, Quận 1',
      ].join('\n'),
    })
    const candidates = buildMetadataCandidatesFromEvidence(evidence)
    const summary = buildShortsTrack2V3AuditSummary([{
      case: {
        id: 'metadata_multi_review_mock',
        url: 'https://www.youtube.com/shorts/metadataMultiReviewMock',
        category: 'metadata_multi_location',
        expectedOutcome: 'METADATA_MULTI_REVIEW',
        expectedCandidateMin: 2,
      },
      result: result('CANDIDATES', {
        candidateCount: candidates.length,
        candidates,
      }),
    }])

    assert.equal(summary.cases[0].caseClosureStatus, 'PASSED_EXPECTED_REVIEW_CANDIDATE')
    assert.equal(summary.cases[0].evidenceSourceHint, 'metadata')
    assert.equal(summary.cases[0].bestCandidate.evidenceSource, 'youtube_description')
    assert.equal(summary.casesNeedingMetadata, 0)
    assert.equal(summary.expectedOutcomePassCount, 1)
    assert.equal(summary.autoResolveCount, 0)
  })

  it('closes a generic caption as an expected rejection', () => {
    const summary = buildShortsTrack2V3AuditSummary([{
      case: {
        id: 'generic_rejection_mock',
        url: 'https://www.youtube.com/shorts/genericReject01',
        category: 'generic_caption_only',
        expectedResolution: 'UNRESOLVED',
        expectedOutcome: 'GENERIC_REJECTED',
      },
      result: result('UNRESOLVED', {
        bestOcrSnippets: ['TOP 8 QUÁN NÊN THỬ QUẬN BÌNH THẠNH PHẦN 2'],
      }),
    }])

    assert.equal(summary.cases[0].caseClosureStatus, 'PASSED_EXPECTED_REJECTION')
    assert.equal(summary.cases[0].canAutoResolve, false)
    assert.equal(summary.correctlyRejectedGenericCaptions, 1)
  })

  it('counts closure states and produces data-based recommendations', () => {
    const reviewCandidate = {
      type: 'OCR_ADDRESS_FRAGMENT',
      displayText: '105 Tran Hung Dao, Quận 5',
      addressFragment: '105 Tran Hung Dao, Quận 5',
      riskFlags: ['REVIEW_ONLY', 'LOW_CONFIDENCE_OCR'],
      canAutoResolve: false,
    }
    const entries = [
      {
        case: { ...fixtureCase('closure_review', 'overlay_full_address'), expectedOutcome: 'REVIEW_CANDIDATE' },
        result: result('CANDIDATES', { candidateCount: 1, candidates: [reviewCandidate] }),
      },
      {
        case: { ...fixtureCase('closure_unresolved', 'no_address_expected'), expectedOutcome: 'CORRECT_UNRESOLVED' },
        result: result('UNRESOLVED'),
      },
      {
        case: { ...fixtureCase('closure_generic', 'generic_caption_only'), expectedOutcome: 'GENERIC_REJECTED' },
        result: result('UNRESOLVED', { bestOcrSnippets: ['TOP 8 QUÁN NÊN THỬ'] }),
      },
      {
        case: {
          ...fixtureCase('closure_metadata', 'overlay_partial_address'),
          expectedOutcome: 'METADATA_NEEDED',
          notes: 'Metadata contains an address that is absent from visual OCR.',
        },
        result: result('UNRESOLVED', { bestOcrSnippets: ['BROKEN RICE'] }),
      },
      {
        case: { ...fixtureCase('closure_parser', 'hard_ocr'), expectedOutcome: 'HARD_OCR_REVIEW' },
        result: result('UNRESOLVED', {
          bestOcrSnippets: ['360 D. Pham Van Chi, Phưròng 4, Qun 6'],
        }),
      },
    ]
    const summary = buildShortsTrack2V3AuditSummary(entries)

    assert.equal(summary.byCaseClosureStatus.PASSED_EXPECTED_REVIEW_CANDIDATE, 1)
    assert.equal(summary.byCaseClosureStatus.PASSED_EXPECTED_UNRESOLVED, 1)
    assert.equal(summary.byCaseClosureStatus.PASSED_EXPECTED_REJECTION, 1)
    assert.equal(summary.byCaseClosureStatus.NEEDS_METADATA_EVIDENCE, 1)
    assert.equal(summary.byCaseClosureStatus.NEEDS_PARSER_RELAXATION, 1)
    assert.equal(summary.casesNeedingMetadata, 1)
    assert.equal(summary.casesNeedingParserRelaxation, 1)
    assert.equal(summary.expectedOutcomePassCount, 4)
    assert.equal(summary.expectedOutcomeFailCount, 1)
    assert.ok(summary.recommendationHints.some((hint) => /metadata evidence extraction/u.test(hint)))
    assert.ok(summary.recommendationHints.some((hint) => /parser normalization/u.test(hint)))
  })

  it('does not hardcode the audit regression URL or unsupported house number in production source', async () => {
    async function sourceFiles(directory) {
      const entries = await fs.readdir(directory, { withFileTypes: true })
      const nested = await Promise.all(entries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name)
        if (entry.isDirectory()) return sourceFiles(entryPath)
        return entry.isFile() && /\.(?:js|mjs|cjs)$/u.test(entry.name) ? [entryPath] : []
      }))
      return nested.flat()
    }

    const files = [
      ...await sourceFiles(path.join(backendRoot, 'src')),
      ...await sourceFiles(path.join(backendRoot, 'scripts')),
    ].filter((filePath) => path.basename(filePath) !== 'auditTrack2V3Fixture.js')
    const forbidden = /xohEPfmd6y0|JSf3Yh3094s|1433\/2/u
    for (const filePath of files) {
      const source = await fs.readFile(filePath, 'utf8')
      assert.doesNotMatch(source, forbidden, path.relative(backendRoot, filePath))
    }
  })
})
