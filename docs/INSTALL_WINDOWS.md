# Windows 11 — PowerShell setup, no placeholder JSON

Use **PowerShell**, not Command Prompt. Supported design: Windows + Node.js 22+ + Git for Windows + a local MCP client. The configuration generator discovers the actual absolute Node executable and escapes Windows `\\` characters properly.

## 1. Prerequisites

```powershell
node --version
npm --version
git --version
```

If missing, install Node.js 22+ from https://nodejs.org/ and Git for Windows from https://git-scm.com/downloads/win, then reopen PowerShell. Do **not** disable PowerShell execution policies to make RepoSafe work. On some managed machines running `npm` may invoke a blocked `npm.ps1`; use `npm.cmd` in the commands below instead.

## 2. Recommended: install a precompiled archive with no npm scripts

```powershell
npm.cmd install --prefix "$HOME\.reposafe" --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
node "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js" doctor --root "C:\Users\YourUser\Projects\YourProject"
node "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js" scan --root "C:\Users\YourUser\Projects\YourProject"
```

Replace the project root with an existing repository you are authorized to audit. Precompiled `dist/` means no local TypeScript compilation or npm lifecycle approval. `main` is mutable; replace it with a reviewed full commit SHA for reproducible installation. More details: [FIRST_RUN](FIRST_RUN.md).

## Alternative for contributors: clone source and run tests

```powershell
Set-Location $HOME
git clone https://github.com/VladTepes84/RepoSafe-MCP.git
Set-Location "$HOME\RepoSafe-MCP"
npm.cmd ci
npm.cmd run check
npm.cmd run demo
```

RepoSafe is public; cloning still requires GitHub connectivity. The complete check exits 0 on success; the demo prints `REAL OFFLINE DEMO PASS`.

## 3. Create a safe, disposable target

```powershell
$Target = Join-Path $HOME 'Projects\reposafe-sample'
New-Item -ItemType Directory -Force -Path $Target | Out-Null
Set-Content -Path (Join-Path $Target 'README.md') -Value '# Synthetic test project'
Set-Content -Path (Join-Path $Target 'LICENSE') -Value 'MIT'
Set-Content -Path (Join-Path $Target '.gitignore') -Value @('.env', '.env.*')
node "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js" scan --root "$Target" --no-git --json
```

This current-tree-only report will contain no findings for the synthetic sample. Remove `--no-git` when testing a real Git repository; a target without a `.git` directory cannot produce a complete Git history check.

## 4. Generate exact client settings

For the **precompiled archive** installation from step 2, use `node "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js" init --root "$Target" --client cursor` (or a supported client) to preview its config without changing client files.

For **source contributors only**, run any one or more of these (from `$HOME\RepoSafe-MCP`):

```powershell
npm.cmd run config -- --client cursor --root "$Target"
npm.cmd run config -- --client claude --root "$Target"
npm.cmd run config -- --client vscode --root "$Target"
npm.cmd run config -- --client codex --root "$Target"
```

The command prints the path of the configuration file **and the complete ready-to-paste JSON/TOML**. It also inserts the actual `node.exe` path (which may contain spaces). **Do not manually single-escape backslashes in JSON.** Copy the generated block; merge `reposafe` with existing MCP servers rather than replacing other settings.

| Client | Where the generated entry belongs |
| --- | --- |
| Cursor | `$HOME\.cursor\mcp.json` |
| Claude Desktop | `$env:APPDATA\Claude\claude_desktop_config.json` |
| VS Code Copilot harness (2026) | `$HOME\.copilot\mcp-config.json` |
| Codex / supported ChatGPT desktop | `$HOME\.codex\config.toml` |

Restart the client and find `reposafe` in its MCP panel or tool list. Ask: **“Use RepoSafe `generate_report` on the approved folder and explain the findings without copying source values.”** Do not grant the client automatic permission to run unrelated shell tools just to use RepoSafe.

## Troubleshooting

- `node` not found: reinstall Node.js then open a new PowerShell; confirm `Get-Command node`.
- `npm.ps1 cannot be loaded`: use `npm.cmd` rather than lowering execution-policy protections.
- Invalid JSON: use the generator output without manually replacing escaped `\\` characters; `ConvertFrom-Json` can validate a JSON configuration.
- No tools: restart the desktop client; check config filename and presence of `dist\server.js`; rerun `npm.cmd run build`.
- Git tools fail: `git --version`, `git -C "$Target" status`; for non-Git folders use `--no-git` in CLI and understand that history has not been checked.
- Cursor organization network controls may prevent local stdio servers on Windows if sandboxing is enforced; ask your administrator rather than disabling protections.

Official references: https://prod.cursor.com/help/customization/mcp , https://modelcontextprotocol.io/docs/develop/connect-local-servers , https://code.visualstudio.com/docs/agents/reference/mcp-configuration , https://learn.chatgpt.com/docs/extend/mcp .
## v0.4: validated local MCP self-check (does not change client files)

Run the following from the cloned RepoSafe-MCP directory after `npm ci` and `npm run build`. Replace `ABSOLUTE_PROJECT_PATH` with an existing local repository directory.

```text
node dist/cli.js doctor --root "ABSOLUTE_PROJECT_PATH"
node dist/cli.js init --root "ABSOLUTE_PROJECT_PATH" --client cursor
node dist/cli.js init --root "ABSOLUTE_PROJECT_PATH" --client claude
```

`doctor` must return `RepoSafe doctor PASS` and seven tools. `init` prints the exact configuration target and JSON for the current computer. **Copy/merge it manually; neither command edits client config.** A real Cursor or Claude Desktop GUI session has NOT yet been verified on this platform. See [QUICKSTART](QUICKSTART.md).

## Managed local client configuration

See [LOCAL_MCP.md](LOCAL_MCP.md) for `connect`/`disconnect` with user-level configuration and [UNINSTALL.md](UNINSTALL.md) for clean removal without PowerShell policy changes.
