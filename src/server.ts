#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { createGithubSnapshot } from '../bin/github-snapshot.mjs';
import { scanRepository, validateRoot } from './scanner.js';
import { generateReport } from './git.js';
import type { Category, ScanReport } from './types.js';

const root = await validateRoot(process.env.REPOSAFE_ROOT ?? '').catch(() => {
  console.error('RepoSafe: REPOSAFE_ROOT must be set to an existing absolute directory.');
  process.exit(1);
});

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
type Target = { kind: 'configured_local_root'; sessionRootId: string } |
  { kind: 'public_github_snapshot'; url: string; commitSha: string };
type CachedReport = { report: ScanReport; category?: Category; target: Target; reportId: string };
const publicGithubEnabled = process.env.REPOSAFE_ALLOW_PUBLIC_GITHUB === '1';
const localTarget: Target = { kind: 'configured_local_root', sessionRootId: randomUUID() };
const remoteWarning = 'Public GitHub snapshot only: Git index/history, LFS objects and submodules were NOT inspected.';

async function scanPublicSnapshot(url: string): Promise<{ report: ScanReport; target: Target }> {
  const snapshot = await createGithubSnapshot(url);
  try {
    // Never execute Git or apply suppression policy supplied by a remote repository.
    const report = await scanRepository(snapshot.root, { skipBaseline: true });
    report.stats.complete = false;
    report.stats.warnings.push(remoteWarning);
    report.limitations = [...report.limitations, remoteWarning,
      'Repository-provided baseline suppressions are disabled for MCP public snapshots.'];
    report.verdict = 'review_required';
    return { report, target: { kind: 'public_github_snapshot', url: snapshot.url, commitSha: snapshot.sha } };
  } finally {
    // Cleanup failures fail the request rather than silently returning a success.
    await rm(snapshot.root, { recursive: true, force: true, maxRetries: 3 });
  }
}

function selectReport(entry: CachedReport, offset = 0, limit = 50): object {
  const { report, category, target, reportId } = entry;
  const matches = report.findings
    .filter(f => !category || f.category === category || (category === 'git' && f.rule === 'env_not_gitignored'))
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] ||
      a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of matches) severityCounts[finding.severity]++;
  return {
    ...report,
    target, reportId, severityCounts,
    ...(category ? { category } : {}),
    findings: matches.slice(offset, offset + limit),
    pagination: { offset, limit, total: matches.length, hasMore: offset + limit < matches.length },
    note: (category ? 'Verdict reflects the complete scan, not only this category. ' : '') +
      'Counts cover retained findings in this report/category; see coverage and findingsOmitted. Pass reportId to get_findings_page for more results.',
  };
}

