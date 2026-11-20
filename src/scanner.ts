import { constants } from 'node:fs';
import { open, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, parse, relative, sep } from 'node:path';
import type { Finding, ScanReport, ScanStats } from './types.js';

const MAX_FILES = 1000;
const MAX_DIRECTORIES = 2000;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_DEPTH = 10;
export const MAX_FINDINGS = 100;
const MAX_LINE_CHARS = 8192;

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.next',
  '.venv', 'venv', '__pycache__', '.turbo', '.cache', 'vendor',
]);
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip',
  '.gz', '.tar', '.7z', '.exe', '.dll', '.so', '.dylib', '.mp3',
  '.mp4', '.mov', '.woff', '.woff2', '.ttf', '.otf', '.db', '.sqlite',
]);
const LIMITATIONS = [
  'Heuristic checks; false negatives and false positives are possible.',
  'Scans current local files only, not Git history, branches, commits, or remote repository settings.',
  'Symlinks, hard-linked files, binary files, ignored build/vendor directories, and oversized files are skipped.',
  'A clean report is NOT a guarantee that publishing is safe.',
  'The scan runs with the operating system permissions of the MCP host; it is not an OS-level sandbox.',
];

interface SecretRule {
  name: string;
  pattern: RegExp;
  severity: 'high' | 'medium';
  message: string;
  action: string;
}

const SECRET_RULES: SecretRule[] = [
  {
    name: 'private_key_block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
    severity: 'high', message: 'Possible private key material.',
    action: 'Remove the key, rotate it if exposed, and exclude credential files.',
  },
  {
    name: 'aws_access_key_id', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
    severity: 'high', message: 'Possible AWS access key ID.',
    action: 'Review and revoke/rotate the credential if valid.',
  },
  {
    name: 'github_token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    severity: 'high', message: 'Possible GitHub access token.',
    action: 'Revoke and replace the token; keep it out of tracked files.',
  },
  {
    name: 'openai_key', pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/,
    severity: 'high', message: 'Possible API key.',
    action: 'Revoke/rotate the key and load it securely at runtime.',
  },
  {
    name: 'anthropic_key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/,
    severity: 'high', message: 'Possible Anthropic API key.',
    action: 'Rotate the key and remove it from files and commit history.',
  },
  {
    name: 'stripe_secret', pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/,
    severity: 'high', message: 'Possible Stripe live secret.',
    action: 'Rotate the secret and use a protected runtime secret store.',
  },
  {
    name: 'google_api_key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
    severity: 'high', message: 'Possible Google API key.',
    action: 'Restrict and rotate the key; check provider usage logs.',
  },
  {
    name: 'slack_token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
    severity: 'high', message: 'Possible Slack token.',
    action: 'Revoke/rotate this token and use a secrets manager.',
  },
];

