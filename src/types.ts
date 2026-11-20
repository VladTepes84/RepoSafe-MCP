export type Severity = 'high' | 'medium' | 'low';
export type Category = 'secrets' | 'privacy' | 'readiness';

export interface Finding {
  category: Category;
  rule: string;
  severity: Severity;
  file: string;
  line?: number;
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

export interface ScanReport {
  schemaVersion: '1';
  scanner: 'reposafe-mcp';
  verdict: 'review_required' | 'no_findings_in_scope';
  findings: Finding[];
  stats: ScanStats;
  limitations: string[];
}
