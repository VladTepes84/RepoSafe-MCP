# RepoSafe MCP — first run (script-free installation)

**Goal:** perform a read-only repository audit without cloning RepoSafe, compiling TypeScript or approving npm package build scripts. Requires Node.js **22+**, npm and Git. An internet connection is required for initial download; no AI API key is needed.

## 1. Install the precompiled GitHub archive

**macOS / Linux Terminal**

```sh
npm install --prefix "$HOME/.reposafe" --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
```

**Windows PowerShell** (use `npm.cmd` if `npm.ps1` is blocked):

```powershell
npm.cmd install --prefix "$HOME\.reposafe" --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
```

The project contains committed `dist/` JavaScript; no npm lifecycle build/approval is required. Dependency downloads come from npm; the repo archive comes from GitHub over HTTPS. `--ignore-scripts` also disables dependency lifecycle scripts. The installer still writes to the chosen prefix and npm cache, **not the repository being audited**.

**Supply-chain:** the convenience URL above ends in `main`, a **mutable branch**. For reproducibility, replace the final `main` with an independently reviewed **full 40-character Git commit SHA**. This is a commit-pinned archive, *not* a signed or independently attested software release. The npm registry package is not published.

## 2. Verify the real CLI and MCP protocol

**macOS / Linux:**

```sh
node "$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js" --help
node "$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js" doctor --root "/ABSOLUTE/PATH/TO/PROJECT"
```

**Windows PowerShell:**

```powershell
node "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js" --help
node "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js" doctor --root "C:\Users\YourUser\Projects\YourProject"
```

Use an **existing, specific directory you own or have permission to audit**. Do not select your entire home directory or a system drive. `doctor` performs a real local MCP handshake and checks discovery of **seven tools**; it does not run a repository scan.

## 3. First real repository scan (no AI needed)

**macOS / Linux:**

```sh
node "$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js" scan --root "/ABSOLUTE/PATH/TO/PROJECT"
```

**Windows PowerShell:**

```powershell
node "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js" scan --root "C:\Users\YourUser\Projects\YourProject"
```

Exit 0: no unsuppressed findings **inside the bounded scanned scope**; exit 1: review required or incomplete scan; exit 2: runtime/usage error. A clean scan is **not a security certification**. Do not paste private source, real token values or unredacted reports into support issues.

## 4. Optional: connect a local MCP AI client

**macOS / Linux (Cursor example):**

```sh
node "$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js" init --root "/ABSOLUTE/PATH/TO/PROJECT" --client cursor
```

**Windows PowerShell (Claude Desktop example):**

```powershell
node "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js" init --root "C:\Users\YourUser\Projects\YourProject" --client claude
```

Choose `cursor|claude|vscode|codex`. `init` confirms the MCP handshake, validates seven tools and **prints** the exact JSON/TOML entry and target config path. It never writes or overwrites client configuration. Merge **only** the `reposafe` entry into existing settings, restart the client and ask:

> Use RepoSafe generate_report for the approved repository. Prioritize severe findings and coverage limitations without quoting secrets or source contents.

For automation append `--json`; the result distinguishes `verifiedProtocol: true` from `verifiedGUI: false` and `writesFiles: false`. Actual Cursor/Claude Desktop GUI interactions remain **UNVERIFIED until manually tested**. Keep the installation directory in place while a client references it.

## 5. Diagnosing an installation issue

- `MODULE_NOT_FOUND`: check the installed `dist/cli.js` path. Do **not** approve lifecycle build scripts; the archive should already contain compiled JavaScript.
- `NODE_UNSUPPORTED` or `GIT_UNAVAILABLE`: confirm `node --version` (22+) and `git --version` in the same terminal.
- Client tools absent: rerun `doctor --root ... --json`, inspect client JSON/TOML settings and approval controls; protocol success is not a GUI test.
- `skipping integrity check for git dependency` or `allow-scripts ... prepare`: you likely installed the **older v0.7 Git-transport package**. Reinstall from the precompiled archive above with `--ignore-scripts` (no manual script approval).
- If scanning a non-Git directory, use `scan --no-git` knowingly; the report then excludes Git readiness/history.

The engine runs locally without sending source files to a RepoSafe cloud. A connected AI client may apply its own cloud/privacy policies to the **report** it receives; choose CLI-only mode if necessary.

## Optional managed MCP connection

After doctor succeeds, use `reposafe connect --root ABSOLUTE_PATH --client codex` or `cursor|claude|vscode` to update only the RepoSafe user-level MCP entry. `--dry-run` previews, `disconnect --client ...` reverses the change, and `init` remains a read-only configuration preview. See [LOCAL_MCP](LOCAL_MCP.md) and [UNINSTALL](UNINSTALL.md).
