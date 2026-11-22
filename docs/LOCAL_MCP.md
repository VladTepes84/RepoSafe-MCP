
# RepoSafe MCP — local IDE connection (no cloud hosting)

RepoSafe runs as a **local STDIO MCP server**, not as a hosted plugin or GUI app. The CLI and AI-connected MCP tools share the same offline scanner. Installation of the archive and npm dependencies requires internet once; scans operate on local files. An AI host may send redacted finding metadata to its model provider under that host's privacy policy.

**Actual GUI integration: NOT YET VERIFIED.** Automated tests verify SDK handshake, tool discovery and safe config handling; these are not equivalent to manual client acceptance.

## 1. Install and check

Requirements: Node.js 22+, Git, npm. On macOS/Linux:

    npm install --prefix "$HOME/.reposafe" --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
    node "$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js" doctor --root "/ABSOLUTE/PATH/TO/PROJECT"

On Windows PowerShell:

    npm.cmd install --prefix "$HOME\.reposafe" --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
    node "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js" doctor --root "C:\Users\USER\Projects\PROJECT"

The URL ending in main is mutable; for trustworthy reproducibility replace it with a reviewed full 40-character commit SHA. No installer scripts or macOS security-policy changes are necessary. Adapt the prefix if RepoSafe is already installed in .reposafe-v2.

## 2. Connect to Codex Desktop, Codex CLI and other IDEs

On macOS/Linux, with an installed RepoSafe runtime:

    RS="$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js"
    node "$RS" connect --root "/ABSOLUTE/PATH/TO/PROJECT" --client codex --dry-run
    node "$RS" connect --root "/ABSOLUTE/PATH/TO/PROJECT" --client codex

On Windows PowerShell:

    $RS = "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js"
    node $RS connect --root "C:\Users\USER\Projects\PROJECT" --client codex --dry-run
    node $RS connect --root "C:\Users\USER\Projects\PROJECT" --client codex

Other choices: --client cursor, --client vscode, --client claude. The installer writes **only** the named RepoSafe MCP entry in the user's client configuration, preserving other servers and unrelated settings. Codex Desktop and Codex CLI use the same local Codex TOML configuration. Crucially, connecting RepoSafe does **not** execute the codex binary or change macOS Gatekeeper settings.

Restart/reload the relevant IDE. Ask it to list the seven RepoSafe tools, call generate_report, and then retrieve later findings via get_findings_page with offset and limit. MCP sends a bounded first page (up to 50 results), with later pages up to 100; data is cached in the running local server process and not stored on disk.

Client GUIs and approval prompts have not been manually validated on the user's actual installed versions. Protocol compatibility does not guarantee UI availability or permissions.

## 3. Normal CLI usage

    node "$RS" scan --root "/ABSOLUTE/PATH/TO/PROJECT" --history-depth 1000 --max-diff-size 16
    node "$RS" scan --root "/ABSOLUTE/PATH/TO/PROJECT" --all-findings
    node "$RS" scan --root "/ABSOLUTE/PATH/TO/PROJECT" --json
    node "$RS" scan --root "/ABSOLUTE/PATH/TO/PROJECT" --sarif

Human CLI output defaults to the first 50 highest-severity findings, without losing the rest of the internally retained report. --all-findings expands the view, and JSON/SARIF remain available. Git history is processed in bounded sequential batches of up to 100 commits each; max-diff-size 1–16 MiB applies **per batch**. The maximum requested history depth is 5,000 commits. A single commit exceeding the per-batch budget is not silently skipped: coverage is marked incomplete. All work remains offline.

## 4. Privacy and safety

- The scan engine does not execute code from the target repository or upload it to a RepoSafe server.
- Only an operator-approved absolute REPOSAFE_ROOT is accessible to the MCP tools.
- Client-provided model requests may still share **redacted report metadata** with the AI provider.
- No scanner can prove that a repository is safe to publish. Review incomplete coverage and false positives.
- A macOS “Malware blocked” dialog for the separate codex executable must be investigated independently. Do not bypass macOS security controls or assume RepoSafe caused the alert.
- Undo client setup and remove RepoSafe by following [UNINSTALL.md](UNINSTALL.md).

References: [Codex configuration](https://developers.openai.com/codex/config-reference), [VS Code MCP](https://code.visualstudio.com/docs/agents/reference/mcp-configuration), [MCP local STDIO](https://modelcontextprotocol.io/docs/develop/connect-local-servers).
