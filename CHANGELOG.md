# Changelog

## Unreleased — security hardening of draft PR #10

- Separate persisted history warnings from fresh tracked-file checks to avoid stale incomplete verdicts across resumed scans; add regression with fixed uncommitted oversized file.
- Reject ambiguous Codex TOML forms (quoted/child tables, inline mappings) without changing any client configuration.
- Reject future-dated checkpoint metadata and group/world-writable parent state directories.
- Remove inherited `GIT_*` environment overrides before Git subprocesses; add two-repository boundary regression.
- These changes remain **draft/unmerged** pending acceptance of real client integrations and macOS Codex binary investigation.

## Unreleased — local MCP onboarding and scalable bounded scans (PR #10)

- Optional `connect` / `disconnect` for Codex Desktop/CLI, Cursor, Claude Desktop and VS Code, with reversible RepoSafe-only client configuration; no AI client executables or macOS security policy are invoked.
- Git history scanned in sequential 100-commit batches with per-batch byte/timeout limits, commit-boundary resumption, local history candidate counts, and 5,000 requested commit ceiling. CLI-only opt-in `--resume-history` now persists bounded, private redacted checkpoint metadata for restart-safe resumption, keyed by canonical root, Git ref tips and scan options (7-day reuse window). Default CLI and all MCP tools do not write scan state.
- Working-tree resource bounds increased while preserving fail-closed warnings; 5,000 findings retained with High/Critical priority and explicit omissions.
- MCP `get_findings_page` provides paginated, in-process cached results; CLI summarizes the first 50 and offers `--all-findings`, JSON and SARIF.
- Explicit client configuration writes now use a fail-closed lock, change detection and private recovery backups when an existing configuration is replaced. Recovery snapshots may contain unrelated credentials and require careful local retention/deletion.
- Minimal TTY-only status and severity colors (disabled for JSON/SARIF and `NO_COLOR`), retained/omitted finding counts and optional checkpoint-reuse status.
- Synthetic small/medium/large benchmarks and opt-in extended benchmark measure elapsed scan time and observed RSS on each CI OS.
- Safe cross-platform onboarding/uninstall guides, expanded synthetic tests, and precompiled runtime checked against TypeScript in CI. Real GUI client acceptance remains unverified.


Changes describe the committed source and automated test evidence, **not a security certification**.

## [Unreleased] — 2026-11-22 (script-free distribution update)

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
