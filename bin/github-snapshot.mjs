// GitHub public snapshot transport, separate from the read-only scanner.
// No Git checkout, shell, third-party archive package, redirects or untrusted links.
// Only regular files from bounded, checksummed tar entries are materialized.
import https from 'node:https';
import { createGunzip } from 'node:zlib';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

const MAX_METADATA = 128 * 1024;
const MAX_REPO_KIB = 64 * 1024;
const MAX_COMPRESSED = 32 * 1024 * 1024;
const MAX_UNCOMPRESSED = 96 * 1024 * 1024;
const MAX_FILES_BYTES = 64 * 1024 * 1024;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 10_000;
const MAX_DEPTH = 20;
const MAX_PAX_BYTES = 16 * 1024;
const MAX_FETCH_MS = 45_000;

export function parseGithubUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 280 || !/^https:\/\/github\.com\//i.test(raw) ||
      /[%?#\u0000-\u0020\u007f\\]/.test(raw)) throw new Error('REMOTE_URL_INVALID');
  let url;
  try { url = new URL(raw); } catch { throw new Error('REMOTE_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port ||
      url.username || url.password || url.search || url.hash) throw new Error('REMOTE_URL_INVALID');
  const parts = url.pathname.replace(/\/$/, '').split('/');
  if (parts.length !== 3) throw new Error('REMOTE_URL_INVALID');
  const owner = parts[1];
  const repoName = parts[2].endsWith('.git') ? parts[2].slice(0, -4) : parts[2];
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner) ||
      !/^[a-z\d_.-]{1,100}$/i.test(repoName) ||
      repoName === '.' || repoName === '..' || repoName.includes('..')) {
    throw new Error('REMOTE_URL_INVALID');
  }
  return { owner, repo: repoName, url: 'https://github.com/' + owner + '/' + repoName };
}

function openFixedHost(host, path, signal) {
  return new Promise((resolve, reject) => {
    const req = https.get({
      protocol: 'https:', hostname: host, port: 443, path, signal,
      headers: {
        'User-Agent': 'RepoSafe-MCP/1.0 (bounded local GitHub snapshot)',
        'Accept': host === 'api.github.com' ? 'application/vnd.github+json' : 'application/octet-stream',
        'Accept-Encoding': 'identity',
        ...(host === 'api.github.com' ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}),
      },
    }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('REMOTE_HTTP_UNAVAILABLE'));
        return;
      }
      resolve(res);
    });
    req.setTimeout(15000, () => req.destroy(new Error('REMOTE_TIMEOUT')));
    req.once('error', reject);
  });
}

async function fetchJson(path, signal) {
  const response = await openFixedHost('api.github.com', path, signal);
  let bytes = 0;
  const parts = [];
  for await (const chunk of response) {
    bytes += chunk.length;
    if (bytes > MAX_METADATA) {
      response.destroy();
      throw new Error('REMOTE_METADATA_LIMIT');
    }
    parts.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new Error('REMOTE_METADATA_INVALID'); }
}

