#!/usr/bin/env node

import 'dotenv/config'
import { readFileSync, writeFileSync } from 'node:fs'
import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { routeShortsAddress } from '../src/services/shortsAddressRouterService.js'
import { fetchShortsMetadata } from '../src/services/shortsMetadataFetchService.js'

const BACKEND_ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url))
const FIXTURE_PATH = fileURLToPath(
  new URL('../tests/fixtures/youtube-shorts-address-30.json', import.meta.url),
)
const SNAPSHOT_PATH = fileURLToPath(
  new URL('../tests/fixtures/youtube-shorts-address-30.live-snapshot.json', import.meta.url),
)

loadDotenv({ path: BACKEND_ENV_PATH, override: false })

function safeError(error) {
  return {
    name: error?.name || 'Error',
    code: error?.code || null,
    message: error?.message || 'unknown_error',
  }
}

function expectedTrack1Cases(cases = []) {
  return cases.filter((item) => item.expectedTrack === 'TRACK_1')
}

function expectedTrack2Cases(cases = []) {
  return cases.filter((item) => item.expectedTrack === 'TRACK_2')
}

function compareResult(item, result) {
  const failures = []

  if (result.track !== item.expectedTrack) {
    failures.push(`track expected ${item.expectedTrack} got ${result.track}`)
  }

  if (item.expectedTrack === 'TRACK_2' && result.track === 'TRACK_2') {
    return failures
  }

  if (
    Object.hasOwn(item, 'expectedReason') &&
    result.reason !== item.expectedReason
  ) {
    failures.push(`reason expected ${item.expectedReason} got ${result.reason}`)
  }
  if (
    Object.hasOwn(item, 'expectedEvidenceSource') &&
    result.evidenceSource !== item.expectedEvidenceSource
  ) {
    failures.push(
      `evidenceSource expected ${item.expectedEvidenceSource} got ${result.evidenceSource}`,
    )
  }

  return failures
}

function classifyNonFatalMismatch(item, result) {
  if (!result || item.expectedTrack !== 'TRACK_2' || result.track !== 'TRACK_2') {
    return []
  }

  const reasonMismatch =
    Object.hasOwn(item, 'expectedReason') && result.reason !== item.expectedReason
  const sourceMismatch =
    Object.hasOwn(item, 'expectedEvidenceSource') &&
    result.evidenceSource !== item.expectedEvidenceSource

  if (!reasonMismatch && !sourceMismatch) {
    return []
  }

  const expectedOcrOnly =
    item.expectedReason === 'OCR_ONLY' || item.expectedEvidenceSource === 'ocr'
  if (expectedOcrOnly && result.evidenceSource !== 'ocr') {
    return ['OCR_DISABLED_REASON_MISMATCH']
  }

  return ['TRACK2_REASON_MISMATCH']
}

function snapshotCase({
  item,
  metadata = null,
  result = null,
  failures = [],
  classifications = [],
  error = null,
}) {
  return {
    id: item.id,
    url: item.url,
    expectedTrack: item.expectedTrack,
    expectedReason: item.expectedReason || null,
    expectedEvidenceSource: item.expectedEvidenceSource || null,
    actualTrack: result?.track || null,
    actualReason: result?.reason || null,
    actualEvidenceSource: result?.evidenceSource || null,
    candidateAddress: result?.candidateAddress || null,
    normalizedAddress: result?.normalizedAddress || null,
    pass: failures.length === 0 && !error,
    failures,
    classifications,
    error,
    metadata,
    result,
  }
}

function printTrack1Candidates(rows = []) {
  console.log('\nExpected TRACK_1 candidates')
  for (const row of rows) {
    console.log(
      `${row.id}: candidate=${row.candidateAddress || 'null'} | normalized=${row.normalizedAddress || 'null'}`,
    )
  }
}

