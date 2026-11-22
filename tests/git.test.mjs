import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateReport, scanGit } from '../dist/git.js';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {
  stdio: 'pipe', timeout: 8000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
}).toString();

async function withGitRepo(run) {
  const root = await mkdtemp(join(tmpdir(), 'reposafe-history-'));
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.name', 'Synthetic Test');
    git(root, 'config', 'user.email', 'synthetic@example.invalid');
    await writeFile(join(root, 'README.md'), '# Synthetic app\n');
    await writeFile(join(root, 'LICENSE'), 'MIT\n');
    await writeFile(join(root, '.gitignore'), '.env\n.env.*\n');
    return await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('detects deleted credential remaining in committed Git history without exposing its bytes', async () => {
  await withGitRepo(async root => {
    const token = 'ghp_' + 'Z'.repeat(36);
    await writeFile(join(root, 'src.txt'), `GITHUB_TOKEN=${token}\n`);
    git(root, 'add', 'README.md', 'LICENSE', '.gitignore', 'src.txt');
    git(root, 'commit', '-qm', 'first commit');
    await writeFile(join(root, 'src.txt'), 'const token = process.env.GITHUB_TOKEN;\n');
    git(root, 'add', 'src.txt');
    git(root, 'commit', '-qm', 'remove token');
    const report = await generateReport(root);
    assert.equal(report.git.historyChecked, true);
    assert.ok(report.git.commitsInspected >= 2);
    assert.ok(report.findings.some(x => x.rule === 'git_history_github_token'));
    assert.ok(!JSON.stringify(report).includes(token));
  });
});

test('flags tracked .env and uses Git ignore semantics, not mere .gitignore presence', async () => {
  await withGitRepo(async root => {
    await writeFile(join(root, '.gitignore'), 'node_modules/\n');
    await writeFile(join(root, '.env'), 'PASSWORD=synthetic_value_abcdefgh\n');
    git(root, 'add', '-f', '.env');
    const gitReport = await scanGit(root, false);
    assert.ok(gitReport.findings.some(x => x.rule === 'tracked_sensitive_file'));
    assert.ok(gitReport.findings.some(x => x.rule === 'env_not_gitignored'));
    assert.ok(!JSON.stringify(gitReport).includes('synthetic_value_abcdefgh'));
  });
});

test('does not read a parent Git repository when scoped to nested directory', async () => {
  await withGitRepo(async root => {
    const nested = join(root, 'nested');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(nested);
    const outcome = await scanGit(nested, true);
    assert.equal(outcome.stats.complete, false);
    assert.ok(outcome.stats.warnings.some(x => x.includes('differs')));
  });
});

test('Git history with no commits can still be inspected; explicit opt-out is recorded', async () => {
  await withGitRepo(async root => {
    const report = await scanGit(root, false);
    assert.equal(report.stats.historyChecked, false);
    assert.ok(report.stats.warnings.some(x => x.includes('disabled')));
  });
});


test('history findings pinpoint the introducing commit, not the removal commit', async () => {
  await withGitRepo(async root => {
    const token = 'ghp_' + 'J'.repeat(36);
    await writeFile(join(root, 'token.txt'), 'GITHUB_TOKEN=' + token + '\n');
    git(root, 'add', 'token.txt');
    git(root, 'commit', '-qm', 'introduce synthetic token');
    const introduced = git(root, 'rev-parse', 'HEAD').trim().slice(0, 12);
    await writeFile(join(root, 'token.txt'), 'export const clean=true;\n');
    git(root, 'add', 'token.txt');
    git(root, 'commit', '-qm', 'remove synthetic token');
    const removal = git(root, 'rev-parse', 'HEAD').trim().slice(0, 12);
    const findings = (await scanGit(root, true)).findings.filter(f => f.rule === 'git_history_github_token');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].commit, introduced);
    assert.notEqual(findings[0].commit, removal);
    assert.ok(!JSON.stringify(findings).includes(token));
  });
});

