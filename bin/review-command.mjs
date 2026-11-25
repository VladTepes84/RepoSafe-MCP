// Preserve copyable follow-up commands for the documented private npm install.
// Never print an absolute home-directory path or infer a target repository root.
import { join, normalize } from 'node:path';

export function reviewLauncher(entrypoint, home, platform = process.platform) {
  if (typeof entrypoint !== 'string' || typeof home !== 'string' || !home) return 'reposafe';
  const privateEntrypoint = join(home, '.reposafe', 'node_modules',
    'reposafe-mcp', 'bin', 'reposafe.mjs');
  if (normalize(entrypoint) !== normalize(privateEntrypoint)) return 'reposafe';
  if (platform === 'win32') return 'reposafe.cmd';
  return '"$HOME/.reposafe/node_modules/.bin/reposafe"';
}
