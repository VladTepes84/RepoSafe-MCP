import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve('dist/cli.js');
const schema = JSON.parse(readFileSync(new URL('../schemas/report-v2.schema.json', import.meta.url), 'utf8'));

test('versioned report contract documents fields and preserves metadata-only JSON/SARIF', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'reposafe-contract-'));
  try {
    await writeFile(join(root, 'README.md'), '# Synthetic fixture\n');
    await writeFile(join(root, 'LICENSE'), 'MIT\n');
    await writeFile(join(root, '.gitignore'), '.env\n');
    const secret = 'ghp_' + 'D'.repeat(36);
    await writeFile(join(root, 'config.txt'), 'GITHUB_TOKEN=' + secret + '\n');

    const run = format => spawnSync(process.execPath,
      [cli, 'scan', '--root', root, '--no-git', format],
      { encoding: 'utf8', timeout: 14000 });
    const json = run('--json');
    assert.equal(json.status, 1, json.stderr);
    const report = JSON.parse(json.stdout);
    assert.equal(report.schemaVersion, schema.properties.schemaVersion.const);
    assert.equal(report.scanner, schema.properties.scanner.const);
    assert.deepEqual(Object.keys(report).filter(k => !(k in schema.properties)), []);
    assert.equal(report.verdict, 'review_required');
    assert.equal(typeof report.stats.complete, 'boolean');
    assert.equal(report.stats.complete, true);
    assert.equal(report.git, undefined);
    assert.ok(report.findings.some(f => f.rule === 'github_token' && f.severity === 'high'));
    assert.ok(!json.stdout.includes(secret));
    assert.ok(!json.stdout.includes(root));
    assert.doesNotMatch(json.stdout, /\u001b\[[0-9;]*m/);

    const sarif = run('--sarif');
    assert.equal(sarif.status, 1, sarif.stderr);
    const s = JSON.parse(sarif.stdout);
    assert.equal(s.version, '2.1.0');
    assert.equal(s.runs.length, 1);
    assert.ok(s.runs[0].results.some(r => r.ruleId === 'reposafe/github_token'));
    assert.ok(!sarif.stdout.includes(secret));
    assert.ok(!sarif.stdout.includes(root));
    assert.doesNotMatch(sarif.stdout, /\u001b\[[0-9;]*m/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
