# Test and evidence plan

## Repeatable real scenario

Run `npm run check` (after installing dependencies), then `npm run demo`. The demo creates a real local Git repo, commits a **synthetic** GitHub-format token, detects it, commits its deletion, detects it again in history, asserts the token does not appear in JSON output, then deletes the temporary test directory.

Expected demo output:

```text
[1/3] Clean project: no findings in examined scope
[2/3] Token in working tree: findings, exit 1, secret redacted
[3/3] Current files clean, history still risky: <N> finding(s), no secret values leaked
REAL OFFLINE DEMO PASS (synthetic credentials only)
```

`<N>` may differ with detector updates. Never assert a specific number of findings instead of checking the expected rules.

## Automated suites

| Suite | Mechanism / expected result |
| --- | --- |
| `npm run test:unit` | Native Node test runner: dummy credentials, private paths, link skipping, resource budgets, redaction, binary files, path safety |
| `npm run test:git` | Real `git init`, `git add`, `git commit`, secret deletion, tracked `.env`, ignore patterns, nested-root refusal, CLI exit codes |
| `npm run test:config` | Native Windows / macOS configuration path and schema simulation for Cursor, Claude, VS Code, Codex |
| `npm run test:integration` | Starts real compiled server via official MCP stdio client SDK, lists 6 tools, calls report and checks no raw token leakage |
| `npm run typecheck` | TypeScript strict typecheck |
| `npm run audit:deps` | npm high/critical production dependency audit |
| GitHub Actions | `npm run check` and dependency audit on Ubuntu, Windows, macOS (each run must be inspected) |

## Honest verification levels

- **Verified locally:** Node.js scanner / Git / CLI / config-generator tests actually executed in an isolated Linux container.
- **Verified in GitHub Actions:** only when a named workflow run explicitly shows each matrix job succeeded, with its associated commit SHA.
- **Vendor-documented:** host supports local stdio MCP and documents file schema.
- **Not tested:** GUI calls in Claude Desktop, Cursor, Codex, JetBrains etc. A successful official SDK handshake is not equivalent to all of those manual tests.

## Security regression tests worth adding next

- Windows junction/reparse-point escape with an actual Windows machine.
- Broader token detectors, encoded secrets, and benign fixture false-positive baselines.
- Unicode-heavy repository path behavior on all supported filesystems.
- Multi-branch history with huge binary diffs and external Git configuration edge cases.
- A signed release and dependency lockfile before stable public v1.0.
