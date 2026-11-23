# Changelog

## Unreleased — experimental public URL snapshot (separate PR, NOT released)

- Proposed `reposafe scan https://github.com/OWNER/REPO` with a strictly validated public GitHub URL, bounded SHA-pinned tar.gz download, verified regular-file-only temporary extraction, local scan and cleanup.
- No clone, Git hooks, submodules, LFS transfer, arbitrary URL, external scanning, new package dependency or change to the existing seven MCP tools.
- Snapshot findings remain **Git-incomplete** by design; machine-readable remote output and Git history are deferred. Parser tests, cross-platform CI and a real Mac acceptance are required before considering this suitable for public distribution.

## [1.0.0] — 2026-11-23 (release candidate; NOT published)

- **Draft PR #34 (unmerged, 23 Nov 2026):** clearer numbered Next Actions (priority severity review, file-grouped details and incomplete coverage); preserved `--no-history`/selected scope in suggested commands; interactive aggregate progress/elapsed time and cancellation diagnostics. No scanner-rule or MCP changes. Code head `bfa03c839c725292248c758562dfdfafbed3b3e5` passed [4/4 CI](https://github.com/VladTepes84/RepoSafe-MCP/actions/runs/45164169801) and was manually accepted on macOS for a real authorized current-file scan. Git inspection in that local copy was incomplete; neither an independent audit nor public 1.0 Release is claimed.
- First standalone **one-command local CLI**: enter an authorized Git repository root, run `reposafe scan`; review the terminal severity dashboard and all retained rules, or select `--high`, `--details`, `--summary`, JSON v2 or SARIF 2.1.0. No mandatory GUI, AI key, cloud service, telemetry, or source upload.
- Retains the seven-tool local MCP STDIO server, bounded Git-history auditing, metadata-only redacted reports, fail-closed incomplete-coverage warnings, and optional private CLI checkpoint.
- Internal Apple Silicon Mac acceptance: published-source beta command installed from an immutable SHA and a real authorized repository scan rendered the expected dashboard, priority details and coverage warnings. CI for PR #32 and post-merge source passed four OS/Node jobs. **This candidate version has not yet been independently accepted or tagged.**
- Packaging: `reposafe` executable is included in the npm tarball; `private: true` remains intentionally enabled until separate npm publishing approval. The reviewed GitHub source archive is installable with lifecycle scripts disabled. No npm registry release or GitHub Release is claimed.
- Limitations: source pattern detection is heuristic; live credential validity, representative field accuracy and independent security audit are **not verified**. A realistic repository scan found an overlength line and a Git-history timeout, both reported as incomplete coverage. Client GUI/IDE integrations are deferred to a future release.
- Publication gate: execute the manual release-candidate workflow on the exact final commit; validate CycloneDX SBOM, package and SHA256SUMS and pin the release/tag before announcing 1.0.0.

### Implementation history included in this candidate

### CLI first-run polish (PR #32 merged)

- Added a dedicated public bin/reposafe.mjs entrypoint: from an explicitly entered Git repository root, "reposafe scan" runs the same read-only engine without requiring manual --root arguments. Non-Git current directories fail closed; explicit absolute --root remains supported.
- Terminal presentation now aggregates **all retained findings by severity/rule** and shows actionable HIGH/CRITICAL details via --high, a detailed view via --details, coverage limitations, and redacted metadata. No cloud scans, auto-fix or scanner detector changes.
- Preserved pure JSON v2/SARIF 2.1.0, legacy dist/cli.js, seven MCP STDIO tools and exit statuses. New CLI packaging and cross-platform smoke/regression tests.
- Installation can use a GitHub source archive with --ignore-scripts; npm-registry publication, a stable 1.0 tag and external security certification are **not claimed**.

### adversarial filesystem boundary regression (PR #31 merged)

- Added synthetic read-only tests for lexical traversal, Git metadata paths, symlink/junction escape, hardlinks to outside files, credential-bearing filenames and inherited GIT_COMMON_DIR overrides. Tests report any Windows privilege-based skips rather than asserting unconditional coverage.
- Documented external security review scope. This is an internal test hardening proposal, **not an independent audit**.

### offline field-quality scoring (PR #30 merged 2026-11-23)

- Added optional, offline adjudication of redacted JSON v2 reports against privately held labels: per-rule TP/FP/FN, unknown and duplicate counts, precision/recall with null for empty denominators, and coverage/suppression checks.
- No scanner behavior, network access, credential validation or cloud scanning added. The scorer never displays input filenames, source lines, token values or commit IDs.
- Added synthetic CLI/privacy/error regressions and documented the authorized local validation protocol. **Real-world accuracy and independent audit remain unverified.** Codex/IDE integration is deferred to future work.

### bounded overlength-line heuristic checks (PR #27 merged 2026-11-22)

