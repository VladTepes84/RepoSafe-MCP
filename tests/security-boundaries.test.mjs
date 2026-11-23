import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanSelectedTrackedFiles, scanRepository } from '../dist/scanner.js';

async function withBoundaries(run) {
  const root = await mkdtemp(join(tmpdir(), 'reposafe-boundary-root-'));
  const outside = await mkdtemp(join(tmpdir(), 'reposafe-boundary-outside-'));
  try {
    await writeFile(join(root, 'README.md'), '# Authorized synthetic test\n');
    await writeFile(join(root, 'LICENSE'), 'MIT\n');
    await writeFile(join(root, '.gitignore'), 'node_modules/\n');
    await mkdir(join(root, 'node_modules'));
    return await run(root, outside);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    await rm(outside, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

test('tracked-file reads reject lexical traversal, Git metadata and Windows separators', async () => {
  await withBoundaries(async root => {
    const unsafe = [
      '../outside/secret.txt',
      'node_modules/../../outside/secret.txt',
      '.git/config',
      'node_modules//nested.txt',
      'node_modules\\secret.txt',
      'node_modules/./secret.txt',
      'node_modules/../secret.txt',
    ];
    const result = await scanSelectedTrackedFiles(root, unsafe);
    assert.equal(result.complete, false);
    assert.equal(result.filesScanned, 0);
    assert.deepEqual(result.findings, []);
    assert.ok(result.warnings.some(x => x.includes('unsafe')));
  });
});

test('tracked-excluded symlink parent cannot redirect reads outside root', async t => {
  await withBoundaries(async (root, outside) => {
    const canary = 'ghp_' + 'S'.repeat(36);
    await writeFile(join(outside, 'canary.txt'), 'GITHUB_TOKEN=' + canary + '\n');
    try {
      await symlink(outside, join(root, 'node_modules', 'pivot'),
        process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (process.platform === 'win32' && ['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
        t.skip('Runner disallows junction creation');
        return;
      }
      throw error;
    }
    const tracked = await scanSelectedTrackedFiles(root, ['node_modules/pivot/canary.txt']);
    const current = await scanRepository(root);
    assert.equal(tracked.complete, false);
    assert.equal(tracked.filesScanned, 0);
    assert.deepEqual(tracked.findings, []);
    assert.ok(tracked.warnings.length > 0);
    assert.ok(!JSON.stringify(tracked).includes(canary));
    assert.ok(!JSON.stringify(current).includes(canary));
  });
});

test('hardlink to a file outside approved root is rejected without source disclosure', async t => {
  await withBoundaries(async (root, outside) => {
    const canary = 'AKIA' + 'X'.repeat(16);
    await writeFile(join(outside, 'canary.txt'), 'AWS_ID=' + canary + '\n');
    try {
      await link(join(outside, 'canary.txt'), join(root, 'node_modules', 'linked.txt'));
    } catch (error) {
      if (process.platform === 'win32' && ['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
        t.skip('Runner disallows creation of hardlinks');
        return;
      }
      throw error;
    }
    const result = await scanSelectedTrackedFiles(root, ['node_modules/linked.txt']);
    assert.equal(result.complete, false);
    assert.equal(result.filesScanned, 0);
    assert.deepEqual(result.findings, []);
    assert.ok(result.warnings.length > 0);
    assert.ok(!JSON.stringify(result).includes(canary));
  });
});

test('credential-shaped tracked filenames are redacted before report serialization', async () => {
  await withBoundaries(async root => {
    const token = 'ghp_' + 'Z'.repeat(36);
    const filename = 'node_modules/' + token + '.txt';
    await writeFile(join(root, 'node_modules', token + '.txt'),
      'PASSWORD=some_synthetic_value_12345\n');
    const result = await scanSelectedTrackedFiles(root, [filename]);
    assert.equal(result.complete, true);
    assert.equal(result.filesScanned, 1);
    assert.ok(result.findings.some(f => f.rule === 'generic_secret_assignment'));
    assert.ok(result.findings.every(f => f.file === '[REDACTED_FILE_NAME]'));
    assert.ok(!JSON.stringify(result).includes(token));
    assert.ok(!JSON.stringify(result).includes('some_synthetic_value_12345'));
  });
});

test('unapproved working-tree symlink targets never become local findings', async t => {
  await withBoundaries(async (root, outside) => {
    const marker = 'PASSWORD=never_scan_this_external_value_55555';
    await writeFile(join(outside, 'canary.txt'), marker + '\n');
    try {
      await symlink(join(outside, 'canary.txt'), join(root, 'external-link.txt'), 'file');
    } catch (error) {
      if (process.platform === 'win32' && ['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
        t.skip('Runner disallows file symlinks');
        return;
      }
      throw error;
    }
    const result = await scanRepository(root);
    assert.ok(result.stats.filesSkipped > 0);
    assert.ok(!JSON.stringify(result).includes(marker));
    assert.ok(!result.findings.some(f => f.file === 'external-link.txt'));
  });
});
