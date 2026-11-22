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

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
function selectReport(report: ScanReport, category?: Category, offset = 0, limit = 50): object {
  const matches = report.findings
    .filter(f => !category || f.category === category || (category === 'git' && f.rule === 'env_not_gitignored'))
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] ||
      a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
  return {
    ...report,
    ...(category ? { category, note: 'Verdict reflects the complete scan, not only this category.' } : {}),
    findings: matches.slice(offset, offset + limit),
    pagination: { offset, limit, total: matches.length, hasMore: offset + limit < matches.length },
    note: 'Metadata-only findings; call get_findings_page for additional results. Coverage warnings are not suppressed.',
  };
}

function createServer(): McpServer {
  const server = new McpServer({ name: 'reposafe-mcp', version: '0.7.0' });
  let lastReport: { report: ScanReport; category?: Category } | undefined;
  const historySchema = z.object({
    historyDepth: z.number().int().min(1).max(5000).optional(),
    since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    maxDiffSizeMiB: z.number().int().min(1).max(16).optional(),
    currentBranchOnly: z.boolean().optional(),
  }).strict();
  const noArgsSchema = z.object({}).strict();
  const register = (name: string, description: string, category?: Category): void => {
    const inputSchema = category === 'history' || !category ? historySchema : noArgsSchema;
    server.registerTool(name, { description, inputSchema }, async (args) => {
      try {
        const opts = args as { historyDepth?: number; since?: string; maxDiffSizeMiB?: number; currentBranchOnly?: boolean };
        const historyOptions = {
          depth: opts.historyDepth, since: opts.since,
          maxDiffSizeMiB: opts.maxDiffSizeMiB, currentBranchOnly: opts.currentBranchOnly,
        };
        const report = category === 'git' || category === 'history'
          ? await generateReport(root, { includeHistory: category === 'history',
              ...(category === 'history' ? { historyOptions } : {}) })
          : category === 'readiness' ? await generateReport(root, { includeHistory: false })
          : category ? await scanRepository(root) : await generateReport(root, { historyOptions });
        lastReport = { report, category };
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
  server.registerTool('get_findings_page', {
    description: 'Read the next page of redacted findings from the most recent RepoSafe scan in this local MCP session. No rescan and no file contents.',
    inputSchema: z.object({
      offset: z.number().int().min(0).max(5000).default(0),
      limit: z.number().int().min(1).max(100).default(50),
    }).strict(),
  }, async ({ offset, limit }) => {
    try {
      if (!lastReport) return { isError: true, content: [{ type: 'text' as const,
        text: 'No prior RepoSafe scan in this MCP session. Call generate_report before get_findings_page.' }] };
      return { content: [{ type: 'text' as const,
        text: JSON.stringify(selectReport(lastReport.report, lastReport.category, offset, limit), null, 2) }] };
    } catch {
      return { isError: true, content: [{ type: 'text' as const, text: 'RepoSafe findings unavailable; check local scan configuration.' }] };
    }
  });
  return server;
}

void serveStdio(createServer);
console.error('RepoSafe MCP ready on stdio. Scans are scoped to REPOSAFE_ROOT.');
