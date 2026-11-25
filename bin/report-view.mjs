// Presentation-only CLI renderer: never receives source code or matched token bytes.
// All counts and statuses come from the existing versioned, redacted scanner report.
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const COLORS = { critical: 91, high: 33, medium: 36, low: 32 };
const bar = n => n === 0 ? '·' : '■'.repeat(Math.min(12, Math.max(1, Math.ceil(Math.log2(n + 1)))));

function severityCounts(findings) {
  return Object.fromEntries(SEVERITIES.map(s => [s, findings.filter(f => f.severity === s).length]));
}

function orderFindings(a, b) {
  return SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
    a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) ||
    a.rule.localeCompare(b.rule);
}

export function renderPrettyReport(report, {
  color = false, summary = false, high = false, severity = null, details = false,
  compact = false, allFindings = false, groupBy = 'severity',
  reviewCommand = 'reposafe scan', explicitRoot = false, remoteSource = null, windowsPrivate = false, windows = false,
  ascii = false, width = 72, localSha = null,
} = {}) {
  if (report?.schemaVersion !== '2' || !Array.isArray(report.findings) ||
      !report.stats || typeof report.stats.complete !== 'boolean') {
    throw new Error('INVALID_REPORT');
  }
  const paint = (text, code) => color ? '\x1b[' + code + 'm' + text + '\x1b[0m' : text;
  const LINE = '─'.repeat(Math.max(20, Math.min(70, (width || 72) - 2)));
  const findings = report.findings;
  const counts = severityCounts(findings);
  const complete = report.stats.complete && (report.git?.complete ?? true);
  const restricted = findings.filter(f => severity ? f.severity === severity : !high || f.severity === 'critical' || f.severity === 'high');
  const out = [
    '╭' + LINE + '╮',
    '│ ' + paint('REPOSAFE', 1) + '   LOCAL REPOSITORY SECURITY AUDIT',
    '╰' + LINE + '╯',
    ...(remoteSource ? ['Source: public GitHub snapshot ' + remoteSource.url + ' @ ' + remoteSource.sha.slice(0, 12),
      '        Temporary local extraction; Git history not available.'] :
      ['Target: approved local directory', 'Git HEAD: ' + (localSha ? localSha + ' (observed after scan; working tree may differ)' : 'unavailable or not requested')]),
    '',
    'STATUS    ' + (report.verdict === 'review_required' ?
      paint('REVIEW REQUIRED', 33) : paint('NO FINDINGS IN SCANNED SCOPE', 32)),
    'Coverage: ' + (complete ? 'complete within scanner limits' :
      paint('INCOMPLETE; manual review required', 33)) +
      ' | Files read: ' + report.stats.filesScanned +
      ' | Findings kept: ' + findings.length +
      ((report.stats.findingsOmitted ?? 0) > 0 ?
        ' | Known omissions: ' + report.stats.findingsOmitted : '') +
      ((report.stats.overlengthLinesSkipped ?? 0) > 0 ?
        ' | Long lines skipped: ' + report.stats.overlengthLinesSkipped : ''),
    'Files: ' + (report.stats.complete ? 'complete within limits' : 'incomplete') +
      ' | Git: ' + (remoteSource ? 'snapshot only; index and history not inspected' :
        !report.git ? 'not inspected' : !report.git.gitAvailable ? 'unavailable' : !report.git.complete ? 'incomplete; see warnings' :
          report.git.historyChecked ? 'index and bounded history inspected' : 'index inspected; history not inspected'),
    ...(remoteSource ? ['LFS objects: not inspected | Submodules: not inspected'] : []),
    ...(high || severity ? ['Filtered findings: ' + restricted.length + ' of ' + findings.length + ' retained'] : []),
    '',
    paint('SEVERITY OVERVIEW', 1),
  ];
  for (const severity of SEVERITIES) {
    out.push('  ' + paint(severity.toUpperCase().padEnd(10), COLORS[severity]) +
      String(counts[severity]).padStart(5) + '   ' + paint(bar(counts[severity]), COLORS[severity]));
  }

  const tracked = findings.filter(f => f.gitTracked === true).length;
  const untracked = findings.filter(f => f.gitTracked === false).length;
  const testLike = findings.filter(f => f.testFile === true).length;
  const history = findings.filter(f => f.category === 'history').length;
  if (tracked + untracked + testLike + history > 0) {
    out.push('', 'CONTEXT   Tracked: ' + tracked + '  Untracked: ' + untracked +
      '  Git history: ' + history + '  Test-like: ' + testLike,
      '          Counts overlap; untracked does not imply never published.');
  }
  if (report.git?.historyWindow) {
    const w = report.git.historyWindow;
    out.push('', 'Git history: inspected ' + report.git.commitsInspected +
      (report.git.historyCandidates === undefined ? '' : '/' + report.git.historyCandidates) +
      ' commits (cap ' + w.maxCommits + ', ' + w.maxDiffSizeMiB + ' MiB' +
      (w.currentBranchOnly ? ', current branch only' : ', all local refs') +
      (w.since ? ', since ' + w.since : '') + ').');
  }
  if (report.git?.historyResumedFrom !== undefined) {
    out.push('Checkpoint: reused ' + report.git.historyResumedFrom + ' locally inspected commits (opt-in).');
  }
  if (report.baseline) {
    out.push('Baseline: ' + report.baseline.suppressed + ' suppressed (' +
      report.baseline.highSuppressed + ' high/critical), ' + report.baseline.expired + ' expired.');
  }

  if (!summary) {
    out.push('', paint(severity ? severity.toUpperCase() + ' DETECTION GROUPS' : high ? 'HIGH / CRITICAL DETECTION GROUPS' : 'DETECTION GROUPS — ALL SEVERITIES', 1));
    if (restricted.length === 0) {
      out.push(severity ? '  No ' + severity.toUpperCase() + ' findings in the examined scope.' : high ? '  No HIGH or CRITICAL findings in the examined scope.' :
        '  No findings were identified within the examined scope.');
    } else {
      const groups = new Map();
      for (const f of restricted) {
        const key = f.severity + '\0' + f.rule;
        const row = groups.get(key) ?? { severity: f.severity, rule: f.rule, count: 0,
          tracked: 0, untracked: 0, history: 0, test: 0 };
        row.count++;
        if (f.gitTracked === true) row.tracked++;
        if (f.gitTracked === false) row.untracked++;
        if (f.category === 'history') row.history++;
        if (f.testFile) row.test++;
        groups.set(key, row);
      }
      for (const row of [...groups.values()].sort((a, b) =>
        SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
        a.rule.localeCompare(b.rule))) {
        const context = [row.tracked && 'tracked:' + row.tracked,
          row.untracked && 'untracked:' + row.untracked,
          row.history && 'history:' + row.history,
          row.test && 'test-like:' + row.test].filter(Boolean);
        out.push('  ' + paint(row.severity.toUpperCase().padEnd(8), COLORS[row.severity]) + ' ' +
          row.rule.padEnd(34) + String(row.count).padStart(4) +
          (context.length ? '  ' + context.join(' ') : ''));
      }
      out.push('  ' + LINE, '  Total shown in groups: ' + restricted.length +
        (severity ? ' (filtered; full counts above)' : high ? ' (HIGH/CRITICAL only; full counts above)' : ' (all retained findings)'));
    }

    const showDetails = high || severity || details || compact || allFindings;
    if (showDetails && restricted.length) {
      const sorted = [...restricted].sort((a, b) =>
        groupBy === 'file' ?
          a.file.localeCompare(b.file) || orderFindings(a, b) :
          orderFindings(a, b));
      const limit = allFindings ? sorted.length : high ? 50 : compact ? 30 : 50;
      const displayed = sorted.slice(0, limit);
      out.push('', paint('FINDINGS & ACTIONS', 1));
      let lastGroup = '';
      for (const [index, f] of displayed.entries()) {
        const label = groupBy === 'file' ? f.file : f.severity.toUpperCase();
        if (label !== lastGroup) {
          lastGroup = label;
          out.push('', paint((groupBy === 'file' ? 'FILE  ' : 'SEVERITY  ') + label, 1));
        }
        out.push('  ' + (index + 1) + '. [' + paint(f.severity.toUpperCase(), COLORS[f.severity]) +
          '] ' + f.rule + ' — ' + f.file + (f.line ? ':' + f.line : '') +
          (f.commit ? ' (commit ' + f.commit + ')' : ''));
        if (!compact) {
          out.push('     Reason: ' + f.message, '     Action: ' + f.action);
          const context = [f.category === 'history' ? 'local Git history; remote exposure unverified' :
            f.gitTracked === true ? 'tracked locally; remote exposure unverified' :
            f.gitTracked === false ? 'not tracked locally; previous exposure not excluded' : '',
            f.testFile ? 'test-like path, credential validity unknown' : ''].filter(Boolean);
          if (context.length) out.push('     Context: ' + context.join('; '));
        }
      }
      if (sorted.length > displayed.length) {
        out.push('  ... ' + (sorted.length - displayed.length) +
          ' additional findings. Run with --all-findings to show all retained entries.');
      }
    } else if (!high && restricted.length) {
      out.push('', 'Use --high to inspect priority findings, or --details to inspect every rule and file.');
    }
  } else {
    out.push('', 'Summary view: run without --summary for per-rule counts and review guidance.');
  }

  const warnings = [...new Set([...(report.stats.warnings ?? []),
    ...(report.git?.warnings ?? [])])];
  if (!complete || warnings.length) {
    out.push('', paint('COVERAGE WARNINGS', 33));
    if (warnings.length === 0) out.push('  Coverage is incomplete; inspect the scan configuration.');
    for (const warning of warnings) out.push('  • ' + warning);
  }
  out.push('', paint('NEXT ACTIONS', 1));
  const commands = new Set();
  const commandLines = suffix => {
    const command = reviewCommand + suffix;
    if (explicitRoot) {
      if (!windows) { const line = '     ' + command + ' --root "$PWD"'; commands.add(line); return [line]; }
      const cmd = windowsPrivate ? command.replace(/^reposafe\.cmd/, '"%USERPROFILE%\\.reposafe\\node_modules\\.bin\\reposafe.cmd"') : command;
      const ps = windowsPrivate ? command.replace(/^reposafe\.cmd/, '& "$HOME\\.reposafe\\node_modules\\.bin\\reposafe.cmd"') : command;
      const lines = ['     CMD: ' + cmd + ' --root "%CD%"',
        '     PowerShell: ' + ps + ' --root (Get-Location).Path'];
      lines.forEach(line => commands.add(line)); return lines;
    }
    if (!windowsPrivate) { const line = '     ' + command; commands.add(line); return [line]; }
    const lines = ['     PATH: ' + command,
      '     CMD: ' + command.replace(/^reposafe\.cmd/, '"%USERPROFILE%\\.reposafe\\node_modules\\.bin\\reposafe.cmd"'),
      '     PowerShell: ' + command.replace(/^reposafe\.cmd/, '& "$HOME\\.reposafe\\node_modules\\.bin\\reposafe.cmd"')];
    lines.forEach(line => commands.add(line)); return lines;
  };
  // Commands reproduce the user's scan scope/options and run read-only.
  // They do re-scan; reports are not persisted or cached between CLI invocations.
  const priority = counts.critical + counts.high;
  if (priority || (report.baseline?.highSuppressed ?? 0)) {
    out.push('  1. PRIORITY — Review ' + priority + ' CRITICAL/HIGH findings (file:line, reason, action).',
      ...commandLines(' --high'));
    if ((report.baseline?.highSuppressed ?? 0) > 0) {
      out.push('     Warning: ' + report.baseline.highSuppressed + ' high/critical findings are suppressed by baseline.');
    }
  } else if (findings.length) {
    out.push('  1. REVIEW — Start with ' + counts.medium + ' MEDIUM and ' + counts.low + ' LOW findings.',
      ...commandLines(' --details'));
  } else {
    out.push('  1. REVIEW — No recognized findings in the inspected scope; this is not a safety guarantee.');
  }
  if (findings.length) {
    out.push('',
      '  2. BY FILE — Inspect ' + findings.length + ' findings grouped by relative file path' +
      (findings.length > 50 ? ' (first 50 displayed).' : '.'),
      ...commandLines(' --details --group-by file'));
    if (findings.length > 50) {
      out.push('     All retained findings:', ...commandLines(' --details --group-by file --all-findings'));
    }
    out.push('', '  3. SEVERITY — Inspect HIGH findings only:', ...commandLines(' --severity high'));
  }
  if (!complete) {
    out.push('',
      '  ' + (findings.length ? '4' : '2') + '. COVERAGE — Audit incomplete; review the warnings above.');
    if (report.git && report.git.gitAvailable === false) {
      out.push('     Git status was not inspected. Check the Git installation and working-tree root.');
    } else {
      out.push('     Do not interpret partial coverage as a clean repository.');
    }
  }
  if (explicitRoot) out.push('  First change directory to the same approved scan directory.');
  out.push('  Commands re-run the read-only scan; this report is not cached between runs.');
  out.push('  No findings does NOT mean the repository is safe to publish.');
  const maxWidth = Math.max(24, width || 72);
  const visibleLength = text => text.replace(/\x1b\[[0-9;]*m/g, '').length;
  const wrapped = out.flatMap(line => {
    if (commands.has(line) || visibleLength(line) <= maxWidth) return [line];
    const indent = (line.match(/^\s*/) ?? [''])[0];
    const words = line.trim().split(/\s+/); const lines = []; let current = indent;
    for (const word of words) {
      if (current.trim() && visibleLength(current) + 1 + visibleLength(word) > maxWidth) {
        lines.push(current); current = indent + word;
      } else current += (current.trim() ? ' ' : '') + word;
    }
    if (current.trim()) lines.push(current);
    return lines;
  });
  const result = wrapped.join('\n');
  return ascii ? result.replace(/[╭╮╰╯]/g, '+').replace(/│/g, '|').replace(/─/g, '-')
    .replace(/■/g, '#').replace(/[·•]/g, '*').replace(/—/g, '-') : result;
}
