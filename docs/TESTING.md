# Test and evidence plan

> **Current evidence (22 Nov 2026):** combined PR #20 merged to `main` at `1fe5bbb4c14e738f1fd196b839346f967909bf58`. Its combined head passed four GitHub CI jobs and **146 local Mac automated tests**, plus demo, runtime verification, benchmark, audit and manual synthetic CLI Git/history/JSON/SARIF/checkpoint checks. Those results do **not** validate the subsequent new CLI display flags until a fresh run completes. **Codex Desktop tools were not exposed in the observed client conversation; GUI acceptance has not passed.**

> Historical references below to **six** tools are old v0.7 development checkpoints; the merged current implementation exposes **seven** via SDK `doctor`, including `get_findings_page`. Do not use historical counts as today's requirement.


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
| `npm run test:integration` | Starts real compiled server via official MCP stdio client SDK, lists 7 tools, calls report and checks no raw token leakage |
| `npm run typecheck` | TypeScript strict typecheck |
| `npm run audit:deps` | npm high/critical production dependency audit |
| GitHub Actions | `npm run check` and dependency audit on Ubuntu, Windows, macOS (each run must be inspected) |

## Honest verification levels

- **Verified locally:** current scanner/Git/CLI/config SDK tests executed on a real Apple Silicon Mac (Node 24.19.0), as detailed in the 2026-11-22 acceptance logs; CI also runs isolated runners. Real GUI client calls have not passed.
- **Verified in GitHub Actions:** only when a named workflow run explicitly shows each matrix job succeeded, with its associated commit SHA.
- **Vendor-documented:** host supports local stdio MCP and documents file schema.
- **Not tested:** GUI calls in Claude Desktop, Cursor, Codex, JetBrains etc. A successful official SDK handshake is not equivalent to all of those manual tests.

## Script-free distribution regression (2026-11-22)

The GitHub repository tracks compiled JavaScript and declarations in `dist/`. CI runs `npm run verify:runtime` after building to catch any drift from TypeScript sources. A real pinned GitHub archive is installed in an isolated prefix with `npm --ignore-scripts`, then `--help`, `doctor --json` and `init --json` verify executable availability, an actual SDK MCP handshake and six tools. This is run on Linux, Windows and macOS, including Node.js 24 on macOS. Direct runtime dependencies are pinned to the tested versions. The existing GitHub-source install smoke also uses `--ignore-scripts`. The npm registry remains unpublished, and actual Cursor/Claude GUI integration is still pending.

## New human-readable CLI UX regression

The source adds `tests/cli-display.test.mjs` to `npm run test:userflow`. Acceptance requires severity grouping, summary-only counts, compact file-grouped output, incomplete coverage display, no credential leakage and rejection of invalid options. **This new suite is pending fresh CI verification on its PR**, separate from the 146 tests reported for merged PR #20.

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

## v0.6 evidence targets

- New suite `tests/structured-config.test.mjs`: Spring/application properties, Terraform variable defaults, Kubernetes `kind: Secret` encoded credentials, benign ConfigMaps/placeholders, redaction and the bounded tracked-file path.
- New suite `tests/history-options.test.mjs`: depth truncation, expanded history, current-branch/date windows, invalid bounds/dates, CLI error codes and redacted JSON.
- `tests/userflow.test.mjs`: `init --dry-run` still makes a real MCP connection and prints configuration only.
- Existing tests still cover malicious Git fsmonitor and Git environment configuration, symlink safety, MCP stdio and restricted npm tarball manifest.
- Windows/macOS/Linux CI must all complete successfully at the **same commit** before integration. No graphical client acceptance evidence is invented.

## v0.6 Linux-only distribution/supply-chain smoke

- `tests/package-install.test.mjs` creates an **actual local npm tarball**, installs it to a disposable directory and runs its `reposafe --help` and real `doctor` MCP handshake. No `npm publish` or write to a user's system-wide npm installation occurs.
- CI generates a CycloneDX dependency SBOM using `npm sbom` and validates the JSON structure. The generated file stays in ephemeral runner storage; it is **not uploaded, signed, or automatically released**.
- Windows/macOS still run the main package-manifest test and full regression suite. The full tarball installation test is Linux-only until additional runners are explicitly added.

## v0.7 GitHub-source first-run acceptance

- Four real `init --json` tool discovery calls (Cursor, Claude, VS Code, Codex) in CI, asserting pure machine-readable JSON, six tools, and no false claim of GUI verification or file writes.
- The standalone config generator has its own JSON-mode test with `verifiedProtocol: false`.
- A Linux runner installs the **exact PR/head commit** directly from public GitHub using npm's `github:` specifier into a disposable prefix, then calls `doctor` and `init --json` from the installed package. This is not npm registry publication and does not modify a user's computer.
- The existing Windows/macOS/Linux matrix runs all standard tests. A CI success does not validate the actual Cursor/Claude Desktop graphical interfaces.

- Git-based npm dependencies require the package `prepare` lifecycle to compile `dist/` before packaging. A local `prepack` smoke alone is insufficient: the GitHub source test confirms that the installed entrypoint actually exists.
