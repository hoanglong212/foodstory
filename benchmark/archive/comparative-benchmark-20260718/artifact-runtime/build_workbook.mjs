import fs from 'node:fs/promises'
import path from 'node:path'
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool'

const benchmarkRoot = 'C:\\COS30043\\foodstory\\comparative-benchmark'
const previewDir = path.join(benchmarkRoot, 'artifact-runtime', 'previews')
const outputPath = path.join(benchmarkRoot, 'FoodStory_Comparative_Benchmark_Data.xlsx')

async function listCsvFiles(directory) {
  const files = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'artifact-runtime'].includes(entry.name)) continue
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listCsvFiles(full))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) files.push(full)
  }
  return files
}

const csvFiles = await listCsvFiles(benchmarkRoot)
const validation = []
for (const file of csvFiles) {
  const text = await fs.readFile(file, 'utf8')
  const imported = await Workbook.fromCSV(text, { sheetName: 'Validation' })
  const inspected = await imported.inspect({ kind: 'table', range: 'Validation!A1:Z8', include: 'values', tableMaxRows: 8, tableMaxCols: 26, maxChars: 1500 })
  validation.push({ file: path.relative(benchmarkRoot, file).replaceAll('\\', '/'), valid: Boolean(inspected?.ndjson) })
}

const selected = [
  ['Versions', 'version_manifest.csv'],
  ['Build Summary', 'frontend/build_summary.csv'],
  ['Frontend Summary', 'frontend/frontend_summary.csv'],
  ['API Summary', 'api/api_summary.csv'],
  ['Realtime Summary', 'realtime/realtime_summary.csv'],
  ['Vision Summary', 'vision/vision_summary.csv'],
  ['FoodMap Summary', 'foodmap/foodmap_summary.csv'],
  ['Responsive Summary', 'chart_data/16_responsive_failures.csv'],
]

const workbook = Workbook.create()
for (const [sheetName, relative] of selected) {
  await workbook.fromCSV(await fs.readFile(path.join(benchmarkRoot, relative), 'utf8'), { sheetName })
  const sheet = workbook.worksheets.getItem(sheetName)
  const used = sheet.getUsedRange()
  sheet.showGridLines = false
  sheet.freezePanes.freezeRows(1)
  used.format = { font: { name: 'Aptos', size: 10 }, verticalAlignment: 'top', wrapText: true }
  used.format.autofitColumns()
  used.format.autofitRows()
  const header = used.getRow(0)
  header.format = { fill: '#173F35', font: { bold: true, color: '#FFFFFF', name: 'Aptos', size: 10 }, verticalAlignment: 'center', wrapText: true, borders: { preset: 'outside', style: 'thin', color: '#A7B8B2' } }
  header.format.rowHeightPx = 34
}

await fs.mkdir(previewDir, { recursive: true })
for (const [sheetName] of selected) {
  const preview = await workbook.render({ sheetName, autoCrop: 'all', scale: 0.8, format: 'png' })
  await fs.writeFile(path.join(previewDir, `${sheetName.replaceAll(/[^a-z0-9]+/giu, '_')}.png`), new Uint8Array(await preview.arrayBuffer()))
}

const keyInspection = await workbook.inspect({ kind: 'workbook,sheet,table', maxChars: 5000, tableMaxRows: 6, tableMaxCols: 12, tableMaxCellChars: 80 })
const errorScan = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A', options: { useRegex: true, maxResults: 300 }, summary: 'final formula error scan' })
const output = await SpreadsheetFile.exportXlsx(workbook)
await output.save(outputPath)

console.log(JSON.stringify({ csv_files_validated: validation.length, validation_failures: validation.filter((item) => !item.valid), workbook: outputPath }, null, 2))
console.log(keyInspection.ndjson)
console.log(errorScan.ndjson)