function field(header, start, length) {
  const data = header.subarray(start, start + length);
  const nul = data.indexOf(0);
  return data.subarray(0, nul < 0 ? data.length : nul).toString('utf8');
}
function octal(header, start, length) {
  const data = field(header, start, length).trim();
  if (!/^[0-7]+$/.test(data)) throw new Error('REMOTE_ARCHIVE_INVALID');
  const number = parseInt(data, 8);
  if (!Number.isSafeInteger(number)) throw new Error('REMOTE_ARCHIVE_INVALID');
  return number;
}
function parsePax(data, { global = false } = {}) {
  let at = 0;
  let path = null;
  while (at < data.length) {
    const space = data.indexOf(32, at);
    if (space < 0 || space - at > 8) throw new Error('REMOTE_ARCHIVE_INVALID');
    const length = Number(data.subarray(at, space).toString('ascii'));
    if (!Number.isSafeInteger(length) || length <= space - at + 2 || at + length > data.length ||
        data[at + length - 1] !== 10) throw new Error('REMOTE_ARCHIVE_INVALID');
    const record = data.subarray(space + 1, at + length - 1).toString('utf8');
    const equals = record.indexOf('=');
    if (equals < 1) throw new Error('REMOTE_ARCHIVE_INVALID');
    const key = record.slice(0, equals);
    if (key === 'size' || key.startsWith('GNU.sparse') || key === 'linkpath' ||
        (global && key === 'path')) {
      throw new Error('REMOTE_ARCHIVE_UNSUPPORTED');
    }
    // A global PAX header applies to future entries. Only harmless metadata
    // fields are accepted; never adopt a global path, size or link override.
    if (global && !['comment', 'mtime', 'atime', 'ctime', 'uid', 'gid',
      'uname', 'gname'].includes(key)) {
      throw new Error('REMOTE_ARCHIVE_UNSUPPORTED');
    }
    if (key === 'path') path = record.slice(equals + 1);
    at += length;
  }
  return path;
}

export class SafeTarExtractor {
  constructor(root) {
    this.root = root;
    this.pending = Buffer.alloc(0);
    this.entry = null;
    this.nextPath = null;
    this.prefix = null;
    this.ended = false;
    this.files = 0;
    this.total = 0;
    this.uncompressed = 0;
  }

  safePath(raw) {
    if (typeof raw !== 'string' || raw.length > 1024 || raw.startsWith('/') ||
        /[\\:\u0000-\u001f\u007f]/.test(raw)) throw new Error('REMOTE_ARCHIVE_PATH');
    const trimmed = raw.endsWith('/') ? raw.slice(0, -1) : raw;
    const parts = trimmed.split('/');
    if (!parts[0] || parts.some(x => !x || x === '.' || x === '..') ||
        parts.length > MAX_DEPTH + 1) throw new Error('REMOTE_ARCHIVE_PATH');
    if (this.prefix === null) this.prefix = parts[0];
    if (parts[0] !== this.prefix) throw new Error('REMOTE_ARCHIVE_PATH');
    if (parts.length === 1) return null;
    if (parts.slice(1).some(x => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x) ||
        x.endsWith('.') || x.endsWith(' '))) throw new Error('REMOTE_ARCHIVE_PATH');
    return parts.slice(1);
  }

  async push(chunk) {
    this.uncompressed += chunk.length;
    if (this.uncompressed > MAX_UNCOMPRESSED) throw new Error('REMOTE_ARCHIVE_LIMIT');
    this.pending = Buffer.concat([this.pending, chunk]);
    while (true) {
      if (this.ended) {
        if (this.pending.some(byte => byte !== 0)) throw new Error('REMOTE_ARCHIVE_INVALID');
        this.pending = Buffer.alloc(0);
        return;
      }
      if (!this.entry) {
        if (this.pending.length < 512) return;
        const header = this.pending.subarray(0, 512);
        this.pending = this.pending.subarray(512);
        if (header.every(byte => byte === 0)) {
          this.ended = true;
          continue;
        }
        const supplied = octal(header, 148, 8);
        let checksum = 0;
        for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
        if (supplied !== checksum) throw new Error('REMOTE_ARCHIVE_INVALID');
        const size = octal(header, 124, 12);
        const type = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
        if (!['0', '5', 'x', 'L', 'g'].includes(type)) throw new Error('REMOTE_ARCHIVE_UNSUPPORTED');
        if (type === 'x' || type === 'L' || type === 'g') {
          if (size > MAX_PAX_BYTES) throw new Error('REMOTE_ARCHIVE_LIMIT');
        } else if (type === '0') {
          if (size > MAX_FILE_BYTES || this.total + size > MAX_FILES_BYTES ||
              this.files >= MAX_FILES) throw new Error('REMOTE_ARCHIVE_LIMIT');
        } else if (size !== 0) throw new Error('REMOTE_ARCHIVE_INVALID');
        const name = field(header, 0, 100);
        const prefix = field(header, 345, 155);
        const path = this.nextPath ?? (prefix ? prefix + '/' + name : name);
        this.nextPath = null;
        this.entry = { path, size, type };
      }
      const { size, type, path } = this.entry;
      const padded = Math.ceil(size / 512) * 512;
      if (this.pending.length < padded) return;
      const data = this.pending.subarray(0, size);
      this.pending = this.pending.subarray(padded);
      if (type === 'g') {
        // GitHub Codeload archives may begin with a global PAX comment.
        // Consume metadata only; never create files or inherit unsafe overrides.
        parsePax(data, { global: true });
      } else if (type === 'x') {
        this.nextPath = parsePax(data);
      } else if (type === 'L') {
        const nul = data.indexOf(0);
        this.nextPath = data.subarray(0, nul < 0 ? data.length : nul).toString('utf8').replace(/\n$/, '');
      } else {
        const pathParts = this.safePath(path);
        if (type === '0' && pathParts) {
          const target = join(this.root, ...pathParts);
          await mkdir(join(this.root, ...pathParts.slice(0, -1)), { recursive: true, mode: 0o700 });
          await writeFile(target, data, { flag: 'wx', mode: 0o600 });
          this.files++;
          this.total += size;
        }
      }
      this.entry = null;
    }
  }

  finish() {
    if (!this.ended || this.entry || this.nextPath !== null || this.files === 0) {
      throw new Error('REMOTE_ARCHIVE_TRUNCATED');
    }
  }
}

