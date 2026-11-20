import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanRepository } from '../src/scanner.ts';

async function withRepo(fn) {
  const root = await mkdtemp(join(tmpdir(),'reposafe-baseline-'));
  try {
    await writeFile(join(root,'README.md'),'# Sample\n');
    await writeFile(join(root,'LICENSE'),'MIT\n');
    await writeFile(join(root,'.gitignore'),'.env\n');
    return await fn(root);
  } finally { await rm(root,{recursive:true,force:true}); }
}
test('strict low/medium allowlist with reason and exact path is observable', async()=>{
  await withRepo(async root=>{
    await writeFile(join(root,'app.txt'),'PASSWORD=syntheticPassword123\n');
    const first=await scanRepository(root);
    assert.ok(first.findings.some(x=>x.rule==='generic_secret_assignment'));
    const reason='A controlled synthetic test fixture, reviewed in PR.';
    await writeFile(join(root,'.reposafe.json'),JSON.stringify({version:1,exceptions:[
      {path:'app.txt',rule:'generic_secret_assignment',reason}
    ]}));
    const report=await scanRepository(root);
    assert.equal(report.baseline.suppressed,1);
    assert.equal(report.baseline.highSuppressed,0);
    assert.equal(report.verdict,'no_findings_in_scope');
    assert.ok(report.stats.warnings.some(x=>x.includes('Baseline exceptions')));
    assert.ok(!JSON.stringify(report).includes(reason));
  });
});
test('high/critical rules cannot yield a clean verdict merely by baseline exemption',async()=>{
  await withRepo(async root=>{
    await writeFile(join(root,'app.txt'),'AWS_ID=AKIA'+'W'.repeat(16)+'\n');
    await writeFile(join(root,'.reposafe.json'),JSON.stringify({version:1,exceptions:[
      {path:'app.txt',rule:'aws_access_key_id',reason:'Reviewed synthetic test credential'}
    ]}));
    const r=await scanRepository(root);
    assert.equal(r.baseline.highSuppressed,1);
    assert.equal(r.verdict,'review_required');
  });
});
test('expired baseline entries do not suppress findings',async()=>{
  await withRepo(async root=>{
    await writeFile(join(root,'app.txt'),'PASSWORD=syntheticPassword123\n');
    await writeFile(join(root,'.reposafe.json'),JSON.stringify({version:1,exceptions:[
      {path:'app.txt',rule:'generic_secret_assignment',reason:'Expires deliberately',expires:'2000-01-01'}
    ]}));
    const r=await scanRepository(root);
    assert.equal(r.baseline.expired,1);
    assert.equal(r.baseline.suppressed,0);
    assert.equal(r.verdict,'review_required');
  });
});
for(const config of [
  '{"version":1,"exceptions":[{"path":"**/*.ts","rule":"generic_secret_assignment","reason":"Wildcard forbidden"}]}',
  '{"version":1,"exceptions":[{"path":"../outside","rule":"generic_secret_assignment","reason":"Traversal forbidden"}]}',
  '{"version":1,"exceptions":[{"path":"app.txt","rule":"*","reason":"Broad suppression forbidden"}]}',
  '{"version":1,"exceptions":[{"path":"app.txt","rule":"generic_secret_assignment","reason":"Valid comment","extra":true}]}',
  'not-json',
]) {
  test('malformed or broad baseline fails closed',async()=>{
    await withRepo(async root=>{
      await writeFile(join(root,'.reposafe.json'),config);
      const r=await scanRepository(root);
      assert.equal(r.stats.complete,false);
      assert.equal(r.verdict,'review_required');
      assert.ok(r.stats.warnings.some(x=>x.includes('Invalid or unreadable')));
    });
  });
}
