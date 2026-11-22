import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

test('npm pack dry-run includes executable bins and only required runtime files', { timeout: 30000 }, async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.private, true, 'Do not enable npm publication');
  assert.equal(pkg.scripts.prepare, undefined, 'Git install must not require a lifecycle build');
  assert.equal(pkg.scripts.prepack, undefined, 'Git install must not require a lifecycle pack script');
  assert.equal(pkg.bin.reposafe, './dist/cli.js');
  assert.equal(pkg.bin['reposafe-mcp'], './dist/cli.js');
  assert.ok(process.env.npm_execpath, 'Invoke using npm run test:package');
  const r = spawnSync(process.execPath,
    [process.env.npm_execpath, 'pack', '--dry-run', '--json', '--ignore-scripts', '--no-audit', '--no-fund'],
    { encoding: 'utf8', timeout: 25000, maxBuffer: 4 * 1024 * 1024 }
  );
  assert.equal(r.status, 0, (r.stderr || '').slice(0, 600));
  const [info] = JSON.parse(r.stdout);
  assert.equal(info.name, 'reposafe-mcp');
  const files = new Set(info.files.map(f => f.path));
  for (const name of ['package.json','README.md','LICENSE','dist/cli.js','dist/server.js',
    'dist/sarif.js','dist/format.js','dist/baseline.js','scripts/config.mjs']) {
    assert.ok(files.has(name), 'Missing runtime file: ' + name);
  }
  assert.ok([...files].every(f => !f.startsWith('tests/') && !f.startsWith('src/') && !f.startsWith('.github/')),
    'Tarball must exclude source code, test fixtures, and workflows');
  assert.ok(info.size < 1024 * 1024, 'Tarball must be tightly scoped');
});
