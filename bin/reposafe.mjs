#!/usr/bin/env node
// Public CLI entrypoint. The scanner engine and MCP server remain unchanged.
// Only an operator-supplied --root or the current Git repository root is scanned.
import { lstat, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPrettyReport } from './report-view.mjs';

const engine = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');
const argv = process.argv.slice(2);
const command = argv[0];
const MAX_REPORT_BYTES = 32 * 1024 * 1024;
const MAX_SCAN_MS = 160_000;

function help() {
  process.stdout.write([
    'RepoSafe — private-by-design local repository security audit',
    '',
    'QUICK START',
    '  cd your-git-repository',
    '  reposafe scan              Show severity dashboard and grouped findings',
    '  reposafe scan --high       Review CRITICAL/HIGH findings and actions',
    '  reposafe scan --details    Show individual findings, paths and remediation',
    '',
    'SCAN OPTIONS',
    '  --summary                  Counts and warnings only',
    '  --compact                  Short individual finding list',
    '  --all-findings             Print every retained finding',
    '  --group-by severity|file   Sort detailed findings',
    '  --no-history               Skip history scanning; keep current Git checks',
    '  --no-git                   Skip all Git integration',
    '  --history-depth N          Inspect 1..5000 commits (default: 100)',
    '  --max-diff-size N          Git diff MiB per batch (1..16)',
    '  --current-branch           Limit scan to current branch',
    '  --since YYYY-MM-DD         Restrict Git history by date',
    '  --root ABSOLUTE_PATH      Explicit approved path, including non-Git folders',
    '  --json | --sarif           Pure machine-readable reports (unchanged)',
    '  --no-color                Disable terminal styling',
    '',
    'OTHER COMMANDS',
    '  reposafe doctor --root ABSOLUTE_PATH',
    '  reposafe init|connect|disconnect  (optional MCP client setup)',
    '',
    'No source upload, API key, telemetry or automatic modification.',
    'A partial scan or no findings never certifies a repository as safe.',
    'Exit codes: 0 = no findings in scope; 1 = review required; 2 = error.',
    '',
  ].join('\n'));
}

function fail(message) {
  process.stderr.write(message + '\n');
  process.exitCode = 2;
}

function execute(params, collect = false) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [engine, ...params], {
      stdio: ['ignore', collect ? 'pipe' : 'inherit', collect ? 'pipe' : 'inherit'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let oversized = false;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, MAX_SCAN_MS);
    const abort = () => child.kill('SIGINT');
    process.once('SIGINT', abort);
    if (collect) {
      child.stdout.on('data', data => {
        if (oversized) return;
        if (Buffer.byteLength(stdout, 'utf8') + data.length > MAX_REPORT_BYTES) {
          oversized = true;
          child.kill();
        } else stdout += data.toString('utf8');
      });
      // Error details remain intentionally generic; never display source paths or tokens.
      child.stderr.on('data', data => {
        if (stderr.length < 4096) stderr += data.toString('utf8').slice(0, 4096 - stderr.length);
      });
    }
    child.on('error', () => {
      clearTimeout(timer);
      process.removeListener('SIGINT', abort);
      resolve({ status: 2, stdout: '', reason: 'SCAN_PROCESS_FAILED' });
    });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      process.removeListener('SIGINT', abort);
      resolve({
        status: timedOut || oversized ? 2 : signal ? 2 : (status ?? 2),
        stdout,
        reason: timedOut ? 'SCAN_TIMEOUT' : oversized ? 'REPORT_TOO_LARGE' :
          signal ? 'SCAN_INTERRUPTED' : 'SCAN_FAILED',
      });
    });
  });
}

async function scan() {
  const flags = new Set(argv.slice(1));
  const isJson = flags.has('--json');
  const isSarif = flags.has('--sarif');
  const high = flags.has('--high');
  const details = flags.has('--details');
  const summary = flags.has('--summary');
  const compact = flags.has('--compact');
  const allFindings = flags.has('--all-findings');
  const color = Boolean(process.stdout.isTTY && process.env.NO_COLOR === undefined &&
    process.env.TERM !== 'dumb' && !flags.has('--no-color'));
  const groupIndex = argv.indexOf('--group-by');
  const groupBy = groupIndex === -1 ? 'severity' : argv[groupIndex + 1];
  if (isJson && isSarif || (isJson || isSarif) && (high || details || summary || compact || groupIndex >= 0) ||
      summary && (compact || high || details || allFindings) ||
      (groupIndex >= 0 && !['severity', 'file'].includes(groupBy))) {
    return fail('INVALID_OPTIONS: use --help for valid scan options.');
  }
  const rootIndex = argv.indexOf('--root');
  const params = argv.slice(0);
  if (rootIndex < 0) {
    // Deliberately require a Git root marker in the *current* directory.
    // Never silently ascend to a parent/home folder or scan arbitrary cwd.
    const cwd = await realpath(process.cwd());
    let marker;
    try { marker = await lstat(join(cwd, '.git')); } catch {}
    if (!marker || marker.isSymbolicLink() || !(marker.isDirectory() || marker.isFile())) {
      return fail('NO_REPOSITORY_ROOT: run from the Git repository root, or pass --root ABSOLUTE_PATH.');
    }
    params.push('--root', cwd);
  }
  // Keep JSON/SARIF byte-identical to the underlying CLI schema and error codes.
  if (isJson || isSarif) {
    const result = await execute(params);
    process.exitCode = result.status;
    if (result.status === 2) fail(result.reason);
    return;
  }
  const rendererOptions = { color, high, details, summary, compact, allFindings, groupBy };
  const engineParams = [];
  for (let index = 0; index < params.length; index++) {
    if (['--high', '--details', '--summary', '--compact', '--all-findings', '--no-color'].includes(params[index])) continue;
    if (params[index] === '--group-by') { index++; continue; }
    engineParams.push(params[index]);
  }
  engineParams.push('--json');
  if (process.stderr.isTTY) process.stderr.write('RepoSafe: scanning locally (read-only)...\n');
  const result = await execute(engineParams, true);
  if (![0, 1].includes(result.status)) return fail(result.reason);
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { return fail('INVALID_REPORT: scanner returned an unreadable result.'); }
  try {
    process.stdout.write(renderPrettyReport(report, rendererOptions) + '\n');
    process.exitCode = result.status;
  } catch {
    fail('INVALID_REPORT: scanner output failed validation.');
  }
}

if (command === 'scan') {
  scan().catch(() => fail('SCAN_FAILED: check repository permissions and approved root.'));
} else if (!command || command === '--help' || command === '-h' ||
           command === 'help' || argv.includes('--help')) {
  help();
} else {
  execute(argv).then(result => {
    process.exitCode = result.status;
  }).catch(() => fail('COMMAND_FAILED: verify arguments and local installation.'));
}
