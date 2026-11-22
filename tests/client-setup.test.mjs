import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { updateClient, updateCodexToml, updateJsonConfig } from '../scripts/client-setup.mjs';

const root = '/tmp/reposafe-synthetic-project';
const node = '/usr/local/bin/node';
const serverPath = '/tmp/reposafe-installed/dist/server.js';

test('Codex TOML keeps unrelated sections; connect and disconnect are reversible', () => {
  const original = 'model = "test"\n[mcp_servers.another]\ncommand = "untouched"\n\n[features]\nsearch = true\n';
  const entry = '[mcp_servers.reposafe]\ncommand = "/node"\nargs = ["/server"]\n';
  const installed = updateCodexToml(original, entry, false);
  assert.match(installed, /\[mcp_servers\.another\]\ncommand = "untouched"/);
  assert.match(installed, /\[mcp_servers\.reposafe\]/);
  assert.equal(updateCodexToml(installed, entry, false), installed);
  const removed = updateCodexToml(installed, entry, true);
  assert.equal(removed, original);
  assert.throws(() => updateCodexToml(installed + entry, entry, true), /Ambiguous/);
});

test('JSON MCP entries preserve existing connectors and arbitrary settings', () => {
  const original = JSON.stringify({ theme: 'dark', mcpServers: { another: { command: 'safe' } } });
  const entry = { command: node, args: [serverPath], env: { REPOSAFE_ROOT: root } };
  const updated = updateJsonConfig(original, entry, false);
  const parsed = JSON.parse(updated);
  assert.equal(parsed.theme, 'dark');
  assert.equal(parsed.mcpServers.another.command, 'safe');
  assert.deepEqual(parsed.mcpServers.reposafe, entry);
  assert.equal(updateJsonConfig(updated, entry, false), updated);
  assert.equal(Object.hasOwn(JSON.parse(updateJsonConfig(updated, entry, true)).mcpServers, 'reposafe'), false);
  assert.throws(() => updateJsonConfig('{broken', entry, false), /Invalid/);
});