function createServer(): McpServer {
  const server = new McpServer({ name: 'reposafe-mcp', version: '1.0.0' });
  let lastReport: CachedReport | undefined;
  let scanning = false;
  const historySchema = z.object({
    historyDepth: z.number().int().min(1).max(5000).optional(),
    since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    maxDiffSizeMiB: z.number().int().min(1).max(16).optional(),
    currentBranchOnly: z.boolean().optional(),
  }).strict();
  const reportSchema = historySchema.extend({
    repositoryUrl: z.string().min(1).max(280).optional(),
    confirmPublicDownload: z.boolean().optional(),
  }).strict();
  const noArgsSchema = z.object({}).strict();
  const register = (name: string, description: string, category?: Category): void => {
    const inputSchema = !category ? reportSchema : category === 'history' ? historySchema : noArgsSchema;
    server.registerTool(name, { description, inputSchema }, async (args) => {
      if (scanning) return { isError: true, content: [{ type: 'text' as const, text: 'A scan is already running. Wait for it to finish.' }] };
      scanning = true;
      lastReport = undefined;
      try {
        const opts = args as { historyDepth?: number; since?: string; maxDiffSizeMiB?: number; currentBranchOnly?: boolean;
          repositoryUrl?: string; confirmPublicDownload?: boolean };
        const historyOptions = {
          depth: opts.historyDepth, since: opts.since,
          maxDiffSizeMiB: opts.maxDiffSizeMiB, currentBranchOnly: opts.currentBranchOnly,
        };
        let report: ScanReport;
        let target: Target = localTarget;
        if (!category && opts.repositoryUrl !== undefined) {
          if (!publicGithubEnabled) return { isError: true, content: [{ type: 'text' as const,
            text: 'Public GitHub downloads are disabled by the operator. Enable REPOSAFE_ALLOW_PUBLIC_GITHUB=1 in the local MCP configuration first.' }] };
          if (opts.confirmPublicDownload !== true || Object.values(historyOptions).some(value => value !== undefined)) {
            return { isError: true, content: [{ type: 'text' as const,
              text: 'Public snapshot requires explicit user authorization (confirmPublicDownload: true) and no Git history options.' }] };
          }
          ({ report, target } = await scanPublicSnapshot(opts.repositoryUrl));
        } else {
          if (opts.confirmPublicDownload !== undefined) return { isError: true, content: [{ type: 'text' as const,
            text: 'confirmPublicDownload is only supported with repositoryUrl.' }] };
          report = category === 'git' || category === 'history'
            ? await generateReport(root, { includeHistory: category === 'history',
                ...(category === 'history' ? { historyOptions } : {}) })
            : category === 'readiness' ? await generateReport(root, { includeHistory: false })
            : category ? await scanRepository(root) : await generateReport(root, { historyOptions });
        }
        const entry = { report, category, target, reportId: randomUUID() };
        const text = JSON.stringify(selectReport(entry), null, 2);
        lastReport = entry;
        return { content: [{ type: 'text' as const, text }] };
      } catch {
        // Never disclose file contents or local absolute paths in error messages.
        return {
          isError: true,
          content: [{ type: 'text' as const, text: 'Scan failed. Check the authorized root or public GitHub URL, network availability, snapshot limits and temporary-directory permissions. No current report is available.' }],
        };
      } finally {
        scanning = false;
      }
    });
  };
  register('scan_secrets', 'Read-only local scan for possible embedded credentials. Values are never returned.', 'secrets');
  register('scan_private_refs', 'Read-only scan for workstation paths, internal hosts, and GitHub links to review.', 'privacy');
  register('check_repo_readiness', 'Check root README, license, and .gitignore before publishing.', 'readiness');
  register('scan_git_history', 'Read-only bounded Git history scan for secrets that may remain in old commits (no fetch or modification).', 'history');
  register('check_git_exposure', 'Check tracked sensitive files and .env Git ignore rules without changing the repo.', 'git');
  register('generate_report', 'Scan the configured local root (default) or an explicitly user-authorized public HTTPS GitHub repository URL. For a public snapshot, set repositoryUrl and confirmPublicDownload=true only after the user requests that exact URL and approves the tool call; requires operator opt-in REPOSAFE_ALLOW_PUBLIC_GITHUB=1, downloads temporary source locally, no Git history. Other tools still scan only the configured local root.');
  server.registerTool('get_findings_page', {
    description: 'Read redacted findings from the most recent completed scan. Pass its reportId (required for public snapshots) to avoid mixing targets. No rescan and no file contents.',
    inputSchema: z.object({
      reportId: z.string().uuid().optional(),
      offset: z.number().int().min(0).max(5000).default(0),
      limit: z.number().int().min(1).max(100).default(50),
    }).strict(),
  }, async ({ reportId, offset, limit }) => {
    try {
      if (!lastReport) return { isError: true, content: [{ type: 'text' as const,
        text: 'No prior RepoSafe scan in this MCP session. Call generate_report before get_findings_page.' }] };
      if ((reportId !== undefined && reportId !== lastReport.reportId) ||
          (lastReport.target.kind === 'public_github_snapshot' && reportId === undefined)) {
        return { isError: true, content: [{ type: 'text' as const,
          text: 'Report ID missing or stale. Use the reportId returned by the intended scan; no automatic rescan.' }] };
      }
      return { content: [{ type: 'text' as const,
        text: JSON.stringify(selectReport(lastReport, offset, limit), null, 2) }] };
    } catch {
      return { isError: true, content: [{ type: 'text' as const, text: 'RepoSafe findings unavailable; check local scan configuration.' }] };
    }
  });
  return server;
}

void serveStdio(createServer);
console.error('RepoSafe MCP ready on stdio. Local scans are scoped to REPOSAFE_ROOT; explicit public GitHub snapshots are temporary.');
