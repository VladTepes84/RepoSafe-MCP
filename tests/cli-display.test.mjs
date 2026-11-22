import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { formatHumanReport } from '../dist/format.js';

const cli = resolve('dist/cli.js');
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 15000 });
const sample = {
  schemaVersion: '2', scanner: 'reposafe-mcp', verdict: 'review_required',
  findings: [
    { category: 'readiness', severity: 'medium', rule: 'medium_rule', file: 'z.txt',
      message: 'Review this configuration.', action: 'Adjust synthetic config.' },
    { category: 'secrets', severity: 'high', rule: 'secret_rule', file: 'a.txt',
      message: 'Synthetic pattern present.', action: 'Rotate synthetic token.' },
    { category: 'privacy', severity: 'low', rule: 'low_rule', file: 'a.txt',
      message: 'Review fake reference.', action: 'Confirm intended disclosure.' },
  ],
  stats: { complete: true, filesScanned: 3, directoriesVisited: 1,
    bytesScanned: 100, filesSkipped: 0, warnings: [] },
  git: { complete: true, historyChecked: true, gitAvailable: true, commitsInspected: 2, warnings: [] },
  limitations: [],
};

test('human default groups findings by severity with remediation, no color required', () => {
  const report = formatHumanReport(sample);
  assert.ok(report.indexOf('SEVERITY  HIGH') < report.indexOf('SEVERITY  MEDIUM'));
  assert.ok(report.indexOf('SEVERITY  MEDIUM') < report.indexOf('SEVERITY  LOW'));
  assert.match(report, /FINDINGS & ACTIONS/);
  assert.match(report, /Action: Rotate synthetic token/);
  assert.doesNotMatch(report, /\u001b\[/);
});

test('compact and file-grouped output preserves high severity while shortening descriptions', () => {
  const report = formatHumanReport(sample, 50, false, { compact: true, groupBy: 'file' });
  assert.ok(report.indexOf('FILE  a.txt') < report.indexOf('FILE  z.txt'));
  assert.doesNotMatch(report, /Reason:|Action:/);
  assert.match(report, /\[HIGH\]/);
});

test('summary mode keeps counts and coverage while hiding individual findings', () => {
  const report = formatHumanReport(sample, 50, false, { summary: true });
  assert.match(report, /high=1/);
  assert.match(report, /Summary view/);
  assert.doesNotMatch(report, /secret_rule|medium_rule|low_rule/);
  assert.match(report, /complete within scanner limits/);
});

test('Git-only incomplete coverage cannot print complete status', () => {
  const report = formatHumanReport({ ...sample, git: { ...sample.git, complete: false } });
  assert.match(report, /INCOMPLETE/);
});

test('CLI honors summary/compact and rejects conflicting and invalid display flags', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reposafe-cli-display-'));
  try {
    await writeFile(join(root, 'README.md'), '# Synthetic\n');
    await writeFile(join(root, 'LICENSE'), 'MIT\n');
    await writeFile(join(root, '.gitignore'), '.env\n');
    const credential = 'ghp_' + 'K'.repeat(36);
    await writeFile(join(root, 'fixture.js'), 'GITHUB_TOKEN=' + credential + '\n');
    const summary = run('scan', '--root', root, '--no-git', '--summary');
    assert.equal(summary.status, 1, summary.stderr);
    assert.match(summary.stdout, /Summary view/);
    assert.doesNotMatch(summary.stdout, /github_token/);
    const compact = run('scan', '--root', root, '--no-git', '--compact', '--group-by', 'file');
    assert.equal(compact.status, 1, compact.stderr);
    assert.match(compact.stdout, /FILE  fixture.js/);
    assert.doesNotMatch(compact.stdout, /Reason:|Action:/);
    assert.ok(!compact.stdout.includes(credential));
    for (const flags of [
      ['--summary', '--compact'], ['--group-by', 'other'], ['--json', '--summary'],
      ['--sarif', '--group-by', 'file'], ['--group-by'],
    ]) {
      const result = run('scan', '--root', root, '--no-git', ...flags);
      assert.equal(result.status, 2, flags.join(' ') + ': ' + result.stderr);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
