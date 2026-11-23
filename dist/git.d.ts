import type { Finding, GitStats, ScanReport, ScanProgress } from './types.js';
export interface HistoryScanOptions {
    depth?: number;
    since?: string;
    maxDiffSizeMiB?: number;
    currentBranchOnly?: boolean;
    /** Explicit CLI-only opt-in to private, redacted checkpoint storage. */
    resume?: boolean;
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
    onProgress?: (progress: ScanProgress) => void;
}): Promise<ScanReport>;
