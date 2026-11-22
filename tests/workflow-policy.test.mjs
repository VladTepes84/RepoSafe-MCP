import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static review guard only; never starts a runner, checks out code, or calls a network API.
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('CI workflow uses immutable reviewed action revisions and minimal token permissions', () => {
  const uses = [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)].map(x => x[1]);
  assert.ok(uses.length >= 3, 'Expected two external actions and the local composite Action');
  for (const action of uses) {
    if (action.startsWith('./')) continue;
    assert.match(action, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}$/,
      'External Actions must use immutable reviewed full commit SHAs: ' + action);
  }
  assert.match(workflow, /^permissions:\s*\n  contents: read\s*$/m);
  assert.doesNotMatch(workflow, /\bpull_request_target\s*:/);
  assert.doesNotMatch(workflow, /\bsecurity-events:\s*write\b/);
});
