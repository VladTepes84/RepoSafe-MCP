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
    console.log('Generate exact local MCP configuration (no files are changed).\nUsage: npm run config -- --client cursor|claude|vscode|codex --root /ABSOLUTE/PATH/TO/APP');
    return;
  }
  const value = flag => args[args.indexOf(flag) + 1];
  if (args.length !== 4 || !args.includes('--client') || !args.includes('--root')) throw new Error('Use --client and --root only.');
  const root = await realpath(value('--root'));
  const data = makeClientConfig({ client: value('--client'), platform: process.platform, home: homedir(), appdata: process.env.APPDATA, root });
  console.log(`Configuration target: ${data.file}\n\n${data.content}`);
  console.log('Merge only the reposafe entry into an existing configuration. Never overwrite other MCP servers. Restart the client and verify tool discovery.');
};
if (process.argv[1] && fileURLToPath(import.meta.url) === (await realpath(process.argv[1]).catch(() => ''))) {
  main().catch(() => { console.error('Configuration generation failed. Check client, absolute root and permissions.'); process.exitCode = 2; });
}
