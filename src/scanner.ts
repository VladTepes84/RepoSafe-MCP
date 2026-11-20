import { constants } from 'node:fs';
import { open, readdir, realpath, stat, lstat } from 'node:fs/promises';
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
  '.git', 'node_modules', 'coverage', '.next',
  '.venv', 'venv', '__pycache__', '.turbo', '.cache',
]);
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip',
  '.gz', '.tar', '.7z', '.exe', '.dll', '.so', '.dylib', '.mp3',
  '.mp4', '.mov', '.woff', '.woff2', '.ttf', '.otf', '.db', '.sqlite',
]);
const LIMITATIONS = [
  'Heuristic checks; false negatives and false positives are possible.',
  'Scans current local files only, not Git history, branches, commits, or remote repository settings.',
  'Symlinks, hard-linked files, binary files, dependency/cache directories, and oversized files are skipped. dist/build/vendor ARE scanned.',
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
    name: 'openai_key', pattern: /\bsk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/,
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
  {
    name: 'sendgrid_api_key', pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
    severity: 'high', message: 'Possible SendGrid API key.',
    action: 'Revoke/rotate the SendGrid key and move it into a secrets manager.',
  },
  {
    name: 'npm_access_token', pattern: /\bnpm_[A-Za-z0-9_-]{24,}\b/,
    severity: 'high', message: 'Possible npm access token.',
    action: 'Revoke the token and use protected npm authentication configuration.',
  },
  {
    name: 'jwt_token', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b/,
    severity: 'high', message: 'Possible signed JSON Web Token (JWT).',
    action: 'Treat a real authentication JWT as exposed; revoke or expire its access.',
  },

  {
    name: 'gitlab_token', pattern: /\bglpat-[A-Za-z0-9_-]{16,}\b/,
    severity: 'high', message: 'Possible GitLab personal access token.',
    action: 'Revoke or rotate the GitLab token and use a protected secret store.',
  },
  {
    name: 'huggingface_token', pattern: /\bhf_[A-Za-z0-9]{30,}\b/,
    severity: 'high', message: 'Possible Hugging Face access token.',
    action: 'Revoke/rotate the Hugging Face token and use a protected secret store.',
  },
  {
    name: 'digitalocean_token', pattern: /\b(?:dop|doo|dor)_v1_[A-Za-z0-9]{32,}\b/,
    severity: 'high', message: 'Possible DigitalOcean access token.',
    action: 'Revoke/rotate the DigitalOcean token and check account activity.',
  },
  {
    name: 'twilio_api_key_sid', pattern: /\bSK[a-fA-F0-9]{32}\b/,
    severity: 'medium', message: 'Possible Twilio API key SID (identifier, not necessarily its secret).',
    action: 'Review whether the associated Twilio API key secret is exposed.',
  },
  {
    name: 'slack_webhook', pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]{8,}\/[A-Za-z0-9]{8,}\/[A-Za-z0-9]{16,}/i,
    severity: 'high', message: 'Possible Slack incoming webhook URL.',
    action: 'Rotate the Slack webhook if exposed and remove it from source code.',
  },
  {
    name: 'discord_webhook', pattern: /https:\/\/(?:discord(?:app)?\.com)\/api\/webhooks\/[0-9]{15,22}\/[A-Za-z0-9_-]{20,}/i,
    severity: 'high', message: 'Possible Discord incoming webhook URL.',
    action: 'Delete or rotate the webhook and use protected configuration.',
  },
  {
    name: 'azure_storage_key', pattern: /\bAccountKey=[A-Za-z0-9+/]{60,}={0,2}/,
    severity: 'high', message: 'Possible Azure Storage account key in connection configuration.',
    action: 'Rotate the Azure Storage key and use managed identity or secure configuration.',
  },
  {
    name: 'gcp_service_account_private_key', pattern: /["']private_key["']\s*:\s*["']-----BEGIN (?:RSA )?PRIVATE KEY-----/,
    severity: 'high', message: 'Possible GCP service account private key in JSON configuration.',
    action: 'Revoke the service account key and use workload identity or a secret store.',
  },
];

