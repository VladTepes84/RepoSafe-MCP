import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const script=resolve('dist/cli.js');
const run=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:22000});
async function fixture(fn) {
  const root=await mkdtemp(join(tmpdir(),'reposafe-userflow-'));
  try{
    await writeFile(join(root,'README.md'),'# Example\n');
    await writeFile(join(root,'LICENSE'),'MIT\n');
    await writeFile(join(root,'.gitignore'),'.env\n');
    return await fn(root);
  } finally {await rm(root,{recursive:true,force:true});}
}
test('doctor starts the real local MCP server and discovers all seven tools', {timeout:26000}, async()=>{
  await fixture(async root=>{
    const r=run('doctor','--root',root,'--json');
    assert.equal(r.status,0,r.stderr);
    const report=JSON.parse(r.stdout);
    assert.equal(report.status,'pass');
    assert.equal(report.tools.length,7);
    assert.ok(report.tools.includes('generate_report'));
    assert.equal(report.approvedRoot,true);
  });
});
test('init verifies MCP and prints a real host config without editing user config',{timeout:26000},async()=>{
  await fixture(async root=>{
    const r=run('init','--root',root,'--client','cursor');
    assert.equal(r.status,0,r.stderr);
    assert.ok(r.stdout.includes('MCP handshake PASSED'));
    assert.ok(r.stdout.includes('mcpServers'));
    assert.ok(r.stdout.includes('REPOSAFE_ROOT'));
    // The generator writes JSON-escaped canonical paths (Windows can expand 8.3 aliases).
    const { realpath } = await import('node:fs/promises');
    const canonical = await realpath(root);
    assert.ok(r.stdout.includes(JSON.stringify(canonical).slice(1, -1)));
  });
});
test('doctor and init reject invalid scope and unknown client without leaking the path',{timeout:26000}, async()=>{
  for(const args of [['doctor','--root','./relative'],['doctor','--root','/unlikely-nonexistent-reposafe-path-781'],['init','--root','./relative','--client','cursor'],['init','--root','/unlikely-nonexistent-reposafe-path-781','--client','other']]){
    const r=run(...args);
    assert.equal(r.status,2);
    assert.ok(!r.stderr.includes('/unlikely-nonexistent-reposafe-path-781'));
  }
});


test('explicit init --dry-run remains no-write and verifies real MCP handshake', { timeout:26000 },async()=>{
  await fixture(async root=>{
    const r=run('init','--root',root,'--client','cursor','--dry-run');
    assert.equal(r.status,0,r.stderr);
    assert.ok(r.stdout.includes('MCP handshake PASSED'));
    assert.ok(r.stdout.includes('DRY RUN'));
  });
});


test('machine-readable init performs real MCP handshake for all supported clients', {timeout:120000},async()=>{
  await fixture(async root=>{
    for (const client of ['cursor','claude','vscode','codex']) {
      const r=run('init','--root',root,'--client',client,'--json');
      assert.equal(r.status,0,client+': '+r.stderr);
      const result=JSON.parse(r.stdout);
      assert.equal(result.verifiedProtocol,true);
      assert.equal(result.verifiedGUI,false);
      assert.equal(result.writesFiles,false);
      assert.equal(result.client,client);
      assert.equal(result.discoveredTools.length,7);
      assert.ok(result.targetFile);
      assert.ok(result.content.includes('REPOSAFE_ROOT'));
      assert.ok(!r.stdout.includes('MCP handshake PASSED'), 'stdout must be pure JSON');
    }
  });
});
test('init --json remains machine-readable with explicit --dry-run', {timeout:26000},async()=>{
  await fixture(async root=>{
    const r=run('init','--root',root,'--client','cursor','--json','--dry-run');
    assert.equal(r.status,0,r.stderr);
    const result=JSON.parse(r.stdout);
    assert.equal(result.writesFiles,false);
    assert.equal(result.verifiedProtocol,true);
  });
});
