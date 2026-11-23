import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

// Live public-network smoke: complements synthetic parser tests.
// No live credentials, private repositories, user data or upload.
test('a real GitHub Codeload PAX archive produces a Git-incomplete local report', async () => {
  const before = new Set((await readdir(tmpdir())).filter(x => x.startsWith('reposafe-remote-')));
  const proc = spawnSync(process.execPath, [
    'bin/reposafe.mjs', 'scan', 'https://github.com/octocat/Hello-World',
    '--no-color',
  ], {
    encoding: 'utf8',
    timeout: 75_000,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  });
  assert.equal(proc.error, undefined, proc.error?.message);
  assert.equal(proc.status, 1, proc.stderr);
  assert.match(proc.stdout, /Source: public GitHub snapshot https:\/\/github\.com\/octocat\/Hello-World/);
  assert.match(proc.stdout, /STATUS\s+REVIEW REQUIRED/);
  assert.match(proc.stdout, /Coverage: INCOMPLETE/);
  assert.match(proc.stdout, /Git history not available/);
  assert.match(proc.stdout, /NEXT ACTIONS/);
  assert.doesNotMatch(proc.stdout + proc.stderr, /\x1b\[/);
  const after = (await readdir(tmpdir())).filter(x => x.startsWith('reposafe-remote-'));
  assert.deepEqual(after.filter(x => !before.has(x)), [], 'temporary extraction not cleaned up');
});