// Fixed-width key token + one suffix check prevents regex backtracking on long underscore sequences.
const GENERIC_ASSIGNMENT = /(?:^|[\s"'{,])([A-Za-z][A-Za-z0-9_-]{0,95})\s*["']?\s*[:=]\s*["']?([^\s,'";#}]{8,})/i;
const SENSITIVE_KEY = /(?:^|[_-])(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?access[_-]?key|secret[_-]?key|password|passwd|secret|token)$/i;
const EXAMPLE_VALUE = /^(?:\$\{|\$|<|\{|example|sample|dummy|test|change[_-]?me|replace|your[_-]?|placeholder|undefined|null|none|process\.|env\.|os\.environ)/i;

function shannonEntropy(value: string): number {
  if (!value) return 0;
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// Deliberately ignore the matched value in all output. Findings contain metadata only.
export function checkSecrets(line: string, file: string, lineNumber: number, category: 'secrets' | 'history' = 'secrets'): Finding[] {
  const findings: Finding[] = [];
  for (const rule of SECRET_RULES) {
    if (rule.name === 'private_key_block' && SECRET_RULES.some(r => r.name === 'gcp_service_account_private_key' && r.pattern.test(line))) continue;
    if (rule.pattern.test(line)) {
      findings.push({
        category, rule: rule.name, severity: rule.severity,
        file, line: lineNumber, message: rule.message, action: rule.action,
      });
    }
  }
  // Provider-specific matches take precedence over a generic finding for the same value.
  const match = GENERIC_ASSIGNMENT.exec(line);
  if (match && SENSITIVE_KEY.test(match[1]) && !EXAMPLE_VALUE.test(match[2]) &&
      !SECRET_RULES.some(rule => rule.pattern.test(match[2]))) {
    findings.push({
      category, rule: 'generic_secret_assignment', severity: 'medium',
      file, line: lineNumber, message: 'Possible hardcoded credential assignment.',
      action: 'Review this assignment; move real credentials to protected configuration.',
    });
  }

  // .npmrc often contains an unprefixed secret, e.g. //registry.npmjs.org/:_authToken=...
  const npmAuth = /(?:^|[:\s])_authToken\s*=\s*["']?([^\s"'#;]{12,})/i.exec(line);
  if (npmAuth && !EXAMPLE_VALUE.test(npmAuth[1]) &&
      !SECRET_RULES.some(rule => rule.pattern.test(npmAuth[1]))) {
    findings.push({
      category, rule: 'npmrc_auth_token', severity: 'high', file, line: lineNumber,
      message: 'Possible npm registry authentication token.',
      action: 'Revoke/rotate the token, do not commit .npmrc credentials, and use CI secrets.',
    });
  }

  // Generic database and broker URI userinfo; preserve the Postgres rule for compatibility.
  // A URL without a password is not a secret. Parsing is bounded by MAX_LINE_CHARS.
  const databaseUri = /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis(?:s)?|amqp(?:s)?):\/\/[^\s"'<>]+/i.exec(line)?.[0];
  if (databaseUri) {
    try {
      const url = new URL(databaseUri.replace(/[),;]+$/, ''));
      const password = decodeURIComponent(url.password);
      if (url.username && password && !EXAMPLE_VALUE.test(password)) {
        const postgres = url.protocol === 'postgres:' || url.protocol === 'postgresql:';
        findings.push({
          category, rule: postgres ? 'postgres_connection_password' : 'database_uri_password',
          severity: 'high', file, line: lineNumber,
          message: postgres ? 'PostgreSQL URI contains embedded authentication credentials.' : 'Database or broker URI contains embedded authentication credentials.',
          action: 'Rotate the exposed credential and supply connection configuration securely.',
        });
      }
    } catch { /* Invalid URI; do not return contents or claim it was scanned. */ }
  }

  // Conservative entropy check for unknown bearer credentials; don't duplicate a named token.
  const bearer = /\bBearer\s+([A-Za-z0-9._~+/-]{24,}={0,2})\b/i.exec(line)?.[1];
  if (bearer && !EXAMPLE_VALUE.test(bearer) && !SECRET_RULES.some(rule => rule.pattern.test(bearer)) &&
      shannonEntropy(bearer) >= 3.5) {
    findings.push({
      category, rule: 'high_entropy_bearer', severity: 'medium', file, line: lineNumber,
      message: 'Possible high-entropy bearer credential.',
      action: 'Verify whether this is a live authorization credential and rotate it if exposed.',
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
  if (SECRET_RULES.some(rule => rule.pattern.test(normalized)) || /(?:password|token|secret|key)[=:][^/\\]{8,}/i.test(normalized) || /(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?):\/\/[^/\\\s]+:[^@/\\\s]+@/i.test(normalized) || /_authToken=[^/\\\s]{8,}/i.test(normalized)) {
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

/** Inspect ONLY exact tracked paths in normally skipped dependency/cache directories.
 * A Git path is untrusted input; each parent component is lstat-checked before opening.
 * Individual files are read within strict resource budgets. Nothing is executed or written.
 */
export async function scanSelectedTrackedFiles(approvedRoot: string, names: string[]): Promise<{
  findings: Finding[]; filesScanned: number; bytesScanned: number; complete: boolean; warnings: string[];
}> {
  const root = await validateRoot(approvedRoot);
  const findings: Finding[] = [];
  const warnings: string[] = [];
  let filesScanned = 0;
  let bytesScanned = 0;
  let complete = true;
  const mark = (reason: string): void => { complete = false; if (!warnings.includes(reason)) warnings.push(reason); };
  if (names.length > MAX_FILES) mark('Too many tracked excluded files to scan completely.');
  const selected = names.slice(0, MAX_FILES);
  for (const name of selected) {
    if (findings.length >= MAX_FINDINGS) { mark('Tracked file finding limit reached.'); break; }
    // Reject traversal, absolute paths, Git metadata, Windows separators and strange path components.
    const segments = name.split('/');
    if (!name || name.includes('\\') || isAbsolute(name) || segments.some(p => !p || p === '.' || p === '..' || p === '.git') ||
        segments.length > MAX_DEPTH + 2) {
      mark('A tracked file had an unsafe or excessively deep path.');
      continue;
    }
    const abs = join(root, ...segments);
    if (!contained(root, abs)) { mark('A tracked file resolved outside the approved root.'); continue; }
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      let cursor = root;
      for (const [index, part] of segments.entries()) {
        cursor = join(cursor, part);
        const st = await lstat(cursor);
        if (st.isSymbolicLink()) throw new Error('Symbolic link not allowed.');
        if (index < segments.length - 1 && !st.isDirectory()) throw new Error('Parent is not a directory.');
        if (index === segments.length - 1 && !st.isFile()) throw new Error('Not a regular file.');
      }
      if (!contained(root, await realpath(abs))) throw new Error('Escaped scope.');
      if (BINARY_EXTENSIONS.has(fileExtension(name))) throw new Error('Binary/unsupported tracked file.');
      handle = await open(abs, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const st = await handle.stat();
      if (!st.isFile() || st.nlink > 1) throw new Error('Unsafe tracked file type or hardlink.');
      if (st.size > MAX_FILE_BYTES || bytesScanned + st.size > MAX_BYTES) {
        mark('Tracked file size or total byte limit reached.');
        continue;
      }
      const buf = await handle.readFile();
      if (buf.includes(0)) { mark('Binary tracked file could not be examined.'); continue; }
      filesScanned++;
      bytesScanned += buf.byteLength;
      const lines = buf.toString('utf8').split(/\r?\n/);
      for (const [n, line] of lines.entries()) {
        if (line.length > MAX_LINE_CHARS) { mark('A tracked file line exceeded the analysis length limit.'); continue; }
        for (const finding of [...checkSecrets(line, name, n + 1), ...checkPrivacy(line, name, n + 1)]) {
          if (findings.length >= MAX_FINDINGS) { mark('Tracked file finding limit reached.'); break; }
          findings.push({ ...finding, file: safeRelativePath(finding.file) });
        }
      }
    } catch {
      mark('One or more tracked files could not be read safely.');
    } finally { await handle?.close(); }
  }
  return { findings, filesScanned, bytesScanned, complete, warnings };
}
