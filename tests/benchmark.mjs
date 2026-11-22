#!/usr/bin/env node
// Synthetic-only performance and memory measurements. No user repository,
// network service, credential, IDE or background process is involved.
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { generateReport } from '../dist/git.js';

const full = process.argv.includes('--full');
if (process.argv.slice(2).some(a => a !== '--full' && a !== '--smoke')) {
  console.error('Usage: node tests/benchmark.mjs [--smoke|--full]');
  process.exit(2);
}
const scenarios = full
  ? [['small', 100, 15], ['medium', 1500, 150], ['large', 6000, 400]]
  : [['small', 30, 4], ['medium', 200, 15], ['large', 800, 40]];
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {
  timeout: 12000, stdio: 'pipe', encoding: 'utf8',
});
const results = [];
for (const [name, files, commits] of scenarios) {
  const root = await mkdtemp(join(tmpdir(), 'reposafe-benchmark-'));
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.name', 'Synthetic Benchmark');
    git(root, 'config', 'user.email', 'bench@example.invalid');
    await writeFile(join(root, 'README.md'), '# Synthetic benchmark\n');
    await writeFile(join(root, 'LICENSE'), 'MIT\n');
    await writeFile(join(root, '.gitignore'), '.env\n.env.*\n');
    await mkdir(join(root, 'src'));
    for (let index = 0; index < files; index += 100) {
      await Promise.all(Array.from({ length: Math.min(100, files - index) }, (_, offset) => {
        const number = index + offset;
        return writeFile(join(root, 'src', 'file-' + number + '.txt'),
          'synthetic-file-' + number + '=no-credential\n');
      }));
    }
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'synthetic files');
    for (let i = 0; i < commits; i++) {
      await writeFile(join(root, 'history.txt'), 'synthetic commit #' + i + '\n');
      git(root, 'add', 'history.txt');
      git(root, 'commit', '-qm', 'benchmark ' + i);
    }

    let peak = process.memoryUsage().rss;
    const sampler = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 10);
    const started = performance.now();
    let report;
    try {
      report = await generateReport(root, { historyOptions: { depth: commits + 1, maxDiffSizeMiB: 4 } });
    } finally { clearInterval(sampler); }
    peak = Math.max(peak, process.memoryUsage().rss);
    const elapsedMs = Math.round(performance.now() - started);
    if (!report.stats.complete || !report.git?.complete ||
        report.git.commitsInspected !== commits + 1) {
      throw new Error('Incomplete synthetic benchmark coverage: ' + name);
    }
    results.push({ scenario: name, files, commits: commits + 1, elapsedMs,
      observedPeakRssMiB: Math.round(peak / (1024 * 1024)) });
  } finally {
    // Git for Windows may briefly retain a handle after the history child exits.
    // Retry only removal of this owned synthetic temp fixture; never suppress a failure.
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
}
console.log(JSON.stringify({ scanner: 'reposafe-mcp', mode: full ? 'full' : 'smoke',
  platform: process.platform, node: process.version, measurements: results }, null, 2));
