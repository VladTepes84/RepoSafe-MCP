import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseGithubUrl, unpackGithubArchive } from '../bin/github-snapshot.mjs';
import { renderPrettyReport } from '../bin/report-view.mjs';

function octal(header, offset, len, number) {
  const value = number.toString(8).padStart(len - 1, '0') + '\0';
  header.write(value, offset, len, 'ascii');
}
function entry(path, type = '0', body = Buffer.alloc(0), declaredSize = body.length) {
  const h = Buffer.alloc(512, 0);
  h.write(path, 0, Math.min(100, Buffer.byteLength(path)), 'utf8');
  octal(h, 100, 8, 0o600);
  octal(h, 108, 8, 0);
  octal(h, 116, 8, 0);
  octal(h, 124, 12, declaredSize);
  octal(h, 136, 12, 0);
  h.fill(32, 148, 156);
  h[156] = type.charCodeAt(0);
  h.write('ustar\0', 257, 6, 'ascii');
  let checksum = 0;
  for (const byte of h) checksum += byte;
  octal(h, 148, 8, checksum);
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512, 0);
  return Buffer.concat([h, body, padding]);
}
const archive = (...entries) => gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]));
async function temp(fn) {
  const root = await mkdtemp(join(tmpdir(), 'reposafe-remote-fixture-'));
  try { return await fn(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}
const extract = (root, data) => unpackGithubArchive(Readable.from([data]), root);
const cli = (...args) => spawnSync(process.execPath, ['bin/reposafe.mjs', ...args], {
  encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024,
});

test('public GitHub URL parser accepts only simple HTTPS owner/repo', () => {
  assert.deepEqual(parseGithubUrl('https://github.com/Owner/repo.git'),
    { owner: 'Owner', repo: 'repo', url: 'https://github.com/Owner/repo' });
  for (const value of [
    'http://github.com/owner/repo', 'https://evil.tld/owner/repo',
    'https://github.com.evil.tld/owner/repo',
    'https://github.com:444/owner/repo',
    'https://attacker@github.com/owner/repo',
    'https://github.com/owner/repo?access_token=secret',
    'https://github.com/owner/repo#ref',
    'https://github.com/owner/repo/extra',
    'https://github.com/owner/%2e%2e',
    'https://github.com/owner/..',
    'https://github.com/owner/repo//',
    'https://github.com/owner/repo with space',
    'git@github.com:owner/repo.git',
    'https://github.com/owner/repo\\extra',
  ]) assert.throws(() => parseGithubUrl(value), /REMOTE_URL_INVALID/, value);
});

test('safe snapshot tar extracts only regular bounded files and scanner reads them', async () => {
  await temp(async root => {
    const dummy = 'ghp_' + 'R'.repeat(36);
    const input = archive(
      entry('repository-abcdef/', '5'),
      entry('repository-abcdef/README.md', '0', Buffer.from('# Synthetic repository\n')),
      entry('repository-abcdef/.gitignore', '0', Buffer.from('.env.local\n')),
      entry('repository-abcdef/demo.txt', '0', Buffer.from('GITHUB_TOKEN=' + dummy + '\n')),
    );
    const result = await extract(root, input);
    assert.equal(result.files, 3);
    assert.match(await readFile(join(root, 'demo.txt'), 'utf8'), /GITHUB_TOKEN/);
    const scan = cli('scan', '--root', root, '--no-git', '--high', '--no-color');
    assert.equal(scan.status, 1, scan.stderr);
    assert.match(scan.stdout, /demo.txt:1/);
    assert.doesNotMatch(scan.stdout + scan.stderr, new RegExp(dummy));
  });
});

test('safe extractor rejects symlinks and hardlinks without writing destinations', async () => {
  for (const type of ['1', '2']) {
    await temp(async root => {
      const zip = archive(entry('repo-abc/', '5'), entry('repo-abc/escape', type));
      await assert.rejects(extract(root, zip), /REMOTE_ARCHIVE_UNSUPPORTED/);
      assert.deepEqual(await readdir(root), []);
    });
  }
});

test('safe extractor fails closed on traversal, ambiguous Windows paths and duplicate entries', async () => {
  for (const bad of ['repo-abc/../../escape', 'repo-abc/./escape',
    'repo-abc/C:\\escape', 'repo-abc/CON', 'repo-abc/a//b', '/absolute/path']) {
    await temp(async root => {
      await assert.rejects(extract(root, archive(entry(bad, '0', Buffer.from('X')))),
        /REMOTE_ARCHIVE_PATH/, bad);
      assert.deepEqual(await readdir(root), []);
    });
  }
  await temp(async root => {
    await assert.rejects(extract(root, archive(
      entry('repo-abc/a.txt', '0', Buffer.from('a')),
      entry('repo-abc/a.txt', '0', Buffer.from('b')),
    )), /EEXIST/);
    assert.equal(await readFile(join(root, 'a.txt'), 'utf8'), 'a');
  });
});

test('safe extractor rejects corrupted checksum, truncated archive and excessive declared sizes', async () => {
  await temp(async root => {
    const source = Buffer.concat([entry('repo-abc/file', '0', Buffer.from('X')), Buffer.alloc(1024)]);
    source[0] ^= 1;
    await assert.rejects(extract(root, gzipSync(source)), /REMOTE_ARCHIVE_INVALID/);
  });
  await temp(async root => {
    await assert.rejects(extract(root, gzipSync(entry('repo-abc/file', '0', Buffer.from('X')))),
      /REMOTE_ARCHIVE_TRUNCATED/);
  });
  await temp(async root => {
    await assert.rejects(extract(root, archive(entry('repo-abc/huge', '0',
      Buffer.alloc(0), 4 * 1024 * 1024 + 1))), /REMOTE_ARCHIVE_LIMIT/);
    assert.deepEqual(await readdir(root), []);
  });
});

test('public URL options fail before any network request', () => {
  for (const args of [
    ['scan', 'http://github.com/owner/repo'],
    ['scan', 'https://github.com/owner/repo?key=do-not-echo'],
    ['scan', 'https://github.com/owner/repo', '--root', '/tmp'],
    ['scan', 'https://github.com/owner/repo', '--no-history'],
    ['scan', 'https://github.com/owner/repo', '--sarif'],
    ['scan', 'https://github.com/owner/repo', '--json'],
    ['scan', 'https://github.com/owner/repo', '--unknown-flag'],
    ['scan', 'https://github.com/owner/repo', '--group-by', 'invalid'],
    ['scan', 'https://github.com/owner/repo', '--summary', '--high'],
  ]) {
    const result = cli(...args);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /REMOTE_(URL_INVALID|OPTIONS_UNSUPPORTED)/);
    assert.ok(!result.stderr.includes('do-not-echo'));
  }
});

test('remote dashboard discloses immutable source and retains follow-up URL', () => {
  const output = renderPrettyReport({
    schemaVersion: '2', verdict: 'review_required',
    findings: [{ category: 'secrets', rule: 'github_token', severity: 'high',
      file: 'demo.txt', line: 1, message: 'Possible token', action: 'Review' }],
    stats: { complete: false, filesScanned: 1, warnings: ['Remote snapshot only'] },
  }, {
    reviewCommand: 'reposafe scan https://github.com/owner/repo',
    remoteSource: { url: 'https://github.com/owner/repo', sha: 'a'.repeat(40) },
  });
  assert.match(output, /Source: public GitHub snapshot/);
  assert.match(output, /aaaaaaaaaaaa/);
  assert.match(output, /reposafe scan https:\/\/github.com\/owner\/repo --high/);
  assert.match(output, /COVERAGE WARNINGS/);
});
