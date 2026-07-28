#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const expectedColumns = [
  'case_id',
  'video_url_or_file',
  'ground_truth_dish',
  'expected_location_if_known',
  'top_candidate',
  'candidate_rank',
  'outcome',
  'processing_seconds',
  'notes',
]

const allowedOutcomes = [
  'correct_top1',
  'correct_in_candidates',
  'incorrect',
  'review_only',
  'no_result',
  'technical_failure',
]

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
      continue
    }

    if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (character !== '\r') {
      field += character
    }
  }

  if (quoted) {
    throw new Error('CSV contains an unterminated quoted field.')
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

function percentage(count, total) {
  return total === 0 ? '0.00%' : `${((count / total) * 100).toFixed(2)}%`
}

function fail(message) {
  console.error(`Error: ${message}`)
  process.exitCode = 1
}

const inputArgument = process.argv[2]

if (!inputArgument) {
  fail('Provide the path to a manually labelled Vision Auto benchmark CSV.')
} else {
  try {
    const inputPath = resolve(inputArgument)
    const text = await readFile(inputPath, 'utf8')
    const parsedRows = parseCsv(text.replace(/^\uFEFF/, ''))

    if (parsedRows.length === 0) {
      throw new Error('CSV is empty.')
    }

    const header = parsedRows[0].map((column) => column.trim())
    if (
      header.length !== expectedColumns.length
      || header.some((column, index) => column !== expectedColumns[index])
    ) {
      throw new Error(`CSV header must be exactly: ${expectedColumns.join(',')}`)
    }

    const records = parsedRows
      .slice(1)
      .filter((row) => row.some((field) => field.trim() !== ''))
      .map((row, index) => {
        if (row.length !== expectedColumns.length) {
          throw new Error(
            `Data row ${index + 2} has ${row.length} columns; expected ${expectedColumns.length}.`,
          )
        }
        return Object.fromEntries(
          expectedColumns.map((column, columnIndex) => [column, row[columnIndex].trim()]),
        )
      })

    if (records.length === 0) {
      throw new Error(
        'No labelled cases were found. Add student-labelled cases before running a benchmark summary.',
      )
    }

    const seenIds = new Set()
    for (const [index, record] of records.entries()) {
      const rowNumber = index + 2
      if (!record.case_id) {
        throw new Error(`Data row ${rowNumber} is missing case_id.`)
      }
      if (seenIds.has(record.case_id)) {
        throw new Error(`Data row ${rowNumber} repeats case_id ${record.case_id}.`)
      }
      seenIds.add(record.case_id)

      if (!record.ground_truth_dish) {
        throw new Error(
          `Data row ${rowNumber} is missing the manually supplied ground_truth_dish.`,
        )
      }
      if (!allowedOutcomes.includes(record.outcome)) {
        throw new Error(
          `Data row ${rowNumber} has invalid outcome ${record.outcome}. `
          + `Allowed values: ${allowedOutcomes.join(', ')}.`,
        )
      }
      if (
        record.candidate_rank
        && (!Number.isInteger(Number(record.candidate_rank)) || Number(record.candidate_rank) < 1)
      ) {
        throw new Error(`Data row ${rowNumber} has an invalid candidate_rank.`)
      }
      if (
        record.processing_seconds
        && (!Number.isFinite(Number(record.processing_seconds))
          || Number(record.processing_seconds) < 0)
      ) {
        throw new Error(`Data row ${rowNumber} has invalid processing_seconds.`)
      }
    }

    const counts = Object.fromEntries(allowedOutcomes.map((outcome) => [outcome, 0]))
    for (const record of records) {
      counts[record.outcome] += 1
    }

    console.log('Vision Auto small benchmark summary')
    console.log(`SAMPLE SIZE: n=${records.length}`)
    console.log('')
    console.log('Outcome counts and percentages:')
    for (const outcome of allowedOutcomes) {
      console.log(`- ${outcome}: ${counts[outcome]} (${percentage(counts[outcome], records.length)})`)
    }
    console.log('')
    console.log(
      'Warning: this is a small convenience sample and is not representative '
      + 'of recognition accuracy in the wider population.',
    )
    console.log(
      'Ground-truth labels are read exactly as supplied; this script does not infer, '
      + 'rewrite, or fill them.',
    )
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}