- Overlength current-file and Git-tracked excluded-file lines receive overlapping, 65,536-character bounded pattern checks rather than being silently omitted from heuristic matching. Repeated rules on a single source line are deduplicated; matched values are never included in results.
- The existing overlength counter and fail-closed incomplete-coverage verdict remain. Full-line structured parsing, arbitrary-length secrets and historical patch-line handling are **not** certified as covered; broader architecture remains necessary before calling overlength coverage complete.
- Synthetic regressions cover a credential spanning a chunk boundary, a late-line match, repeated copies on one source line, and an excluded Git-tracked file.

### contextual finding triage and CLI readability (PR #26)

- Human-oriented scan display modes: `--summary`, `--compact`, `--group-by severity|file`; severity/file section headings, deterministic sort and clearer coverage (including Git completeness).
- Contextual finding annotations: optional `testFile` path hint, `gitTracked` local Git index status, and `stats.overlengthLinesSkipped`. Human CLI context/counters improve triage without dropping or lowering alerts. JSON schema v2 is extended additively; seven-tool MCP API and existing provider patterns are unchanged.
- Full README/CLI reference/first-run/uninstall/quickstart refresh with explicit dependency versions and actual Codex Desktop GUI limitation.
- Synthetic Git and scanner regression tests cover fixture context, tracked/untracked provenance, redaction and long-line coverage. PR #26 code head `724fa432d71afccad0bd037d4ba8aa1ff50947d2` passed four GitHub Actions matrix jobs in run #45053790697. Later documentation-only changes require CI at their own head; actual desktop GUI MCP acceptance remains unverified.

### Integrated PRO updates merged (#20)

- Merged consolidated PRs #11–#18 through PR #20, merge commit `1fe5bbb4c14e738f1fd196b839346f967909bf58`.
- Combined head passed four CI matrix jobs; user-run Mac M3 testing passed 146 automated tests, runtime sync, synthetic benchmark and dependency audit.
- Codex Desktop GUI session did not expose the tools; no GUI integration claim is made.


### security hardening merged in PR #10 (22 November 2026)

- Separate persisted history warnings from fresh tracked-file checks to avoid stale incomplete verdicts across resumed scans; add regression with fixed uncommitted oversized file. Invalidate old v1 checkpoint schema; new v2 snapshots are only eligible for reuse for seven days, with manual cleanup of old files.
- Reject ambiguous Codex TOML forms (quoted/child tables, inline mappings) without changing any client configuration.
- Reject future-dated checkpoint metadata and group/world-writable parent state directories.
- Remove inherited `GIT_*` environment overrides before Git subprocesses; add two-repository boundary regression.
- Align managed VS Code Copilot config with `COPILOT_HOME` and Claude Desktop Linux config with `XDG_CONFIG_HOME`; verify alternate locations and deliberate fail-closed relative-path handling.
- These changes are merged on `main`; real client GUI integrations and the separate macOS Codex binary warning remain unverified.

### local MCP onboarding and scalable bounded scans (merged PR #10)

- Optional `connect` / `disconnect` for Codex Desktop/CLI, Cursor, Claude Desktop and VS Code, with reversible RepoSafe-only client configuration; no AI client executables or macOS security policy are invoked.
- Git history scanned in sequential 100-commit batches with per-batch byte/timeout limits, commit-boundary resumption, local history candidate counts, and 5,000 requested commit ceiling. CLI-only opt-in `--resume-history` now persists bounded, private redacted checkpoint metadata for restart-safe resumption, keyed by canonical root, Git ref tips and scan options (7-day reuse window). Default CLI and all MCP tools do not write scan state.
- Working-tree resource bounds increased while preserving fail-closed warnings; 5,000 findings retained with High/Critical priority and explicit omissions.
- MCP `get_findings_page` provides paginated, in-process cached results; CLI summarizes the first 50 and offers `--all-findings`, JSON and SARIF.
- Explicit client configuration writes now use a fail-closed lock, change detection and private recovery backups when an existing configuration is replaced. Recovery snapshots may contain unrelated credentials and require careful local retention/deletion.
- Minimal TTY-only status and severity colors (disabled for JSON/SARIF and `NO_COLOR`), retained/omitted finding counts and optional checkpoint-reuse status.
- Synthetic small/medium/large benchmarks and opt-in extended benchmark measure elapsed scan time and observed RSS on each CI OS.
- Safe cross-platform onboarding/uninstall guides, expanded synthetic tests, and precompiled runtime checked against TypeScript in CI. Real GUI client acceptance remains unverified.


Changes describe the committed source and automated test evidence, **not a security certification**.

### 2026-11-22 (script-free distribution update)

- Stream Git history with bounded memory rather than buffering complete multi-MiB patches. Preserve fully inspected commit counts and partial findings on byte/timeout limits, with specific redacted diagnostics and synthetic 100-commit regressions. No scan budget is silently relaxed.

