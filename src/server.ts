#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { scanRepository, validateRoot } from './scanner.js';
import { generateReport } from './git.js';
import type { Category, ScanReport } from './types.js';

const root = await validateRoot(process.env.REPOSAFE_ROOT ?? '').catch(() => {
  console.error('RepoSafe: REPOSAFE_ROOT must be set to an existing absolute directory.');
  process.exit(1);
});

function selectReport(report: ScanReport, category?: Category): object {
  if (!category) return report;
  return {
    schemaVersion: report.schemaVersion,
    scanner: report.scanner,
    category,
    findings: report.findings.filter(f => f.category === category || (category === 'git' && f.rule === 'env_not_gitignored')),
    verdict: report.verdict,
    stats: report.stats,
    git: report.git,
    limitations: report.limitations,
    note: 'verdict reflects the complete scan, not only this category',
  };
}

function createServer(): McpServer {
  const server = new McpServer({ name: 'reposafe-mcp', version: '0.2.0' });
  const register = (name: string, description: string, category?: Category): void => {
    server.registerTool(name, { description, inputSchema: z.object({}) }, async () => {
      try {
        const report = category === 'git' || category === 'history'
          ? await generateReport(root, { includeHistory: category === 'history' })
          : category === 'readiness' ? await generateReport(root, { includeHistory: false })
          : category ? await scanRepository(root) : await generateReport(root);
        return { content: [{ type: 'text' as const, text: JSON.stringify(selectReport(report, category), null, 2) }] };
      } catch {
        // Never disclose file contents or local absolute paths in error messages.
        return {
          isError: true,
          content: [{ type: 'text' as const, text: 'Scan failed. Check filesystem permissions and the configured root.' }],
        };
      }
    });
  };
  register('scan_secrets', 'Read-only local scan for possible embedded credentials. Values are never returned.', 'secrets');
  register('scan_private_refs', 'Read-only scan for workstation paths, internal hosts, and GitHub links to review.', 'privacy');
  register('check_repo_readiness', 'Check root README, license, and .gitignore before publishing.', 'readiness');
  register('scan_git_history', 'Read-only bounded Git history scan for secrets that may remain in old commits (no fetch or modification).', 'history');
  register('check_git_exposure', 'Check tracked sensitive files and .env Git ignore rules without changing the repo.', 'git');
  register('generate_report', 'Combined current files and bounded Git publication-readiness findings and coverage.');
  return server;
}

void serveStdio(createServer);
console.error('RepoSafe MCP ready on stdio. Scans are scoped to REPOSAFE_ROOT.');