// Fixed-width key token + one suffix check prevents regex backtracking on long underscore sequences.
const GENERIC_ASSIGNMENT = /(?:^|[\s"'{,])([A-Za-z][A-Za-z0-9_-]{0,95})\s*["']?\s*[:=]\s*["']?([^\s,'";#}]{8,})/i;
const SENSITIVE_KEY = /(?:^|[_-])(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?access[_-]?key|secret[_-]?key|password|passwd|secret|token)$/i;
const EXAMPLE_VALUE = /^(?:\$\{|\$|<|\{|example|sample|dummy|test|change[_-]?me|replace|your[_-]?|placeholder|undefined|null|none|process\.|env\.|os\.environ)/i;

// Deliberately ignore the matched value in all output. Findings contain metadata only.
export function checkSecrets(line: string, file: string, lineNumber: number, category: 'secrets' | 'history' = 'secrets'): Finding[] {
  const findings: Finding[] = [];
  for (const rule of SECRET_RULES) {
    if (rule.pattern.test(line)) {
      findings.push({
        category, rule: rule.name, severity: rule.severity,
        file, line: lineNumber, message: rule.message, action: rule.action,
      });
    }
  }
  const match = GENERIC_ASSIGNMENT.exec(line);
  if (match && SENSITIVE_KEY.test(match[1]) && !EXAMPLE_VALUE.test(match[2])) {
    findings.push({
      category, rule: 'generic_secret_assignment', severity: 'medium',
      file, line: lineNumber, message: 'Possible hardcoded credential assignment.',
      action: 'Review this assignment; move real credentials to protected configuration.',
    });
  }
  return findings;
}

export function checkPrivacy(line: string, file: string, lineNumber: number): Finding[] {
  const findings: Finding[] = [];
  if (/(?:^|[\s"'(])(?:\/Users\/[^\s/]+\/|\/home\/[^\s/]+\/|[A-Z]:\\Users\\[^\s\\]+\\)/i.test(line)) {
    findings.push({
      category: 'privacy', rule: 'absolute_user_path', severity: 'low', file, line: lineNumber,
      message: 'Possible personal workstation path.',
      action: 'Replace local user-specific paths with generic examples.',
    });
  }
  if (/\b(?:[a-z0-9-]+\.)+(?:internal|corp)\b/i.test(line)) {
    findings.push({
      category: 'privacy', rule: 'internal_hostname', severity: 'medium', file, line: lineNumber,
      message: 'Possible internal hostname reference.',
      action: 'Confirm this host may be publicly documented or replace it with a placeholder.',
    });
  }
  if (/github\.com\/[A-Za-z\d_.-]+\/[A-Za-z\d_.-]+/i.test(line)) {
    findings.push({
      category: 'privacy', rule: 'repository_link_review', severity: 'low', file, line: lineNumber,
      message: 'GitHub repository link: visibility cannot be inferred from the URL.',
      action: 'Verify the linked repository is intended to be referenced publicly.',
    });
  }
  return findings;
}

export function safeRelativePath(raw: string): string {
  // Never allow an untrusted filename to carry a credential or terminal control sequence to an AI client.
  const normalized = raw.replace(/[\x00-\x1f\x7f-\x9f]/g, '?').slice(0, 240);
  if (SECRET_RULES.some(rule => rule.pattern.test(normalized)) || /(?:password|token|secret|key)[=:][^/\\]{8,}/i.test(normalized)) {
    return '[REDACTED_FILE_NAME]';
  }
  return normalized || '[UNNAMED_FILE]';
}

function fileExtension(file: string): string {
  const i = file.lastIndexOf('.');
  return i < 0 ? '' : file.slice(i).toLowerCase();
}

function contained(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

// The root is configured by the operator, never by tool input or repository text.
export async function validateRoot(configuredPath: string): Promise<string> {
  if (!configuredPath || !isAbsolute(configuredPath)) {
    throw new Error('REPOSAFE_ROOT must be an absolute path to an approved directory.');
  }
  const root = await realpath(configuredPath);
  if (root === parse(root).root) throw new Error('Filesystem root is not an allowed scan scope.');
  const st = await stat(root);
  if (!st.isDirectory()) throw new Error('REPOSAFE_ROOT must reference a directory.');
  return root;
}

export async function scanRepository(approvedRoot: string): Promise<ScanReport> {
  const root = await validateRoot(approvedRoot);
  const stats: ScanStats = {
    filesScanned: 0, directoriesVisited: 0, bytesScanned: 0,
    filesSkipped: 0, complete: true, warnings: [],
  };
  const findings: Finding[] = [];
  const toVisit: Array<{ abs: string; depth: number }> = [{ abs: root, depth: 0 }];
  const rootFiles = new Set<string>();
  let stopped = false;

  function markPartial(reason: string): void {
    stats.complete = false;
    if (!stats.warnings.includes(reason)) stats.warnings.push(reason);
  }
  function addFinding(finding: Finding): void {
    if (findings.length >= MAX_FINDINGS) {
      markPartial('Finding limit reached.');
      stopped = true;
      return;
    }
    findings.push({ ...finding, file: safeRelativePath(finding.file) });
  }

  while (toVisit.length && !stopped) {
    if (stats.directoriesVisited >= MAX_DIRECTORIES) {
      markPartial('Directory count limit reached.');
      break;
    }
    const { abs: directory, depth } = toVisit.pop()!;
    let entries;
    try {
      // Check again before traversing a directory; never intentionally follow symlinks.
      const canonical = await realpath(directory);
      if (!contained(root, canonical)) {
        markPartial('A path resolved outside the authorized directory.');
        continue;
      }
      entries = await readdir(directory, { withFileTypes: true });
      stats.directoriesVisited++;
    } catch {
      markPartial('A directory could not be read.');
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (stopped) break;
      const abs = join(directory, entry.name);
      const rel = relative(root, abs).replaceAll(sep, '/');
      if (entry.isSymbolicLink()) {
        stats.filesSkipped++;
        continue;
      }
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) { stats.filesSkipped++; continue; }
        if (depth >= MAX_DEPTH) {
          stats.filesSkipped++;
          markPartial('Maximum directory depth reached.');
          continue;
        }
        toVisit.push({ abs, depth: depth + 1 });
        continue;
      }
      if (!entry.isFile()) { stats.filesSkipped++; continue; }
      if (depth === 0) rootFiles.add(entry.name.toLowerCase());
      if (BINARY_EXTENSIONS.has(fileExtension(entry.name))) { stats.filesSkipped++; continue; }
      if (stats.filesScanned >= MAX_FILES) {
        markPartial('File count limit reached.');
        stopped = true;
        break;
      }
      let handle;
      try {
        const canonical = await realpath(abs);
        if (!contained(root, canonical)) {
          stats.filesSkipped++;
          markPartial('A file resolved outside the authorized directory.');
          continue;
        }
        handle = await open(abs, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const st = await handle.stat();
        if (!st.isFile()) { stats.filesSkipped++; continue; }
        // Hard links can point to the same inode as a file outside the approved root.
        // We cannot prove their provenance, so skip rather than risk disclosing content.
        if (st.nlink > 1) { stats.filesSkipped++; markPartial('Hard-linked files were skipped.'); continue; }
        if (st.size > MAX_FILE_BYTES) { stats.filesSkipped++; markPartial('Oversized files were skipped.'); continue; }
        if (stats.bytesScanned + st.size > MAX_BYTES) {
          markPartial('Total scan byte limit reached.');
          stopped = true;
          break;
        }
        const buffer = await handle.readFile();
        stats.filesScanned++;
        stats.bytesScanned += buffer.byteLength;
        if (buffer.includes(0)) { stats.filesSkipped++; continue; }
        const lines = buffer.toString('utf8').split(/\r?\n/);
        for (let n = 0; n < lines.length; n++) {
          if (lines[n].length > MAX_LINE_CHARS) {
            markPartial('One or more lines exceeded the analysis length limit.');
            continue;
          }
          for (const f of checkSecrets(lines[n], rel, n + 1)) addFinding(f);
          for (const f of checkPrivacy(lines[n], rel, n + 1)) addFinding(f);
          if (stopped) break;
        }
      } catch {
        stats.filesSkipped++;
        markPartial('A file could not be read safely.');
      } finally {
        await handle?.close();
      }
    }
  }

  function readiness(rule: string, severity: 'low' | 'medium', message: string, action: string): void {
    addFinding({ category: 'readiness', rule, severity, file: '.', message, action });
  }
  if (!rootFiles.has('readme.md')) {
    readiness('missing_readme', 'medium', 'README.md not found at repository root.', 'Document purpose, usage, installation, and limitations.');
  }
  if (![...rootFiles].some(x => /^licen[cs]e(?:\..+)?$/.test(x))) {
    readiness('missing_license', 'medium', 'No LICENSE file found at repository root.', 'Choose and include an appropriate open-source license.');
  }
  if (!rootFiles.has('.gitignore')) {
    readiness('missing_gitignore', 'low', '.gitignore not found at repository root.', 'Exclude local credentials, build outputs, and dependency directories.');
  }
  // Never overstate a clean result if traversal was incomplete.
  const verdict = stats.complete && findings.length === 0 ? 'no_findings_in_scope' : 'review_required';
  return {
    schemaVersion: '2', scanner: 'reposafe-mcp', verdict,
    findings: findings.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || a.rule.localeCompare(b.rule)),
    stats, limitations: LIMITATIONS,
  };
}
