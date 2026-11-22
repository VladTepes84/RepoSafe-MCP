# RepoSafe MCP — Windows 11 installation (PowerShell)

**Runtime:** Node.js 22+, npm, Git for Windows. The local scanner does not need an AI key, cloud service, administrator installation or PowerShell execution-policy changes. Use PowerShell; when `npm.ps1` is restricted, call **`npm.cmd`**.

## 1. Verify available tools

~~~powershell
node --version
npm --version
git --version
~~~

If Node/Git are missing, obtain them from [nodejs.org](https://nodejs.org/) and [git-scm.com](https://git-scm.com/downloads/win), then reopen PowerShell. Do not disable Defender or relax script execution policies to install RepoSafe.

## 2. Install a precompiled GitHub source archive

~~~powershell
npm.cmd install --prefix "$HOME\.reposafe" --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
$RS = "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js"
node $RS --help
~~~

The project ships compiled `dist/` JavaScript. `--ignore-scripts` prevents lifecycle scripts. The installed directory and npm cache are modified; the scanned project is not. GitHub's `main` archive is **mutable**. Replace its final segment with a reviewed full 40-character commit SHA for reproducible installation; this is not signed provenance or an npm-registry release.

## 3. Audit one authorized directory

~~~powershell
$REPO = "C:\ABSOLUTE\PATH\TO\REPOSITORY"
node $RS doctor --root $REPO
node $RS scan --root $REPO
node $RS scan --root $REPO --summary
node $RS scan --root $REPO --compact --group-by file
~~~

Do not select an entire drive, `$HOME` or a system directory. `doctor` verifies **seven** local MCP tool names and a STDIO handshake, **without scanning** or verifying any AI client's UI. Scan results identify severity, relative file, optional commit, coverage and recommended action. Exit `0` = no findings in bounded examined scope, `1` = review or incomplete, `2` = error.

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
