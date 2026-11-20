import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const cli=resolve('dist/cli.js');
const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:12000});
async function fixture(fn) {
  const root=await mkdtemp(join(tmpdir(),'reposafe-sarif-test-'));
  try {
    await writeFile(join(root,'README.md'),'# Demo\n');
    await writeFile(join(root,'LICENSE'),'MIT\n');
    await writeFile(join(root,'.gitignore'),'.env\n');
    return await fn(root);
  } finally { await rm(root,{recursive:true,force:true}); }
}
test('SARIF 2.1.0 includes locations and remediation, not credential values',async()=>{
  await fixture(async root=>{
    const secret='ghp_'+'V'.repeat(36);
    await writeFile(join(root,'config.js'),'GITHUB_TOKEN='+secret+'\n');
    const r=run('scan','--root',root,'--no-git','--sarif');
    assert.equal(r.status,1,r.stderr);
    assert.ok(!r.stdout.includes(secret));
    assert.ok(!r.stdout.includes(root), 'Do not expose absolute scope');
    const data=JSON.parse(r.stdout);
    assert.equal(data.version,'2.1.0');
    assert.equal(data.runs.length,1);
    const finding=data.runs[0].results.find(x=>x.ruleId==='reposafe/github_token');
    assert.ok(finding);
    assert.equal(finding.level,'error');
    assert.equal(finding.locations[0].physicalLocation.artifactLocation.uri,'config.js');
    assert.equal(finding.locations[0].physicalLocation.region.startLine,1);
    assert.match(finding.message.text,/Recommended action/);
  });
});
test('SARIF includes an incomplete-scan warning even when no secret is detected',async()=>{
  await fixture(async root=>{
    await writeFile(join(root,'large.txt'),'x'.repeat(512*1024+1));
    const r=run('scan','--root',root,'--no-git','--sarif');
    assert.equal(r.status,1,r.stderr);
    const results=JSON.parse(r.stdout).runs[0].results;
    assert.ok(results.some(x=>x.ruleId==='reposafe/incomplete_scan' && x.level==='warning'));
  });
});
test('human report groups by severity and provides concrete actions without secrets',async()=>{
  await fixture(async root=>{
    const secret='sk-proj-'+'Y'.repeat(36);
    await writeFile(join(root,'app.js'),'OPENAI_KEY='+secret+'\n');
    const r=run('scan','--root',root,'--no-git');
    assert.equal(r.status,1,r.stderr);
    assert.match(r.stdout,/REVIEW REQUIRED/);
    assert.match(r.stdout,/FINDINGS & ACTIONS/);
    assert.match(r.stdout,/Action:/);
    assert.match(r.stdout,/HIGH/);
    assert.ok(!r.stdout.includes(secret));
    assert.ok(!r.stdout.includes(root));
  });
});
test('mutually exclusive SARIF/JSON flags are rejected',async()=>{
  await fixture(async root=>{
    const r=run('scan','--root',root,'--json','--sarif');
    assert.equal(r.status,2);
  });
});
