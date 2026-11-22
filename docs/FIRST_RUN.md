# RepoSafe MCP — first run (precompiled installation)

**Audience:** security practitioners, developers and maintainers who want to audit a Git repository locally. **Prerequisites:** Node.js 22+, npm and Git; permission to inspect the target repository. No AI API key, hosted scanner, telemetry or privileged installer is required.

The **recommended** installation uses a precompiled source archive in a dedicated user directory and skips all npm lifecycle scripts. For the complete commands, see [Quick start](QUICKSTART.md) and [CLI reference](CLI_REFERENCE.md).

## Install

macOS / Linux:

~~~sh
node --version
git --version
npm install --prefix "$HOME/.reposafe" --ignore-scripts --no-audit --no-fund \
  "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
RS="$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js"
node "$RS" --help
~~~

Windows PowerShell:

~~~powershell
node --version
git --version
npm.cmd install --prefix "$HOME\.reposafe" --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
$RS = "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js"
node $RS --help
~~~

**Security and reproducibility:** `main` is a mutable Git branch. Replace the archive segment `main` with a reviewed **40-character commit SHA** for a reproducible source version. This is **not** a signed, independently attested binary. The installer downloads from GitHub/npm over HTTPS, writes to the specified prefix/npm cache, and never builds/executes npm lifecycle scripts (`--ignore-scripts`). The source includes committed compiled JavaScript under `dist/`, verified against TypeScript builds in CI. No package is published to the npm registry.

## Approve a precise scope and verify

Use an existing absolute directory that you own or may audit, **not your entire home or filesystem root**.

~~~sh
REPO="/ABSOLUTE/PATH/TO/YOUR/PROJECT"
node "$RS" doctor --root "$REPO"
node "$RS" scan --root "$REPO" --summary
node "$RS" scan --root "$REPO" --compact --group-by file
~~~

Windows: use a drive-qualified path and `node $RS`.

`doctor` connects to a real local MCP STDIO server and discovers **seven tools**. It **does not** scan a repository and **does not** verify the actual AI client's GUI. `scan` runs a real read-only audit and provides a verdict, severity counts, known omissions, coverage and optional finding details.

**Exit codes:** `0` no unsuppressed findings within bounded scope; `1` review required or incomplete scan; `2` usage/runtime error. Even exit 0 is **not** proof that publication is safe.

## Optional AI client setup — after CLI acceptance

Preview the configuration, **without** writing user settings:

~~~sh
node "$RS" init --root "$REPO" --client codex --json
node "$RS" connect --root "$REPO" --client codex --dry-run
~~~

Explicitly configure the client **only after reviewing the preview**:

~~~sh
node "$RS" connect --root "$REPO" --client codex
~~~

Supported config targets: `codex`, `cursor`, `claude`, `vscode`. Restart the client and demand real tool call receipts for `generate_report` and `get_findings_page`. `verifiedProtocol: true` does **not** mean `verifiedGUI: true`.

**Observed 2026-11-22:** seven tools were found with local `doctor` on Mac, but they were **not available** in a Codex Desktop conversation. Actual Codex GUI integration therefore **has not passed**. Diagnosing it is deferred; CLI auditing is independently usable. See [Clients](CLIENTS.md) and [Manual acceptance](CLIENT_ACCEPTANCE.md).

## First scan, then interpret

A representative token deleted from current files can still be present in a previous commit. RepoSafe's history check reports a **redacted** finding associated with the introducing commit when within the scanned Git window. Treat a genuine exposed credential as compromised: rotate/revoke it; history rewriting alone is insufficient.

~~~sh
node "$RS" scan --root "$REPO" --history-depth 500
node "$RS" scan --root "$REPO" --all-findings
node "$RS" scan --root "$REPO" --json > "/SAFE/OUTPUT/report.json"
node "$RS" scan --root "$REPO" --sarif > "/SAFE/OUTPUT/report.sarif"
~~~

Put export files **outside** the target repository. Structured output reports redacted metadata, not source lines or matched tokens. For checkpoint opt-in use `scan --resume-history` and review the private files under `~/.reposafe/checkpoints/`. Disabled by default.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `MODULE_NOT_FOUND` / missing `dist/cli.js` | Verify actual installation prefix and package contents; do not approve unreviewed prepare hooks |
| `NODE_UNSUPPORTED` | `node --version` must be >=22 |
| `GIT_UNAVAILABLE` | Verify `git --version` in the same terminal |
| Invalid root | Must be an existing, authorized, **absolute directory** |
| `doctor` passes but IDE sees no tools | Diagnose client settings, transport, app availability and approvals separately; **do not claim GUI success** |
| Too many or unexpected findings | Inspect severity, exact rule, ignore semantics and supported baseline exceptions; never blindly suppress High/Critical |
| Incomplete coverage | Review skipped files, history depth/budget, warnings and local refs; rerun with intentional limits |

For safe removal: [Uninstall / rollback](UNINSTALL.md). For full CLI options: [CLI reference](CLI_REFERENCE.md). For security limitations: [Security](SECURITY.md).

**Never paste a live secret or a private unredacted config into an issue or chat transcript.**
