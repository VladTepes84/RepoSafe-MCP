#!/usr/bin/env node
import { realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, win32, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const current = fileURLToPath(import.meta.url);
const server = join(dirname(current), '..', 'dist', 'server.js');

export function makeClientConfig({ client, platform, home, appdata, root, node = process.execPath, serverPath = server }) {
  if (!['cursor', 'claude', 'vscode', 'codex'].includes(client)) throw new Error('Choose cursor, claude, vscode or codex.');
  if (!['win32', 'darwin', 'linux'].includes(platform)) throw new Error('Unsupported platform.');
  const paths = platform === 'win32' ? win32 : posix;
  if (!paths.isAbsolute(root) || !paths.isAbsolute(node) || !paths.isAbsolute(serverPath)) {
    throw new Error('Root, Node executable and server path must all be absolute.');
  }
  const cfg = { command: node, args: [serverPath], env: { REPOSAFE_ROOT: root } };
  const file = {
    cursor: paths.join(home, '.cursor', 'mcp.json'),
    claude: platform === 'win32'
      ? paths.join(appdata || paths.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')
      : paths.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    vscode: paths.join(home, '.copilot', 'mcp-config.json'),
    codex: paths.join(home, '.codex', 'config.toml'),
  }[client];
  if (client === 'codex') {
    const quote = value => JSON.stringify(value);
    const content = `[mcp_servers.reposafe]\ncommand = ${quote(node)}\nargs = [${quote(serverPath)}]\nenv = { REPOSAFE_ROOT = ${quote(root)} }\n`;
    return { client, file, content, format: 'toml', config: cfg };
  }
  const data = { mcpServers: { reposafe: {
    ...(client === 'vscode' ? { type: 'stdio', tools: ['*'] } : {}), ...cfg,
  } } };
  return { client, file, content: JSON.stringify(data, null, 2) + '\n', format: 'json', config: cfg };
}

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes('--help') || !args.length) {
    console.log('Generate local MCP configuration (read-only).\nUsage: npm run config -- --client cursor|claude|vscode|codex --root ABSOLUTE_PATH [--json]');
    return;
  }
  const value = flag => args[args.indexOf(flag) + 1];
  const flags = args.filter(value => value.startsWith('--'));
  if (args.length !== (args.includes('--json') ? 5 : 4) ||
      flags.filter(value => value === '--client').length !== 1 ||
      flags.filter(value => value === '--root').length !== 1 ||
      flags.filter(value => value === '--json').length > 1 ||
      flags.some(value => !['--client','--root','--json'].includes(value))) {
    throw new Error('Use --client and --root, optionally --json.');
  }
  const root = await realpath(value('--root'));
  const data = makeClientConfig({ client: value('--client'), platform: process.platform, home: homedir(), appdata: process.env.APPDATA, root });
  if (args.includes('--json')) {
    console.log(JSON.stringify({
      client: data.client, targetFile: data.file, format: data.format,
      content: data.content, verifiedProtocol: false,
      verifiedGUI: false, writesFiles: false,
      note: 'Generated configuration only. Real MCP handshake and client GUI are not tested by this script.',
    }, null, 2));
    return;
  }
  console.log(`Configuration target: ${data.file}\n\n${data.content}`);
  console.log('Merge only the reposafe entry into an existing configuration. Never overwrite other MCP servers. Restart the client and verify tool discovery.');
};
// Node may use different casing or symlink/junction spellings for the same
// entry point on Windows (notably when installed from an npm archive).
// Compare canonical paths rather than a raw file URL path against realpath.
const mainScript = await realpath(current).catch(() => '');
const invokedScript = process.argv[1] ? await realpath(process.argv[1]).catch(() => '') : '';
const directlyInvoked = mainScript && invokedScript && (
  process.platform === 'win32'
    ? mainScript.toLowerCase() === invokedScript.toLowerCase()
    : mainScript === invokedScript
);
if (directlyInvoked) {
  main().catch(() => { console.error('Configuration generation failed. Check client, absolute root and permissions.'); process.exitCode = 2; });
}
