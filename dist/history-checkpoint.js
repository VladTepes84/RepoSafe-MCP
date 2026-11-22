import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, lstat, open, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
// Explicit opt-in only. This is metadata from already-redacted findings, never
// the raw Git patch or matched values. The scanned repository is never changed.
const MAX_STATE_BYTES = 8 * 1024 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RESULTS = 5000;
function validFinding(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const finding = value;
    const permitted = ['category', 'rule', 'severity', 'file', 'line', 'commit', 'message', 'action'];
    if (Object.keys(finding).some(k => !permitted.includes(k)))
        return false;
    const category = ['secrets', 'privacy', 'readiness', 'history', 'git'];
    const severity = ['critical', 'high', 'medium', 'low'];
    return category.includes(String(finding.category)) && severity.includes(String(finding.severity)) &&
        typeof finding.rule === 'string' && finding.rule.length <= 160 &&
        typeof finding.file === 'string' && finding.file.length <= 1024 &&
        !finding.file.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(finding.file) &&
        typeof finding.message === 'string' && finding.message.length <= 512 &&
        typeof finding.action === 'string' && finding.action.length <= 512 &&
        (finding.line === undefined || (typeof finding.line === 'number' && Number.isSafeInteger(finding.line) && finding.line >= 0)) &&
        (finding.commit === undefined || (typeof finding.commit === 'string' && /^[a-f0-9]{12}$/.test(finding.commit)));
}
function validSnapshot(value, key) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const data = value;
    return data.version === 2 && data.key === key &&
        typeof data.commits === 'number' && Number.isSafeInteger(data.commits) && data.commits >= 0 && data.commits <= 5000 &&
        typeof data.batches === 'number' && Number.isSafeInteger(data.batches) && data.batches >= 0 && data.batches <= 5000 &&
        typeof data.complete === 'boolean' &&
        typeof data.updatedAt === 'number' && Number.isFinite(data.updatedAt) &&
        data.updatedAt <= Date.now() + 60_000 && data.updatedAt >= 0 &&
        Array.isArray(data.warnings) && data.warnings.length <= 128 &&
        data.warnings.every((x) => typeof x === 'string' && x.length <= 1024) &&
        Array.isArray(data.findings) && data.findings.length <= MAX_RESULTS &&
        data.findings.every(validFinding);
}
async function directory(path, privateMode) {
    try {
        await mkdir(path, { mode: 0o700 });
    }
    catch (error) {
        if (error.code !== 'EEXIST')
            throw error;
    }
    const st = await lstat(path);
    if (!st.isDirectory() || st.isSymbolicLink() ||
        (process.platform !== 'win32' && (st.mode & (privateMode ? 0o077 : 0o022)) !== 0)) {
        throw new Error('Unsafe RepoSafe checkpoint directory; no state read or written.');
    }
}
export async function historyCheckpoint(key) {
    if (!/^[a-f0-9]{64}$/.test(key))
        throw new Error('Invalid history checkpoint identity.');
    const base = join(homedir(), '.reposafe');
    await directory(base, false);
    const folder = join(base, 'checkpoints');
    await directory(folder, true);
    const path = join(folder, key + '.json');
    async function validateExisting() {
        let st;
        try {
            st = await lstat(path);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return false;
            throw error;
        }
        if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.size > MAX_STATE_BYTES ||
            (process.platform !== 'win32' && (st.mode & 0o077) !== 0)) {
            throw new Error('Unsafe history checkpoint file; use a fresh scan.');
        }
        return true;
    }
    return {
        async load() {
            if (!await validateExisting())
                return undefined;
            const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
            let raw;
            try {
                const st = await handle.stat();
                if (!st.isFile() || st.nlink !== 1 || st.size > MAX_STATE_BYTES) {
                    throw new Error('Unsafe history checkpoint content.');
                }
                raw = await handle.readFile({ encoding: 'utf8' });
            }
            finally {
                await handle.close();
            }
            let snapshot;
            try {
                snapshot = JSON.parse(raw);
            }
            catch {
                throw new Error('History checkpoint is invalid; rerun without --resume-history.');
            }
            // A validly located legacy snapshot is never reused. A fresh scan may
            // replace it atomically with the current schema after completing a batch.
            if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) &&
                snapshot.version === 1 &&
                snapshot.key === key)
                return undefined;
            if (!validSnapshot(snapshot, key)) {
                throw new Error('History checkpoint failed validation; rerun without --resume-history.');
            }
            return Date.now() - snapshot.updatedAt > MAX_AGE_MS ? undefined : snapshot;
        },
        async save(data) {
            if (!validSnapshot(data, key))
                throw new Error('Invalid history checkpoint snapshot.');
            const serialized = JSON.stringify(data);
            if (Buffer.byteLength(serialized) > MAX_STATE_BYTES) {
                throw new Error('History checkpoint exceeds safe storage budget.');
            }
            await validateExisting();
            const tmp = path + '.' + randomUUID() + '.tmp';
            try {
                await writeFile(tmp, serialized, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
                await rename(tmp, path);
            }
            finally {
                await unlink(tmp).catch(() => { });
            }
        },
    };
}
