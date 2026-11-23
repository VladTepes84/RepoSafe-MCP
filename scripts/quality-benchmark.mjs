#!/usr/bin/env node
// Offline adjudication of RepoSafe JSON v2 findings. Never scans a repository,
// invokes a third-party binary, sends network requests, or prints input paths.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_ENTRIES = 10000;
const VALID_CLASSES = new Set(['true_positive', 'false_positive', 'unverified']);
const VALID_CATEGORIES = new Set(['secrets', 'history']);
const KNOWN_RULES = new Set([
  'private_key_block', 'aws_access_key_id', 'github_token', 'openai_key',
  'anthropic_key', 'stripe_secret', 'google_api_key', 'slack_token',
  'sendgrid_api_key', 'npm_access_token', 'jwt_token', 'gitlab_token',
  'huggingface_token', 'digitalocean_token', 'twilio_api_key_sid',
  'slack_webhook', 'discord_webhook', 'azure_storage_key',
  'gcp_service_account_private_key', 'generic_secret_assignment',
  'structured_config_secret', 'npmrc_auth_token',
  'postgres_connection_password', 'database_uri_password',
  'high_entropy_bearer', 'terraform_sensitive_default',
  'kubernetes_encoded_secret',
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function identity(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item) ||
      !VALID_CATEGORIES.has(item.category) ||
      typeof item.rule !== 'string' || item.rule.length < 1 || item.rule.length > 128 ||
      typeof item.file !== 'string' || item.file.length < 1 || item.file.length > 512 ||
      (item.line !== undefined && (!Number.isInteger(item.line) || item.line < 1)) ||
      (item.commit !== undefined && (typeof item.commit !== 'string' ||
        !/^[a-f0-9]{12}$/.test(item.commit)))) {
    fail('INVALID_FINDING_IDENTITY');
  }
  // Only structural fields enter the key. No source lines or matched tokens.
  return JSON.stringify([item.category, item.rule, item.file,
    item.line ?? null, item.commit ?? null]);
}

function displayedRule(name) {
  const underlying = name.startsWith('git_history_') ? name.slice(12) : name;
  if (!KNOWN_RULES.has(underlying)) return 'other_rule';
  return name.startsWith('git_history_') ? 'git_history_' + underlying : underlying;
}

function requiredArray(data, field) {
  if (!Array.isArray(data?.[field]) || data[field].length > MAX_ENTRIES) {
    fail('INVALID_BENCHMARK_LABELS');
  }
  return data[field];
}

function fraction(num, den) {
  return den === 0 ? null : Math.round((num / den) * 10000) / 10000;
}

/** Aggregate only; no filenames, line numbers, commit IDs or values in output. */
export function evaluate(report, labels) {
  if (!report || report.schemaVersion !== '2' || report.scanner !== 'reposafe-mcp' ||
      !report.stats || typeof report.stats.complete !== 'boolean' ||
      !Array.isArray(report.findings) || report.findings.length > 5000 ||
      !['review_required', 'no_findings_in_scope'].includes(report.verdict)) {
    fail('INVALID_REPORT_V2');
  }
  if (!labels || labels.schemaVersion !== 1 ||
      !['working-tree', 'working-tree-and-history'].includes(labels.scope)) {
    fail('INVALID_BENCHMARK_LABELS');
  }

  const reported = new Map();
  let duplicates = 0;
  for (const finding of report.findings) {
    if (!VALID_CATEGORIES.has(finding.category)) continue;
    const key = identity(finding);
    if (reported.has(key)) duplicates++;
    else reported.set(key, finding);
  }

  const adjudications = requiredArray(labels, 'adjudications');
  const missed = requiredArray(labels, 'missed');
  const decisions = new Map();
  for (const decision of adjudications) {
    if (!VALID_CLASSES.has(decision?.classification)) fail('INVALID_BENCHMARK_LABELS');
    const key = identity(decision);
    if (decisions.has(key)) fail('DUPLICATE_ADJUDICATION');
    if (!reported.has(key)) fail('LABEL_WITHOUT_FINDING');
    decisions.set(key, decision.classification);
  }

  const missedKeys = new Set();
  for (const item of missed) {
    const key = identity(item);
    if (reported.has(key)) fail('MISSED_FINDING_WAS_REPORTED');
    if (missedKeys.has(key)) fail('DUPLICATE_MISSED_FINDING');
    missedKeys.add(key);
  }

  const groups = new Map();
  const group = name => {
    const safe = displayedRule(name);
    if (!groups.has(safe)) groups.set(safe, { rule: safe, tp: 0, fp: 0, fn: 0, unverified: 0 });
    return groups.get(safe);
  };
  let tp = 0, fp = 0, fn = 0, unverified = 0;
  for (const [key, finding] of reported) {
    const classification = decisions.get(key) ?? 'unverified';
    const bucket = group(finding.rule);
    if (classification === 'true_positive') { tp++; bucket.tp++; }
    else if (classification === 'false_positive') { fp++; bucket.fp++; }
    else { unverified++; bucket.unverified++; }
  }
  for (const item of missed) { fn++; group(item.rule).fn++; }

  const omissions = report.stats.findingsOmitted ?? 0;
  const suppressed = report.baseline?.suppressed ?? 0;
  const complete = report.stats.complete === true &&
    (labels.scope === 'working-tree' ||
      (report.git?.historyChecked === true && report.git.complete === true)) &&
    omissions === 0 && suppressed === 0;
  const adjudicated = tp + fp;
  const fullyReviewed = unverified === 0 && duplicates === 0 && complete;
  return {
    kind: 'REPOSAFE_LOCAL_ADJUDICATION_NOT_INDEPENDENT_AUDIT',
    scope: labels.scope,
    counts: { reportedUnique: reported.size, adjudicated, tp, fp, fn,
      unverified, duplicates, omittedByScanner: omissions, suppressedByBaseline: suppressed },
    precision: fraction(tp, tp + fp),
    recall: fraction(tp, tp + fn),
    coverage: { workingTreeComplete: report.stats.complete,
      gitHistoryChecked: report.git?.historyChecked ?? false,
      gitComplete: report.git?.complete ?? null, eligibleForFullReview: complete },
    fullyReviewed,
    perRule: [...groups.values()].sort((a, b) => a.rule.localeCompare(b.rule)),
    limitations: 'Labels require independent manual adjudication. Unverified findings and incomplete scans invalidate release acceptance. These metrics apply only to the selected authorized sample.',
  };
}

function readJson(file) {
  let contents;
  try {
    const raw = readFileSync(file);
    if (raw.byteLength > MAX_INPUT_BYTES) fail('INPUT_TOO_LARGE');
    contents = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    if (error?.code === 'INPUT_TOO_LARGE') throw error;
    fail('UNREADABLE_OR_INVALID_JSON');
  }
  return contents;
}

function main(argv) {
  if (argv.length !== 4 || argv[0] !== '--report' || argv[2] !== '--labels' ||
      !argv[1] || !argv[3] || argv[1] === argv[3]) {
    fail('USAGE_EXPECTED_REPORT_AND_LABELS');
  }
  const result = evaluate(readJson(argv[1]), readJson(argv[3]));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    // Error codes are fixed strings: never echo filenames or input contents.
    const code = /^[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'BENCHMARK_FAILED';
    process.stderr.write('RepoSafe quality benchmark: ' + code + '\n');
    process.exitCode = 2;
  }
}
