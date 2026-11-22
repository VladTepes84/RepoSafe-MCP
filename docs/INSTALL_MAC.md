# macOS — verified commands for RepoSafe MCP

Supported design: macOS + Node.js 22+ + Git + a local MCP client. Commands below use **Terminal** (zsh) and no package manager beyond npm. The actual binary and server paths are generated on your machine.

## 1. Verify the prerequisites

```zsh
node --version
npm --version
git --version
```

Install the official Node.js 22 LTS or newer release from https://nodejs.org/ if Node is missing. Git is normally installed with Xcode Command Line Tools (`xcode-select --install`) or another trusted provider. Do not paste arbitrary `curl | sh` install commands.

## 2. Recommended: install the precompiled archive (no build scripts)

```zsh
npm install --prefix "$HOME/.reposafe" --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
node "$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js" doctor --root "/ABSOLUTE/PATH/TO/YOUR/PROJECT"
node "$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js" scan --root "/ABSOLUTE/PATH/TO/YOUR/PROJECT"
```

Replace the project root with a specific existing repository directory. The archive includes precompiled `dist/` and does not require approving npm scripts. `main` is mutable: replace it with a reviewed 40-character commit SHA for a reproducible install. The first download and dependency installation need internet; scans stay local. See [FIRST_RUN](FIRST_RUN.md) for `init` and client configuration.

## Alternative for contributors: clone source, build and run all tests

```zsh
cd "$HOME"
git clone https://github.com/VladTepes84/RepoSafe-MCP.git
cd "$HOME/RepoSafe-MCP"
npm ci
npm run check
npm run demo
```

The repository is public; GitHub access and network connectivity are still required for cloning. A clean `npm run check` must exit 0; `npm run demo` must print `REAL OFFLINE DEMO PASS`. No actual credential is required.

## 3. Create a disposable test target (not a real project)

```zsh
mkdir -p "$HOME/Projects/reposafe-sample"
printf '# Synthetic test project\n' > "$HOME/Projects/reposafe-sample/README.md"
printf 'MIT\n' > "$HOME/Projects/reposafe-sample/LICENSE"
printf '.env\n.env.*\n' > "$HOME/Projects/reposafe-sample/.gitignore"
node dist/cli.js scan --root "$HOME/Projects/reposafe-sample" --no-git --json
```

This prints a JSON report. The *CLI-only* `--no-git` mode explicitly skips Git checks because the sample is not a Git repository. For a normal Git project, remove `--no-git` to also inspect history.

## 4. Configure an MCP AI client

Run **one** of the following while inside `$HOME/RepoSafe-MCP`:

```zsh
npm run config -- --client cursor --root "$HOME/Projects/reposafe-sample"
npm run config -- --client claude --root "$HOME/Projects/reposafe-sample"
npm run config -- --client vscode --root "$HOME/Projects/reposafe-sample"
npm run config -- --client codex --root "$HOME/Projects/reposafe-sample"
```

The generator prints a complete configuration with **your actual Node binary path**. Paste its `reposafe` server entry into the target file indicated in the output. If that file already has other MCP servers, *merge* instead of overwriting. Paths are already correctly escaped. No VS Code/Claude/Cursor configuration is changed automatically.

| Client | Destination (macOS) | How to verify |
| --- | --- | --- |
| Cursor | `~/.cursor/mcp.json` | Restart Cursor; Customize > MCPs; confirm 7 RepoSafe tools and run `generate_report` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | Restart Claude Desktop; inspect connector/tools and call `generate_report` |
| VS Code Copilot harness | `~/.copilot/mcp-config.json` | Choose Copilot harness; Chat: Open Customizations > MCP Servers; confirm `reposafe` |
| Codex CLI / IDE / supported ChatGPT desktop environment | `~/.codex/config.toml` | Restart client, inspect MCP tools (e.g. `/mcp` in supported clients) |

VS Code **modern Copilot harness** uses top-level `mcpServers`; older editor-managed `.vscode/mcp.json` uses **different** `servers` shape and is not the default recommended path. See [CLIENTS](CLIENTS.md).

## 5. Ask in chat

> Run RepoSafe `generate_report` on the pre-authorized folder and explain findings by severity. Show file names and line numbers, but never ask for or reproduce any credentials. Explain any incomplete checks.

## Troubleshooting

- `spawn ENOENT`: use the generator's `command` **absolute Node path**, not a guessed `node` or `npx`; check `ls -l "$(command -v node)"`.
- `MODULE_NOT_FOUND`: run `npm ci && npm run build` in RepoSafe. The server path must end in `dist/server.js`.
- Nothing appears in chat: restart the client, inspect client MCP logs, check JSON/TOML syntax and ensure the target directory exists.
- `review_required` on an empty sample: a non-Git target has **no Git history** to inspect. This is intentional; use `--no-git` for current-tree-only CLI mode.
- Never use a broad folder such as `$HOME`, the filesystem root, `Downloads` or a credential store as your scan target.

Verified documentation: https://prod.cursor.com/help/customization/mcp , https://modelcontextprotocol.io/docs/develop/connect-local-servers , https://code.visualstudio.com/docs/agents/reference/mcp-configuration , https://learn.chatgpt.com/docs/extend/mcp .
## v0.4: validated local MCP self-check (does not change client files)

Run the following from the cloned RepoSafe-MCP directory after `npm ci` and `npm run build`. Replace `ABSOLUTE_PROJECT_PATH` with an existing local repository directory.

```text
node dist/cli.js doctor --root "ABSOLUTE_PROJECT_PATH"
node dist/cli.js init --root "ABSOLUTE_PROJECT_PATH" --client cursor
node dist/cli.js init --root "ABSOLUTE_PROJECT_PATH" --client claude
```

`doctor` must return `RepoSafe doctor PASS` and seven tools. `init` prints the exact configuration target and JSON for the current computer. **Copy/merge it manually; neither command edits client config.** A real Cursor or Claude Desktop GUI session has NOT yet been verified on this platform. See [QUICKSTART](QUICKSTART.md).

## Managed local client configuration

See [LOCAL_MCP.md](LOCAL_MCP.md) for `connect`/`disconnect` without executing Codex CLI and [UNINSTALL.md](UNINSTALL.md) for safe removal. The app's GUI acceptance remains unverified until tested in the actual client.
