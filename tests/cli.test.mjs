import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const cli = resolve('dist/cli.js');
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 8000 });

test('CLI prints usable help and rejects invalid roots', () => {
  assert.equal(run('--help').status, 0);
  assert.equal(run('scan', '--root', '.').status, 2);
});

test('CLI returns stable JSON and exit codes without echoing secret material', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reposafe-cli-'));
  try {
    await writeFile(join(root, 'README.md'), '# Example\n');
    await writeFile(join(root, 'LICENSE'), 'MIT\n');
    await writeFile(join(root, '.gitignore'), '.env\n');
    const clean = run('scan', '--root', root, '--no-git', '--json');
    assert.equal(clean.status, 0);
    assert.equal(JSON.parse(clean.stdout).verdict, 'no_findings_in_scope');
    const secret = 'sk-proj-' + 'B'.repeat(35);
    await writeFile(join(root, 'app.ts'), `const OPENAI_KEY = '${secret}';\n`);
    const bad = run('scan', '--root', root, '--no-git', '--json');
    assert.equal(bad.status, 1);
    assert.ok(JSON.parse(bad.stdout).findings.some(x => x.rule === 'openai_key'));
    assert.ok(!bad.stdout.includes(secret));
  } finally { await rm(root, { recursive: true, force: true }); }
});
