const order = ['critical', 'high', 'medium', 'low'];
export function formatHumanReport(report) {
    const count = Object.fromEntries(order.map(s => [s, report.findings.filter(f => f.severity === s).length]));
    const output = [
        'RepoSafe MCP — ' + (report.verdict === 'review_required' ? 'REVIEW REQUIRED' : 'NO FINDINGS IN SCANNED SCOPE'),
        'Coverage: ' + (report.stats.complete ? 'complete within scanner limits' : 'INCOMPLETE; manual review required') +
            ' | Files: ' + report.stats.filesScanned + ' | Findings: ' + report.findings.length,
        'Severity: ' + order.map(s => s + '=' + count[s]).join('  '),
    ];
    if (report.git?.historyWindow) {
        const w = report.git.historyWindow;
        output.push('Git history: inspected ' + report.git.commitsInspected +
            ' commits (cap ' + w.maxCommits + ', ' + w.maxDiffSizeMiB + ' MiB' +
            (w.since ? ', since ' + w.since : '') +
            (w.currentBranchOnly ? ', current branch only' : ', all local refs') + ').');
    }
    if (report.baseline)
        output.push('Baseline: ' + report.baseline.suppressed + ' suppressed (' +
            report.baseline.highSuppressed + ' high/critical), ' + report.baseline.expired + ' expired.');
    if (report.findings.length) {
        output.push('', 'FINDINGS & ACTIONS');
        const sorted = [...report.findings].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) ||
            a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
        for (const [index, item] of sorted.entries()) {
            output.push((index + 1) + '. [' + item.severity.toUpperCase() + '] ' + item.rule +
                ' — ' + item.file + (item.line ? ':' + item.line : '') +
                (item.commit ? ' (commit ' + item.commit + ')' : ''));
            output.push('   Reason: ' + item.message, '   Action: ' + item.action);
        }
    }
    else {
        if ((report.baseline?.highSuppressed ?? 0) > 0) {
            output.push('', 'WARNING: high/critical findings were hidden by baseline exceptions. Review required.');
        }
        else {
            output.push('', 'No matching credential patterns or other findings were identified within the examined scope.');
        }
    }
    if (report.stats.warnings.length) {
        output.push('', 'COVERAGE WARNINGS');
        for (const note of new Set(report.stats.warnings))
            output.push('- ' + note);
    }
    output.push('', 'Next: review high-severity findings first; rotate exposed credentials, then scan again.');
    output.push('No findings does NOT mean the repository is safe to publish.');
    return output.join('\n');
}
