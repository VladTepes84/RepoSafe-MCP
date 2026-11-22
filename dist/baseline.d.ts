import type { ScanReport } from './types.js';
/** Exactly scoped, auditable exceptions. Untrusted repository configuration must not hide
 * high/critical findings from the overall verdict. The AI never receives exception reasons.
 */
export declare function applyBaseline(report: ScanReport, root: string): Promise<ScanReport>;
