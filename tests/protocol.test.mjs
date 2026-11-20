import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

test('stdio MCP handshake lists four tools and returns redacted report', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'reposafe-mcp-protocol-'));
  let client;
  try {
    await writeFile(join(root, 'README.md'), '# Synthetic test repo\n');
    await writeFile(join(root, 'LICENSE'), 'MIT\n');
    await writeFile(join(root, '.gitignore'), '.env\n');
    const credential = 'AKIA' + 'B'.repeat(16);
    await writeFile(join(root, 'sample.txt'), `key=${credential}\n`);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve('dist/server.js')],
      env: { ...process.env, REPOSAFE_ROOT: root },
    });
    client = new Client({ name: 'reposafe-integration-test', version: '0.1.0' });
    await client.connect(transport);
    const names = (await client.listTools()).tools.map(x => x.name).sort();
    assert.deepEqual(names, [
      'check_repo_readiness', 'generate_report', 'scan_private_refs', 'scan_secrets',
    ]);
    const res = await client.callTool({ name: 'generate_report', arguments: {} });
    assert.notEqual(res.isError, true);
    const output = JSON.stringify(res);
    assert.ok(!output.includes(credential));
    const text = res.content.find(x => x.type === 'text')?.text;
    assert.ok(text);
    const report = JSON.parse(text);
    assert.equal(report.verdict, 'review_required');
    assert.ok(report.findings.some(x => x.rule === 'aws_access_key_id'));
  } finally {
    await client?.close();
    await rm(root, { recursive: true, force: true });
  }
});
