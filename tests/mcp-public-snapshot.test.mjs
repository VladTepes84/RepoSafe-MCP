import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const unpack = result => JSON.parse(result.content.find(item => item.type === 'text').text);
test('MCP public snapshots: explicit scope, identity, paging, cleanup and target switching', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'reposafe-local-mcp-test-'));
  const temp = await mkdtemp(join(tmpdir(), 'reposafe-mcp-snapshot-test-'));
  const client = new Client({ name: 'snapshot-integration-test', version: '1.0.0' });
  try {
    await writeFile(join(root, 'README.md'), '# Local fixture\n');
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: ['--import', pathToFileURL(resolve('tests/fixtures/mcp-snapshot-https.mjs')).href, resolve('dist/server.js')],
      env: { ...process.env, REPOSAFE_ROOT: root, REPOSAFE_ALLOW_PUBLIC_GITHUB: '1', TMPDIR: temp, TMP: temp, TEMP: temp },
    }));
    const call = (name, args = {}) => client.callTool({ name, arguments: args });
    const url = 'https://github.com/owner/repo';
    assert.equal((await client.listTools()).tools.length, 7);
    const local = unpack(await call('generate_report'));
    assert.equal(local.target.kind, 'configured_local_root');
    assert.equal(local.stats.filesScanned, 1);
    assert.ok(!JSON.stringify(local).includes(root));
    assert.equal((await call('generate_report', { repositoryUrl: url })).isError, true);
    assert.equal((await call('get_findings_page', { reportId: local.reportId })).isError, true);
    assert.equal((await call('generate_report', { repositoryUrl: url, confirmPublicDownload: true, historyDepth: 5 })).isError, true);
    assert.equal((await call('generate_report', { repositoryUrl: 'https://evil.invalid/owner/repo', confirmPublicDownload: true })).isError, true);
    const response = await call('generate_report', { repositoryUrl: url, confirmPublicDownload: true });
    assert.notEqual(response.isError, true, JSON.stringify(response));
    const remote = unpack(response);
    assert.deepEqual(remote.target, { kind: 'public_github_snapshot', url, commitSha: 'a'.repeat(40) });
    assert.equal(remote.stats.filesScanned, 4);
    assert.equal(remote.stats.complete, false);
    assert.equal(Object.values(remote.severityCounts).reduce((a, b) => a + b, 0), remote.pagination.total);
    assert.equal(remote.verdict, 'review_required');
    assert.equal(remote.git, undefined);
    assert.ok(remote.stats.warnings.some(w => w.includes('NOT inspected')));
    assert.notEqual(remote.reportId, local.reportId);
    assert.ok(!JSON.stringify(remote).includes(temp));
    assert.deepEqual(await readdir(temp), []);
    assert.equal((await call('get_findings_page', { offset: 0, limit: 10 })).isError, true);
    assert.equal((await call('get_findings_page', { reportId: local.reportId })).isError, true);
    const page = unpack(await call('get_findings_page', { reportId: remote.reportId, offset: 0, limit: 10 }));
    assert.deepEqual(page.target, remote.target);
    assert.equal(page.reportId, remote.reportId);
    assert.deepEqual(page.findings, remote.findings);
    const other = unpack(await call('generate_report', { repositoryUrl: 'https://github.com/owner/other', confirmPublicDownload: true }));
    assert.deepEqual(other.target, { kind: 'public_github_snapshot', url: 'https://github.com/owner/other', commitSha: 'b'.repeat(40) });
    assert.notEqual(other.reportId, remote.reportId);
    assert.equal((await call('get_findings_page', { reportId: remote.reportId })).isError, true);
    assert.equal(unpack(await call('get_findings_page', { reportId: other.reportId })).reportId, other.reportId);
    const nextLocal = unpack(await call('generate_report'));
    assert.deepEqual(nextLocal.target, local.target);
    assert.equal(nextLocal.stats.filesScanned, 1);
    assert.equal((await call('get_findings_page', { reportId: other.reportId })).isError, true);
    assert.equal((await call('generate_report', { repositoryUrl: 'https://github.com/owner/missing', confirmPublicDownload: true })).isError, true);
    assert.equal((await call('get_findings_page', { reportId: nextLocal.reportId })).isError, true);
    assert.deepEqual(await readdir(temp), []);
  } finally {
    await client.close();
    await rm(root, { recursive: true, force: true });
    await rm(temp, { recursive: true, force: true });
  }
});

test('upgraded MCP stays local-only unless the operator opts in', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'reposafe-mcp-opt-in-test-'));
  const client = new Client({ name: 'snapshot-opt-in-test', version: '1.0.0' });
  try {
    await writeFile(join(root, 'README.md'), '# Local only\n');
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: ['--import', pathToFileURL(resolve('tests/fixtures/mcp-snapshot-https.mjs')).href, resolve('dist/server.js')],
      env: { ...process.env, REPOSAFE_ROOT: root, REPOSAFE_ALLOW_PUBLIC_GITHUB: '0' },
    }));
    const result = await client.callTool({ name: 'generate_report', arguments: {
      repositoryUrl: 'https://github.com/owner/repo', confirmPublicDownload: true,
    } });
    assert.equal(result.isError, true);
    assert.match(result.content.find(item => item.type === 'text').text, /disabled by the operator/);
    const local = await client.callTool({ name: 'generate_report', arguments: {} });
    assert.equal(unpack(local).target.kind, 'configured_local_root');
  } finally {
    await client.close();
    await rm(root, { recursive: true, force: true });
  }
});
