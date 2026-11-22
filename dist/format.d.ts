import type { ScanReport } from './types.js';
export interface ReportDisplayOptions {
    summary?: boolean;
    compact?: boolean;
    groupBy?: 'severity' | 'file';
}
export declare function formatHumanReport(report: ScanReport, maxDisplayed?: number, useColor?: boolean, options?: ReportDisplayOptions): string;
