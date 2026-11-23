import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { evaluate } from '../scripts/quality-benchmark.mjs';

const finding = (rule, line, category = 'secrets', file = 'src/example.txt') => ({
  category, rule, file, line, severity: 'high',
  message: 'Fixed detector metadata', action: 'Review locally',
});
const report = () => ({
  schemaVersion: '2', scanner: 'reposafe-mcp', verdict: 'review_required',
  findings: [
    finding('github_token', 2),
    finding('generic_secret_assignment', 3),
    { ...finding('git_history_aws_access_key_id', 4, 'history'),
      commit: 'abc123abc123' },
  ],
  stats: { filesScanned: 2, directoriesVisited: 1, bytesScanned: 1234,
    filesSkipped: 0, complete: true, warnings: [] },
  git: { historyChecked: true, commitsInspected: 2, gitAvailable: true,
    complete: true, warnings: [] },
  limitations: [],
});
const labels = () => ({
  schemaVersion: 1, scope: 'working-tree-and-history',
  adjudications: [
    { category: 'secrets', rule: 'github_token', file: 'src/example.txt',
      line: 2, classification: 'true_positive' },
    { category: 'secrets', rule: 'generic_secret_assignment',
      file: 'src/example.txt', line: 3, classification: 'false_positive' },
    { category: 'history', rule: 'git_history_aws_access_key_id',
      file: 'src/example.txt', line: 4, commit: 'abc123abc123',
      classification: 'unverified' },
  ],
  missed: [{ category: 'secrets', rule: 'stripe_secret',
    file: 'src/another.txt', line: 9 }],
});

test('offline benchmark reports per-rule precision, recall, unverified and misses', () => {
  const result = evaluate(report(), labels());
  assert.equal(result.kind, 'REPOSAFE_LOCAL_ADJUDICATION_NOT_INDEPENDENT_AUDIT');
  assert.equal(result.counts.tp, 1);
  assert.equal(result.counts.fp, 1);
  assert.equal(result.counts.fn, 1);
  assert.equal(result.counts.unverified, 1);
  assert.equal(result.precision, 0.5);
  assert.equal(result.recall, 0.5);
  assert.equal(result.coverage.eligibleForFullReview, true);
  assert.equal(result.fullyReviewed, false);
  assert.ok(result.perRule.some(x => x.rule === 'git_history_aws_access_key_id' && x.unverified === 1));
});

test('an adjudicated sample is distinct from a passing performance target', () => {
  const reviewed = labels();
  reviewed.adjudications[2].classification = 'true_positive';
  const result = evaluate(report(), reviewed);
  assert.equal(result.fullyReviewed, true);
  assert.equal(result.precision, 2 / 3);
  assert.equal(result.recall, 2 / 3);
  assert.equal(result.counts.fn, 1);
});

test('incomplete coverage and suppression cannot masquerade as full review', () => {
  const sample = report();
  sample.stats.complete = false;
  sample.stats.findingsOmitted = 12;
  sample.git.complete = false;
  sample.baseline = { entries: 1, suppressed: 1, highSuppressed: 1, expired: 0 };
  const result = evaluate(sample, labels());
  assert.equal(result.coverage.eligibleForFullReview, false);
  assert.equal(result.fullyReviewed, false);
  assert.equal(result.counts.omittedByScanner, 12);
  assert.equal(result.counts.suppressedByBaseline, 1);
});

test('manual labels are strictly reconciled: no invented true positives or false negatives', () => {
  const sample = report();
  const originals = labels();
  const stray = structuredClone(originals);
  stray.adjudications[0].line = 99;
  assert.throws(() => evaluate(sample, stray), /LABEL_WITHOUT_FINDING/);
  const duplicate = structuredClone(originals);
  duplicate.adjudications.push({ ...originals.adjudications[0] });
  assert.throws(() => evaluate(sample, duplicate), /DUPLICATE_ADJUDICATION/);
  const impossibleMiss = structuredClone(originals);
  impossibleMiss.missed = [{ ...originals.adjudications[0] }];
  assert.throws(() => evaluate(sample, impossibleMiss), /MISSED_FINDING_WAS_REPORTED/);
  const duplicateMiss = structuredClone(originals);
  duplicateMiss.missed.push({ ...originals.missed[0] });
  assert.throws(() => evaluate(sample, duplicateMiss), /DUPLICATE_MISSED_FINDING/);
});

test('invalid report schema, scope, non-secret categories and unbounded input are rejected', () => {
  assert.throws(() => evaluate({ ...report(), schemaVersion: '1' }, labels()), /INVALID_REPORT_V2/);
  assert.throws(() => evaluate(report(), { ...labels(), scope: 'unscoped' }), /INVALID_BENCHMARK_LABELS/);
  const badLabels = labels();
  badLabels.missed[0].category = 'privacy';
  assert.throws(() => evaluate(report(), badLabels), /INVALID_FINDING_IDENTITY/);
  const noHistory = report();
  noHistory.git.historyChecked = false;
  const result = evaluate(noHistory, labels());
  assert.equal(result.coverage.eligibleForFullReview, false);
  assert.equal(result.fullyReviewed, false);
});

test('duplicate finding identity is disclosed, not silently credited twice', () => {
  const sample = report();
  sample.findings.push({ ...sample.findings[0] });
  const result = evaluate(sample, labels());
  assert.equal(result.counts.duplicates, 1);
  assert.equal(result.counts.tp, 1);
  assert.equal(result.fullyReviewed, false);
});

test('CLI is offline, outputs aggregates only and never echoes private filenames', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reposafe-quality-'));
  const tool = resolve('scripts/quality-benchmark.mjs');
  const secretPath = 'src/' + 'synthetic-private-token-marker.txt';
  try {
    const sample = report();
    sample.findings[0].file = secretPath;
    const adjudicated = labels();
    adjudicated.adjudications[0].file = secretPath;
    const input = join(dir, 'report.json');
    const labelsFile = join(dir, 'labels.json');
    await writeFile(input, JSON.stringify(sample));
    await writeFile(labelsFile, JSON.stringify(adjudicated));
    const good = spawnSync(process.execPath, [tool, '--report', input, '--labels', labelsFile],
      { encoding: 'utf8', timeout: 5000 });
    assert.equal(good.status, 0, good.stderr);
    const parsed = JSON.parse(good.stdout);
    assert.equal(parsed.counts.tp, 1);
    assert.ok(!good.stdout.includes(secretPath));
    assert.ok(!good.stdout.includes(dir));
    const bad = spawnSync(process.execPath, [tool, '--report', input, '--labels', join(dir, 'missing.json')],
      { encoding: 'utf8', timeout: 5000 });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /UNREADABLE_OR_INVALID_JSON/);
    assert.ok(!bad.stderr.includes(dir));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
