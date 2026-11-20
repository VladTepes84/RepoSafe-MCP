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
| `npm run test:unit` | Native Node test runner: existing security tests plus v0.3 provider fixtures, false positives, duplicates, build/vendor detection and filename redaction |
| `npm run test:git` | Real `git init`, `git add`, `git commit`, secret deletion, introducing-commit IDs, tracked excluded files, hostile fsmonitor config, Git env injection, tracked `.env`, CLI exit codes |
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
- A signed release, independent supply-chain review and expanded adversarial fixtures before stable public v1.0.
## v0.3 adversarial fixtures

Run `npm run test:unit` for both positive and negative provider fixtures; `npm run test:git` for real commits and attempted fsmonitor execution; `npm run test:integration` for actual MCP tool calls; `npm run demo` for committed-and-deleted synthetic credentials. Only dummy values are used.

The test for a malicious Git fsmonitor configuration checks that no marker is written while RepoSafe reads Git. Passing it does **not** establish safety against all Git configuration/environment exploit paths.

The history scanner reports the first introducing commit for added lines within its bounded scope. Older or unreachable commits, binary secrets, huge diffs and tokens encoded beyond the supported patterns can still escape detection.

## v0.4 execution

- `npm run test:unit`: previous scanner tests plus 30 synthetic positive fixtures (across service and DB families), 20 benign fixtures and strict baseline tests.
- `npm run test:git`: verifies content scanning of Git-tracked excluded files and failure-closed behavior for unsafe symlinks (skip only when a Windows runner lacks symlink privileges).
- `npm run test:userflow`: `doctor` must spawn actual server + list six tools; `init` must print client config without modifying user state.
- CI must verify on all three operating systems. Do not infer GUI functionality from tests.

## v0.5 acceptance checks

- `npm run test:sarif`: real CLI SARIF 2.1.0, source-value redaction, relative code locations, incomplete-scan warning, mutually exclusive output flags, human-friendly remediation.
- `npm run test:package`: checks `npm pack --dry-run --json --ignore-scripts` output: both bins and all runtime files present, no source/tests/workflow files, limited tarball size.
- On Ubuntu, CI runs the actual composite `action.yml` in report-only mode and validates its SARIF output file. The scan does not automatically upload results.
- Windows and macOS test all CLI and package workflows in the main `npm run check` suite. Actual GUI client sessions remain unverified.
