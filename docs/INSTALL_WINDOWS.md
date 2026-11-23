# RepoSafe MCP — Windows 11 installation (PowerShell)

**Runtime:** Node.js 22+, npm, Git for Windows. The local scanner does not need an AI key, cloud service, administrator installation or PowerShell execution-policy changes. Use PowerShell; when `npm.ps1` is restricted, call **`npm.cmd`**.

## 1. Verify available tools

~~~powershell
node --version
npm --version
git --version
~~~

If Node/Git are missing, obtain them from [nodejs.org](https://nodejs.org/) and [git-scm.com](https://git-scm.com/downloads/win), then reopen PowerShell. Do not disable Defender or relax script execution policies to install RepoSafe.

## 2. Install in PowerShell (user directory)

~~~powershell
npm.cmd install --prefix "$HOME\.reposafe" --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
$env:PATH = "$HOME\.reposafe\node_modules\.bin;$env:PATH"
reposafe --help
~~~

No administrator rights, Defender exceptions or PowerShell policy changes are needed. The PATH change is limited to the active terminal. Without it, use `& "$HOME\.reposafe\node_modules\.bin\reposafe.cmd"`. Pin a reviewed immutable 40-character SHA instead of mutable `main` when reproducibility matters; no signed GitHub Release or npm registry distribution is claimed.

## 3. Scan local code or a public GitHub URL

~~~powershell
# Local Git root
Set-Location "C:\ABSOLUTE\PATH\TO\GIT-REPOSITORY"
reposafe scan
reposafe scan --details --group-by file

# Public GitHub repository (no manual clone required)
reposafe scan https://github.com/octocat/Hello-World
~~~

RepoSafe creates a bounded, private temporary snapshot when explicitly given a public GitHub URL. It does **not** execute code or upload findings. The URL mode does **not** inspect Git history/index, LFS objects or submodules; its coverage is always incomplete. A forced process termination may leave temporary files. Exit 0 indicates no recognized finding in inspected scope, 1 indicates findings/incomplete coverage, 2 indicates errors. The terminal prints copyable NEXT ACTIONS for deeper review.

**Advanced / optional MCP commands** below require:

~~~powershell
$RS = "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js"
$REPO = "C:\ABSOLUTE\PATH\TO\REPOSITORY"
node $RS doctor --root $REPO
~~~

This handshake verifies MCP protocol, not the actual AI-client user interface.

## 4. Clone the source for development and test runs

~~~powershell
git clone https://github.com/VladTepes84/RepoSafe-MCP.git
Set-Location RepoSafe-MCP
npm.cmd ci --ignore-scripts
npm.cmd run check
npm.cmd run verify:runtime
npm.cmd run benchmark
npm.cmd run audit:deps
~~~

The test suite uses synthetic credentials and local disposable Git repositories. `npm audit` contacts npm for known advisories; the scanner does not upload source. No credential should be pasted in issues or tests.

## 5. Optional local MCP client configuration

~~~powershell
node $RS init --root $REPO --client cursor --json
node $RS connect --root $REPO --client cursor --dry-run
~~~

Only after inspecting the dry-run:

~~~powershell
node $RS connect --root $REPO --client cursor
~~~

Supported generated configuration targets: `cursor`, `claude`, `vscode`, `codex`. JSON paths/backslashes and actual Node command are produced for this computer by the generator; do **not** manually guess JSON/TOML shapes. Preserve all other MCP entries. Restart the application and insist on real tool invocation receipts.

**GUI status:** cross-platform SDK protocol tests succeed, but an actual Codex Desktop conversation on Mac **did not expose RepoSafe tools** on 2026-11-22. This is **not** a verified Windows client result or a diagnosis. Running the CLI alone is fully independent of any GUI client.

## 6. Reporting and boundaries

~~~powershell
node $RS scan --root $REPO --history-depth 500 --max-diff-size 8
node $RS scan --root $REPO --json > "C:\SAFE\OUTSIDE\REPORTS\report.json"
node $RS scan --root $REPO --sarif > "C:\SAFE\OUTSIDE\REPORTS\report.sarif"
~~~

Create the output directory outside the repository before running redirection. JSON/SARIF contain redacted findings and coverage metadata. Supported current-history depth up to 5,000 commits, up to 16 MiB per history batch, up to 5,000 retained findings. `--resume-history` optionally saves private local progress metadata; see [Security](SECURITY.md).

## 7. Disconnect and uninstall

~~~powershell
node $RS disconnect --client cursor --dry-run
node $RS disconnect --client cursor
npm.cmd uninstall --prefix "$HOME\.reposafe" reposafe-mcp --ignore-scripts --no-audit --no-fund
~~~

Only disconnect a client you actually configured. Source clones, checkpoints, backup configs and test fixtures are separate, **not automatically removed**. See [Uninstall / rollback](UNINSTALL.md). Do not remove Node.js, Git or unrelated client settings.

Further: [Quick start](QUICKSTART.md) · [CLI reference](CLI_REFERENCE.md) · [Security](SECURITY.md) · [Client status](CLIENTS.md).
