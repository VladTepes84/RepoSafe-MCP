import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', timeout: 10000, windowsHide: true,
});
try {
  // Use normalized Git content diffs: Windows checkout stat/line endings may
  // appear dirty in porcelain status even when compiled content is identical.
  const changed = git('diff', '--name-only', '--', 'dist/').trim();
  const untracked = git('ls-files', '--others', '--exclude-standard', '--', 'dist/').trim();
  if (changed || untracked) {
    console.error('DISTRIBUTION OUT OF SYNC: run npm run build and commit dist/ changes.');
    if (changed) console.error('Modified tracked runtime:\n' + changed);
    if (untracked) console.error('Missing committed runtime files:\n' + untracked);
    process.exitCode = 1;
  } else {
    console.log('PRECOMPILED RUNTIME IN SYNC WITH COMMITTED SOURCES');
  }
} catch (error) {
  console.error('Cannot verify the generated distribution using Git:', error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
