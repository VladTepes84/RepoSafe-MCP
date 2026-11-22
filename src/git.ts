import { execFile, spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { promisify } from 'node:util';
import { devNull } from 'node:os';
import { checkSecrets, safeRelativePath, MAX_FINDINGS, scanRepository, scanSelectedTrackedFiles } from './scanner.js';
import type { Finding, GitStats, ScanReport } from './types.js';
import { applyBaseline } from './baseline.js';

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_COMMITS = 100;
const DEFAULT_PATCH_MIB = 4;
const ABSOLUTE_MAX_COMMITS = 500;
const ABSOLUTE_MAX_PATCH_MIB = 16;

export interface HistoryScanOptions {
  depth?: number;
  since?: string;
  maxDiffSizeMiB?: number;
  currentBranchOnly?: boolean;
}
function boundedHistoryOptions(options: HistoryScanOptions): Required<HistoryScanOptions> {
  const depth = options.depth ?? DEFAULT_MAX_COMMITS;
  const maxDiffSizeMiB = options.maxDiffSizeMiB ?? DEFAULT_PATCH_MIB;
  const since = options.since ?? '';
  if (!Number.isInteger(depth) || depth < 1 || depth > ABSOLUTE_MAX_COMMITS) {
    throw new Error('History depth is outside the safe 1..500 range.');
  }
  if (!Number.isInteger(maxDiffSizeMiB) || maxDiffSizeMiB < 1 || maxDiffSizeMiB > ABSOLUTE_MAX_PATCH_MIB) {
    throw new Error('Maximum history diff size is outside the safe 1..16 MiB range.');
  }
  if (since && (!/^\d{4}-\d{2}-\d{2}$/.test(since) ||
      Number.isNaN(Date.parse(since + 'T00:00:00Z')) ||
      new Date(since + 'T00:00:00Z').toISOString().slice(0, 10) !== since)) {
    throw new Error('History --since must be a valid ISO calendar date YYYY-MM-DD.');
  }
  if (options.currentBranchOnly !== undefined && typeof options.currentBranchOnly !== 'boolean') {
    throw new Error('History branch scope must be boolean.');
  }
  return { depth, since, maxDiffSizeMiB, currentBranchOnly: options.currentBranchOnly ?? false };
}
const GIT_TIMEOUT_MS = 12_000;
// Git for Windows expects the native NUL device, not Node's \\.\NUL spelling.
const GIT_NULL = process.platform === 'win32' ? 'NUL' : devNull;
const MAX_GIT_FINDINGS = MAX_FINDINGS;
// These directories are skipped by the working-tree scanner. Git-tracked files
// inside them must never silently disappear from a publication-readiness report.
const EXCLUDED_WORKING_TREE_DIRS = new Set([
  'node_modules', 'coverage', '.next', '.venv', 'venv', '__pycache__', '.turbo', '.cache',
]);

// Never use a shell, fetch, checkout, filters, hooks or textconv. No repository content is executed.
// On-disk .git/config still has to be trusted; only run on a root explicitly approved by the operator.
// Git commands inherit neither host Git injections nor shell execution.
// Apply the same environment controls to metadata and streaming history.
function gitCommand(root: string, args: string[]): { args: string[]; env: NodeJS.ProcessEnv } {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key === 'GIT_CONFIG_PARAMETERS' || key === 'GIT_CONFIG_COUNT' ||
        /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(key) ||
        key === 'GIT_EXTERNAL_DIFF' || key === 'GIT_DIFF_OPTS') delete environment[key];
  }
  return {
    args: [
      '--no-pager', '-C', root, '-c', `core.hooksPath=${GIT_NULL}`,
      '-c', 'core.pager=cat', '-c', 'core.fsmonitor=false',
      '-c', `core.attributesFile=${GIT_NULL}`, '-c', 'diff.external=',
      ...args,
    ],
    env: {
      ...environment,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: GIT_NULL,
      GIT_CONFIG_SYSTEM: GIT_NULL,
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
      GIT_NO_LAZY_FETCH: '1',
      GIT_ATTR_NOSYSTEM: '1',
      GIT_PAGER: 'cat',
    },
  };
}

