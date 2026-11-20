#!/usr/bin/env node
import { generateReport } from './git.js';
import { scanRepository, validateRoot } from './scanner.js';
import type { ScanReport } from './types.js';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`RepoSafe MCP | local read-only repository audit\n\nUsage:\n  node dist/cli.js scan --root ABSOLUTE_PATH [--json] [--no-history] [--no-git]\n  npm run demo               # synthetic safe/unsafe example\n\nExit codes: 0=no findings in scope; 1=review required; 2=usage/scan failure.\nNo --fix, --upload, remote access, or filesystem writes to the target repo.`);
  process.exit(0);
}
if (args[0] !== 'scan' || args.filter(x => x === '--root').length !== 1 || !args.includes('--root')) {
  console.error('Invalid arguments. Use --help for examples.');
  process.exit(2);
}
const rootIndex = args.indexOf('--root');
const root = args[rootIndex + 1];
const validFlags = new Set(['scan', '--root', '--json', '--no-history', '--no-git']);
if (!root || args.some((a, i) => i !== rootIndex + 1 && !validFlags.has(a))) {
  console.error('Invalid arguments. Use --help.');
  process.exit(2);
}
try {
  const approved = await validateRoot(root);
  const report: ScanReport = args.includes('--no-git')
    ? await scanRepository(approved)
    : await generateReport(approved, { includeHistory: !args.includes('--no-history') });
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`RepoSafe: ${report.verdict}\nFiles scanned: ${report.stats.filesScanned}; findings: ${report.findings.length}; complete: ${report.stats.complete}`);
    for (const finding of report.findings) {
      console.log(`[${finding.severity}] ${finding.category}/${finding.rule} ${finding.file}${finding.line ? `:${finding.line}` : ''} — ${finding.message}`);
    }
    if (report.stats.warnings.length) console.log(`Coverage limits: ${[...new Set(report.stats.warnings)].join(' | ')}`);
    console.log('No findings ≠ safe to publish. Never post real credentials in bug reports.');
  }
  process.exitCode = report.verdict === 'review_required' ? 1 : 0;
} catch {
  console.error('Unable to scan the approved root. Check absolute path and permissions.');
  process.exitCode = 2;
}
