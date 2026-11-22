import type { Finding } from './types.js';
export interface HistorySnapshot {
    version: 2;
    key: string;
    commits: number;
    batches: number;
    findings: Finding[];
    warnings: string[];
    complete: boolean;
    updatedAt: number;
}
export declare function historyCheckpoint(key: string): Promise<{
    load(): Promise<HistorySnapshot | undefined>;
    save(data: HistorySnapshot): Promise<void>;
}>;
