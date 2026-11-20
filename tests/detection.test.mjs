import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSecrets, safeRelativePath, scanRepository } from '../src/scanner.ts';

const jwt = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: '1234567890', scope: 'demo' })).toString('base64url'),
  'aB7cD2eF4gH6iJ8kL0mN3pQ5rS7tV9wX1yZ2',
].join('.');

const sg = 'SG.' + 'S'.repeat(22) + '.' + 'G'.repeat(43);
const npmToken = 'npm_' + 'N'.repeat(36);
const postgres = 'postgresql://service:synTh3tic%40P4ssword@db.example.invalid/demo';
const npmrc = '//registry.npmjs.org/:_authToken=syntheticNpmTokenValue12345678';
const bearer = 'Authorization: Bearer aB9zE2cM7pX4kY3rG6dL8wQ5uV1sT0nF';
const anthropic = 'sk-ant-' + 'a'.repeat(40);

for (const item of [
  { label: 'SendGrid API key', source: 'SENDGRID_API_KEY=' + sg, rule: 'sendgrid_api_key', value: sg },
  { label: 'npm prefixed access token', source: 'NPM_TOKEN=' + npmToken, rule: 'npm_access_token', value: npmToken },
  { label: 'npmrc registry auth token', source: npmrc, rule: 'npmrc_auth_token', value: 'syntheticNpmTokenValue12345678' },
  { label: 'Postgres URI password', source: 'DATABASE_URL=' + postgres, rule: 'postgres_connection_password', value: 'synTh3tic' },
  { label: 'JWT', source: 'JWT=' + jwt, rule: 'jwt_token', value: jwt },
  { label: 'high entropy bearer token', source: bearer, rule: 'high_entropy_bearer', value: 'aB9zE2cM7pX4kY3rG6dL8wQ5uV1sT0nF' },
]) {
  test('detects ' + item.label + ' without exporting secret values', () => {
    const findings = checkSecrets(item.source, 'config.txt', 8);
    assert.ok(findings.some(f => f.rule === item.rule), 'Missing ' + item.rule);
    assert.equal(findings.some(f => f.rule === 'generic_secret_assignment'), false);
    assert.ok(!JSON.stringify(findings).includes(item.value));
    assert.ok(findings.every(f => !('snippet' in f) && !('value' in f)));
  });
}

test('specific Anthropic and GitHub detectors do not double-report as OpenAI/generic', () => {
  const ant = checkSecrets('ANTHROPIC_API_KEY=' + anthropic, 'app.ts', 3);
  assert.deepEqual(ant.map(f => f.rule), ['anthropic_key']);
  const git = checkSecrets('GITHUB_TOKEN=ghp_' + 'B'.repeat(36), 'app.ts', 4);
  assert.deepEqual(git.map(f => f.rule), ['github_token']);
});

test('benign credential placeholders and low-entropy bearer values do not trigger new patterns', () => {
  for (const line of [
    'DATABASE_URL=postgresql://user:changeme@localhost/app',
    '//registry.npmjs.org/:_authToken=your_token_here',
    'Authorization: Bearer AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'SENDGRID_API_KEY=example',
    'NPM_TOKEN=your_npm_token_here',
  ]) {
    assert.equal(checkSecrets(line, 'config.txt', 1).length, 0, line);
  }
});

test('potentially publishable dist, build and vendor files are not silently excluded', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reposafe-publishable-'));
  try {
    await writeFile(join(root, 'README.md'), '# Demo\n');
    await writeFile(join(root, 'LICENSE'), 'MIT\n');
    await writeFile(join(root, '.gitignore'), '.env\n');
    for (const dir of ['dist', 'build', 'vendor']) {
      await mkdir(join(root, dir));
      await writeFile(join(root, dir, 'credentials.js'), 'GITHUB_TOKEN=ghp_' + 'Q'.repeat(36) + '\n');
    }
    const report = await scanRepository(root);
    assert.equal(report.stats.complete, true);
    for (const dir of ['dist', 'build', 'vendor']) {
      assert.ok(report.findings.some(f => f.file === dir + '/credentials.js' && f.rule === 'github_token'), 'Missing '+ dir);
    }
    assert.ok(!JSON.stringify(report).includes('ghp_' + 'Q'.repeat(36)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('filenames with connection credentials and npmrc authentication data are redacted', () => {
  assert.equal(safeRelativePath('connection-postgres://user:password123@db.invalid/db'), '[REDACTED_FILE_NAME]');
  assert.equal(safeRelativePath('npmrc-_authToken=syntheticNpmTokenValue12345678.txt'), '[REDACTED_FILE_NAME]');
});
