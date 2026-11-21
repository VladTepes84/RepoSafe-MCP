import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { scanGit } from '../dist/git.js';

const cli=resolve('dist/cli.js');
const call=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:20000});
async function withRepo(fn) {
  const root=await mkdtemp(join(tmpdir(),'reposafe-history-options-'));
  try {
    const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:'pipe',timeout:10000});
    git('init','-q');
    git('config','user.name','Synthetic');
    git('config','user.email','test@example.invalid');
    await writeFile(join(root,'README.md'),'# Synthetic\n');
    await writeFile(join(root,'LICENSE'),'MIT\n');
    await writeFile(join(root,'.gitignore'),'.env\n.env.*\n');
    git('add','.');
    git('commit','-qm','initial');
    return await fn(root,git);
  } finally {await rm(root,{recursive:true,force:true});}
}
test('depth caps restrict history results and report truncated coverage',async()=>{
  await withRepo(async(root,git)=>{
    await writeFile(join(root,'credential.txt'),'GITHUB_TOKEN=ghp_'+'P'.repeat(36)+'\n');
    git('add','credential.txt');git('commit','-qm','add synthetic token');
    await writeFile(join(root,'credential.txt'),'clean\n');
    git('add','credential.txt');git('commit','-qm','remove token');
    const limited=await scanGit(root,true,{depth:1,maxDiffSizeMiB:1});
    assert.equal(limited.stats.commitsInspected,1);
    assert.equal(limited.stats.historyWindow.maxCommits,1);
    assert.equal(limited.stats.historyWindow.maxDiffSizeMiB,1);
    assert.ok(limited.stats.warnings.some(s=>s.includes('depth limit')));
    assert.ok(!limited.findings.some(f=>f.rule==='git_history_github_token'));
    const expanded=await scanGit(root,true,{depth:3,maxDiffSizeMiB:1});
    assert.ok(expanded.findings.some(f=>f.rule==='git_history_github_token'));
    assert.ok(!JSON.stringify(expanded).includes('ghp_'+'P'.repeat(36)));
  });
});
test('branch-only and since options are accepted and explicitly restrict coverage',async()=>{
  await withRepo(async(root,git)=>{
    const today='2025-01-01';
    const limited=await scanGit(root,true,{depth:20,since:today,currentBranchOnly:true,maxDiffSizeMiB:2});
    assert.ok(limited.stats.historyChecked);
    assert.ok(limited.stats.warnings.some(x=>x.includes('operator options')));
    assert.equal(limited.stats.historyWindow.since,today);
    assert.equal(limited.stats.historyWindow.currentBranchOnly,true);
  });
});
test('invalid history bounds and calendar dates are rejected before Git starts',async()=>{
  await withRepo(async(root)=>{
    for(const limits of [{depth:0},{depth:501},{maxDiffSizeMiB:0},{maxDiffSizeMiB:17},{since:'2026-02-30'}]){
      await assert.rejects(scanGit(root,true,limits));
    }
  });
});
test('CLI restricts history flags and emits JSON without credentials',async()=>{
  await withRepo(async(root)=>{
    const good=call('scan','--root',root,'--json','--history-depth','4','--max-diff-size','2','--current-branch');
    assert.equal(good.status,0,good.stderr);
    const report=JSON.parse(good.stdout);
    assert.equal(report.git.historyChecked,true);
    assert.ok(report.git.warnings.some(x=>x.includes('operator options')));
    for(const args of [
      ['--history-depth','0'],['--history-depth','501'],
      ['--max-diff-size','17'],['--since','2026-02-30'],
      ['--no-git','--history-depth','5'],['--no-history','--since','2026-01-01'],
      ['--history-depth','5','--history-depth','6'],
    ]){
      const r=call('scan','--root',root,...args);
      assert.equal(r.status,2,args.join(' '));
    }
  });
});
