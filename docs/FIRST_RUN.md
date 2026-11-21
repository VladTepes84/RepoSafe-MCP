# RepoSafe MCP — first run

**Goal:** get the first read-only repository audit without cloning RepoSafe or compiling TypeScript manually. Node.js 22+, Git, an internet connection for the initial install, and an existing repository directory are required. RepoSafe is free and does not require an AI API key.

## 1. Install from GitHub in a dedicated directory

**macOS / Linux terminal**

```sh
npm install --prefix "$HOME/.reposafe" --no-audit --no-fund "github:VladTepes84/RepoSafe-MCP#main"
```

**Windows PowerShell**

```powershell
npm install --prefix "$HOME\.reposafe" --no-audit --no-fund "github:VladTepes84/RepoSafe-MCP#main"
```

This installs dependencies and builds a local copy. No npm registry release is involved, although dependencies are obtained from npm. The `#main` source ref can change. **For reproducibility and reduced supply-chain risk, replace `#main` with a reviewed full 40-character Git commit SHA.** npm's installation does write to the dedicated prefix and its cache.

## 2. Generate a client config after a real MCP protocol test

**macOS / Linux (Cursor example)**

```sh
node "$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js" init --root "/ABSOLUTE/PATH/TO/YOUR/PROJECT" --client cursor
```

**Windows PowerShell (Claude Desktop example)**

```powershell
node "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js" init --root "C:\Users\YourUser\Projects\YourProject" --client claude
```

You may use `--client cursor|claude|vscode|codex`. The root must be an **existing absolute path**, not your whole drive. The command contacts the installed local MCP server and checks all six tools, then prints an appropriate configuration. It **does not** write/overwrite the app settings.

For an installation script or a reproducible first-run test, append `--json`. Its output includes `targetFile`, `format`, `content`, `discoveredTools`, `verifiedProtocol`, `verifiedGUI` and `writesFiles`. The reported `verifiedGUI` is **false** until that GUI has actually been tested.

## 3. Manually merge the configuration, never replace other servers

Locate the printed target path for the client, **merge only** the `reposafe` entry into existing MCP settings, and restart that application. Do not overwrite existing client configuration. The generated config uses an absolute Node executable and installed server path, tied to your dedicated installation prefix. Keep that prefix in place for as long as the client uses it.

Within a supported local client, request:

> Use RepoSafe's generate_report tool for my approved repository. Summarize high-severity findings and remediation, including coverage limitations, without quoting source or credential values.

Confirm: six tools appear, the report is redacted, and the client does not request access outside the authorized root. **This step is a manual acceptance test, not yet verified by the maintainers inside Cursor/Claude Desktop.** Record OS version, client version, approvals and sanitized outcomes if you report results; do not post source, tokens, local private paths or credentials.

## 4. Use RepoSafe without any AI client

**macOS / Linux:**

```sh
node "$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js" scan --root "/ABSOLUTE/PATH/TO/YOUR/PROJECT"
```

**Windows PowerShell:**

```powershell
node "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js" scan --root "C:\Users\YourUser\Projects\YourProject"
```

Exit 0 is no findings in the bounded scanned scope; 1 requires review (including incomplete scans); 2 is an error. A clean result is never a security certification.

## Operational considerations

- Initial installation requires GitHub and npm connectivity; **the scanning process is local**.
- RepoSafe does not run a cloud scanner, charge an AI API, write scanned source files, change Git history or modify a client configuration.
- npm/Git installations **do download and execute trusted package build code**. Review the source revision, use an isolated container for untrusted code, and verify available npm quotas/network policies.
- You can remove the dedicated installation by manually deleting its prefix only after detaching any client configuration referring to that location.
- For troubleshooting, run `doctor --root ... --json`, check Node.js/Git in PATH, and inspect [CLIENTS](CLIENTS.md). GUI behavior and client support remain unverified until tested in the real applications.