function printPromotions(rows = []) {
  console.log('\nExpected TRACK_2 promoted to TRACK_1')
  if (!rows.length) {
    console.log('none')
    return
  }
  for (const row of rows) {
    console.log(
      `${row.id}: reason=${row.actualReason || 'null'} source=${row.actualEvidenceSource || 'null'} candidate=${row.candidateAddress || 'null'}`,
    )
  }
}

async function auditCase(item, youtubeApiKey) {
  try {
    const metadata = await fetchShortsMetadata(item.url, {
      fetch: globalThis.fetch,
      youtubeApiKey,
    })
    const result = routeShortsAddress(metadata)
    const failures = compareResult(item, result)
    const classifications = classifyNonFatalMismatch(item, result)
    return snapshotCase({ item, metadata, result, failures, classifications })
  } catch (error) {
    return snapshotCase({
      item,
      failures: ['metadata_fetch_or_route_failed'],
      error: safeError(error),
    })
  }
}

async function main() {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
  const youtubeApiKey = String(process.env.YOUTUBE_API_KEY || '').trim()

  if (!youtubeApiKey) {
    console.error('YOUTUBE_API_KEY: missing')
    process.exitCode = 1
    return
  }

  console.log('YOUTUBE_API_KEY: present')
  console.log('Gemini/Places/OCR/ASR: not called')
  console.log(`Auditing ${fixture.cases.length} Shorts URLs with live YouTube metadata`)

  const cases = []
  for (const item of fixture.cases) {
    const row = await auditCase(item, youtubeApiKey)
    cases.push(row)
    const status = row.pass ? 'PASS' : 'FAIL'
    const classificationText = row.classifications?.length
      ? ` classification=${row.classifications.join(',')}`
      : ''
    console.log(`${status} ${row.id}: expected=${item.expectedTrack}/${item.expectedReason || 'null'}/${item.expectedEvidenceSource || 'null'} actual=${row.actualTrack || 'null'}/${row.actualReason || 'null'}/${row.actualEvidenceSource || 'null'}${classificationText}`)
  }

  const expectedTrack1 = expectedTrack1Cases(fixture.cases)
  const expectedTrack2 = expectedTrack2Cases(fixture.cases)
  const failures = cases.filter((item) => !item.pass)
  const promotions = cases.filter(
    (item) => item.expectedTrack === 'TRACK_2' && item.actualTrack === 'TRACK_1',
  )
  const nonFatalClassifications = cases.flatMap((item) => item.classifications || [])
  const track1Rows = cases.filter((item) => item.expectedTrack === 'TRACK_1')
  const snapshot = {
    version: 'shorts-address-router-live-audit-v1',
    sourceFixtureVersion: fixture.version,
    createdAt: new Date().toISOString(),
    providerCalls: {
      youtubeDataApi: true,
      shortsHtmlJsonld: true,
      gemini: false,
      googlePlaces: false,
      ocr: false,
      asr: false,
    },
    counts: {
      total: cases.length,
      passed: cases.length - failures.length,
      failed: failures.length,
      expectedTrack1: expectedTrack1.length,
      expectedTrack2: expectedTrack2.length,
      promotedTrack2ToTrack1: promotions.length,
      ocrDisabledReasonMismatches: nonFatalClassifications.filter(
        (item) => item === 'OCR_DISABLED_REASON_MISMATCH',
      ).length,
      track2ReasonMismatches: nonFatalClassifications.filter(
        (item) => item === 'TRACK2_REASON_MISMATCH',
      ).length,
    },
    failingCaseIds: failures.map((item) => item.id),
    promotedTrack2CaseIds: promotions.map((item) => item.id),
    cases,
  }

  writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')

  printTrack1Candidates(track1Rows)
  printPromotions(promotions)

  console.log('\nSummary')
  console.log(`pass=${snapshot.counts.passed} fail=${snapshot.counts.failed}`)
  console.log(`failingCaseIds=${snapshot.failingCaseIds.join(', ') || 'none'}`)
  console.log(`snapshot=${SNAPSHOT_PATH}`)

  if (failures.length) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(safeError(error))
  process.exitCode = 1
})
