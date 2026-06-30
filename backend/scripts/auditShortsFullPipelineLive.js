#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runTrack2LiveAudit } from './auditShortsTrack2LiveTestSet.js'

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url))
const TRACK1_AUDIT_SCRIPT = fileURLToPath(
  new URL('./auditShortsTrack1LiveTestSet.js', import.meta.url),
)

function safeString(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength)
}

function runNodeScript(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\n${error.message}`,
      })
    })
    child.on('close', (exitCode) => {
      resolve({
        exitCode: Number(exitCode) || 0,
        stdout,
        stderr,
      })
    })
  })
}

function parsePromotedTrack2ToTrack1(stdout = '') {
  const section = String(stdout).split('Expected TRACK_2 promoted to TRACK_1')[1]
  if (!section) return 0
  const beforeSummary = section.split('\nSummary')[0] || ''
  const rows = beforeSummary
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.toLowerCase() !== 'none')
  return rows.length
}

function parseTrack1AuditResult({ exitCode, stdout, stderr }) {
  const summaryMatch = String(stdout).match(/pass=(\d+)\s+fail=(\d+)/iu)
  const failingMatch = String(stdout).match(/failingCaseIds=([^\r\n]*)/iu)
  const fail = summaryMatch ? Number(summaryMatch[2]) : (exitCode === 0 ? 0 : 1)

  return {
    pass: summaryMatch ? Number(summaryMatch[1]) : 0,
    fail,
    promotedTrack2ToTrack1: parsePromotedTrack2ToTrack1(stdout),
    failingCaseIds: failingMatch
      ? failingMatch[1].split(',').map((item) => item.trim()).filter((item) => item && item !== 'none')
      : [],
    exitCode,
    stderr: safeString(stderr, 1000) || null,
  }
}

function compactTrack2Summary(summary = {}) {
  return {
    total: Number(summary.total) || 0,
    enabled: Number(summary.enabled) || 0,
    skipped: Number(summary.skipped) || 0,
    pass: Number(summary.pass) || 0,
    fail: Number(summary.fail) || 0,
    falseResolved: Number(summary.falseResolved) || 0,
    providerErrors: Number(summary.providerErrors) || 0,
    avgLatency: Number(summary.avgLatency) || 0,
    failingCaseIds: Array.isArray(summary.failingCaseIds) ? summary.failingCaseIds : [],
    ...(summary.reason ? { reason: summary.reason } : {}),
  }
}

export async function runFullPipelineLiveAudit({ print = console.log } = {}) {
  print('Running Track 1 live audit')
  const track1Process = await runNodeScript(TRACK1_AUDIT_SCRIPT)
  const track1 = parseTrack1AuditResult(track1Process)
  print(JSON.stringify({ track1 }, null, 2))

  print('\nRunning Track 2 live audit')
  const track2Lines = []
  const track2Audit = await runTrack2LiveAudit({
    print: (line) => {
      track2Lines.push(String(line))
      print(line)
    },
  })
  const track2 = compactTrack2Summary(track2Audit.summary)

  const track1Passes = track1Process.exitCode === 0 && track1.fail === 0
  const track2Passes = track2.fail === 0
  const summary = {
    track1: {
      pass: track1.pass,
      fail: track1.fail,
      promotedTrack2ToTrack1: track1.promotedTrack2ToTrack1,
      failingCaseIds: track1.failingCaseIds,
    },
    track2,
    overall: {
      pass: track1Passes && track2Passes ? 1 : 0,
      fail: track1Passes && track2Passes ? 0 : 1,
    },
  }

  print('\nFull Pipeline Summary')
  print(JSON.stringify(summary, null, 2))
  if (track2.enabled === 0) {
    print('NO_ENABLED_TRACK2_CASES: Track 2 live quality is not validated yet.')
  }

  return summary
}

async function main() {
  const summary = await runFullPipelineLiveAudit()
  if (summary.overall.fail > 0) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      name: safeString(error?.name || 'Error', 80),
      message: safeString(error?.message || 'full pipeline audit failed', 240),
    }, null, 2))
    process.exitCode = 1
  })
}
