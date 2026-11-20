// End-to-end offline demo: actually creates/commits/deletes a dummy token, scans, asserts.
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = await mkdtemp(join(tmpdir(), 'reposafe-real-demo-'));
const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe', timeout: 8000 });
const command = (...args) => {
  const out = execFileSync(process.execPath, [resolve('dist/cli.js'), ...args], {
    encoding: 'utf8', timeout: 15000,
  });
  return JSON.parse(out);
};
try {
  git('init', '-q');
  git('config', 'user.name', 'Synthetic Demo');
  git('config', 'user.email', 'demo@example.invalid');
  await writeFile(join(root, 'README.md'), '# Demo app\n');
  await writeFile(join(root, 'LICENSE'), 'MIT\n');
  await writeFile(join(root, '.gitignore'), '.env\n.env.*\n');
  await writeFile(join(root, 'app.js'), 'console.log("hello");\n');
  git('add', '.');
  git('commit', '-qm', 'clean baseline');
  const baseline = command('scan', '--root', root, '--json');
  assert.equal(baseline.verdict, 'no_findings_in_scope');
  console.log('[1/3] Clean project: no findings in examined scope');
  const synthetic = 'ghp_' + 'X'.repeat(32);
  await writeFile(join(root, 'app.js'), `GITHUB_TOKEN=${synthetic}\n`);
  git('add', 'app.js');
  git('commit', '-qm', 'synthetic committed mistake');
  const { spawnSync } = await import('node:child_process');
  const risky = spawnSync(process.execPath, [resolve('dist/cli.js'), 'scan', '--root', root, '--json'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(risky.status, 1);
  assert.ok(!risky.stdout.includes(synthetic));
  assert.ok(JSON.parse(risky.stdout).findings.some(f => f.category === 'secrets'));
  console.log('[2/3] Token in working tree: findings, exit 1, secret redacted');
  await writeFile(join(root, 'app.js'), 'console.log("fixed");\n');
  git('add', 'app.js');
  git('commit', '-qm', 'remove dummy token');
  const history = spawnSync(process.execPath, [resolve('dist/cli.js'), 'scan', '--root', root, '--json'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(history.status, 1);
  const parsed = JSON.parse(history.stdout);
  assert.ok(parsed.findings.some(f => f.category === 'history'));
  assert.ok(!history.stdout.includes(synthetic));
  console.log(`[3/3] Current files clean, history still risky: ${parsed.findings.length} finding(s), no secret values leaked`);
  console.log('REAL OFFLINE DEMO PASS (synthetic credentials only)');
} finally {
  await rm(root, { recursive: true, force: true });
}
