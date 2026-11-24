import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { makeClientConfig } from '../scripts/config.mjs';

const namesExpected = [
  'check_git_exposure', 'check_repo_readiness', 'generate_report',
  'get_findings_page', 'scan_git_history', 'scan_private_refs', 'scan_secrets',
];

// Parse only the minimal generated TOML subset used by RepoSafe.
// This is a synthetic test of the generated entry, not a parser of users'
// existing Codex configuration or a claim of GUI acceptance.
function parseGeneratedEntry(text) {
  assert.match(text, /^\[mcp_servers\.reposafe\]$/m);
  const property = key => {
    const line = text.split('\n').find(line => line.startsWith(key + ' = '));
    assert.ok(line, 'Generated Codex TOML is missing ' + key);
    return line.slice(key.length + 3);
  };
  const command = JSON.parse(property('command'));
  const args = JSON.parse(property('args'));
  const envText = property('env');
  const match = /^\{ REPOSAFE_ROOT = (".*") \}$/.exec(envText);
  assert.ok(match, 'Codex REPOSAFE_ROOT entry must be explicit and scoped');
  const envRoot = JSON.parse(match[1]);
  assert.equal(typeof command, 'string');
  assert.deepEqual(args.length, 1);
  assert.equal(typeof envRoot, 'string');
  assert.ok(!text.includes('http://') && !text.includes('https://'));
  return { command, args, envRoot };
}

test('generated Codex STDIO configuration actually launches the seven RepoSafe tools',
  { timeout: 45_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'reposafe-codex-config-'));
    const secret = 'AKIA' + 'Q'.repeat(16); // synthetic fixture, never a live key
    let client;
    try {
      await writeFile(join(root, 'fixture.txt'), 'SYNTHETIC_ACCESS_KEY=' + secret + '\n');
      const git = (...args) => execFileSync('git', ['-C', root, ...args], {
        stdio: 'pipe', timeout: 10_000,
      });
      git('init', '-q');
      git('config', 'user.name', 'Synthetic MCP Test');
      git('config', 'user.email', 'synthetic@example.invalid');
      git('add', '.');
      git('commit', '-qm', 'synthetic-only fixture');
      const cfg = makeClientConfig({
        client: 'codex',
        platform: process.platform,
        home: root,
        root,
        node: process.execPath,
        serverPath: resolve('dist/server.js'),
      });
      const parsed = parseGeneratedEntry(cfg.content);
      assert.equal(parsed.command, process.execPath);
      assert.equal(parsed.envRoot, root);
      assert.deepEqual(parsed.args, [resolve('dist/server.js')]);

      const transport = new StdioClientTransport({
        command: parsed.command, args: parsed.args,
        env: { ...process.env, REPOSAFE_ROOT: parsed.envRoot },
      });
      client = new Client({ name: 'reposafe-codex-config-smoke', version: '1.0.0' });
      await client.connect(transport);
      const tools = (await client.listTools()).tools.map(tool => tool.name).sort();
      assert.deepEqual(tools, namesExpected);

      const reportResult = await client.callTool({ name: 'generate_report', arguments: {} });
      assert.notEqual(reportResult.isError, true);
      const report = JSON.parse(reportResult.content.find(item => item.type === 'text').text);
      assert.equal(report.verdict, 'review_required');
      assert.ok(report.findings.length >= 1);
      assert.ok(!JSON.stringify(reportResult).includes(secret), 'report leaked a synthetic secret');

      const pageResult = await client.callTool({
        name: 'get_findings_page', arguments: { offset: 0, limit: 10 },
      });
      assert.notEqual(pageResult.isError, true);
      const page = JSON.parse(pageResult.content.find(item => item.type === 'text').text);
      assert.equal(page.pagination.offset, 0);
      assert.equal(page.pagination.limit, 10);
      assert.ok(page.pagination.total >= 1);
      assert.ok(page.findings.length >= 1 && page.findings.length <= 10);
      assert.ok(!JSON.stringify(pageResult).includes(secret), 'page leaked a synthetic secret');

      // Never conflate a test client invoking a Codex-shaped launch command
      // with the actual Codex Desktop application making tool calls.
    } finally {
      await client?.close();
      await rm(root, { recursive: true, force: true });
    }
  });
