const order = ['critical', 'high', 'medium', 'low'];
const severityColors = { critical: 31, high: 33, medium: 36, low: 2 };
export function formatHumanReport(report, maxDisplayed = 50, useColor = false, options = {}) {
    const paint = (value, code) => useColor ? `\u001b[${code}m${value}\u001b[0m` : value;
    const count = Object.fromEntries(order.map(s => [s, report.findings.filter(f => f.severity === s).length]));
    const overallComplete = report.stats.complete && (report.git?.complete ?? true);
    const output = [
        'RepoSafe MCP — ' + (report.verdict === 'review_required' ? paint('REVIEW REQUIRED', 31) : paint('NO FINDINGS IN SCANNED SCOPE', 32)),
        'Coverage: ' + (overallComplete ? 'complete within scanner limits' : 'INCOMPLETE; manual review required') +
            ' | Files read: ' + report.stats.filesScanned + ' | Findings kept: ' + report.findings.length +
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
    if (report.baseline)
        output.push('Baseline: ' + report.baseline.suppressed + ' suppressed (' +
            report.baseline.highSuppressed + ' high/critical), ' + report.baseline.expired + ' expired.');
    if (report.findings.length) {
        output.push('', paint('FINDINGS & ACTIONS', 1));
        const sorted = [...report.findings].sort((a, b) => (options.groupBy === 'file' ? a.file.localeCompare(b.file) : order.indexOf(a.severity) - order.indexOf(b.severity)) ||
            (options.groupBy === 'file' ? order.indexOf(a.severity) - order.indexOf(b.severity) : a.file.localeCompare(b.file)) ||
            (a.line ?? 0) - (b.line ?? 0) || a.rule.localeCompare(b.rule));
        let previousGroup = '';
        if (options.summary)
            output.push('Summary view: use --compact or default scan to list the findings.');
        for (const [index, item] of (options.summary ? [] : sorted.slice(0, maxDisplayed)).entries()) {
            const group = options.groupBy === 'file' ? item.file : item.severity.toUpperCase();
            if (group !== previousGroup) {
                previousGroup = group;
                output.push('', paint((options.groupBy === 'file' ? 'FILE  ' : 'SEVERITY  ') + group, 1));
            }
            output.push((index + 1) + '. [' + paint(item.severity.toUpperCase(), severityColors[item.severity]) + '] ' + item.rule +
                ' — ' + item.file + (item.line ? ':' + item.line : '') +
                (item.commit ? ' (commit ' + item.commit + ')' : ''));
            if (!options.compact)
                output.push('   Reason: ' + item.message, '   Action: ' + item.action);
        }
        if (sorted.length > maxDisplayed)
            output.push('... ' + (sorted.length - maxDisplayed) + ' additional findings; rerun with --all-findings or --json to see them.');
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
        output.push('', paint('COVERAGE WARNINGS', 33));
        for (const note of new Set(report.stats.warnings))
            output.push('- ' + note);
    }
    output.push('', 'Tip: --summary for counts; --compact for a short list; --group-by file to sort by file.');
    output.push('Next: review high-severity findings first; rotate exposed credentials, then scan again.');
    output.push('No findings does NOT mean the repository is safe to publish.');
    return output.join('\n');
}
