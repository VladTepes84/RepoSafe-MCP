import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { historyCheckpoint } from '../dist/history-checkpoint.js';
import { scanGit } from '../dist/git.js';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args],
  { encoding: 'utf8', stdio: 'pipe', timeout: 10000 });

test('opt-in history cache is private, bounded, and rejects poisoned metadata', async () => {
  const key = createHash('sha256').update(randomUUID()).digest('hex');
  const file = join(homedir(), '.reposafe', 'checkpoints', key + '.json');
  try {
    const cache = await historyCheckpoint(key);
    assert.equal(await cache.load(), undefined);
    const snapshot = { version: 1, key, commits: 2, batches: 1,
      findings: [{ category: 'history', rule: 'git_history_test', severity: 'high',
        file: 'synthetic.txt', commit: '123456789abc', message: 'Possible synthetic credential.',
        action: 'Review and rotate synthetic credential.' }],
      warnings: [], complete: true, updatedAt: Date.now() };
    await cache.save(snapshot);
    assert.deepEqual(await cache.load(), snapshot);
    if (process.platform !== 'win32') {
      assert.equal((await stat(file)).mode & 0o077, 0);
    }
    const serialized = await readFile(file, 'utf8');
    assert.ok(!serialized.includes('ghp_' + 'X'.repeat(36)));
    await writeFile(file, JSON.stringify({ ...snapshot, findings: [
      { ...snapshot.findings[0], value: 'synthetic forbidden value' },
    ] }), { mode: 0o600 });
    await assert.rejects(cache.load(), /validation/);
    await writeFile(file, JSON.stringify({ ...snapshot,
      updatedAt: Date.now() + 24 * 60 * 60 * 1000 }), { mode: 0o600 });
    await assert.rejects(cache.load(), /validation/, 'future timestamps must not prolong cache validity');
  } finally { await unlink(file).catch(() => {}); }
});

test('explicit Git resume reuses completed commits, and changed refs invalidate the checkpoint', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'reposafe-checkpoint-history-'));
  const paths = new Set();
  const limits = { depth: 10, maxDiffSizeMiB: 4, currentBranchOnly: false, since: '', resume: true };
  const checkpointPath = () => {
    const refs = git(root, 'show-ref', '--head');
    const key = createHash('sha256').update(JSON.stringify([realpathSync(root), refs, limits])).digest('hex');
    return join(homedir(), '.reposafe', 'checkpoints', key + '.json');
  };
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.name', 'Synthetic');
    git(root, 'config', 'user.email', 'test@example.invalid');
    await writeFile(join(root, 'README.md'), '# Synthetic fixture\n');
    await writeFile(join(root, 'LICENSE'), 'MIT\n');
    await writeFile(join(root, '.gitignore'), '.env\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'synthetic baseline');
    const fake = 'ghp_' + 'X'.repeat(36);
    await writeFile(join(root, 'token.txt'), 'GITHUB_TOKEN=' + fake + '\n');
    git(root, 'add', 'token.txt');
    git(root, 'commit', '-qm', 'synthetic token');
    await writeFile(join(root, 'token.txt'), 'clean\n');
    git(root, 'add', 'token.txt');
    git(root, 'commit', '-qm', 'remove synthetic token');
    paths.add(checkpointPath());
    const initial = await scanGit(root, true, limits);
    assert.equal(initial.stats.commitsInspected, 3);
    assert.ok(initial.findings.some(f => f.rule === 'git_history_github_token'));
    const repeat = await scanGit(root, true, limits);
    assert.equal(repeat.stats.historyResumedFrom, 3);
    assert.equal(repeat.stats.commitsInspected, 3);
    // Persisted JSON omits optional undefined fields; compare serialized metadata.
    assert.deepEqual(JSON.parse(JSON.stringify(repeat.findings)),
      JSON.parse(JSON.stringify(initial.findings)));
    assert.ok(!JSON.stringify(repeat).includes(fake));
    // This new Node process simulates a restarted CLI and must reuse only the
    // validated metadata-only checkpoint, never local source or raw Git patches.
    const child = spawnSync(process.execPath, [resolve('dist/cli.js'),
      'scan', '--root', root, '--history-depth', '10', '--max-diff-size', '4',
      '--resume-history', '--json'], { encoding: 'utf8', timeout: 20000 });
    assert.equal(child.status, 1, child.stderr);
    const childReport = JSON.parse(child.stdout);
    assert.equal(childReport.git.historyResumedFrom, 3);
    assert.ok(!child.stdout.includes(fake));

    await writeFile(join(root, 'other.txt'), 'new content\n');
    git(root, 'add', 'other.txt');
    git(root, 'commit', '-qm', 'new reference tip');
    paths.add(checkpointPath());
    const fresh = await scanGit(root, true, limits);
    assert.equal(fresh.stats.historyResumedFrom, undefined);
    assert.equal(fresh.stats.commitsInspected, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
    for (const file of paths) await unlink(file).catch(() => {});
  }
});

test('resume does not carry obsolete working-tree scan failures into a fresh report', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'reposafe-checkpoint-fresh-metadata-'));
  const limits = { depth: 5, maxDiffSizeMiB: 4, currentBranchOnly: false, since: '', resume: true };
  let cacheFile;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.name', 'Synthetic');
    git(root, 'config', 'user.email', 'test@example.invalid');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(root, 'node_modules'));
    const tracked = join(root, 'node_modules', 'tracked.txt');
    await writeFile(tracked, 'safe value\\n');
    git(root, 'add', '-f', 'node_modules/tracked.txt');
    git(root, 'commit', '-qm', 'synthetic tracked excluded fixture');
    const refs = git(root, 'show-ref', '--head');
    const key = createHash('sha256').update(JSON.stringify([realpathSync(root), refs, limits])).digest('hex');
    cacheFile = join(homedir(), '.reposafe', 'checkpoints', key + '.json');
    // Only the uncommitted working-tree content grows; Git ref tips stay identical.
    await writeFile(tracked, 'x'.repeat(4 * 1024 * 1024 + 1));
    const oversized = await scanGit(root, true, limits);
    assert.equal(oversized.stats.complete, false);
    assert.ok(oversized.stats.warnings.some(w => w.includes('Tracked file size')));
    const stored = JSON.parse(await readFile(cacheFile, 'utf8'));
    assert.equal(stored.complete, true, 'history checkpoint must exclude unrelated current-file failures');
    assert.equal(stored.warnings.some(w => w.includes('Tracked file size')), false);
    await writeFile(tracked, 'safe value\\n');
    const repaired = await scanGit(root, true, limits);
    assert.equal(repaired.stats.historyResumedFrom, 1);
    assert.equal(repaired.stats.complete, true);
    assert.equal(repaired.stats.warnings.some(w => w.includes('Tracked file size')), false);
  } finally {
    if (cacheFile) await unlink(cacheFile).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
