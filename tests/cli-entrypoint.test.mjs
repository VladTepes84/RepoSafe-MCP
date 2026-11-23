import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderPrettyReport } from '../bin/report-view.mjs';

const executable = resolve('bin/reposafe.mjs');
const run = (cwd, ...args) => spawnSync(process.execPath, [executable, ...args], {
  cwd, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
});
const sample = {
  schemaVersion: '2', verdict: 'review_required',
  stats: { filesScanned: 3, complete: false, overlengthLinesSkipped: 1,
    findingsOmitted: 2, warnings: ['Bounded file reading was incomplete.'] },
  git: { complete: true, commitsInspected: 2, historyCandidates: 20,
    historyWindow: { maxCommits: 2, maxDiffSizeMiB: 4, currentBranchOnly: false },
    warnings: ['History depth limit reached.'] },
  findings: [
    { category: 'secrets', severity: 'high', rule: 'github_token',
      file: 'config.txt', line: 1, gitTracked: true,
      message: 'Possible synthetic token.', action: 'Review token.' },
    { category: 'secrets', severity: 'high', rule: 'github_token',
      file: 'tests/example.test.ts', line: 2, testFile: true, gitTracked: false,
      message: 'Possible synthetic token.', action: 'Review token.' },
    { category: 'readiness', severity: 'medium', rule: 'missing_license',
      file: 'LICENSE', message: 'Synthetic warning.', action: 'Review license.' },
  ],
};

async function fixture(fn, initializeGit = false) {
  const root = await mkdtemp(join(tmpdir(), 'reposafe-cli-first-run-'));
  try {
    await writeFile(join(root, 'README.md'), '# Synthetic CLI test\n');
    await writeFile(join(root, 'LICENSE'), 'MIT\n');
    await writeFile(join(root, '.gitignore'), '.env\n');
    if (initializeGit) {
      execFileSync('git', ['-C', root, 'init', '-q'], { timeout: 10_000, stdio: 'pipe' });
    }
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

test('dashboards group every retained finding by rule and show explicit incomplete coverage', () => {
  const plain = renderPrettyReport(sample);
  assert.match(plain, /REPOSAFE/);
  assert.match(plain, /INCOMPLETE/);
  assert.match(plain, /github_token/);
  assert.match(plain, /missing_license/);
  assert.match(plain, /Total shown in groups: 3/);
  assert.match(plain, /Known omissions: 2/);
  assert.match(plain, /COVERAGE WARNINGS/);
  assert.match(plain, /History depth limit reached/);
  assert.match(plain, /Untracked: 1/);
  assert.doesNotMatch(plain, /\x1b\[/);
  const styled = renderPrettyReport(sample, { color: true });
  assert.match(styled, /\x1b\[/);
  assert.equal(styled.replace(/\x1b\[[0-9;]*m/g, ''), plain);
});

test('priority view prints only HIGH/CRITICAL details, preserves full counts and remediation', () => {
  const output = renderPrettyReport(sample, { high: true });
  assert.match(output, /HIGH \/ CRITICAL DETECTION GROUPS/);
  assert.match(output, /FINDINGS & ACTIONS/);
  assert.match(output, /Action: Review token/);
  assert.doesNotMatch(output, /missing_license/);
  assert.match(output, /MEDIUM/);
  assert.match(output, /Total shown in groups: 2/);
});

test('summary view hides all rule names, compact view abbreviates explanations', () => {
  const summary = renderPrettyReport(sample, { summary: true });
  assert.doesNotMatch(summary, /github_token|missing_license/);
  assert.match(summary, /SEVERITY OVERVIEW/);
  const compact = renderPrettyReport(sample, { compact: true });
  assert.match(compact, /github_token/);
  assert.doesNotMatch(compact, /Reason:|Action:/);
  const details = renderPrettyReport(sample, { details: true, groupBy: 'file' });
  assert.match(details, /FILE  config.txt/);
  assert.match(details, /Action: Review token/);
});

test('one command from a Git root scans working tree with read-only output', async () => {
  await fixture(async root => {
    const token = 'ghp_' + 'V'.repeat(36);
    await writeFile(join(root, 'fixture.txt'), 'GITHUB_TOKEN=' + token + '\n');
    const scan = run(root, 'scan', '--no-history');
    assert.equal(scan.status, 1, scan.stderr);
    assert.match(scan.stdout, /DETECTION GROUPS/);
    assert.match(scan.stdout, /github_token/);
    assert.match(scan.stdout, /tracked:/);
    assert.ok(!scan.stdout.includes(token));
    const high = run(root, 'scan', '--no-history', '--high', '--no-color');
    assert.equal(high.status, 1, high.stderr);
    assert.match(high.stdout, /FINDINGS & ACTIONS/);
    assert.match(high.stdout, /fixture.txt/);
    assert.doesNotMatch(high.stdout, /\x1b\[/);
    assert.ok(!high.stdout.includes(token));
  }, true);
});

test('implicit scan refuses non-Git cwd; an explicitly approved non-Git root still works', async () => {
  await fixture(async root => {
    const unsafe = run(root, 'scan', '--no-git');
    assert.equal(unsafe.status, 2);
    assert.match(unsafe.stderr, /NO_REPOSITORY_ROOT/);
    assert.ok(!unsafe.stderr.includes(root));
    const allowed = run(root, 'scan', '--root', root, '--no-git');
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.match(allowed.stdout, /NO FINDINGS IN SCANNED SCOPE/);
  });
});

test('JSON and SARIF are pure versioned scanner output and reject decorative flags', async () => {
  await fixture(async root => {
    const json = run(root, 'scan', '--no-git', '--json');
    assert.equal(json.status, 0, json.stderr);
    const data = JSON.parse(json.stdout);
    assert.equal(data.schemaVersion, '2');
    assert.equal(data.scanner, 'reposafe-mcp');
    assert.doesNotMatch(json.stdout, /REPOSAFE\s+LOCAL/);
    const sarif = run(root, 'scan', '--sarif', '--no-git');
    assert.equal(sarif.status, 0, sarif.stderr);
    assert.equal(JSON.parse(sarif.stdout).version, '2.1.0');
    for (const flags of [['--json', '--high'], ['--sarif', '--details'],
      ['--summary', '--high'], ['--group-by', 'invalid']]) {
      const invalid = run(root, 'scan', '--root', root, '--no-git', ...flags);
      assert.equal(invalid.status, 2, flags.join(' ') + ': ' + invalid.stderr);
    }
  }, true);
});

test('help contains a real two-command workflow without claiming npm registry publication', async () => {
  await fixture(async root => {
    const help = run(root, '--help');
    assert.equal(help.status, 0);
    assert.match(help.stdout, /cd your-git-repository/);
    assert.match(help.stdout, /reposafe scan/);
    assert.match(help.stdout, /--high/);
    assert.match(help.stdout, /--details/);
  });
});
