#!/usr/bin/env node
// Local-only MCP client configuration. Never executes a client binary, and never
// overwrites unrelated MCP entries. connect/disconnect affect only "reposafe".
import { mkdir, readFile, rename, lstat, unlink, writeFile, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { makeClientConfig } from './config.mjs';

const MAX_CONFIG_BYTES = 1024 * 1024;
const CLIENTS = new Set(['cursor', 'claude', 'vscode', 'codex']);

export function updateCodexToml(existing, entry, remove) {
  // TOML sections are line-oriented; refuse ambiguous duplicate or quoted
  // RepoSafe tables rather than editing a config we cannot safely interpret.
  const markers = [...existing.matchAll(/^\[mcp_servers\.reposafe\][ \t]*(?:\r?\n|$)/gm)];
  // TOML allows quoted keys, whitespace, inline mappings and child tables.
  // A line-only editor cannot safely merge those alternate representations.
  // Refuse them rather than replacing the wrong section or leaving a shadow entry.
  const possibleTables = [...existing.matchAll(/^[ \t]*\[\[?[ \t]*mcp_servers[ \t]*\.[ \t]*(?:reposafe(?=[.\]\s])|"reposafe"|'reposafe')[^\r\n]*/gm)];
  const inlineMap = /^[ \t]*mcp_servers[ \t]*=/m.test(existing);
  const parentHeaders = [...existing.matchAll(/^[ \t]*\[[ \t]*mcp_servers[ \t]*\][ \t]*(?:\r?\n|$)/gm)];
  const ambiguousParentEntry = parentHeaders.some(header => {
    const after = header.index + header[0].length;
    const next = /^[ \t]*\[/gm;
    next.lastIndex = after;
    const found = next.exec(existing);
    const section = existing.slice(after, found ? found.index : existing.length);
    return /^[ \t]*(?:reposafe|"reposafe"|'reposafe')[ \t]*=/m.test(section);
  });
  if (markers.length > 1 || possibleTables.length !== markers.length ||
      inlineMap || ambiguousParentEntry) {
    throw new Error('Ambiguous RepoSafe TOML sections; no changes made.');
  }
  if (!markers.length) {
    if (remove) return existing;
    return existing + (existing && !existing.endsWith('\n') ? '\n' : '') + entry.trimEnd() + '\n';
  }
  const start = markers[0].index;
  const afterHeader = start + markers[0][0].length;
  const nextTable = /^\s*\[/gm;
  nextTable.lastIndex = afterHeader;
  const next = nextTable.exec(existing);
  const end = next ? next.index : existing.length;
  if (remove) return existing.slice(0, start) + existing.slice(end);
  return existing.slice(0, start) + entry.trimEnd() + '\n' + existing.slice(end);
}

export function updateJsonConfig(existing, entry, remove) {
  let data;
  try { data = existing.trim() ? JSON.parse(existing) : {}; }
  catch { throw new Error('Invalid existing JSON configuration; no changes made.'); }
  if (!data || Array.isArray(data) || typeof data !== 'object') {
    throw new Error('Existing client configuration must be a JSON object.');
  }
  if (data.mcpServers !== undefined &&
      (!data.mcpServers || Array.isArray(data.mcpServers) || typeof data.mcpServers !== 'object')) {
    throw new Error('Existing mcpServers is not an object; no changes made.');
  }
  if (remove && (!data.mcpServers || !Object.hasOwn(data.mcpServers, 'reposafe'))) return existing;
  data.mcpServers ??= {};
  if (remove) delete data.mcpServers.reposafe;
  else data.mcpServers.reposafe = entry;
  return JSON.stringify(data, null, 2) + '\n';
}

export async function updateClient({ client, root, remove = false, dryRun = false,
  platform = process.platform, home = homedir(), appdata = process.env.APPDATA,
  copilotHome = process.env.COPILOT_HOME, xdgConfigHome = process.env.XDG_CONFIG_HOME,
  node = process.execPath, serverPath } = {}) {
  if (!CLIENTS.has(client)) throw new Error('Unknown MCP client.');
  const fakeRoot = platform === 'win32' ? 'C:\\' : '/';
  const cfg = makeClientConfig({ client, root: remove ? fakeRoot : root,
    platform, home, appdata, copilotHome, xdgConfigHome, node, ...(serverPath ? { serverPath } : {}) });
  let old = '';
  let exists = false;
  let mode = 0o600;
  try {
    const st = await lstat(cfg.file);
    if (!st.isFile() || st.isSymbolicLink() || st.size > MAX_CONFIG_BYTES) {
      throw new Error('Unsafe, linked, or oversized MCP configuration; no changes made.');
    }
    exists = true;
    mode = st.mode & 0o777;
    old = await readFile(cfg.file, 'utf8');
    if (Buffer.byteLength(old) > MAX_CONFIG_BYTES) throw new Error('Oversized configuration.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const entry = cfg.format === 'toml' ? cfg.content : JSON.parse(cfg.content).mcpServers.reposafe;
  const updated = cfg.format === 'toml'
    ? updateCodexToml(old, entry, remove)
    : updateJsonConfig(old, entry, remove);
  const changed = updated !== old;
  let backupFile;
  if (changed && !dryRun) {
    const folder = dirname(cfg.file);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const parent = await lstat(folder);
    if (!parent.isDirectory() || parent.isSymbolicLink()) {
      throw new Error('Unsafe MCP configuration directory; no changes made.');
    }
    // A cooperative, fail-closed lock: never remove someone else's lock or
    // silently overwrite an IDE configuration changed after our first read.
    const lockPath = cfg.file + '.reposafe.lock';
    let lock;
    try {
      lock = await open(lockPath, 'wx', 0o600);
    } catch {
      throw new Error('MCP configuration is locked; no changes made.');
    }
    const tmp = cfg.file + '.reposafe-' + randomUUID() + '.tmp';
    try {
      let current = '';
      let currentExists = false;
      let currentMode = 0o600;
      try {
        const st = await lstat(cfg.file);
        if (!st.isFile() || st.isSymbolicLink() || st.size > MAX_CONFIG_BYTES) {
          throw new Error('Unsafe MCP configuration; no changes made.');
        }
        currentExists = true;
        currentMode = st.mode & 0o777;
        current = await readFile(cfg.file, 'utf8');
        if (Buffer.byteLength(current) > MAX_CONFIG_BYTES) {
          throw new Error('Oversized MCP configuration; no changes made.');
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        if (exists) throw new Error('MCP configuration was removed concurrently; no changes made.');
      }
      if (current !== old || currentExists !== exists) {
        throw new Error('MCP configuration changed concurrently; no changes made.');
      }
      if (exists) {
        // Existing client settings may contain credentials; backups are never
        // reported over MCP and must be protected with restrictive permissions.
        backupFile = cfg.file + '.reposafe-backup-' + randomUUID();
        await writeFile(backupFile, old, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      }
      await writeFile(tmp, updated, { encoding: 'utf8', flag: 'wx', mode: exists ? currentMode : 0o600 });
      // A final check catches non-cooperating editor writes before replacement.
      let latest = '';
      try { latest = await readFile(cfg.file, 'utf8'); }
      catch (error) {
        if (error?.code !== 'ENOENT' || exists) throw error;
      }
      if (latest !== old) throw new Error('MCP configuration changed before replacement; backup retained.');
      await rename(tmp, cfg.file);
    } finally {
      await unlink(tmp).catch(() => {});
      await lock.close();
      await unlink(lockPath).catch(() => {});
    }
  }
  return { client, configFile: cfg.file, changed, dryRun,
    action: remove ? 'disconnect' : 'connect', applied: changed && !dryRun,
    backupCreated: Boolean(backupFile), backupFile,
    protocolVerified: false, clientGuiVerified: false };
}

async function main() {
  const argv = process.argv.slice(2);
  const action = argv[0];
  const flag = name => { const i = argv.indexOf(name); return i < 0 ? undefined : argv[i + 1]; };
  const client = flag('--client');
  const root = flag('--root');
  const dryRun = argv.includes('--dry-run');
  const asJson = argv.includes('--json');
  if (!['connect', 'disconnect'].includes(action) || !CLIENTS.has(client) ||
      (action === 'connect' && !root) ||
      argv.some(x => x.startsWith('--') && !['--client','--root','--dry-run','--json'].includes(x))) {
    throw new Error('Usage: client-setup.mjs connect|disconnect --client CLIENT [--root ABS_PATH] [--dry-run] [--json]');
  }
  const result = await updateClient({ client, root, remove: action === 'disconnect', dryRun });
  console.log(asJson ? JSON.stringify(result, null, 2) :
    'RepoSafe ' + action + ': ' + (result.changed ? (dryRun ? 'change previewed' : 'configuration updated') : 'already in desired state') +
    '\nClient: ' + client + '\nConfig: ' + result.configFile +
    '\nClient GUI test: NOT VERIFIED; restart client and call generate_report.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('RepoSafe client configuration refused; review client config and paths.'); process.exitCode = 2; });
}