test('Git history checks additional credential formats and omits values', async () => {
  await withGitRepo(async root => {
    const sg = 'SG.' + 'Q'.repeat(22) + '.' + 'T'.repeat(43);
    const npm = 'npm_' + 'K'.repeat(36);
    const postgres = 'postgres://svc:synthetic%40P4ssword@db.example.invalid/app';
    const jwt = [
      Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: 'demo-person' })).toString('base64url'),
      'PzT3hK8dQ0sV6nF2mR5wG7xL9yA1cB4e',
    ].join('.');
    await writeFile(join(root, 'secrets.txt'),
      ['SENDGRID_API_KEY=' + sg, 'NPM_TOKEN=' + npm, 'DATABASE_URL=' + postgres, 'JWT=' + jwt].join('\n'));
    git(root, 'add', 'secrets.txt');
    git(root, 'commit', '-qm', 'synthetic credential history');
    const introduced = git(root, 'rev-parse', 'HEAD').trim().slice(0, 12);
    const result = await scanGit(root, true);
    for (const rule of ['git_history_sendgrid_api_key', 'git_history_npm_access_token', 'git_history_postgres_connection_password', 'git_history_jwt_token']) {
      assert.ok(result.findings.some(x => x.rule === rule && x.commit === introduced), rule);
    }
    for (const secret of [sg, npm, postgres, jwt]) assert.ok(!JSON.stringify(result).includes(secret));
  });
});

test('tracked files under skipped dependency/cache directories fail closed', async () => {
  await withGitRepo(async root => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(root, 'node_modules'));
    await writeFile(join(root, 'node_modules', 'tracked.txt'), 'GITHUB_TOKEN=ghp_' + 'T'.repeat(36));
    git(root, 'add', '-f', 'node_modules/tracked.txt');
    const report = await generateReport(root, { includeHistory: false });
    assert.equal(report.verdict, 'review_required');
    assert.equal(report.stats.complete, true);
    assert.equal(report.git.trackedExcludedFilesRequested, 1);
    assert.equal(report.git.trackedExcludedFilesScanned, 1);
    assert.ok(report.findings.some(x => x.rule === 'tracked_excluded_file' && x.file.includes('node_modules')));
    assert.ok(report.findings.some(x => x.rule === 'github_token' && x.file.includes('node_modules')));
    assert.ok(report.git.warnings.some(x => x.includes('Git tracks files')));
    assert.ok(!JSON.stringify(report).includes('ghp_' + 'T'.repeat(36)));
  });
});

test('Git fsmonitor and injected Git configuration cannot run a malicious command', async () => {
  await withGitRepo(async root => {
    const { existsSync } = await import('node:fs');
    const marker = join(root, '.git', 'fsmonitor-executed');
    const script = join(root, '.git', 'malicious-fsmonitor.cjs');
    await writeFile(script, 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ', "ran");\n');
    git(root, 'config', 'core.fsmonitor', '"' + process.execPath + '" "' + script + '"');
    const old = [process.env.GIT_CONFIG_COUNT, process.env.GIT_CONFIG_KEY_0, process.env.GIT_CONFIG_VALUE_0];
    process.env.GIT_CONFIG_COUNT = '1';
    process.env.GIT_CONFIG_KEY_0 = 'core.fsmonitor';
    process.env.GIT_CONFIG_VALUE_0 = '"' + process.execPath + '" "' + script + '"';
    try {
      const result = await scanGit(root, false);
      assert.equal(result.stats.gitAvailable, true);
      assert.equal(result.stats.complete, true);
      assert.equal(existsSync(marker), false);
    } finally {
      for (const [key, previous] of [
        ['GIT_CONFIG_COUNT',old[0]], ['GIT_CONFIG_KEY_0',old[1]], ['GIT_CONFIG_VALUE_0',old[2]],
      ]) {
        if (previous === undefined) delete process.env[key];
        else process.env[key] = previous;
      }
    }
  });
});


test('Git-tracked secrets under node_modules are scanned under strict budgets', async()=>{
  await withGitRepo(async root=>{
    const {mkdir}=await import('node:fs/promises');
    await mkdir(join(root,'node_modules'));
    const synthetic='ghp_'+'M'.repeat(36);
    await writeFile(join(root,'node_modules','secret.js'),'GITHUB_TOKEN='+synthetic+'\n');
    git(root,'add','-f','node_modules/secret.js');
    const report=await generateReport(root,{includeHistory:false});
    assert.equal(report.git.trackedExcludedFilesRequested,1);
    assert.equal(report.git.trackedExcludedFilesScanned,1);
    assert.ok(report.findings.some(x=>x.file==='node_modules/secret.js' && x.rule==='github_token'));
    assert.ok(!JSON.stringify(report).includes(synthetic));
  });
});

