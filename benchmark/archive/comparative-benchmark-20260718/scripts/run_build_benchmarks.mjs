import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workbook } from '@oai/artifact-tool';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const output = path.join(root, 'frontend', 'build_runs.csv');
const logPath = path.join(root, 'BENCHMARK_EXECUTION_LOG.md');

const versions = [
  {
    id: 'frontend_stage1',
    label: 'Stage 1 responsive Vue baseline',
    commit: '6df998aa33f1f28a958610dce97a0b1bc83e0556',
    cwd: 'C:\\COS30043\\foodstory-benchmark-worktrees\\stage1',
  },
  {
    id: 'frontend_stage2',
    label: 'Stage 2 full-stack application',
    commit: '35c8ddb08567e710b4365a9a9cc93af8b1dbd8d5',
    cwd: 'C:\\COS30043\\foodstory-benchmark-worktrees\\stage2',
  },
  {
    id: 'foodmap_monolith',
    label: 'Earlier monolithic Food Map',
    commit: '770d84cacd02a76ef7e082a34175b1a7d3cb5697',
    cwd: 'C:\\COS30043\\foodstory-benchmark-worktrees\\foodmap-monolith',
  },
  {
    id: 'final',
    label: 'Final snapshot',
    commit: 'c1007231c2bf1dc77091bb381df5462de3dd6b6f',
    cwd: 'C:\\COS30043\\foodstory-benchmark-worktrees\\final\\frontend',
  },
];

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function run(command, args, cwd) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => {
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      resolve({ code, elapsedMs, stdout, stderr });
    });
  });
}

async function assetSizes(distDir) {
  const totals = { js: 0, css: 0, all: 0 };
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) {
        const size = (await fs.stat(full)).size;
        totals.all += size;
        if (/\.js$/i.test(entry.name)) totals.js += size;
        if (/\.css$/i.test(entry.name)) totals.css += size;
      }
    }
  }
  try { await visit(distDir); } catch { /* build failure or no dist */ }
  return totals;
}

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.appendFile(logPath, `\n## Production build benchmark\n\nStarted: ${new Date().toISOString()}\n\n`, 'utf8');

const rows = [];
for (const version of versions) {
  for (let runIndex = 0; runIndex <= 5; runIndex += 1) {
    const runType = runIndex === 0 ? 'warmup' : 'measured_warm';
    const commandText = 'npm.cmd run build';
    await fs.appendFile(logPath, `- ${new Date().toISOString()} | ${version.id} | ${runType} ${runIndex} | \`${commandText}\`\n`, 'utf8');
    const result = await run('cmd.exe', ['/d', '/s', '/c', commandText], version.cwd);
    const combined = `${result.stdout}\n${result.stderr}`;
    const moduleMatch = combined.match(/([\d,]+)\s+modules transformed/i);
    const viteTimeMatch = combined.match(/built in\s+([\d.]+)\s*(ms|s)/i);
    const viteReportedMs = viteTimeMatch
      ? Number(viteTimeMatch[1]) * (viteTimeMatch[2].toLowerCase() === 's' ? 1000 : 1)
      : '';
    const sizes = await assetSizes(path.join(version.cwd, 'dist'));
    rows.push({
      version_id: version.id,
      version_label: version.label,
      commit_sha: version.commit,
      run_index: runIndex,
      run_type: runType,
      evidence_type: 'measured_local_production_build',
      status: result.code === 0 ? 'success' : 'failure',
      wall_clock_ms: result.elapsedMs.toFixed(3),
      vite_reported_ms: viteReportedMs,
      transformed_modules_count: moduleMatch ? moduleMatch[1].replaceAll(',', '') : '',
      generated_js_bytes: result.code === 0 ? sizes.js : '',
      generated_css_bytes: result.code === 0 ? sizes.css : '',
      generated_total_bytes: result.code === 0 ? sizes.all : '',
      sample_size: runIndex === 0 ? 1 : 5,
      caveat: 'Same machine and Node/npm versions; warm-up excluded from summary; filesystem cache not flushed.',
    });
    await fs.appendFile(
      logPath,
      `  - exit=${result.code}; wall_clock_ms=${result.elapsedMs.toFixed(3)}; modules=${moduleMatch?.[1] ?? 'unavailable'}; stderr=${result.stderr.trim().replaceAll(/\s+/g, ' ').slice(0, 500) || 'none'}\n`,
      'utf8',
    );
  }
}

const headers = Object.keys(rows[0]);
const csv = [headers.join(','), ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(','))].join('\r\n') + '\r\n';
await fs.writeFile(output, csv, 'utf8');

const workbook = await Workbook.fromCSV(csv, { sheetName: 'Build Runs' });
const inspection = await workbook.inspect({
  kind: 'table',
  range: `Build Runs!A1:N${rows.length + 1}`,
  include: 'values',
  tableMaxRows: 8,
  tableMaxCols: 14,
  maxChars: 6000,
});
await fs.appendFile(logPath, `\nCSV validation via artifact-tool: success (${rows.length} data rows).\n\n`, 'utf8');
console.log(inspection.ndjson);
console.log(`Wrote ${output}`);
