# RepoSafe — first run

RepoSafe scans an authorized local Git repository or a public GitHub URL. Node.js **22+**, npm and Git are recommended. No AI account, administrator privileges, cloud scanner or build tool required.

## 1. Install in your own user directory

**macOS/Linux:**

~~~sh
npm install --prefix "$HOME/.reposafe" --ignore-scripts --no-audit --no-fund \
  "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
export PATH="$HOME/.reposafe/node_modules/.bin:$PATH"
reposafe --help
~~~

**Windows PowerShell (prompt starts with `PS`):**

~~~powershell
npm.cmd install --prefix "$HOME\.reposafe" --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
$env:PATH = "$HOME\.reposafe\node_modules\.bin;$env:PATH"
reposafe --help
~~~

**Windows CMD (Command Prompt, e.g. `C:\>`) — do not use PowerShell's `$HOME` or `$env:PATH` here:**

~~~bat
npm.cmd install --prefix "%USERPROFILE%\.reposafe" --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
set "PATH=%USERPROFILE%\.reposafe\node_modules\.bin;%PATH%"
reposafe.cmd --help
reposafe.cmd scan https://github.com/octocat/Hello-World
~~~

The PATH change lasts only for the open terminal. Without it, use `"$HOME/.reposafe/node_modules/.bin/reposafe"` on macOS/Linux or `& "$HOME\.reposafe\node_modules\.bin\reposafe.cmd"` on PowerShell. For CMD without PATH, use `"%USERPROFILE%\.reposafe\node_modules\.bin\reposafe.cmd"`. In CMD, if a NEXT ACTIONS command begins with `& "$HOME\.reposafe\node_modules\.bin\reposafe.cmd"`, use `reposafe.cmd` instead (after the PATH setup above), retaining the remaining arguments. PowerShell uses the displayed command unchanged. Avoid `sudo` and OS policy changes. If you already have a **user-writable** global npm prefix, `npm install -g` is also supported. Installation downloads from GitHub/npm; the `main` source archive is mutable. Replace `main` with a vetted 40-character SHA for repeatable installs. No published npm package or signed release is implied.

## 2. Scan

**Local Git root**:

~~~sh
cd /ABSOLUTE/PATH/TO/GIT-REPOSITORY
reposafe scan
~~~

**Public GitHub repository** (no manual clone):

~~~sh
reposafe scan https://github.com/OWNER/REPO
~~~

URL mode transfers a **bounded public source snapshot to local temporary storage**, scans it locally, then cleans it on normal completion. It does not execute code, but it requires HTTPS network access. Remote Git history/index, submodules and LFS objects are not examined, so its coverage is always **INCOMPLETE**. Private repos, arbitrary hosts and remote JSON/SARIF are unsupported.

## 3. Inspect findings

~~~sh
reposafe scan --high                       # local HIGH/CRITICAL findings
reposafe scan --details --group-by file    # local detailed findings by file
reposafe scan --all-findings               # all retained local findings
reposafe scan https://github.com/OWNER/REPO --details
~~~

After the dashboard, copy the numbered `NEXT ACTIONS` for details. Each performs a fresh read-only scan. Local scans accept `--no-history` to skip history, `--root ABSOLUTE_PATH` for another explicitly authorized directory, and `--json` / `--sarif` for machines. Exit `0` means no findings within the scanned scope; `1` means findings or incomplete coverage; `2` indicates an error. No result certifies the repository's safety.

**Optional advanced MCP commands below require these variables on macOS/Linux:**

~~~sh
RS="$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js"
REPO="/ABSOLUTE/PATH/TO/YOUR/GIT-REPOSITORY"
~~~

On PowerShell use `$RS = "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js"` and `$REPO = "C:\ABSOLUTE\PATH\TO\REPOSITORY"`. The MCP server is optional, not needed to scan from the CLI.

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
| `Tracked: 0` / `Untracked: 0` with Git warning | Git status is **unknown** until Git inspection succeeds; do not infer that all files are untracked or that no files are published |
| No visible output while scanning | The public terminal launcher displays an elapsed-time counter and current phase; if a scan is interrupted or times out, no complete audit has occurred |
| `SCAN_TIMEOUT` / `SCAN_INTERRUPTED` | Review elapsed time and last phase/file count; do not treat it as a security finding or completed scan |

For safe removal: [Uninstall / rollback](UNINSTALL.md). For full CLI options: [CLI reference](CLI_REFERENCE.md). For security limitations: [Security](SECURITY.md).

**Never paste a live secret or a private unredacted config into an issue or chat transcript.**
