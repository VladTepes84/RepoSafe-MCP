#!/usr/bin/env node
// Public CLI entrypoint. The scanner engine and MCP server remain unchanged.
// Only an operator-supplied --root or the current Git repository root is scanned.
import { lstat, realpath, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPrettyReport } from './report-view.mjs';
import { createGithubSnapshot, parseGithubUrl } from './github-snapshot.mjs';

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
    '  reposafe scan https://github.com/OWNER/REPO   Scan a public snapshot locally',
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
    '  Public URL scan: current files only, bounded download and temporary extraction.',
    '  Remote history/LFS/submodules and remote JSON/SARIF are not supported.',
    '  A remote snapshot is always marked INCOMPLETE for Git coverage.',
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

function execute(params, collect = false, onProgress) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [engine, ...params], {
      stdio: ['ignore', collect ? 'pipe' : 'inherit', collect ? 'pipe' : 'inherit'],
      windowsHide: true,
      env: collect ? { ...process.env, REPOSAFE_INTERNAL_PROGRESS: '1' } : process.env,
    });
    let stdout = '';
    let bytesReceived = 0;
    let progressBuffer = '';
    const decoder = new StringDecoder('utf8');
    let oversized = false;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, MAX_SCAN_MS);
    const abort = () => child.kill('SIGINT');
    process.once('SIGINT', abort);
    if (collect) {
      child.stdout.on('data', data => {
        if (oversized) return;
        bytesReceived += data.length;
        if (bytesReceived > MAX_REPORT_BYTES) {
          oversized = true;
          child.kill();
        } else stdout += decoder.write(data);
      });
      // Only accept internal aggregate counters; never echo child diagnostics or file paths.
      child.stderr.on('data', data => {
        progressBuffer += data.toString('utf8');
        if (progressBuffer.length > 4096) progressBuffer = progressBuffer.slice(-4096);
        let index;
        while ((index = progressBuffer.indexOf('\n')) !== -1) {
          const line = progressBuffer.slice(0, index);
          progressBuffer = progressBuffer.slice(index + 1);
          if (!line.startsWith('REPOSAFE_PROGRESS ')) continue;
          try {
            const event = JSON.parse(line.slice('REPOSAFE_PROGRESS '.length));
            if (['files', 'git', 'finalizing'].includes(event.phase) &&
                Number.isSafeInteger(event.filesScanned) && event.filesScanned >= 0 &&
                Number.isSafeInteger(event.directoriesVisited) && event.directoriesVisited >= 0) {
              onProgress?.(event);
            }
          } catch { /* Discard malformed untrusted diagnostics. */ }
        }
      });
    }
    child.on('error', () => {
      clearTimeout(timer);
      process.removeListener('SIGINT', abort);
      resolve({ status: 2, stdout: '', reason: 'SCAN_PROCESS_FAILED' });
    });
    child.on('close', (status, signal) => {
      if (collect && !oversized) stdout += decoder.end();
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
  const rawUrl = argv[1] && !argv[1].startsWith('--') ? argv[1] : null;
  let remote = null;
  if (rawUrl) {
    try { parseGithubUrl(rawUrl); } catch { return fail('REMOTE_URL_INVALID: only public https://github.com/OWNER/REPO is supported.'); }
    const conflicting = ['--root', '--no-git', '--no-history', '--history-depth',
      '--max-diff-size', '--current-branch', '--since', '--resume-history',
      '--json', '--sarif'];
    if (argv.some(arg => conflicting.includes(arg))) {
      return fail('REMOTE_OPTIONS_UNSUPPORTED: public URL scans are current-file-only and human-readable.');
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    process.once('SIGINT', abort);
    try {
      remote = await createGithubSnapshot(rawUrl, controller.signal);
    } catch (error) {
      return fail(error?.message?.startsWith('REMOTE_') ? error.message : 'REMOTE_DOWNLOAD_FAILED');
    } finally {
      process.removeListener('SIGINT', abort);
    }
  }
  try {
    await scanPrepared(remote);
  } finally {
    if (remote) {
      try { await rm(remote.root, { recursive: true, force: true, maxRetries: 3 }); }
      catch { fail('REMOTE_CLEANUP_FAILED: inspect the private system temporary directory.'); }
    }
  }
}

async function scanPrepared(remote) {
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
  const params = remote ? ['scan', ...argv.slice(2), '--root', remote.root, '--no-git'] : argv.slice(0);
  if (!remote && rootIndex < 0) {
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
  // Recommend scope-preserving read-only follow-ups, never emit an absolute private path.
  // Historical checkpoint resume is intentionally not copied into suggested commands.
  const reviewArgs = ['reposafe', 'scan'];
  if (remote) reviewArgs.push(remote.url);
  else if (rootIndex >= 0) reviewArgs.push('--root', 'ABSOLUTE_PATH');
  for (const flag of ['--no-git', '--no-history', '--current-branch']) {
    if (flags.has(flag)) reviewArgs.push(flag);
  }
  for (const flag of ['--history-depth', '--max-diff-size', '--since']) {
    const index = argv.indexOf(flag);
    if (index < 0) continue;
    const value = argv[index + 1] ?? '';
    if ((flag === '--since' ? /^\d{4}-\d{2}-\d{2}$/ : /^[1-9]\d*$/).test(value)) {
      reviewArgs.push(flag, value);
    }
  }
  const rendererOptions = {
    color, high, details, summary, compact, allFindings, groupBy,
    reviewCommand: reviewArgs.join(' '), explicitRoot: !remote && rootIndex >= 0,
    remoteSource: remote ? { url: remote.url, sha: remote.sha } : null,
  };
  const engineParams = [];
  for (let index = 0; index < params.length; index++) {
    if (['--high', '--details', '--summary', '--compact', '--all-findings', '--no-color'].includes(params[index])) continue;
    if (params[index] === '--group-by') { index++; continue; }
    engineParams.push(params[index]);
  }
  engineParams.push('--json');
  const started = Date.now();
  let latest = { phase: 'starting', filesScanned: 0, directoriesVisited: 0 };
  let tick = 0;
  const interactive = Boolean(process.stderr.isTTY && process.env.TERM !== 'dumb');
  const clock = () => {
    const elapsed = Math.floor((Date.now() - started) / 1000);
    return String(Math.floor(elapsed / 60)).padStart(2, '0') +
      ':' + String(elapsed % 60).padStart(2, '0');
  };
  const draw = () => {
    if (!interactive) return;
    const label = latest.phase === 'files' ? 'Scanning files' :
      latest.phase === 'git' ? 'Checking local Git' :
      latest.phase === 'finalizing' ? 'Preparing report' : 'Starting scanner';
    const counters = latest.phase === 'starting' ? '' :
      ' | ' + latest.filesScanned + ' files / ' + latest.directoriesVisited + ' dirs';
    // No percentage or estimated end time: total eligible files are not known.
    process.stderr.write('\r\x1b[2KRepoSafe ' + ['|', '/', '-', '\\'][tick++ % 4] +
      ' ' + label + counters + ' | elapsed ' + clock());
  };
  const spinner = interactive ? setInterval(draw, 700) : undefined;
  if (interactive) draw();
  else process.stderr.write('RepoSafe: scanning locally (read-only)...\n');
  let result;
  try {
    result = await execute(engineParams, true, update => {
      latest = update;
      draw();
    });
  } finally {
    if (spinner) clearInterval(spinner);
    if (interactive) process.stderr.write('\r\x1b[2K');
  }
  if (![0, 1].includes(result.status)) {
    return fail(result.reason + ' (elapsed ' + clock() +
      ', last stage ' + latest.phase + ', files ' + latest.filesScanned +
      '). No completed report; repository unchanged.');
  }
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { return fail('INVALID_REPORT: scanner returned an unreadable result.'); }
  if (remote) {
    // A source archive cannot establish any local Git index/history coverage.
    // Never advertise a clean or fully covered repository from this transport.
    report.stats.complete = false;
    report.stats.warnings.push(
      'Remote GitHub snapshot only: Git index/history, LFS objects and submodules were NOT inspected.');
    report.verdict = 'review_required';
  }
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
