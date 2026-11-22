#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { generateReport } from './git.js';
import { scanRepository, validateRoot } from './scanner.js';
import { reportToSarif } from './sarif.js';
import { formatHumanReport } from './format.js';
const args = process.argv.slice(2);
const command = args[0];
const ownDirectory = dirname(fileURLToPath(import.meta.url));
const serverPath = join(ownDirectory, 'server.js');
const configScript = join(ownDirectory, '..', 'scripts', 'config.mjs');
const clientSetupScript = join(ownDirectory, '..', 'scripts', 'client-setup.mjs');
const EXPECTED_TOOLS = [
    'check_git_exposure', 'check_repo_readiness', 'generate_report', 'get_findings_page',
    'scan_git_history', 'scan_private_refs', 'scan_secrets',
];
function help() {
    console.log([
        'RepoSafe MCP v0.7 | offline read-only repository auditor',
        '',
        'Usage:',
        '  reposafe scan --root ABSOLUTE_PATH [--json|--sarif] [--no-history] [--no-git]',
        '       [--all-findings] [--no-color] [--history-depth 1..5000] [--since YYYY-MM-DD] [--max-diff-size MiB:1..16] [--current-branch]',
        '  reposafe doctor --root ABSOLUTE_PATH [--json]',
        '  reposafe connect --root ABSOLUTE_PATH --client cursor|claude|vscode|codex [--dry-run]',
        '  reposafe disconnect --client cursor|claude|vscode|codex [--dry-run]',
        '  reposafe init --root ABSOLUTE_PATH --client cursor|claude|vscode|codex [--dry-run] [--json]',
        '  npm run demo',
        '',
        'init verifies MCP and PRINTS configuration only; --json produces structured onboarding output.',
        'doctor performs a real local stdio MCP handshake and seven-tool discovery.',
        'Exit codes: 0=pass/clean in scoped scan; 1=review required; 2=usage or runtime failure.',
        'Use synthetic data for security tests; never paste real credentials in bug reports.',
    ].join('\n'));
}
function option(flag) {
    const pos = args.indexOf(flag);
    return pos === -1 ? undefined : args[pos + 1];
}
function errorReason(error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Node.js 22+'))
        return 'NODE_UNSUPPORTED: use Node.js version 22 or newer.';
    if (message.includes('GIT_NOT_AVAILABLE'))
        return 'GIT_UNAVAILABLE: install Git and ensure the executable is in PATH.';
    if (message.includes('Invalid') || message.includes('History options conflict')) {
        return 'INVALID_OPTIONS: check --help for allowed flags, combinations and safe history limits.';
    }
    if (message.includes('absolute path'))
        return 'ROOT_NOT_ABSOLUTE: use a fully qualified existing directory.';
    if (message.includes('Filesystem root'))
        return 'ROOT_TOO_BROAD: select a specific repository, not a drive root.';
    if (message.includes('reference a directory'))
        return 'ROOT_NOT_DIRECTORY: select a directory.';
    if (message.includes('ENOENT'))
        return 'MISSING_PATH_OR_GIT: verify the approved directory, Node.js and Git installation.';
    if (message.includes('EACCES') || message.includes('EPERM'))
        return 'ACCESS_DENIED: check local filesystem permissions.';
    return 'CHECK_FAILED: local MCP handshake or filesystem check failed. Run npm ci and npm run build.';
}
async function doctor(root) {
    if (parseInt(process.versions.node, 10) < 22)
        throw new Error('Node.js 22+ required.');
    const approved = await validateRoot(root);
    let gitVersion;
    try {
        gitVersion = execFileSync('git', ['--version'], {
            encoding: 'utf8', timeout: 8000, windowsHide: true,
        }).trim();
    }
    catch {
        throw new Error('GIT_NOT_AVAILABLE');
    }
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [serverPath],
        env: { ...process.env, REPOSAFE_ROOT: approved },
    });
    const client = new Client({ name: 'reposafe-doctor', version: '0.7.0' });
    try {
        await client.connect(transport);
        const tools = (await client.listTools()).tools.map(x => x.name).sort();
        if (JSON.stringify(tools) !== JSON.stringify(EXPECTED_TOOLS))
            throw new Error('MCP tool discovery mismatch.');
        return { status: 'pass', node: process.versions.node, git: gitVersion, tools, approvedRoot: true };
    }
    finally {
        await client.close().catch(() => { });
    }
}
function validateFlags(allowed) {
    if (!allowed.includes(command ?? ''))
        return false;
    const flags = new Set(allowed.slice(1));
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (!flags.has(arg))
            return false;
        if (['--root', '--client', '--history-depth', '--since', '--max-diff-size'].includes(arg)) {
            i++;
            if (!args[i] || args[i].startsWith('--'))
                return false;
        }
    }
    return args.filter(x => x === '--root').length === 1 &&
        ['--client', '--history-depth', '--since', '--max-diff-size'].every(flag => args.filter(x => x === flag).length <= 1);
}
async function main() {
    if (!command || command === '--help' || command === '-h') {
        help();
        return;
    }
    if (command === 'scan') {
        if (!validateFlags(['scan', '--root', '--json', '--sarif', '--no-history', '--no-git',
            '--history-depth', '--since', '--max-diff-size', '--current-branch', '--all-findings', '--no-color']) ||
            (args.includes('--json') && args.includes('--sarif')))
            throw new Error('Invalid scan arguments.');
        const historyFlags = ['--history-depth', '--since', '--max-diff-size', '--current-branch'];
        if ((args.includes('--no-git') || args.includes('--no-history')) &&
            historyFlags.some(flag => args.includes(flag)))
            throw new Error('History options conflict with a disabled history scan.');
        function boundedInteger(flag, max) {
            const raw = option(flag);
            if (!args.includes(flag))
                return undefined;
            if (!raw || !/^[1-9][0-9]*$/.test(raw))
                throw new Error('Invalid numeric scan option.');
            const value = Number(raw);
            if (!Number.isSafeInteger(value) || value > max)
                throw new Error('History scan option exceeds its safe limit.');
            return value;
        }
        const since = option('--since');
        if (args.includes('--since') && (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since) ||
            Number.isNaN(Date.parse(since + 'T00:00:00Z')) ||
            new Date(since + 'T00:00:00Z').toISOString().slice(0, 10) !== since)) {
            throw new Error('Invalid --since date.');
        }
        const historyOptions = {
            depth: boundedInteger('--history-depth', 5000),
            maxDiffSizeMiB: boundedInteger('--max-diff-size', 16),
            since,
            currentBranchOnly: args.includes('--current-branch'),
        };
        const root = await validateRoot(option('--root') ?? '');
        if (process.stderr.isTTY && !args.includes('--json') && !args.includes('--sarif')) {
            process.stderr.write('RepoSafe: scanning the approved repository (read-only)...\n');
        }
        const report = args.includes('--no-git')
            ? await scanRepository(root)
            : await generateReport(root, { includeHistory: !args.includes('--no-history'), historyOptions });
        if (args.includes('--json'))
            console.log(JSON.stringify(report, null, 2));
        else if (args.includes('--sarif'))
            console.log(JSON.stringify(reportToSarif(report), null, 2));
        else
            console.log(formatHumanReport(report, args.includes('--all-findings') ? Infinity : 50, Boolean(process.stdout.isTTY && process.env.NO_COLOR === undefined && !args.includes('--no-color'))));
        process.exitCode = report.verdict === 'review_required' ? 1 : 0;
        return;
    }
    if (command === 'connect' || command === 'disconnect') {
        const client = option('--client');
        const root = option('--root');
        const connect = command === 'connect';
        const flags = connect ? ['--root', '--client', '--dry-run', '--json'] :
            ['--client', '--dry-run', '--json'];
        if (!client || !['cursor', 'claude', 'vscode', 'codex'].includes(client) ||
            (connect && !root) || (!connect && root !== undefined) ||
            args.slice(1).some(x => x.startsWith('--') && !flags.includes(x)) ||
            ['--client', '--root', '--dry-run', '--json'].some(x => args.filter(y => y === x).length > 1) ||
            args.some((x, i) => i > 0 && !x.startsWith('--') &&
                !((args[i - 1] === '--client') || (connect && args[i - 1] === '--root')))) {
            throw new Error('Invalid client connection arguments.');
        }
        if (connect)
            await doctor(root); // Real MCP handshake before modifying client configuration.
        const output = execFileSync(process.execPath, [clientSetupScript,
            connect ? 'connect' : 'disconnect', '--client', client,
            ...(connect ? ['--root', root] : []),
            ...(args.includes('--dry-run') ? ['--dry-run'] : []),
            ...(args.includes('--json') ? ['--json'] : [])], {
            encoding: 'utf8', timeout: 10000, windowsHide: true,
        });
        process.stdout.write(output);
        return;
    }
    if (command === 'doctor' || command === 'init') {
        const allowed = command === 'doctor' ? ['doctor', '--root', '--json'] : ['init', '--root', '--client', '--dry-run', '--json'];
        if (!validateFlags(allowed))
            throw new Error('Invalid doctor/init arguments.');
        const root = option('--root') ?? '';
        if (command === 'init' && (!option('--client') || !['cursor', 'claude', 'vscode', 'codex'].includes(option('--client'))))
            throw new Error('Invalid client.');
        const result = await doctor(root);
        if (command === 'doctor') {
            console.log(args.includes('--json') ? JSON.stringify(result, null, 2) :
                'RepoSafe doctor PASS | Node ' + result.node + ' | ' + result.git +
                    ' | MCP handshake: ' + result.tools.length + ' tools available');
            return;
        }
        const output = execFileSync(process.execPath, [configScript, '--client', option('--client'),
            '--root', root, ...(args.includes('--json') ? ['--json'] : [])], {
            encoding: 'utf8', timeout: 10000, windowsHide: true,
        });
        if (args.includes('--json')) {
            const config = JSON.parse(output);
            console.log(JSON.stringify({
                ...config, verifiedProtocol: true, verifiedGUI: false, writesFiles: false,
                discoveredTools: result.tools,
                nextStep: 'Merge the RepoSafe entry into the client config manually, restart the client, and verify a real GUI tool call.',
            }, null, 2));
            return;
        }
        console.log('RepoSafe init: real MCP handshake PASSED; approved root and seven tools validated.');
        process.stdout.write(output);
        console.log('DRY RUN: no client file was changed. Add/merge the entry manually, restart the app and verify tool calls.');
        console.log('In the client ask: "Use RepoSafe generate_report for my approved repository and summarize findings without quoting secrets."');
        console.log('GUI acceptance remains UNVERIFIED until a real client session succeeds.');
        return;
    }
    throw new Error('Invalid command.');
}
void main().catch(error => {
    console.error(errorReason(error));
    console.error('Usage: reposafe scan|doctor|init --root ABSOLUTE_PATH [--client CLIENT]');
    process.exitCode = 2;
});