async function git(root: string, args: string[], maxBuffer = 1024 * 1024): Promise<string> {
  const command = gitCommand(root, args);
  const { stdout } = await execFileAsync('git', command.args, {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer,
    windowsHide: true,
    encoding: 'utf8',
    env: command.env,
  });
  return stdout;
}

type HistoryStreamOutcome = 'complete' | 'byte_limit' | 'timeout' | 'git_error' | 'finding_limit';
const MAX_HISTORY_LINE_CHARS = 8193;

/**
 * Read Git history incrementally. Bound memory by line length and byte budget.
 * Never retain or return raw diff content, stderr, or matched credential values.
 */
async function streamGitHistory(
  root: string,
  args: string[],
  maxBytes: number,
  onLine: (line: string) => boolean,
  onLongLine: () => void,
): Promise<HistoryStreamOutcome> {
  const command = gitCommand(root, args);
  return new Promise(resolve => {
    let reason: HistoryStreamOutcome | undefined;
    let bytesReceived = 0;
    let pending = '';
    let discardLongLine = false;
    const decoder = new StringDecoder('utf8');
    const child = spawn('git', command.args, {
      env: command.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const stop = (why: HistoryStreamOutcome): void => {
      if (reason) return;
      reason = why;
      child.kill();
    };
    const processText = (text: string): void => {
      let offset = 0;
      while (offset < text.length && !reason) {
        const end = text.indexOf('\n', offset);
        const fragment = text.slice(offset, end === -1 ? undefined : end);
        if (!discardLongLine) {
          if (pending.length + fragment.length > MAX_HISTORY_LINE_CHARS) {
            pending = '';
            discardLongLine = true;
            onLongLine();
          } else {
            pending += fragment;
          }
        }
        if (end === -1) break;
        if (!discardLongLine && !onLine(pending.endsWith('\r') ? pending.slice(0, -1) : pending)) {
          stop('finding_limit');
          break;
        }
        pending = '';
        discardLongLine = false;
        offset = end + 1;
      }
    };
    const timer = setTimeout(() => stop('timeout'), GIT_TIMEOUT_MS);
    child.stdout?.on('data', (chunk: Buffer) => {
      if (reason) return;
      const permitted = Math.min(chunk.length, maxBytes - bytesReceived);
      if (permitted > 0) {
        bytesReceived += permitted;
        processText(decoder.write(chunk.subarray(0, permitted)));
      }
      if (!reason && (permitted < chunk.length || bytesReceived >= maxBytes)) stop('byte_limit');
    });
    child.once('error', () => { if (!reason) reason = 'git_error'; });
    child.once('close', code => {
      clearTimeout(timer);
      if (!reason && code === 0) {
        processText(decoder.end());
        if (!reason && pending && !discardLongLine &&
            !onLine(pending.endsWith('\r') ? pending.slice(0, -1) : pending)) {
          reason = 'finding_limit';
        }
      } else if (!reason) {
        reason = 'git_error';
      }
      resolve(reason ?? 'complete');
    });
  });
}

export interface GitResults { findings: Finding[]; stats: GitStats }

export async function scanGit(root: string, history = true, limits: HistoryScanOptions = {}): Promise<GitResults> {
  // Validate before any Git operation; invalid options must fail rather than silently relax limits.
  const window = boundedHistoryOptions(limits);
  const findings: Finding[] = [];
  const stats: GitStats = { historyChecked: false, commitsInspected: 0, gitAvailable: false, complete: true, warnings: [],
    ...(history ? { historyWindow: { maxCommits: window.depth, maxDiffSizeMiB: window.maxDiffSizeMiB,
      ...(window.since ? { since: window.since } : {}), currentBranchOnly: window.currentBranchOnly } } : {}),
  };
  const warning = (message: string): void => { stats.complete = false; if (!stats.warnings.includes(message)) stats.warnings.push(message); };
  let inside = '';
  try {
    inside = (await git(root, ['rev-parse', '--show-toplevel'])).trim();
    stats.gitAvailable = true;
  } catch {
    // Git may be missing or root is not a Git repository. Be explicit instead of claiming coverage.
    warning('Git metadata/history could not be inspected (Git unavailable or not a Git working tree).');
    return { findings, stats };
  }
  // An approved subdirectory must not unexpectedly grant Git access to the parent repository.
  const { realpath } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  try {
    if (resolve(await realpath(inside)) !== resolve(await realpath(root))) {
      warning('Git working tree root differs from REPOSAFE_ROOT; Git inspection refused.');
      return { findings, stats };
    }
  } catch { warning('Git working tree root could not be validated.'); return { findings, stats }; }

  try {
    const tracked = (await git(root, ['ls-files', '--cached', '-z'])).split('\0').filter(Boolean);
    const selectedPaths: string[] = [];
    for (const filename of tracked) {
      // A tracked file inside an otherwise skipped dependency/cache tree is a
      // publication risk; do not return a clean verdict without inspecting it.
      if (filename.replaceAll('\\', '/').split('/').some(part => EXCLUDED_WORKING_TREE_DIRS.has(part))) {
        selectedPaths.push(filename);
        findings.push({ category: 'git', rule: 'tracked_excluded_file', severity: 'medium',
          file: safeRelativePath(filename), message: 'Git tracks a file in a directory omitted by working-tree scanning.',
          action: 'Inspect this tracked file with an additional scanner or remove it from the Git index.' });
        stats.warnings.push('Git tracks files in dependency/cache folders; additional targeted scanning is performed.');
      }
      if (/(?:^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|id_rsa|id_ed25519|.*\.(?:pem|p12|pfx|key))$/i.test(filename)) {
        findings.push({ category: 'git', rule: 'tracked_sensitive_file', severity: 'high',
          file: safeRelativePath(filename), message: 'Potential credential file is tracked by Git.',
          action: 'Inspect the tracked file; remove it from the index and rotate any exposed credentials. .gitignore does not untrack files.' });
        if (findings.length >= MAX_GIT_FINDINGS) { warning('Git finding limit reached.'); break; }
      }
    }
    if (selectedPaths.length) {
      const scan = await scanSelectedTrackedFiles(root, selectedPaths);
      findings.push(...scan.findings);
      stats.trackedExcludedFilesRequested = selectedPaths.length;
      stats.trackedExcludedFilesScanned = scan.filesScanned;
      if (!scan.complete) {
        stats.complete = false;
        for (const note of scan.warnings) if (!stats.warnings.includes(note)) stats.warnings.push(note);
      }
      if (findings.length >= MAX_FINDINGS) warning('Git finding limit reached.');
    }
  } catch { warning('Could not inspect tracked Git files.'); }

  for (const candidate of ['.env', '.env.local', '.env.production']) {
    try {
      await git(root, ['check-ignore', '-q', '--no-index', '--', candidate]);
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (code !== 1) { warning('Could not verify Git ignore patterns.'); continue; }
      findings.push({ category: 'readiness', rule: 'env_not_gitignored', severity: 'medium',
        file: '.gitignore', message: `Git does not ignore ${candidate}.`,
        action: 'Add precise .gitignore rules and verify them with git check-ignore --no-index.' });
    }
  }

  if (!history) {
    stats.warnings.push('Git history inspection disabled by explicit request.');
    return { findings, stats };
  }
  const logArgs = [
    'log', ...(window.currentBranchOnly ? [] : ['--all']),
    `--max-count=${window.depth}`,
    ...(window.since ? [`--since=${window.since}T00:00:00Z`] : []),
    '--no-ext-diff', '--no-textconv', '--no-renames',
    '--format=RS_COMMIT_START:%H', '--unified=0', '-p',
    ...(window.currentBranchOnly ? ['HEAD'] : []),
  ];
  let currentFile = '[GIT_HISTORY]';
  let currentCommit: string | undefined;
  let commitOpen = false;
  const onLine = (line: string): boolean => {
    if (line.startsWith('RS_COMMIT_START:')) {
      // Count only a completed commit: next marker or successful EOF.
      if (commitOpen) stats.commitsInspected++;
      commitOpen = true;
      const hash = line.slice('RS_COMMIT_START:'.length).trim();
      currentCommit = /^[a-f0-9]{40,64}$/i.test(hash) ? hash.slice(0, 12) : undefined;
      currentFile = '[GIT_HISTORY]';
      return true;
    }
    if (!commitOpen) return true;
    if (line.startsWith('+++ b/')) { currentFile = safeRelativePath(line.slice(6)); return true; }
    if (line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('diff ') || line.startsWith('@@')) return true;
    if (!line.startsWith('+')) return true;
    for (const finding of checkSecrets(line.slice(1), currentFile, 0, 'history')) {
      if (findings.length >= MAX_GIT_FINDINGS) return false;
      findings.push({ ...finding, file: safeRelativePath(finding.file), line: undefined,
        commit: currentCommit, rule: `git_history_${finding.rule}`,
        message: 'Possible credential remains in the Git history.',
        action: 'Treat the credential as exposed, rotate it, and review history before publishing. Rewriting history alone does not revoke it.' });
    }
    return findings.length < MAX_GIT_FINDINGS;
  };
  const outcome = await streamGitHistory(
    root, logArgs, window.maxDiffSizeMiB * 1024 * 1024, onLine,
    () => warning('Long lines in Git history were not analyzed.'),
  );
  stats.historyChecked = true;
  if (outcome === 'complete' && commitOpen) stats.commitsInspected++;
  if (outcome === 'byte_limit') warning(`Git history diff byte budget reached (${window.maxDiffSizeMiB} MiB); previously completed commits were preserved.`);
  else if (outcome === 'timeout') warning(`Git history exceeded its ${GIT_TIMEOUT_MS / 1000}s timeout; previously completed commits were preserved.`);
  else if (outcome === 'git_error') warning('Git history command failed; previously completed commits were preserved.');
  else if (outcome === 'finding_limit') warning('Git finding limit reached; additional history findings were not inspected.');
  if (outcome === 'complete' && stats.commitsInspected === window.depth) {
    warning('History depth limit reached; older commits are outside the selected scan.');
  }
  if (window.since || window.currentBranchOnly) {
    stats.warnings.push('History was restricted by operator options; commits outside that window/scope were not inspected.');
  }
  if (window.since && stats.commitsInspected === 0) {
    warning('Selected history window has no inspected commits; history coverage cannot be inferred.');
  }
  return { findings, stats };
}

export async function generateReport(root: string, options: { includeGit?: boolean; includeHistory?: boolean; historyOptions?: HistoryScanOptions } = {}): Promise<ScanReport> {
  const report = await scanRepository(root, { skipBaseline: true });
  if (options.includeGit === false) {
    report.limitations.push('Git metadata and history not requested.');
    return applyBaseline(report, root);
  }
  const g = await scanGit(root, options.includeHistory !== false, options.historyOptions);
  report.git = g.stats;
  report.findings = [...report.findings, ...g.findings].slice(0, MAX_FINDINGS);
  if (report.findings.length === MAX_FINDINGS) {
    report.stats.complete = false;
    report.stats.warnings.push('Total finding limit reached.');
  }
  if (!g.stats.complete) {
    report.stats.complete = false;
    report.stats.warnings.push(...g.stats.warnings);
  }
  report.findings.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || a.rule.localeCompare(b.rule));
  report.verdict = report.stats.complete && report.findings.length === 0 ? 'no_findings_in_scope' : 'review_required';
  report.limitations = report.limitations.filter(x => !x.startsWith('Scans current local files only'));
  report.limitations.push('Git history is always bounded (default: 100 commits and 4 MiB output; operator caps: 500 commits and 16 MiB). Unreachable/dangling objects and remote settings are not inspected.');
  return applyBaseline(report, root);
}