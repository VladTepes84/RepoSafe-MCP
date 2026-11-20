export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Category = 'secrets' | 'privacy' | 'readiness' | 'history' | 'git';

export interface Finding {
  category: Category;
  rule: string;
  severity: Severity;
  file: string;
  line?: number;
  /** Abbreviated Git commit ID for history findings; never contains a secret value. */
  commit?: string;
  message: string;
  action: string;
}

export interface ScanStats {
  filesScanned: number;
  directoriesVisited: number;
  bytesScanned: number;
  filesSkipped: number;
  complete: boolean;
  warnings: string[];
}

export interface GitStats {
  historyChecked: boolean;
  commitsInspected: number;
  trackedExcludedFilesRequested?: number;
  trackedExcludedFilesScanned?: number;
  gitAvailable: boolean;
  complete: boolean;
  warnings: string[];
}

export interface ScanReport {
  schemaVersion: '2';
  scanner: 'reposafe-mcp';
  verdict: 'review_required' | 'no_findings_in_scope';
  findings: Finding[];
  stats: ScanStats;
  git?: GitStats;
  limitations: string[];
  /** Exact-match baseline exceptions; counts are disclosed, reasons never returned to AI. */
  baseline?: { entries: number; suppressed: number; highSuppressed: number; expired: number };
}
