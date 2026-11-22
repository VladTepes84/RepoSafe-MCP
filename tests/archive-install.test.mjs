import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// Real pinned GitHub archive installation: precompiled files, no npm lifecycle scripts.
const sha = process.env.REPOSAFE_SOURCE_SHA ?? '';
assert.match(sha, /^[0-9a-f]{40}$/, 'Require an immutable source commit SHA');
const directory = await mkdtemp(join(tmpdir(), 'reposafe-archive-install-'));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024, ...options,
  });
  assert.equal(result.status, 0,
    'Archive installation or real MCP test failed: ' +
    String(result.stderr ?? '').slice(0, 1400) +
    '\nSTDOUT: ' + String(result.stdout ?? '').slice(0, 500));
  return result;
}
try {
  const prefix = join(directory, 'installed');
  await mkdir(prefix);
  const archive = 'https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/' + sha;
  const npmArgs = [
    'install', '--prefix', prefix, '--ignore-scripts', '--no-save',
    '--no-audit', '--no-fund', archive,
  ];
  // On Windows, invoke the npm JS CLI through node to avoid shell quoting and .cmd spawn issues.
  const windowsNpm = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const installed = process.platform === 'win32'
    ? run(process.execPath, [windowsNpm, ...npmArgs], { env: { ...process.env, npm_config_cache: join(directory, 'cache') } })
    : run('npm', npmArgs, { env: { ...process.env, npm_config_cache: join(directory, 'cache') } });
  assert.doesNotMatch(installed.stderr, /allow-scripts|skipping integrity check for git dependency/i);
  const cli = join(prefix, 'node_modules', 'reposafe-mcp', 'dist', 'cli.js');
  assert.match(run(process.execPath, [cli, '--help']).stdout, /RepoSafe MCP/);
  const target = join(directory, 'test-repository');
  await mkdir(target);
  await writeFile(join(target, 'README.md'), '# Test\n');
  const doctor = JSON.parse(run(process.execPath, [cli, 'doctor', '--root', target, '--json']).stdout);
  assert.equal(doctor.status, 'pass');
  assert.equal(doctor.tools.length, 6);
  const init = JSON.parse(run(process.execPath, [
    cli, 'init', '--root', target, '--client', 'cursor', '--json',
  ]).stdout);
  assert.equal(init.verifiedProtocol, true);
  assert.equal(init.verifiedGUI, false);
  assert.equal(init.discoveredTools.length, 6);
  assert.equal(init.writesFiles, false);
  console.log('PINNED ARCHIVE INSTALL WITHOUT LIFECYCLE SCRIPTS + REAL MCP PASS');
} finally {
  await rm(directory, { recursive: true, force: true });
}
