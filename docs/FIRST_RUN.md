# RepoSafe MCP — first run (simple standalone CLI)

RepoSafe works without Codex, an IDE, AI API keys, a hosted scanner or a dashboard. **Node.js 22+, npm and Git** are required. Choose only a Git repository you own or are authorized to audit.

## Option A — Simple global command (macOS, Linux, Windows)

With a user-writable global npm prefix, install the precompiled GitHub archive; npm lifecycle scripts are disabled:

~~~sh
npm install -g --ignore-scripts --no-audit --no-fund \
  "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
~~~

Then open your Git repository **root**, not your home folder:

~~~sh
cd /ABSOLUTE/PATH/TO/GIT-REPOSITORY
reposafe scan
reposafe scan --high
reposafe scan --details
~~~

On Windows PowerShell, use npm.cmd instead of npm, and Set-Location to enter the repository root.

**Important:** main is a mutable source ref. Replace it with the reviewed immutable 40-character SHA before using the command for a production release. This is not a signed distribution. If a global npm installation fails due to permissions, use Option B; **do not use sudo**.

## Option B — Dedicated per-user install (no global npm changes)

macOS/Linux:

~~~sh
npm install --prefix "$HOME/.reposafe" --ignore-scripts --no-audit --no-fund \
  "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
export PATH="$HOME/.reposafe/node_modules/.bin:$PATH"
cd /ABSOLUTE/PATH/TO/GIT-REPOSITORY
reposafe scan
~~~

The PATH export applies only to this shell session unless you independently choose to configure your shell. No system administrator permissions are needed if your home directory is writable.

Windows PowerShell:

~~~powershell
npm.cmd install --prefix "$HOME\.reposafe" --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
$env:PATH = "$HOME\.reposafe\node_modules\.bin;$env:PATH"
Set-Location "C:\ABSOLUTE\PATH\TO\GIT-REPOSITORY"
reposafe scan
~~~

## Scan with one command

~~~sh
reposafe scan                 # dashboard + all findings grouped by rule
reposafe scan --high          # priority findings with individual paths/actions
reposafe scan --details       # detailed findings and guidance
reposafe scan --summary       # counts and coverage only
reposafe scan --no-history    # faster current-state scan
reposafe scan --json          # versioned machine-readable report
reposafe scan --sarif         # SARIF 2.1.0
reposafe --help               # full list of options
~~~

For safety, the implicit root must itself contain a .git directory or worktree marker. RepoSafe never silently climbs into parent folders. You can explicitly approve another existing absolute directory using --root, even for a non-Git scan. Exit 0 means no findings within the inspected scope, exit 1 means manual review or incomplete coverage, and exit 2 means an error. **Zero findings does not certify publishability.**

The public launcher is installed at bin/reposafe.mjs; the original dist/cli.js remains available for backward compatibility. Scanner results contain redacted metadata only; --high and --details display relative file paths that may themselves be sensitive. Do not paste private findings into issues.

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
