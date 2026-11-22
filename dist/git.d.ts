import type { Finding, GitStats, ScanReport } from './types.js';
export interface HistoryScanOptions {
    depth?: number;
    since?: string;
    maxDiffSizeMiB?: number;
    currentBranchOnly?: boolean;
}
export interface GitResults {
    findings: Finding[];
    stats: GitStats;
}
export declare function scanGit(root: string, history?: boolean, limits?: HistoryScanOptions): Promise<GitResults>;
export declare function generateReport(root: string, options?: {
    includeGit?: boolean;
    includeHistory?: boolean;
    historyOptions?: HistoryScanOptions;
}): Promise<ScanReport>;
