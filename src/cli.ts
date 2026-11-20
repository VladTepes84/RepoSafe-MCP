#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { generateReport } from './git.js';
import { scanRepository, validateRoot } from './scanner.js';
import type { ScanReport } from './types.js';
import { reportToSarif } from './sarif.js';
import { formatHumanReport } from './format.js';

const args = process.argv.slice(2);
const command = args[0];
const ownDirectory = dirname(fileURLToPath(import.meta.url));
const serverPath = join(ownDirectory, 'server.js');
const configScript = join(ownDirectory, '..', 'scripts', 'config.mjs');
const EXPECTED_TOOLS = [
  'check_git_exposure', 'check_repo_readiness', 'generate_report',
  'scan_git_history', 'scan_private_refs', 'scan_secrets',
];
function help(): void {
  console.log([
    'RepoSafe MCP v0.4 | offline read-only repository auditor',
    '',
    'Usage:',
    '  reposafe scan --root ABSOLUTE_PATH [--json|--sarif] [--no-history] [--no-git]',
    '  reposafe doctor --root ABSOLUTE_PATH [--json]',
    '  reposafe init --root ABSOLUTE_PATH --client cursor|claude|vscode|codex',
    '  npm run demo',
    '',
    'init PRINTS configuration only: it never writes a client config or installs hooks.',
    'doctor performs a real local stdio MCP handshake and six-tool discovery.',
    'Exit codes: 0=pass/clean in scoped scan; 1=review required; 2=usage or runtime failure.',
    'Use synthetic data for security tests; never paste real credentials in bug reports.',
  ].join('\n'));
}

function option(flag: string): string | undefined {
  const pos = args.indexOf(flag);
  return pos === -1 ? undefined : args[pos + 1];
}

function errorReason(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('absolute path')) return 'ROOT_NOT_ABSOLUTE: use a fully qualified existing directory.';
  if (message.includes('Filesystem root')) return 'ROOT_TOO_BROAD: select a specific repository, not a drive root.';
  if (message.includes('reference a directory')) return 'ROOT_NOT_DIRECTORY: select a directory.';
  if (message.includes('ENOENT')) return 'MISSING_PATH_OR_GIT: verify the approved directory, Node.js and Git installation.';
  if (message.includes('EACCES') || message.includes('EPERM')) return 'ACCESS_DENIED: check local filesystem permissions.';
  return 'CHECK_FAILED: local MCP handshake or filesystem check failed. Run npm ci and npm run build.';
}

async function doctor(root: string): Promise<{ status: 'pass'; node: string; git: string; tools: string[]; approvedRoot: true }> {
  if (parseInt(process.versions.node, 10) < 22) throw new Error('Node.js 22+ required.');
  const approved = await validateRoot(root);
  const gitVersion = execFileSync('git', ['--version'], { encoding: 'utf8', timeout: 8000, windowsHide: true }).trim();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: { ...process.env, REPOSAFE_ROOT: approved },
  });
  const client = new Client({ name: 'reposafe-doctor', version: '0.4.0' });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools.map(x => x.name).sort();
    if (JSON.stringify(tools) !== JSON.stringify(EXPECTED_TOOLS)) throw new Error('MCP tool discovery mismatch.');
    return { status: 'pass', node: process.versions.node, git: gitVersion, tools, approvedRoot: true };
  } finally {
    await client.close().catch(() => {});
  }
}

function validateFlags(allowed: string[]): boolean {
  if (!allowed.includes(command ?? '')) return false;
  const flags = new Set(allowed.slice(1));
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (!flags.has(arg)) return false;
    if (arg === '--root' || arg === '--client') {
      i++;
      if (!args[i] || args[i].startsWith('--')) return false;
    }
  }
  return args.filter(x => x === '--root').length === 1 &&
    args.filter(x => x === '--client').length <= 1;
}

async function main(): Promise<void> {
  if (!command || command === '--help' || command === '-h') { help(); return; }
  if (command === 'scan') {
    if (!validateFlags(['scan', '--root', '--json', '--sarif', '--no-history', '--no-git']) ||
        (args.includes('--json') && args.includes('--sarif'))) throw new Error('Invalid scan arguments.');
    const root = await validateRoot(option('--root') ?? '');
    const report: ScanReport = args.includes('--no-git')
      ? await scanRepository(root)
      : await generateReport(root, { includeHistory: !args.includes('--no-history') });
    if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else if (args.includes('--sarif')) console.log(JSON.stringify(reportToSarif(report), null, 2));
    else console.log(formatHumanReport(report));
    process.exitCode = report.verdict === 'review_required' ? 1 : 0;
    return;
  }
  if (command === 'doctor' || command === 'init') {
    const allowed = command === 'doctor' ? ['doctor', '--root', '--json'] : ['init', '--root', '--client'];
    if (!validateFlags(allowed)) throw new Error('Invalid doctor/init arguments.');
    const root = option('--root') ?? '';
    if (command === 'init' && (!option('--client') || !['cursor','claude','vscode','codex'].includes(option('--client')!)))
      throw new Error('Invalid client.');
    const result = await doctor(root);
    if (command === 'doctor') {
      console.log(args.includes('--json') ? JSON.stringify(result, null, 2) :
        'RepoSafe doctor PASS | Node ' + result.node + ' | ' + result.git +
        ' | MCP handshake: ' + result.tools.length + ' tools available');
      return;
    }
    const output = execFileSync(process.execPath, [configScript, '--client', option('--client')!, '--root', root], {
      encoding: 'utf8', timeout: 10000, windowsHide: true,
    });
    console.log('RepoSafe init: real MCP handshake PASSED; approved root and six tools validated.');
    process.stdout.write(output);
    console.log('No client file was changed. Add/merge the entry manually, restart the app and verify tool calls.');
    return;
  }
  throw new Error('Invalid command.');
}

void main().catch(error => {
  console.error(errorReason(error));
  console.error('Usage: reposafe scan|doctor|init --root ABSOLUTE_PATH [--client CLIENT]');
  process.exitCode = 2;
});