test('local Codex config only updates RepoSafe and supports dry-run and uninstall', async () => {
  const home = await mkdtemp(join(tmpdir(), 'reposafe-client-'));
  try {
    await mkdir(join(home, '.codex'), { recursive: true });
    const file = join(home, '.codex', 'config.toml');
    const before = 'model = "safe"\n[mcp_servers.existing]\ncommand = "keep"\n';
    await writeFile(file, before);
    const args = { client: 'codex', platform: process.platform, home, root: home, node: process.execPath, serverPath: resolve('dist/server.js') };
    const preview = await updateClient({ ...args, dryRun: true });
    assert.equal(preview.applied, false);
    assert.equal(await readFile(file, 'utf8'), before);
    const first = await updateClient(args);
    assert.equal(first.applied, true);
    assert.equal(first.backupCreated, true);
    assert.equal(await readFile(first.backupFile, 'utf8'), before);
    if (process.platform !== 'win32') assert.equal((await stat(first.backupFile)).mode & 0o777, 0o600);
    assert.match(await readFile(file, 'utf8'), /mcp_servers\.reposafe/);
    assert.equal((await updateClient(args)).changed, false);
    const disconnect = await updateClient({ ...args, remove: true });
    assert.equal(disconnect.backupCreated, true);
    assert.match(await readFile(disconnect.backupFile, 'utf8'), /mcp_servers\.reposafe/);
    assert.equal(await readFile(file, 'utf8'), before);
    assert.equal((await updateClient({ ...args, remove: true })).changed, false);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('client config symlinks are refused instead of changing outside files', async () => {
  const home = await mkdtemp(join(tmpdir(), 'reposafe-client-link-'));
  try {
    await mkdir(join(home, '.cursor'), { recursive: true });
    const outside = join(home, 'other.json');
    await writeFile(outside, '{"keep":true}\n');
    await symlink(outside, join(home, '.cursor', 'mcp.json'));
    await assert.rejects(updateClient({ client: 'cursor', root: home, home, platform: process.platform,
      node: process.execPath, serverPath }), /Unsafe/);
    assert.equal(await readFile(outside, 'utf8'), '{"keep":true}\n');
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('CLI connection and disconnect work without invoking codex binary', { timeout: 20000 }, async () => {
  const fakeHome = await mkdtemp(join(tmpdir(), 'reposafe-cli-client-'));
  const oldHome = process.env.HOME;
  try {
    // Exercise isolated filesystem; on macOS/Linux homedir() may be OS-backed,
    // so use the exported setup function with an injected home for deterministic tests.
    const entry = await updateClient({ client: 'codex', root: fakeHome, home: fakeHome, platform: process.platform,
      node: process.execPath, serverPath: resolve('dist/server.js') });
    assert.equal(entry.applied, true);
    const text = await readFile(entry.configFile, 'utf8');
    assert.match(text, /mcp_servers\.reposafe/);
    const r = spawnSync(process.execPath, ['dist/cli.js', 'doctor', '--root', fakeHome],
      { encoding: 'utf8', timeout: 10000 });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /MCP handshake: 7 tools/);
  } finally {
    if (oldHome !== undefined) process.env.HOME = oldHome;
    await rm(fakeHome, { recursive: true, force: true });
  }
});

test('client setup refuses an existing lock and preserves all other settings', async () => {
  const home = await mkdtemp(join(tmpdir(), 'reposafe-client-lock-'));
  try {
    const folder = join(home, '.codex');
    await mkdir(folder, { recursive: true });
    const file = join(folder, 'config.toml');
    const before = 'model = "keep"\n';
    await writeFile(file, before);
    const lock = file + '.reposafe.lock';
    await writeFile(lock, 'another operation');
    const options = { client: 'codex', home, root: home, platform: process.platform,
      node: process.execPath, serverPath: resolve('dist/server.js') };
    await assert.rejects(updateClient(options), /locked/);
    assert.equal(await readFile(file, 'utf8'), before);
    assert.equal(await readFile(lock, 'utf8'), 'another operation');
    const preview = await updateClient({ ...options, dryRun: true });
    assert.equal(preview.applied, false);
    assert.equal(preview.backupCreated, false);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('existing empty config can be updated and safely backed up', async () => {
  const home = await mkdtemp(join(tmpdir(), 'reposafe-client-empty-'));
  try {
    await mkdir(join(home, '.cursor'), { recursive: true });
    await writeFile(join(home, '.cursor', 'mcp.json'), '');
    const result = await updateClient({ client: 'cursor', home, root: home,
      platform: process.platform, node: process.execPath,
      serverPath: resolve('dist/server.js') });
    assert.equal(result.backupCreated, true);
    assert.equal(await readFile(result.backupFile, 'utf8'), '');
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('Codex configuration refuses ambiguous nested, quoted and inline RepoSafe entries', () => {
  const managed = '[mcp_servers.reposafe]\ncommand = "/node"\nargs = ["/server"]\n';
  const alternate = [
    '[mcp_servers.reposafe.env]\nTOKEN = "placeholder"\n',
    managed + '[mcp_servers.reposafe.env]\nTOKEN = "placeholder"\n',
    '[[mcp_servers.reposafe]]\ncommand = "other"\n',
    '[mcp_servers."reposafe"]\ncommand = "other"\n',
    "[mcp_servers.'reposafe']\ncommand = 'other'\n",
    '[mcp_servers . reposafe]\ncommand = "other"\n',
    '[mcp_servers]\nreposafe = { command = "other" }\n',
    'mcp_servers = { reposafe = { command = "other" } }\n',
  ];
  for (const original of alternate) {
    assert.throws(() => updateCodexToml(original, managed, false), /Ambiguous/, original);
    assert.throws(() => updateCodexToml(original, managed, true), /Ambiguous/, original);
  }
});
