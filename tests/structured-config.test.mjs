import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanRepository, checkSecrets, checkStructuredFile } from '../dist/scanner.js';

async function fixture(fn) {
  const root=await mkdtemp(join(tmpdir(),'reposafe-structured-'));
  try {
    await writeFile(join(root,'README.md'),'# Demo\n');
    await writeFile(join(root,'LICENSE'),'MIT\n');
    await writeFile(join(root,'.gitignore'),'.env\n');
    return await fn(root);
  } finally { await rm(root,{recursive:true,force:true}); }
}

test('Spring application properties and dotted YAML credentials are found without values',async()=>{
  await fixture(async root=>{
    const value='syntheticUnsafePassword123';
    await writeFile(join(root,'application.properties'),
      'spring.datasource.username=exampleuser\nspring.datasource.password='+value+'\n');
    await writeFile(join(root,'application.yml'),
      'spring:\n  datasource:\n    password: '+value+'\n');
    const result=await scanRepository(root);
    assert.equal(result.verdict,'review_required');
    assert.ok(result.findings.some(f=>f.rule==='structured_config_secret'&&f.file==='application.properties'));
    assert.ok(result.findings.some(f=>f.file==='application.yml'&&f.rule==='generic_secret_assignment'));
    assert.ok(!JSON.stringify(result).includes(value));
  });
});
test('Terraform sensitive variable default can span multiple lines',async()=>{
  await fixture(async root=>{
    const value='terraformSyntheticSecret987654';
    await writeFile(join(root,'variables.tf'),
      'variable "db_password" {\n  description = "demo"\n  default = "'+value+'"\n}\n');
    const result=await scanRepository(root);
    assert.ok(result.findings.some(f=>f.rule==='terraform_sensitive_default'&&f.file==='variables.tf'&&f.line===3));
    assert.ok(!JSON.stringify(result).includes(value));
  });
});
test('Kubernetes kind Secret with a credential in data Base64 is detected',async()=>{
  await fixture(async root=>{
    const value='k8sSyntheticCredential927';
    const encoded=Buffer.from(value).toString('base64');
    await writeFile(join(root,'k8s-secret.yaml'),
      'apiVersion: v1\nkind: Secret\nmetadata:\n  name: example\ntype: Opaque\ndata:\n  password: '+encoded+'\n');
    const result=await scanRepository(root);
    assert.ok(result.findings.some(f=>f.rule==='kubernetes_encoded_secret'&&f.file==='k8s-secret.yaml'&&f.line===7));
    assert.ok(!JSON.stringify(result).includes(value));
    assert.ok(!JSON.stringify(result).includes(encoded));
  });
});
test('same Base64 field in ordinary ConfigMap is not promoted to Kubernetes Secret',async()=>{
  await fixture(async root=>{
    const encoded=Buffer.from('syntheticNotActuallySecretValue').toString('base64');
    await writeFile(join(root,'configmap.yaml'),
      'apiVersion: v1\nkind: ConfigMap\ndata:\n  password: '+encoded+'\n');
    const result=await scanRepository(root);
    assert.ok(!result.findings.some(f=>f.rule==='kubernetes_encoded_secret'));
  });
});
test('Kubernetes Secret placeholder Base64 is excluded from high-confidence rule',()=>{
  const encoded=Buffer.from('your_password_here').toString('base64');
  const result=checkStructuredFile(['kind: Secret','data:','  password: '+encoded],'demo.yaml');
  assert.ok(!result.some(x=>x.rule==='kubernetes_encoded_secret'));
});
test('Terraform placeholder default is not a credential finding',()=>{
  const lines=['variable "db_password" {','  default = "your_password_here"','}'];
  assert.ok(!checkStructuredFile(lines,'vars.tf').some(x=>x.rule==='terraform_sensitive_default'));
});
test('regular source strings do not trigger structured configuration rule',()=>{
  const line='spring.datasource.password=syntheticSecretValue123';
  assert.ok(!checkSecrets(line,'README.md',1).some(f=>f.rule==='structured_config_secret'));
});
test('excluded Git tracked files get structured scanner analysis in integration',async()=>{
  // Structural parsing is also called by the bounded tracked-file reader, without symlink traversal.
  await fixture(async root=>{
    await mkdir(join(root,'node_modules'));
    await writeFile(join(root,'node_modules','settings.properties'),
      'spring.datasource.password=syntheticPassword987\n');
    const {scanSelectedTrackedFiles}=await import('../dist/scanner.js');
    const result=await scanSelectedTrackedFiles(root,['node_modules/settings.properties']);
    assert.equal(result.complete,true);
    assert.equal(result.filesScanned,1);
    assert.ok(result.findings.some(x=>x.rule==='structured_config_secret'));
    assert.ok(!JSON.stringify(result).includes('syntheticPassword987'));
  });
});
