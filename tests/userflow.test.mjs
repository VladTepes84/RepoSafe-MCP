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
test('doctor starts the real local MCP server and discovers all six tools', {timeout:26000}, async()=>{
  await fixture(async root=>{
    const r=run('doctor','--root',root,'--json');
    assert.equal(r.status,0,r.stderr);
    const report=JSON.parse(r.stdout);
    assert.equal(report.status,'pass');
    assert.equal(report.tools.length,6);
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
    assert.ok(r.stdout.includes(root));
  });
});
test('doctor and init reject invalid scope and unknown client without leaking the path',{timeout:26000}, async()=>{
  for(const args of [['doctor','--root','./relative'],['doctor','--root','/unlikely-nonexistent-reposafe-path-781'],['init','--root','./relative','--client','cursor'],['init','--root','/unlikely-nonexistent-reposafe-path-781','--client','other']]){
    const r=run(...args);
    assert.equal(r.status,2);
    assert.ok(!r.stderr.includes('/unlikely-nonexistent-reposafe-path-781'));
  }
});
