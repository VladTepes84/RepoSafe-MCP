import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// CI-only: installs a real locally packed tarball, not a registry release.
const directory=await mkdtemp(join(tmpdir(),'reposafe-packed-install-'));
function exec(program,args,options={}) {
  const r=spawnSync(program,args,{
    encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024,...options,
  });
  assert.equal(r.status,0,
    'Package installation or CLI self-test failed: '+
    String(r.stderr||'').slice(0,800));
  return r.stdout;
}
try {
  const stdout=exec('npm',['pack','--json','--ignore-scripts',
    '--no-audit','--no-fund','--pack-destination',directory]);
  const [info]=JSON.parse(stdout);
  assert.equal(info.name,'reposafe-mcp');
  const tarball=join(directory,info.filename);
  const prefix=join(directory,'installed');
  await mkdir(prefix);
  exec('npm',['install','--prefix',prefix,tarball,'--ignore-scripts',
    '--no-save','--no-audit','--no-fund']);
  const bin=join(prefix,'node_modules','.bin','reposafe');
  const usage=exec(bin,['--help']);
  assert.ok(usage.includes('RepoSafe'));
  assert.ok(usage.includes('reposafe scan'));
  const root=join(directory,'example');
  await mkdir(root);
  await writeFile(join(root,'README.md'),'# Synthetic\n');
  await writeFile(join(root,'LICENSE'),'MIT\n');
  await writeFile(join(root,'.gitignore'),'.env\n.env.*\n');
  exec('git',['-C',root,'init','-q']);
  exec('git',['-C',root,'add','.']);
  exec('git',['-C',root,'-c','user.name=Synthetic Fixture',
    '-c','user.email=fixture@example.invalid','commit','-qm','initial fixture']);
  const terminal=exec(bin,['scan','--no-history'],{cwd:root});
  assert.match(terminal,/SEVERITY OVERVIEW/);
  assert.match(terminal,/NO FINDINGS IN SCANNED SCOPE/);
  const doctor=exec(bin,['doctor','--root',root,'--json']);
  const result=JSON.parse(doctor);
  assert.equal(result.status,'pass');
  assert.equal(result.tools.length,7);
  console.log('REAL PACKED NPM INSTALL PASS (temporary prefix, no registry publication)');
} finally {
  await rm(directory,{recursive:true,force:true});
}
