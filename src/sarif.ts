import type { Finding, ScanReport, Severity } from './types.js';

const SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

function severityLevel(severity: Severity): 'error' | 'warning' | 'note' {
  if (severity === 'critical' || severity === 'high') return 'error';
  if (severity === 'medium') return 'warning';
  return 'note';
}

function artifactUri(relativeFile: string): string | undefined {
  // Never put absolute paths, unsanitized link targets or placeholder redactions into SARIF locations.
  if (!relativeFile || relativeFile === '.' || relativeFile.startsWith('[') ||
      relativeFile.startsWith('/') || relativeFile.includes('\\') ||
      relativeFile.split('/').some(p => !p || p === '.' || p === '..')) return undefined;
  return relativeFile.split('/').map(encodeURIComponent).join('/');
}

function location(finding: Finding): object[] | undefined {
  const uri = artifactUri(finding.file);
  if (!uri) return undefined;
  return [{
    physicalLocation: {
      artifactLocation: { uri },
      ...(finding.line && finding.line > 0 ? { region: { startLine: finding.line } } : {}),
    },
  }];
}

/** Serialize only safe, already-redacted Finding metadata; never include repository contents. */
export function reportToSarif(report: ScanReport): object {
  const rules = new Map<string, { id: string; shortDescription: { text: string }; defaultConfiguration: { level: 'error' | 'warning' | 'note' } }>();
  const results: object[] = [];
  for (const finding of report.findings) {
    const id = 'reposafe/' + finding.rule;
    if (!rules.has(id)) rules.set(id, {
      id, shortDescription: { text: finding.message },
      defaultConfiguration: { level: severityLevel(finding.severity) },
    });
    const loc = location(finding);
    results.push({
      ruleId: id,
      level: severityLevel(finding.severity),
      message: { text: finding.message + ' Recommended action: ' + finding.action },
      ...(loc ? { locations: loc } : {}),
      properties: {
        category: finding.category, severity: finding.severity,
        ...(finding.commit ? { introducingCommit: finding.commit } : {}),
      },
    });
  }
  if ((report.baseline?.highSuppressed ?? 0) > 0) {
    const id = 'reposafe/high_risk_baseline_suppression';
    rules.set(id, {
      id, shortDescription: { text: 'High-risk findings were suppressed by a baseline exception.' },
      defaultConfiguration: { level: 'warning' },
    });
    results.push({
      ruleId: id, level: 'warning',
      message: { text: 'The baseline hides one or more high/critical findings. Review these exceptions before publishing.' },
      properties: { highRiskSuppressionCount: report.baseline!.highSuppressed },
    });
  }
  if (!report.stats.complete) {
    const id = 'reposafe/incomplete_scan';
    rules.set(id, {
      id, shortDescription: { text: 'Repository scanning was incomplete.' },
      defaultConfiguration: { level: 'warning' },
    });
    results.push({
      ruleId: id, level: 'warning',
      message: { text: 'RepoSafe did not inspect the full requested scope. Review scan coverage and warnings.' },
      properties: { coverageComplete: false },
    });
  }
  return {
    version: '2.1.0', $schema: SCHEMA,
    runs: [{
      tool: { driver: {
        name: 'RepoSafe MCP', version: '0.7.0',
        informationUri: 'https://github.com/VladTepes84/RepoSafe-MCP',
        rules: [...rules.values()],
      } },
      results,
      properties: {
        verdict: report.verdict, coverageComplete: report.stats.complete,
        filesScanned: report.stats.filesScanned,
        baselineSuppressed: report.baseline?.suppressed ?? 0,
        baselineHighSuppressed: report.baseline?.highSuppressed ?? 0,
        ...(report.git?.historyWindow ? { gitHistory: {
          inspectedCommits: report.git.commitsInspected,
          maxCommits: report.git.historyWindow.maxCommits,
          maxDiffSizeMiB: report.git.historyWindow.maxDiffSizeMiB,
          since: report.git.historyWindow.since ?? null,
          currentBranchOnly: report.git.historyWindow.currentBranchOnly,
        } } : {}),
      },
    }],
  };
}
