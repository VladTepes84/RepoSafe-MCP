import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  // Catch modified, deleted AND untracked compiler output; git diff alone misses new files.
  const changed = execFileSync('git', [
    'status', '--porcelain=v1', '--untracked-files=all', '--', 'dist/',
  ], { cwd: root, encoding: 'utf8', timeout: 10000, windowsHide: true });
  if (changed.trim()) {
    console.error('DISTRIBUTION OUT OF SYNC: run npm run build and commit dist/ changes.\n' + changed);
    process.exitCode = 1;
  } else {
    console.log('PRECOMPILED RUNTIME IN SYNC WITH COMMITTED SOURCES');
  }
} catch (error) {
  console.error('Cannot verify the generated distribution using Git:', error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
