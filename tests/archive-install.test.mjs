import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

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
  const publicCli = join(prefix, 'node_modules', 'reposafe-mcp', 'bin', 'reposafe.mjs');
  assert.match(run(process.execPath, [publicCli, '--help']).stdout, /reposafe scan/);
  const target = join(directory, 'test-repository');
  await mkdir(target);
  await writeFile(join(target, 'README.md'), '# Test\n');
  const doctorProcess = spawnSync(process.execPath, [cli, 'doctor', '--root', target, '--json'], {
    encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024,
  });
  if (doctorProcess.status !== 0) {
    console.error('Archive doctor failure stderr:', String(doctorProcess.stderr).slice(0, 1000));
    // Diagnose the actual SDK failure rather than relying on CLI's intentionally redacted error.
    const server = join(prefix, 'node_modules', 'reposafe-mcp', 'dist', 'server.js');
    const transport = new StdioClientTransport({
      command: process.execPath, args: [server], env: { ...process.env, REPOSAFE_ROOT: target },
    });
    const client = new Client({ name: 'archive-diagnostic', version: '0.0.1' });
    try {
      await client.connect(transport);
      console.error('Archive direct MCP tool list:', (await client.listTools()).tools.map(x => x.name));
    } catch (error) {
      console.error('Archive direct MCP diagnostic:', error instanceof Error ? error.stack : String(error));
    } finally {
      await client.close().catch(() => {});
    }
  }
  assert.equal(doctorProcess.status, 0, 'Installed archive doctor failed');
  const doctor = JSON.parse(doctorProcess.stdout);
  assert.equal(doctor.status, 'pass');
  assert.equal(doctor.tools.length, 7);
  const initProcess = spawnSync(process.execPath, [
    cli, 'init', '--root', target, '--client', 'cursor', '--json',
  ], { encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
  if (initProcess.status !== 0) {
    console.error('Archive init failure stderr:', String(initProcess.stderr).slice(0, 1200));
    const config = join(prefix, 'node_modules', 'reposafe-mcp', 'scripts', 'config.mjs');
    const generator = spawnSync(process.execPath, [
      config, '--client', 'cursor', '--root', target, '--json',
    ], { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    console.error('Archive standalone config status:', generator.status,
      'stderr:', String(generator.stderr).slice(0, 1800),
      'stdout:', String(generator.stdout).slice(0, 500));
    const doctorAgain = spawnSync(process.execPath, [cli, 'doctor', '--root', target, '--json'], {
      encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    });
    console.error('Archive second doctor status:', doctorAgain.status,
      'stderr:', String(doctorAgain.stderr).slice(0, 1200));
  }
  assert.equal(initProcess.status, 0, 'Installed archive init failed');
  const init = JSON.parse(initProcess.stdout);
  assert.equal(init.verifiedProtocol, true);
  assert.equal(init.verifiedGUI, false);
  assert.equal(init.discoveredTools.length, 7);
  assert.equal(init.writesFiles, false);
  console.log('PINNED ARCHIVE INSTALL WITHOUT LIFECYCLE SCRIPTS + REAL MCP PASS');
} finally {
  await rm(directory, { recursive: true, force: true });
}
