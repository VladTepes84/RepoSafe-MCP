import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import type { ScanReport } from './types.js';

const MAX_CONFIG_BYTES = 16 * 1024;
const MAX_EXCEPTIONS = 100;
interface Exception { path: string; rule: string; reason: string; expires?: string }

function validException(value: unknown): value is Exception {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some(key => !['path', 'rule', 'reason', 'expires'].includes(key))) return false;
  if (typeof item.path !== 'string' || item.path.length > 240 || !item.path ||
      isAbsolute(item.path) || item.path.includes('\\') || item.path.includes('*') ||
      item.path.split('/').some(x => !x || x === '.' || x === '..')) return false;
  if (typeof item.rule !== 'string' || !/^[a-z][a-z0-9_]{2,79}$/.test(item.rule)) return false;
  if (typeof item.reason !== 'string' || item.reason.length < 8 || item.reason.length > 160) return false;
  if (item.expires !== undefined && (typeof item.expires !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.expires) ||
      Number.isNaN(Date.parse(item.expires + 'T00:00:00Z')) ||
      new Date(item.expires + 'T00:00:00Z').toISOString().slice(0, 10) !== item.expires)) return false;
  return true;
}

function invalid(report: ScanReport): ScanReport {
  report.stats.complete = false;
  report.stats.warnings.push('Invalid or unreadable .reposafe.json baseline; no suppressions applied.');
  report.verdict = 'review_required';
  return report;
}

/** Exactly scoped, auditable exceptions. Untrusted repository configuration must not hide
 * high/critical findings from the overall verdict. The AI never receives exception reasons.
 */
export async function applyBaseline(report: ScanReport, root: string): Promise<ScanReport> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let input: string;
  try {
    handle = await open(join(root, '.reposafe.json'), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const st = await handle.stat();
    if (!st.isFile() || st.nlink > 1 || st.size > MAX_CONFIG_BYTES) return invalid(report);
    input = await handle.readFile({ encoding: 'utf8' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return report;
    return invalid(report);
  } finally { await handle?.close(); }
  let entries: Exception[];
  try {
    const config: unknown = JSON.parse(input);
    if (!config || typeof config !== 'object' || Array.isArray(config)) return invalid(report);
    const data = config as Record<string, unknown>;
    if (Object.keys(data).some(k => !['version', 'exceptions'].includes(k)) ||
        data.version !== 1 || !Array.isArray(data.exceptions) || data.exceptions.length > MAX_EXCEPTIONS ||
        !data.exceptions.every(validException)) return invalid(report);
    entries = data.exceptions;
    if (new Set(entries.map(e => e.path + '\0' + e.rule)).size !== entries.length) return invalid(report);
  } catch { return invalid(report); }
  const today = new Date().toISOString().slice(0, 10);
  const active = entries.filter(x => !x.expires || x.expires >= today);
  const expired = entries.length - active.length;
  let suppressed = 0, highSuppressed = 0;
  report.findings = report.findings.filter(f => {
    const matched = active.some(e => e.path === f.file && e.rule === f.rule);
    if (!matched) return true;
    suppressed++;
    if (f.severity === 'high' || f.severity === 'critical') highSuppressed++;
    return false;
  });
  report.baseline = { entries: entries.length, suppressed, highSuppressed, expired };
  if (suppressed) report.stats.warnings.push('Baseline exceptions suppressed findings; review .reposafe.json changes in every PR.');
  if (expired) report.stats.warnings.push('Expired baseline exceptions are ignored.');
  // An exception for a high-risk secret must never produce a supposedly clean scan.
  report.verdict = report.stats.complete && report.findings.length === 0 && highSuppressed === 0
    ? 'no_findings_in_scope' : 'review_required';
  return report;
}