export async function unpackGithubArchive(response, destination, signal) {
  const gunzip = createGunzip();
  const extractor = new SafeTarExtractor(destination);
  let compressed = 0;
  response.on('data', chunk => {
    compressed += chunk.length;
    if (compressed > MAX_COMPRESSED) response.destroy(new Error('REMOTE_DOWNLOAD_LIMIT'));
  });
  response.on('error', error => gunzip.destroy(error));
  if (signal?.aborted) response.destroy(new Error('REMOTE_INTERRUPTED'));
  response.pipe(gunzip);
  try {
    for await (const chunk of gunzip) await extractor.push(chunk);
    extractor.finish();
    return { files: extractor.files, bytes: extractor.total };
  } catch (error) {
    gunzip.destroy();
    response.destroy();
    throw error;
  }
}

export async function createGithubSnapshot(raw, signal) {
  const parsed = parseGithubUrl(raw);
  const deadline = AbortSignal.timeout(MAX_FETCH_MS);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let root;
  try {
    const metadata = await fetchJson('/repos/' + parsed.owner + '/' + parsed.repo, combined);
    if (metadata.private !== false || !Number.isSafeInteger(metadata.size) ||
        metadata.size > MAX_REPO_KIB || !metadata.default_branch ||
        typeof metadata.default_branch !== 'string') throw new Error('REMOTE_REPOSITORY_UNAVAILABLE');
    const commit = await fetchJson('/repos/' + parsed.owner + '/' + parsed.repo +
      '/commits/' + encodeURIComponent(metadata.default_branch), combined);
    if (!/^[0-9a-f]{40}$/.test(commit.sha ?? '')) throw new Error('REMOTE_COMMIT_INVALID');
    root = await mkdtemp(join(tmpdir(), 'reposafe-remote-'));
    const response = await openFixedHost('codeload.github.com', '/' +
      parsed.owner + '/' + parsed.repo + '/tar.gz/' + commit.sha, combined);
    const scanned = await unpackGithubArchive(response, root, combined);
    return { root, url: parsed.url, sha: commit.sha, ...scanned };
  } catch (error) {
    if (root) await rm(root, { recursive: true, force: true, maxRetries: 3 });
    if (combined.aborted) throw new Error('REMOTE_TIMEOUT_OR_INTERRUPTED');
    const known = /^REMOTE_[A-Z_]+$/;
    throw new Error(known.test(error?.message ?? '') ? error.message : 'REMOTE_DOWNLOAD_FAILED');
  }
}
