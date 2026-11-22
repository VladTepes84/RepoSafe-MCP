import type { Finding, ScanReport } from './types.js';
export declare const MAX_FINDINGS = 5000;
export declare function checkSecrets(line: string, file: string, lineNumber: number, category?: 'secrets' | 'history'): Finding[];
/** Conservative multi-line checks for Terraform variable defaults and Kubernetes Secret
 * data values. Called only after bounded text files are loaded. No source contents escape.
 * Git patch-history scanning remains line-only and is not claimed to support these contexts.
 */
export declare function checkStructuredFile(lines: string[], file: string): Finding[];
export declare function checkPrivacy(line: string, file: string, lineNumber: number): Finding[];
export declare function safeRelativePath(raw: string): string;
export declare function validateRoot(configuredPath: string): Promise<string>;
export declare function scanRepository(approvedRoot: string, options?: {
    skipBaseline?: boolean;
}): Promise<ScanReport>;
/** Inspect ONLY exact tracked paths in normally skipped dependency/cache directories.
 * A Git path is untrusted input; each parent component is lstat-checked before opening.
 * Individual files are read within strict resource budgets. Nothing is executed or written.
 */
export declare function scanSelectedTrackedFiles(approvedRoot: string, names: string[]): Promise<{
    findings: Finding[];
    filesScanned: number;
    bytesScanned: number;
    complete: boolean;
    warnings: string[];
}>;