test('Symlinked tracked file cannot traverse outside the permitted root',async(t)=>{
  const {symlink,mkdtemp:temp,rm:remove}=await import('node:fs/promises');
  const outside=await temp(join(tmpdir(),'reposafe-outside-v04-'));
  try{
    const secret='ghp_'+'O'.repeat(36);
    await writeFile(join(outside,'outside.txt'),'GITHUB_TOKEN='+secret+'\n');
    await withGitRepo(async root=>{
      const {mkdir}=await import('node:fs/promises');
      await mkdir(join(root,'node_modules'));
      try {await symlink(join(outside,'outside.txt'),join(root,'node_modules','link.txt'));}
      catch(e){if(process.platform==='win32' && ['EPERM','EACCES'].includes(e.code)){t.skip('No symlink privilege');return;} throw e;}
      git(root,'add','-f','node_modules/link.txt');
      const report=await generateReport(root,{includeHistory:false});
      assert.equal(report.stats.complete,false);
      assert.equal(report.git.trackedExcludedFilesScanned,0);
      assert.ok(!JSON.stringify(report).includes(secret));
    });
  } finally {await remove(outside,{recursive:true,force:true});}
});

test('large 100-commit Git logs resume automatically across 4 MiB batches', async () => {
  await withGitRepo(async root => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(root, 'commits'));
    const secret = 'ghp_' + 'R'.repeat(36); // synthetic fixture, never a real token
    for (let i = 0; i < 103; i++) {
      // Each commit adds about 50 KiB of regular short lines; 100 commits exceed 4 MiB.
      const content = Array.from({ length: 700 }, (_, j) => `sample-${i}-${j}=${'x'.repeat(55)}\n`).join('');
      await writeFile(join(root, 'commits', `sample-${String(i).padStart(3, '0')}.txt`), content);
      git(root, 'add', 'commits');
      git(root, 'commit', '-qm', `synthetic ${i}`);
    }
    await writeFile(join(root, 'token.txt'), `GITHUB_TOKEN=${secret}\n`);
    git(root, 'add', 'token.txt');
    git(root, 'commit', '-qm', 'synthetic most recent token');
    const limited = await scanGit(root, true, { depth: 100, maxDiffSizeMiB: 4 });
    assert.equal(limited.stats.historyChecked, true);
    assert.equal(limited.stats.commitsInspected, 100);
    assert.ok(limited.stats.historyBatches > 1);
    assert.ok(!limited.stats.warnings.some(x => x.includes('single Git commit exceeded')));
    assert.ok(limited.findings.some(x => x.rule === 'git_history_github_token'));
    assert.ok(!JSON.stringify(limited).includes(secret));
    const expanded = await scanGit(root, true, { depth: 100, maxDiffSizeMiB: 16 });
    assert.equal(expanded.stats.commitsInspected, 100);
    assert.ok(expanded.stats.warnings.some(x => x.includes('depth limit')));
    assert.ok(!expanded.stats.warnings.some(x => x.includes('diff byte budget')));
  });
});

test('oversized single history line is skipped without hiding subsequent secret', async () => {
  await withGitRepo(async root => {
    const secret = 'ghp_' + 'S'.repeat(36);
    await writeFile(join(root, 'sample.txt'), 'x'.repeat(66000) + `\nGITHUB_TOKEN=${secret}\n`);
    git(root, 'add', 'sample.txt');
    git(root, 'commit', '-qm', 'synthetic oversized line');
    const result = await scanGit(root, true, { depth: 2 });
    assert.equal(result.stats.commitsInspected, 1);
    assert.equal(result.stats.complete, false);
    assert.ok(result.stats.warnings.some(x => x.includes('Long lines')));
    assert.ok(result.findings.some(x => x.rule === 'git_history_github_token'));
    assert.ok(!JSON.stringify(result).includes(secret));
  });
});


test('history batches cover more than 200 commits without a global diff cap', { timeout: 40_000 }, async () => {
  await withGitRepo(async root => {
    await writeFile(join(root, 'README.md'), '# Batch test\n');
    git(root, 'add', 'README.md');
    git(root, 'commit', '-qm', 'initial');
    const synthetic = 'ghp_' + 'N'.repeat(36);
    for (let i = 0; i < 210; i++) {
      await writeFile(join(root, 'history.txt'), i === 30 ? 'GITHUB_TOKEN=' + synthetic + '\n' : 'safe=' + i + '\n');
      git(root, 'add', 'history.txt');
      git(root, 'commit', '-qm', 'synthetic batch ' + i);
    }
    const result = await scanGit(root, true, { depth: 1000, maxDiffSizeMiB: 1 });
    assert.equal(result.stats.commitsInspected, 211);
    assert.equal(result.stats.historyCandidates, 211);
    assert.equal(result.stats.historyBatches, 3);
    assert.equal(result.stats.complete, true, result.stats.warnings.join('; '));
    assert.ok(result.findings.some(f => f.rule === 'git_history_github_token'));
    assert.ok(!JSON.stringify(result).includes(synthetic));
  });
});
