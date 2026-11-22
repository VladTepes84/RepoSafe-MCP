import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

test('stdio MCP handshake lists six tools and returns redacted report', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'reposafe-mcp-protocol-'));
  let client;
  try {
    await writeFile(join(root, 'README.md'), '# Synthetic test repo\n');
    await writeFile(join(root, 'LICENSE'), 'MIT\n');
    await writeFile(join(root, '.gitignore'), '.env\n.env.*\n');
    const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe', timeout: 8000 });
    git('init', '-q');
    git('config', 'user.name', 'MCP Test');
    git('config', 'user.email', 'mcp@example.invalid');
    const credential = 'AKIA' + 'B'.repeat(16);
    const npmToken = 'npm_' + 'R'.repeat(36);
    await writeFile(join(root, 'sample.txt'), `key=${credential}\nNPM_TOKEN=${npmToken}\n`);
    git('add', '.');
    git('commit', '-qm', 'synthetic exposure');
    await writeFile(join(root, 'sample.txt'), 'safe=true\n');
    git('add', '.');
    git('commit', '-qm', 'remove synthetic exposure');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve('dist/server.js')],
      env: { ...process.env, REPOSAFE_ROOT: root },
    });
    client = new Client({ name: 'reposafe-integration-test', version: '0.2.0' });
    await client.connect(transport);
    const names = (await client.listTools()).tools.map(x => x.name).sort();
    assert.deepEqual(names, [
      'check_git_exposure', 'check_repo_readiness', 'generate_report', 'get_findings_page', 'scan_git_history', 'scan_private_refs', 'scan_secrets',
    ]);
    const res = await client.callTool({ name: 'generate_report', arguments: {} });
    assert.notEqual(res.isError, true);
    const output = JSON.stringify(res);
    assert.ok(!output.includes(credential));
    assert.ok(!output.includes(npmToken));
    const text = res.content.find(x => x.type === 'text')?.text;
    assert.ok(text);
    const report = JSON.parse(text);
    assert.equal(report.verdict, 'review_required');
    assert.ok(report.findings.some(x => x.rule === 'git_history_aws_access_key_id'));
    assert.ok(report.findings.some(x => x.rule === 'git_history_npm_access_token' && /^[a-f\d]{12}$/.test(x.commit ?? '')));
    const history = await client.callTool({ name: 'scan_git_history', arguments: {} });
    assert.ok(JSON.parse(history.content.find(x => x.type === 'text').text).findings.some(x => x.category === 'history'));

    // Request a bounded single-commit history window via the actual MCP protocol.
    const limited = await client.callTool({name:'scan_git_history',
      arguments:{historyDepth:1,maxDiffSizeMiB:1,currentBranchOnly:true}});
    assert.notEqual(limited.isError,true);
    const scoped=JSON.parse(limited.content.find(x=>x.type==='text').text);
    assert.equal(scoped.git.commitsInspected,1);
    assert.ok(scoped.git.warnings.some(x=>x.includes('operator options')));
    assert.ok(!JSON.stringify(limited).includes(credential));
    // Zod input validation must reject out-of-range AI arguments.
    let rejected=false;
    try {
      const invalid=await client.callTool({name:'scan_git_history',arguments:{historyDepth:5001}});
      rejected=invalid.isError===true;
    } catch { rejected=true; }
    assert.equal(rejected,true);

    // Refresh the report after the single-commit scoped scan before paging it.
    await client.callTool({ name: 'generate_report', arguments: {} });
    const page = await client.callTool({ name: 'get_findings_page', arguments: { offset: 0, limit: 1 } });
    assert.notEqual(page.isError, true);
    const pageData = JSON.parse(page.content.find(x => x.type === 'text').text);
    assert.equal(pageData.pagination.limit, 1);
    assert.ok(pageData.pagination.total >= 1);
    assert.equal(pageData.findings.length, 1);

    for (const name of names) {
      const result = await client.callTool({ name, arguments: {} });
      assert.notEqual(result.isError, true, `Tool failed: ${name}`);
      assert.ok(!JSON.stringify(result).includes(credential));
    }
  } finally {
    await client?.close();
    await rm(root, { recursive: true, force: true });
  }
});
