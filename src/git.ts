import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { devNull } from 'node:os';
import { checkSecrets, safeRelativePath, MAX_FINDINGS, scanRepository } from './scanner.js';
import type { Finding, GitStats, ScanReport } from './types.js';

const execFileAsync = promisify(execFile);
const MAX_COMMITS = 100;
const MAX_PATCH_BYTES = 4 * 1024 * 1024;
const GIT_TIMEOUT_MS = 12_000;
// Git for Windows expects the native NUL device, not Node's \\.\NUL spelling.
const GIT_NULL = process.platform === 'win32' ? 'NUL' : devNull;
const MAX_GIT_FINDINGS = MAX_FINDINGS;

// Never use a shell, fetch, checkout, filters, hooks or textconv. No repository content is executed.
// On-disk .git/config still has to be trusted; only run on a root explicitly approved by the operator.
async function git(root: string, args: string[], maxBuffer = 1024 * 1024): Promise<string> {
  const { stdout } = await execFileAsync('git', [
    '-C', root, '-c', `core.hooksPath=${GIT_NULL}`, '-c', 'core.pager=cat',
    ...args,
  ], {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer,
    windowsHide: true,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: GIT_NULL,
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
      GIT_PAGER: 'cat',
    },
  });
  return stdout;
}

export interface GitResults { findings: Finding[]; stats: GitStats }

export async function scanGit(root: string, history = true): Promise<GitResults> {
  const findings: Finding[] = [];
  const stats: GitStats = { historyChecked: false, commitsInspected: 0, gitAvailable: false, complete: true, warnings: [] };
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
    for (const filename of tracked) {
      if (/(?:^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|id_rsa|id_ed25519|.*\.(?:pem|p12|pfx|key))$/i.test(filename)) {
        findings.push({ category: 'git', rule: 'tracked_sensitive_file', severity: 'high',
          file: safeRelativePath(filename), message: 'Potential credential file is tracked by Git.',
          action: 'Inspect the tracked file; remove it from the index and rotate any exposed credentials. .gitignore does not untrack files.' });
        if (findings.length >= MAX_GIT_FINDINGS) { warning('Git finding limit reached.'); break; }
      }
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
  try {
    const patch = await git(root, [
      'log', '--all', `--max-count=${MAX_COMMITS}`, '--no-ext-diff', '--no-textconv',
      '--no-renames', '--format=RS_COMMIT_START:%H', '--unified=0', '-p',
    ], MAX_PATCH_BYTES);
    stats.historyChecked = true;
    let currentFile = '[GIT_HISTORY]';
    for (const line of patch.split(/\r?\n/)) {
      if (line.startsWith('RS_COMMIT_START:')) { stats.commitsInspected++; currentFile = '[GIT_HISTORY]'; continue; }
      if (line.startsWith('+++ b/')) { currentFile = safeRelativePath(line.slice(6)); continue; }
      if (line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('diff ') || line.startsWith('@@')) continue;
      if (!line.startsWith('+') && !line.startsWith('-')) continue;
      if (line.length > 8193) { warning('Long lines in Git history were not analyzed.'); continue; }
      for (const finding of checkSecrets(line.slice(1), currentFile, 0, 'history')) {
        if (findings.length >= MAX_GIT_FINDINGS) { warning('Git finding limit reached.'); break; }
        // Commit hashes and matched values are intentionally omitted.
        findings.push({ ...finding, file: safeRelativePath(finding.file), line: undefined,
          rule: `git_history_${finding.rule}`,
          message: 'Possible credential remains in the Git history.',
          action: 'Treat the credential as exposed, rotate it, and review history before publishing. Rewriting history alone does not revoke it.' });
      }
      if (findings.length >= MAX_GIT_FINDINGS) break;
    }
    if (stats.commitsInspected === MAX_COMMITS) warning('Git history coverage is limited to the most recent 100 commits across refs.');
  } catch { warning('Git history could not be fully scanned (size, timeout, permissions, or Git error).'); }
  return { findings, stats };
}

export async function generateReport(root: string, options: { includeGit?: boolean; includeHistory?: boolean } = {}): Promise<ScanReport> {
  const report = await scanRepository(root);
  if (options.includeGit === false) {
    report.limitations.push('Git metadata and history not requested.');
    return report;
  }
  const g = await scanGit(root, options.includeHistory !== false);
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
  report.limitations.push('Git history checks only bounded patches (up to 100 commits and 4 MiB output); unreachable/dangling objects and remote settings are not inspected.');
  return report;
}