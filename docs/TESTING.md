## Controlled public URL snapshot — separate feature candidate

New `tests/github-snapshot.test.mjs` synthetic regressions validate strict GitHub URL normalization, tar checksum/trailer verification, regular-file-only extraction, hardlink/symlink/path traversal refusal, resource limits, priority scan integration, and remote-only options failing before any network request. The tests use synthetic credentials, not tokens. They **do not** prove the live GitHub Codeload response format, network reliability, macOS manual acceptance, disk cleanup after SIGKILL or protection against a compromised operating system. The stable local CLI and MCP must continue passing their existing suites. A fresh cross-platform CI at the feature PR head is required.

## One-command public CLI acceptance (new release-candidate gate)

The test:cli-entrypoint suite exercises the public bin/reposafe.mjs launcher (not merely the legacy dist/cli.js), default Git-root scoping, safe refusal outside an approved Git root, a detailed HIGH view, summary/compact flags, text/ANSI parity, JSON and SARIF output without decoration, and package manifest checks. The cross-platform CI executes this via the standard npm test chain. **Operator macOS acceptance for the PR #34 source candidate passed on 2026-11-23**: standalone archive installation, local progress, completed authorized scan and readable numbered Next Actions. This confirms CLI usability for that tested scope, not completeness of Git coverage or representative security accuracy. Test data are synthetic; never publish private reports or actual tokens.

# Test and evidence plan
The internal-progress regression uses synthetic-only data to verify numeric/path-free file/Git stage events and unchanged JSON output. The documented macOS operator repeated the formerly interrupted scan and obtained a complete current-file report and prioritized Next Actions, with **Git metadata still unavailable**. This demonstrates usability in that environment, **not** p50/p95 speed, Git history coverage, independent audit or representative detector performance.

**PR #34 acceptance evidence (23 Nov 2026):** exact code head `bfa03c839c725292248c758562dfdfafbed3b3e5` passed [GitHub Actions #45164169801](https://github.com/VladTepes84/RepoSafe-MCP/actions/runs/45164169801) on Ubuntu Node 22, Windows Node 22 and macOS Node 22/24 (**4/4 PASS**). The real Mac scan at this pinned head completed, producing the same current-file counts as the preceding run and displaying the new Next Actions. The private local repository name, absolute paths and possible credential values are intentionally omitted from public documentation. **This evidence predates the current documentation-only commit, which needs its own CI.**


> **Current evidence (22 Nov 2026):** combined PR #20 merged to `main` at `1fe5bbb4c14e738f1fd196b839346f967909bf58`. Its combined head passed four GitHub CI jobs and **146 local Mac automated tests**, plus demo, runtime verification, benchmark, audit and manual synthetic CLI Git/history/JSON/SARIF/checkpoint checks. PR #26 code head `724fa432d71afccad0bd037d4ba8aa1ff50947d2` separately passed four CI matrix jobs in [run #45053790697](https://github.com/VladTepes84/RepoSafe-MCP/actions/runs/45053790697), including the display and contextual triage regressions. CI on that code head does **not** constitute manual Mac/Codex Desktop GUI acceptance or validation of later commits. **Codex Desktop tools were not exposed in the observed client conversation; GUI acceptance has not passed.**

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

The GitHub repository tracks compiled JavaScript and declarations in `dist/`. CI runs `npm run verify:runtime` after building to catch any drift from TypeScript sources. A real pinned GitHub archive is installed in an isolated prefix with `npm --ignore-scripts`, then `--help`, `doctor --json` and `init --json` verify executable availability, an actual SDK MCP handshake and seven tools. This is run on Linux, Windows and macOS, including Node.js 24 on macOS. Direct runtime dependencies are pinned to the tested versions. The existing GitHub-source install smoke also uses `--ignore-scripts`. The npm registry remains unpublished, and actual Cursor/Claude GUI integration is still pending.

## New human-readable CLI UX regression

The source adds `tests/cli-display.test.mjs` to `npm run test:userflow`. Acceptance requires severity grouping, summary-only counts, compact file-grouped output, incomplete coverage display, no credential leakage and rejection of invalid options. **The CLI display suite is covered by PR #26's passing CI run #45053790697**, separate from the 146 local Mac tests recorded for merged PR #20.

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

## Offline field-accuracy scoring (under development for 1.0)

After scanning an authorized local repository, keep the JSON report and manually reviewed labels outside the repository and run: 

~~~sh
npm run quality:score -- --report "$PRIVATE_DIR/reposafe.json" --labels "$PRIVATE_DIR/labels.json"
~~~

The scorer performs no scans or network calls, and outputs only aggregate TP/FP/FN/unknown counts, per-rule results and coverage flags. Its synthetic regression suite runs in the standard npm test chain via test:quality. See [QUALITY_BENCHMARK.md](QUALITY_BENCHMARK.md). **Passing that unit test does not establish real-world detector precision, recall or independent security audit.**
