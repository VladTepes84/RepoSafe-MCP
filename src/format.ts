import type { Finding, ScanReport, Severity } from './types.js';

export interface ReportDisplayOptions {
  summary?: boolean;
  compact?: boolean;
  groupBy?: 'severity' | 'file';
}

const order: Severity[] = ['critical', 'high', 'medium', 'low'];
const severityColors: Record<Severity, number> = { critical: 31, high: 33, medium: 36, low: 2 };

export function formatHumanReport(report: ScanReport, maxDisplayed = 50, useColor = false, options: ReportDisplayOptions = {}): string {
  const paint = (value: string, code: number): string => useColor ? `\u001b[${code}m${value}\u001b[0m` : value;
  const count = Object.fromEntries(order.map(s => [s, report.findings.filter(f => f.severity === s).length]));
  const overallComplete = report.stats.complete && (report.git?.complete ?? true);
  const output: string[] = [
    'RepoSafe MCP — ' + (report.verdict === 'review_required' ? paint('REVIEW REQUIRED', 31) : paint('NO FINDINGS IN SCANNED SCOPE', 32)),
    'Coverage: ' + (overallComplete ? 'complete within scanner limits' : 'INCOMPLETE; manual review required') +
      ' | Files read: ' + report.stats.filesScanned + ' | Findings kept: ' + report.findings.length +
      ((report.stats.overlengthLinesSkipped ?? 0) > 0 ?
        ' | Long lines skipped: ' + report.stats.overlengthLinesSkipped : '') +
      ((report.stats.findingsOmitted ?? 0) > 0 ? ' | Known omissions: ' + report.stats.findingsOmitted : ''),
    'Severity: ' + order.map(s => s + '=' + count[s]).join('  '),
    '────────────────────────────────────────────────────────────────'
  ];
  if (report.git?.historyWindow) {
    const w = report.git.historyWindow;
    output.push('Git history: inspected ' + report.git.commitsInspected +
      (report.git.historyCandidates === undefined ? '' : '/' + report.git.historyCandidates) +
      ' commits (cap ' + w.maxCommits + ', ' + w.maxDiffSizeMiB + ' MiB' +
      (w.since ? ', since ' + w.since : '') +
      (w.currentBranchOnly ? ', current branch only' : ', all local refs') + ').');
  }
  if (report.git?.historyResumedFrom !== undefined) {
    output.push('Local history checkpoint: reused ' + report.git.historyResumedFrom +
      ' previously inspected commits (explicit opt-in).');
  }
  const localTrackedCount = report.findings.filter(f => f.gitTracked === true).length;
  const localUntrackedCount = report.findings.filter(f => f.gitTracked === false).length;
  const historyCount = report.findings.filter(f => f.category === 'history').length;
  const testPathCount = report.findings.filter(f => f.testFile).length;
  if (localTrackedCount + localUntrackedCount + historyCount + testPathCount > 0) {
    output.push('Context: Git-index tracked=' + localTrackedCount +
      '  local-untracked=' + localUntrackedCount + '  history=' + historyCount +
      '  test-like paths=' + testPathCount + ' (overlapping categories).');
  }
  if (report.baseline) output.push(
    'Baseline: ' + report.baseline.suppressed + ' suppressed (' +
      report.baseline.highSuppressed + ' high/critical), ' + report.baseline.expired + ' expired.',
  );
  if (report.findings.length) {
    output.push('', paint('FINDINGS & ACTIONS', 1));
    const sorted = [...report.findings].sort((a, b) =>
      (options.groupBy === 'file' ? a.file.localeCompare(b.file) : order.indexOf(a.severity) - order.indexOf(b.severity)) ||
      (options.groupBy === 'file' ? order.indexOf(a.severity) - order.indexOf(b.severity) : a.file.localeCompare(b.file)) ||
      (a.line ?? 0) - (b.line ?? 0) || a.rule.localeCompare(b.rule));
    let previousGroup = '';
    if (options.summary) output.push('Summary view: use --compact or default scan to list the findings.');
    for (const [index, item] of (options.summary ? [] : sorted.slice(0, maxDisplayed)).entries()) {
      const group = options.groupBy === 'file' ? item.file : item.severity.toUpperCase();
      if (group !== previousGroup) {
        previousGroup = group;
        output.push('', paint((options.groupBy === 'file' ? 'FILE  ' : 'SEVERITY  ') + group, 1));
      }
      output.push((index + 1) + '. [' + paint(item.severity.toUpperCase(), severityColors[item.severity]) + '] ' + item.rule +
        ' — ' + item.file + (item.line ? ':' + item.line : '') +
        (item.commit ? ' (commit ' + item.commit + ')' : ''));
      if (!options.compact) {
        output.push('   Reason: ' + item.message, '   Action: ' + item.action);
        const context: string[] = [];
        if (item.category === 'history') {
          context.push('local Git history; remote publication not established');
        } else if (item.gitTracked === true) {
          context.push('tracked in local Git index; remote publication not established');
        } else if (item.gitTracked === false) {
          context.push('not tracked in local Git index; historical exposure not excluded');
        }
        if (item.testFile) context.push('test/fixture-like path; token validity unknown');
        if (context.length) output.push('   Context: ' + context.join('; '));
      }
    }
    if (sorted.length > maxDisplayed) output.push('... ' + (sorted.length - maxDisplayed) + ' additional findings; rerun with --all-findings or --json to see them.');
  } else {
    if ((report.baseline?.highSuppressed ?? 0) > 0) {
      output.push('', 'WARNING: high/critical findings were hidden by baseline exceptions. Review required.');
    } else {
      output.push('', 'No matching credential patterns or other findings were identified within the examined scope.');
    }
  }
  if (report.stats.warnings.length) {
    output.push('', paint('COVERAGE WARNINGS', 33));
    for (const note of new Set(report.stats.warnings)) output.push('- ' + note);
  }
  output.push('', 'Tip: --summary for counts; --compact for a short list; --group-by file to sort by file.');
  output.push('Next: review high-severity findings first; rotate exposed credentials, then scan again.');
  output.push('No findings does NOT mean the repository is safe to publish.');
  return output.join('\n');
}
