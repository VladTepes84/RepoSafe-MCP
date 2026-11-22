import type { ScanReport } from './types.js';
/** Serialize only safe, already-redacted Finding metadata; never include repository contents. */
export declare function reportToSarif(report: ScanReport): object;