- Check in generated `dist/` JavaScript and declarations alongside TypeScript sources. Remove npm `prepare` lifecycle hook so installing RepoSafe need not run TypeScript on the user machine.
- Recommend direct HTTPS GitHub archives plus `npm --ignore-scripts` to avoid the Git-dependency integrity warning and `allow-scripts` approval warning seen with npm Git installs. The archive is pinned to a commit SHA for CI; documentation's `main` example is mutable and explicitly flagged.
- Pin direct runtime dependency versions, and check modified **and untracked** generated files. CI rebuilds and checks that `dist/` matches sources. Add pinned-archive fresh-install smoke tests for Linux/Windows/macOS (including Node.js 24 on macOS) and keep the existing GitHub-source/packed-package acceptance checks.
- Preserve the six MCP tools, read-only scan behavior, local install prefix and manual-only client configuration. No npm publication, signing or real GUI client acceptance claimed.

## [0.7.0] — 2026-11-21 (beta source)

- Prepare a direct **GitHub-source npm installation** into a dedicated user-controlled prefix, avoiding a manual clone, `npm ci` and build. Verify with a pinned-source Linux acceptance test before documenting the path as tested.
- Improve `init` with `--json`: an actual local MCP handshake, safe generated client config and explicit separation of verified SDK protocol, unverified GUI and no-write status.
- Add a first-run guide for macOS and Windows and a concrete user prompt for first real GUI acceptance.
- Keep repository audit read-only and npm registry publishing disabled (`private: true`).

**Not claimed:** Cursor/Claude Desktop GUI integration validation, a published npm package, or no filesystem writes by npm's own installer.

## [0.6.0] — 2026-11-21 (beta source; no npm registry publication)

- Add bounded operator-selectable history: commit count (1..500), date, current branch, patch output cap (1..16 MiB), with validation in CLI and MCP tools.
- Inspect dotted application properties, Terraform sensitive variable defaults and carefully scoped Base64 Kubernetes Secret data.
- Preserve existing path and byte budgets, redacted metadata-only findings, fail-closed history truncation warnings and no-write execution.
- Improve `doctor` errors and provide an explicit `init --dry-run` alias (still prints configuration only).
- Add synthetic regression fixtures for newly covered formats, negative cases, rejected options and selected history windows.
- Add practical remediation guidance without changing Git or secrets on the user's behalf.

**Not done:** actual GUI tests in Cursor/Claude Desktop, npm registry publication, releases/signing, arbitrary trusted-user claims, or exhaustive parsing of configuration formats.

## [0.5.0] — 2026-11-20 (beta source; npm publication not performed)

- Improve human-readable CLI reports with severity ordering, remediation instructions and visible coverage/baseline warnings.
- Add redacted SARIF 2.1.0 output, with incomplete scan alerts and relative, safe file locations.
- Prepare restricted npm tarball (`bin`, runtime file whitelist, prepare build), retaining `private: true` and verifying with `npm pack --dry-run`.
- Add opt-in composite GitHub Action scanning checked-out repositories with no automatic SARIF upload and no write to the target repository.
- Add cross-platform SARIF, action smoke and packaging tests.
- Real Cursor/Claude Desktop GUI tests and npm registry publication remain unverified/not performed.

## [0.4.0] — 2026-11-20 (beta feature branch; CI/review required)

- Broader database/broker URI checks and provider secret indicators.
- Bounded symlink-safe inspection of exact Git-tracked paths under normally skipped dependency/cache directories.
- `.reposafe.json` exact-path/rule baseline with strict parser, expiration, visible counts and high-risk fail-closed behavior.
- `doctor` does an actual MCP stdio handshake; `init` prints configurations after that handshake without writing to the user machine.
- Synthetic positive/benign benchmark fixtures, baseline and tracked-file regressions and CLI user-flow tests.
- No npm publication, GUI verification, or silent host configuration edits.

## [0.3.0] — 2026-11-20 (public beta)

### Detection engineering
- Add JWT, SendGrid, npm access tokens, unprefixed `.npmrc` auth values, PostgreSQL connection URI passwords and conservative entropy-based Bearer detection.
- Suppress overlapping provider/generic findings (especially Anthropic vs. generic OpenAI `sk-`).
- Inspect text in `dist/`, `build/`, and `vendor/`; report tracked files still excluded by dependency/cache skipping as incomplete coverage.
- Emit short commit IDs on history findings; only attribute exposures to **added lines** in a commit diff.

### Git safety and assurance
- Ignore inherited Git configuration-injection environment variables; disable fsmonitor and lazy fetch, suppress external Git diff behavior.
- Add synthetic provider, false-positive, filename-redaction, history-provenance and hostile Git-config regression tests.
- Continue official MCP stdio integration and Windows/macOS/Linux GitHub Actions checks.

### Limitations
- No cloud credential verification, no complete Git object scan, no GUI client acceptance test, and no assurance against all hostile repository configurations.

## [0.2.0] — 2026-11-20 (public beta)
- Read-only tracked-file and `.gitignore` checks; bounded Git history scan.
- Standalone CLI, client config generator, synthetic demo, OS-specific guides and 3-OS CI.
- Fail-closed resource limits and audit of locked production dependencies.

## [0.1.0] — 2026-11-20
- Initial local read-only MCP scanner with four tools, README, MIT and CI tests.
