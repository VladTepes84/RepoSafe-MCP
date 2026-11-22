
# RepoSafe MCP — local IDE connection (no cloud hosting)

RepoSafe runs as a **local STDIO MCP server**, not as a hosted plugin or GUI app. The CLI and AI-connected MCP tools share the same offline scanner. Installation of the archive and npm dependencies requires internet once; scans operate on local files. An AI host may send redacted finding metadata to its model provider under that host's privacy policy.

**Actual GUI integration has NOT passed.** On 2026-11-22 a Codex Desktop conversation did not expose RepoSafe tools; no RepoSafe MCP calls occurred in that session, despite passing local Mac `doctor` and SDK tests. The reason has not been diagnosed. This work is deferred. Other client GUIs remain unverified; protocol success is not client acceptance.

## 1. Install and check

**Version boundary:** the examples below use `main`, which includes managed `connect`/`disconnect`, all seven MCP tools, and bounded expanded Git history (merged via PR #10). Pin a reviewed full commit SHA instead of mutable `main` for reproducibility. Use separate prefixes for testing different versions.

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

Other choices: --client cursor, --client vscode, --client claude. For VS Code's modern Copilot harness, `COPILOT_HOME` overrides the default `~/.copilot` location. Claude Desktop on Linux uses `XDG_CONFIG_HOME/Claude` or `~/.config/Claude`. Always inspect the `--dry-run` target before connecting. The installer writes **only** the named RepoSafe MCP entry in the user's client configuration, preserving other servers and unrelated settings. Codex Desktop and Codex CLI use the same local Codex TOML configuration. Crucially, connecting RepoSafe does **not** execute the codex binary or change macOS Gatekeeper settings.

Restart/reload the relevant IDE. Ask it to list the seven RepoSafe tools, call generate_report, and then retrieve later findings via get_findings_page with offset and limit. MCP sends a bounded first page (up to 50 results), with later pages up to 100; data is cached in the running local server process and not stored on disk.

Client GUIs and approval prompts have not been manually validated on the user's actual installed versions. Protocol compatibility does not guarantee UI availability or permissions.

## CLI-only optional persistent history

Run `node "$RS" scan --root "/ABSOLUTE/PATH/TO/PROJECT" --resume-history` only when you explicitly want to write private, redacted Git-progress metadata outside the repository. The optional 7-day cache is stored under `~/.reposafe/checkpoints/`; it is not enabled for MCP tools or normal CLI scans. A changed Git ref tip or scan options invalidates reuse. Existing repository files are always rechecked; without the flag all history is scanned afresh. Never treat cached coverage as security certification. See [SECURITY.md](SECURITY.md).

## 3. Normal CLI usage

    node "$RS" scan --root "/ABSOLUTE/PATH/TO/PROJECT" --history-depth 1000 --max-diff-size 16
    node "$RS" scan --root "/ABSOLUTE/PATH/TO/PROJECT" --all-findings
    node "$RS" scan --root "/ABSOLUTE/PATH/TO/PROJECT" --json
    node "$RS" scan --root "/ABSOLUTE/PATH/TO/PROJECT" --sarif

Human CLI output defaults to the first 50 highest-severity findings grouped by severity, with remediation. `--summary` prints counts/coverage only; `--compact` gives one-line findings; `--group-by file` changes the human grouping and sort order. `--all-findings` expands the view to all **retained** results; JSON/SARIF remain unchanged. See [CLI_REFERENCE.md](CLI_REFERENCE.md). Git history is processed in bounded sequential batches of up to 100 commits each; max-diff-size 1–16 MiB applies **per batch**. The maximum requested history depth is 5,000 commits. A single commit exceeding the per-batch budget is not silently skipped: coverage is marked incomplete. All work remains offline.

## Synthetic performance checks

`npm run benchmark` runs small/medium/large synthetic repository scans, reports elapsed milliseconds and sampled process RSS, and is included in the cross-platform CI matrix. `npm run benchmark:full` is optional and more CPU/Git-intensive; it should be run deliberately, not automatically on every commit. Synthetic metrics are **not estimates for a real repository** or proof of a fixed resource ceiling. No actual project data, credential or AI provider is involved in these benchmarks.

## 4. Privacy and safety

- The scan engine does not execute code from the target repository or upload it to a RepoSafe server.
- Only an operator-approved absolute REPOSAFE_ROOT is accessible to the MCP tools.
- Client-provided model requests may still share **redacted report metadata** with the AI provider.
- No scanner can prove that a repository is safe to publish. Review incomplete coverage and false positives.
- A macOS “Malware blocked” dialog for the separate codex executable must be investigated independently. Do not bypass macOS security controls or assume RepoSafe caused the alert.
- Undo client setup and remove RepoSafe by following [UNINSTALL.md](UNINSTALL.md).

References: [Codex configuration](https://developers.openai.com/codex/config-reference), [VS Code MCP](https://code.visualstudio.com/docs/agents/reference/mcp-configuration), [MCP local STDIO](https://modelcontextprotocol.io/docs/develop/connect-local-servers).


## 5. macOS warning for a separate Codex executable

A macOS warning that the **`codex` executable** was blocked as potentially malicious is a separate security event. RepoSafe's `connect --client codex` writes a user-level MCP configuration entry **without invoking `codex`**, so neither a successful MCP handshake nor this repository's CI determines why macOS blocked that other executable. Do not assume a false positive, do not automatically reinstall or launch the blocked binary, and do not override Gatekeeper, remove quarantine flags, or disable XProtect.

To investigate safely on the affected Mac, first identify the exact blocked item and its origin in the macOS warning and Finder's Get Info view. If comfortable using Terminal, the following **inspection-only** commands can be run with the real blocked executable path, without executing the item:

```sh
file "/PATH/TO/BLOCKED/codex"
shasum -a 256 "/PATH/TO/BLOCKED/codex"
codesign -dv --verbose=4 "/PATH/TO/BLOCKED/codex"
spctl --assess --type execute --verbose=4 "/PATH/TO/BLOCKED/codex"
```

These checks establish file identity, reported signing metadata and local policy assessment; none alone proves a file is safe or malicious. A failed/unsigned signature or a blocked assessment needs further investigation with the distribution source and vendor, **not a security bypass**. Do not post private filesystem paths, diagnostic logs containing personal data or unredacted application settings. Until the warning is resolved, prefer RepoSafe's standalone CLI or a different verified MCP host rather than relying on the blocked Codex binary. Apple's explanation: https://support.apple.com/en-us/102445 .
