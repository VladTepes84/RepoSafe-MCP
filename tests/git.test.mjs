import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateReport, scanGit } from '../dist/git.js';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {
  stdio: 'pipe', timeout: 8000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
}).toString();

async function withGitRepo(run) {
  const root = await mkdtemp(join(tmpdir(), 'reposafe-history-'));
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.name', 'Synthetic Test');
    git(root, 'config', 'user.email', 'synthetic@example.invalid');
    await writeFile(join(root, 'README.md'), '# Synthetic app\n');
    await writeFile(join(root, 'LICENSE'), 'MIT\n');
    await writeFile(join(root, '.gitignore'), '.env\n.env.*\n');
    return await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('detects deleted credential remaining in committed Git history without exposing its bytes', async () => {
  await withGitRepo(async root => {
    const token = 'ghp_' + 'Z'.repeat(36);
    await writeFile(join(root, 'src.txt'), `GITHUB_TOKEN=${token}\n`);
    git(root, 'add', 'README.md', 'LICENSE', '.gitignore', 'src.txt');
    git(root, 'commit', '-qm', 'first commit');
    await writeFile(join(root, 'src.txt'), 'const token = process.env.GITHUB_TOKEN;\n');
    git(root, 'add', 'src.txt');
    git(root, 'commit', '-qm', 'remove token');
    const report = await generateReport(root);
    assert.equal(report.git.historyChecked, true);
    assert.ok(report.git.commitsInspected >= 2);
    assert.ok(report.findings.some(x => x.rule === 'git_history_github_token'));
    assert.ok(!JSON.stringify(report).includes(token));
  });
});

test('flags tracked .env and uses Git ignore semantics, not mere .gitignore presence', async () => {
  await withGitRepo(async root => {
    await writeFile(join(root, '.gitignore'), 'node_modules/\n');
    await writeFile(join(root, '.env'), 'PASSWORD=synthetic_value_abcdefgh\n');
    git(root, 'add', '-f', '.env');
    const gitReport = await scanGit(root, false);
    assert.ok(gitReport.findings.some(x => x.rule === 'tracked_sensitive_file'));
    assert.ok(gitReport.findings.some(x => x.rule === 'env_not_gitignored'));
    assert.ok(!JSON.stringify(gitReport).includes('synthetic_value_abcdefgh'));
  });
});

test('does not read a parent Git repository when scoped to nested directory', async () => {
  await withGitRepo(async root => {
    const nested = join(root, 'nested');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(nested);
    const outcome = await scanGit(nested, true);
    assert.equal(outcome.stats.complete, false);
    assert.ok(outcome.stats.warnings.some(x => x.includes('differs')));
  });
});

test('Git history with no commits can still be inspected; explicit opt-out is recorded', async () => {
  await withGitRepo(async root => {
    const report = await scanGit(root, false);
    assert.equal(report.stats.historyChecked, false);
    assert.ok(report.stats.warnings.some(x => x.includes('disabled')));
  });
});
