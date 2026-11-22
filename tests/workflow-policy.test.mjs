import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Static, offline review guard. Future workflows are included automatically.
const directory = new URL('../.github/workflows/', import.meta.url);
const workflows = readdirSync(directory).filter(name => /\.ya?ml$/.test(name));

test('repository defines at least one reviewed GitHub Actions workflow', () => {
  assert.ok(workflows.length > 0);
});

for (const name of workflows) {
  test(name + ': immutable external Actions and read-only token permission', () => {
    const workflow = readFileSync(new URL(name, directory), 'utf8');
    const uses = [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)].map(x => x[1]);
    assert.ok(uses.length > 0, name + ': no Actions steps discovered');
    for (const action of uses) {
      if (action.startsWith('./')) continue; // Local repository action needs no remote ref.
      assert.match(action, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}$/,
        name + ': external Action is not pinned to a full reviewed SHA: ' + action);
    }
    assert.match(workflow, /^permissions:\s*\n  contents: read\s*$/m,
      name + ': workflow must declare minimal read-only repository permission');
    assert.doesNotMatch(workflow, /\bpull_request_target\s*:/);
    assert.doesNotMatch(workflow, /\bsecurity-events:\s*write\b/);
  });
}
