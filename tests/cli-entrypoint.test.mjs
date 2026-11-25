import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderPrettyReport } from '../bin/report-view.mjs';
import { reviewLauncher } from '../bin/review-command.mjs';

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

test('severity filter selects exactly one severity while retaining total counts', () => {
  const output = renderPrettyReport(sample, { severity: 'medium' });
  assert.match(output, /MEDIUM DETECTION GROUPS/);
  assert.match(output, /missing_license/);
  assert.doesNotMatch(output, /github_token/);
  assert.match(output, /Total shown in groups: 1 \(filtered; full counts above\)/);
});

test('severity filtering is accepted by the CLI and invalid combinations fail', async () => {
  await fixture(async root => {
    await writeFile(join(root, 'fixture.txt'), 'GITHUB_TOKEN=ghp_' + 'V'.repeat(36) + '\n');
    const result = run(root, 'scan', '--no-history', '--severity', 'high', '--no-color');
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /Filtered findings:/);
    assert.match(result.stdout, /github_token/);
    for (const flags of [['--severity', 'invalid'], ['--severity', 'high', '--high'],
      ['--severity', 'high', '--json'], ['--severity', 'high', '--severity', 'low']]) {
      assert.equal(run(root, 'scan', '--no-history', ...flags).status, 2);
    }
  }, true);
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

test('private-prefix Next Actions reuse the executable without exposing the home path', () => {
  const home = join('synthetic home with spaces', 'private example');
  const script = join(home, '.reposafe', 'node_modules', 'reposafe-mcp', 'bin', 'reposafe.mjs');
  const mac = reviewLauncher(script, home, 'darwin');
  assert.equal(mac, '"$HOME/.reposafe/node_modules/.bin/reposafe"');
  assert.equal(reviewLauncher(script, home, 'linux'), mac);
  const windows = reviewLauncher(script, home, 'win32');
  assert.equal(windows, 'reposafe.cmd');
  assert.ok(!mac.includes(home) && !windows.includes(home));
  assert.equal(reviewLauncher(join(home, 'unrelated', 'bin', 'reposafe.mjs'), home), 'reposafe');
  const output = renderPrettyReport(sample, {
    reviewCommand: mac + ' scan https://github.com/octocat/Hello-World',
    remoteSource: { url: 'https://github.com/octocat/Hello-World', sha: 'a'.repeat(40) },
  });
  assert.match(output, /"\$HOME\/\.reposafe\/node_modules\/\.bin\/reposafe" scan https:\/\/github\.com\/octocat\/Hello-World --high/);
  assert.ok(!output.includes(home));
});

test('Windows private-prefix commands include complete CMD and PowerShell alternatives', () => {
  const output = renderPrettyReport(sample, { windowsPrivate: true,
    reviewCommand: 'reposafe.cmd scan https://github.com/octocat/Hello-World' });
  assert.match(output, /CMD: "%USERPROFILE%\\\.reposafe\\node_modules\\\.bin\\reposafe\.cmd" scan https:\/\/github\.com\/octocat\/Hello-World --high/);
  assert.match(output, /PowerShell: & "\$HOME\\\.reposafe\\node_modules\\\.bin\\reposafe\.cmd" scan https:\/\/github\.com\/octocat\/Hello-World --high/);
});

test('Next Actions include numbered, scoped priority/file/coverage commands', () => {
  const output = renderPrettyReport(sample, {
    reviewCommand: 'reposafe scan --no-history',
  });
  assert.match(output, /1\. PRIORITY — Review 2 CRITICAL\/HIGH findings/);
  assert.match(output, /reposafe scan --no-history --high/);
  assert.match(output, /2\. BY FILE — Inspect 3 findings grouped by relative file path/);
  assert.match(output, /reposafe scan --no-history --details --group-by file/);
  assert.match(output, /3\. SEVERITY/);
  assert.match(output, /4\. COVERAGE — Audit incomplete/);
  assert.match(output, /not cached between runs/);
  assert.doesNotMatch(output, /Tip: reposafe scan/);
  const unavailable = renderPrettyReport({
    ...sample, git: { ...sample.git, gitAvailable: false }
  }, { reviewCommand: 'reposafe scan --root ABSOLUTE_PATH --no-git',
    explicitRoot: true });
  assert.match(unavailable, /Git status was not inspected/);
  assert.match(unavailable, /change directory to the same approved scan directory/);
  assert.ok(!unavailable.includes('/Users/'));
  const nothing = renderPrettyReport({
    ...sample, verdict: 'no_findings_in_scope',
    findings: [], stats: { ...sample.stats, complete: true, warnings: [] },
    git: { ...sample.git, complete: true, warnings: [] },
  });
  assert.match(nothing, /No recognized findings in the inspected scope/);
  assert.doesNotMatch(nothing, /2\. BY FILE/);
});

test('CLI preserves no-history and explicit-root scope in Next Actions without exposing root', async () => {
  await fixture(async root => {
    // Ensure the priority view actually has a synthetic HIGH finding to display.
    await writeFile(join(root, 'synthetic-credential.txt'),
      'GITHUB_TOKEN=ghp_' + 'P'.repeat(36) + '\n');
    const report = run(root, 'scan', '--root', root, '--no-history', '--high', '--no-color');
    assert.equal(report.status, 1, report.stderr);
    assert.match(report.stdout, /reposafe scan --no-history --high --root/);
    assert.match(report.stdout, /reposafe scan --no-history --details --group-by file --root/);
    assert.match(report.stdout, /change directory to the same approved scan directory/);
    assert.ok(!report.stdout.includes(root));
  }, true);
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

test('internal progress emits real numeric file and Git stages without leaking paths or token values', async () => {
  await fixture(async root => {
    const dummy = 'ghp_' + 'Y'.repeat(36);
    await writeFile(join(root, 'synthetic.txt'), 'GITHUB_TOKEN=' + dummy + '\n');
    for (let i = 0; i < 60; i++) {
      await writeFile(join(root, 'fixture-' + i + '.txt'), 'fixture entry ' + i + '\n');
    }
    const engine = resolve('dist/cli.js');
    const result = spawnSync(process.execPath, [
      engine, 'scan', '--root', root, '--no-history', '--json'
    ], { encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, REPOSAFE_INTERNAL_PROGRESS: '1' } });
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.schemaVersion, '2');
    assert.equal(report.scanner, 'reposafe-mcp');
    const lines = result.stderr.trim().split('\n');
    assert.ok(lines.length >= 4, result.stderr);
    const updates = lines.map(line => {
      assert.ok(line.startsWith('REPOSAFE_PROGRESS '), 'Only aggregate progress is expected');
      const event = JSON.parse(line.slice('REPOSAFE_PROGRESS '.length));
      assert.deepEqual(Object.keys(event).sort(), ['directoriesVisited','filesScanned','phase']);
      assert.ok(['files', 'git', 'finalizing'].includes(event.phase));
      assert.ok(Number.isSafeInteger(event.filesScanned) && event.filesScanned >= 0);
      assert.ok(Number.isSafeInteger(event.directoriesVisited) && event.directoriesVisited >= 0);
      return event;
    });
    assert.equal(updates[0].phase, 'files');
    assert.ok(updates.some(event => event.phase === 'files' && event.filesScanned >= 60));
    assert.ok(updates.some(event => event.phase === 'git'));
    assert.equal(updates.at(-1).phase, 'finalizing');
    assert.ok(!result.stderr.includes(dummy));
    assert.ok(!result.stderr.includes(root));
    assert.ok(!result.stdout.includes(dummy));
    const normal = run(root, 'scan', '--no-history', '--json');
    assert.equal(normal.status, 1, normal.stderr);
    assert.doesNotMatch(normal.stdout, /REPOSAFE_PROGRESS|\x1b\[/);
    assert.doesNotMatch(normal.stderr, /REPOSAFE_PROGRESS/);
    assert.equal(JSON.parse(normal.stdout).schemaVersion, '2');
  }, true);
});
