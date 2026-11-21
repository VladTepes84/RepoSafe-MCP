import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Linux GitHub Actions-only acceptance test. No global installs and no npm publish.
const sha=process.env.REPOSAFE_SOURCE_SHA ?? '';
assert.match(sha,/^[0-9a-f]{40}$/,'Test a concrete committed source SHA.');
const dir=await mkdtemp(join(tmpdir(),'reposafe-github-source-'));
const exec=(binary,args,options={})=>{
  const run=spawnSync(binary,args,{
    encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024,...options,
  });
  assert.equal(run.status,0,
    'GitHub source installation or MCP smoke failed: '+String(run.stderr??'').slice(0,800));
  return run.stdout;
};
try {
  const prefix=join(dir,'installed');
  await mkdir(prefix);
  const target=join(dir,'example-repo');
  await mkdir(target);
  await writeFile(join(target,'README.md'),'# Demo\n');
  await writeFile(join(target,'LICENSE'),'MIT\n');
  await writeFile(join(target,'.gitignore'),'.env\n');
  const source='github:VladTepes84/RepoSafe-MCP#'+sha;
  // npm packages the exact GitHub commit (runs its declared prepack build).
  exec('npm',['install','--prefix',prefix,'--no-save','--no-audit','--no-fund',source],{
    env:{...process.env,npm_config_cache:join(dir,'cache')},
  });
  const installed=join(prefix,'node_modules','reposafe-mcp','dist','cli.js');
  const doctor=JSON.parse(exec(process.execPath,[installed,'doctor','--root',target,'--json']));
  assert.equal(doctor.status,'pass');
  assert.equal(doctor.tools.length,6);
  const init=JSON.parse(exec(process.execPath,[installed,'init','--client','cursor','--root',target,'--json']));
  assert.equal(init.verifiedProtocol,true);
  assert.equal(init.verifiedGUI,false);
  assert.equal(init.writesFiles,false);
  assert.equal(init.discoveredTools.length,6);
  assert.match(init.content,/REPOSAFE_ROOT/);
  console.log('GITHUB SOURCE INSTALL + REAL MCP ONBOARDING PASS (temporary prefix, no npm publish)');
} finally {
  await rm(dir,{recursive:true,force:true});
}
