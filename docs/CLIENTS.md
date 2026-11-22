# MCP client compatibility — 21 November 2026

**Three distinct claims must not be conflated:** (1) the vendor documents local `stdio` MCP support; (2) RepoSafe's **real SDK integration test** succeeds in CI; (3) a person has tested RepoSafe inside the actual GUI client. This project currently verifies **(1) and (2), not (3)**. v0.4 adds a CLI `doctor` that launches the *real RepoSafe MCP server* through the official SDK and verifies seven tools, but this still does NOT constitute a Cursor or Claude GUI test. Some clients require specific versions, subscriptions, approvals or settings.

| Client / AI | Local stdio MCP according to vendor docs | RepoSafe configuration | RepoSafe in-product test |
| --- | --- | --- | --- |
| **Cursor Agent** | Yes | `npm run config -- --client cursor --root ABS_PATH`; `~/.cursor/mcp.json` | **Not yet manually tested** |
| **Claude Desktop** | Yes | `--client claude`; macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%\Claude\claude_desktop_config.json` | **Not yet manually tested** |
| **VS Code + GitHub Copilot** | Yes, modern Copilot harness | `--client vscode`; `~/.copilot/mcp-config.json`, native `mcpServers` | **Not yet manually tested** |
| **OpenAI Codex CLI / IDE extension / supported ChatGPT desktop** | Yes, local config | `--client codex`; `~/.codex/config.toml` | **Not yet manually tested** |
| **JetBrains AI Assistant** | Vendor documents STDIO MCP integrations | Add a custom STDIO server with the absolute `node` executable and `dist/server.js`; `REPOSAFE_ROOT` in env | Not tested |
| **Gemini CLI** | Vendor documents STDIO MCP integrations | Use local MCP config (`mcpServers`) / `gemini mcp add`; adapt the `cursor` snippet | Not tested |
| **Claude Code** | Vendor documents STDIO MCP integrations | Use `claude mcp add` or applicable user config; adapt generated `cursor` snippet | Not tested |
| **ChatGPT web without local execution** | **No direct access to a local `stdio` process** | Requires a separately supported remote integration (not shipped by RepoSafe) | Not applicable |
| **Claude web without local desktop integration** | Local `stdio` not directly runnable in a browser tab | Use Claude Desktop or a compatible host | Not applicable |

**Do not mistake protocol compatibility for guaranteed availability in every plan or client session.** A cloud agent cannot automatically read files on your laptop just because a local JSON file was configured.

## Authoritative references

- [Official MCP TypeScript SDK v2 and stdio](https://ts.sdk.modelcontextprotocol.io/v2/get-started/packages)
- [Cursor custom MCP servers and approvals](https://prod.cursor.com/help/customization/mcp)
- [Claude Desktop local MCP setup](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
- [VS Code Copilot native MCP configuration (note the deprecated Local harness format)](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)
- [OpenAI Codex / ChatGPT desktop configuration](https://learn.chatgpt.com/docs/extend/mcp)
- [JetBrains AI Assistant MCP configuration](https://www.jetbrains.com/help/ai-assistant/mcp.html)
- [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)

## Why configuration differs between IDEs

`Cursor` / `Claude Desktop` use `mcpServers` with `command`, `args`, `env`. **VS Code's current Copilot harness** uses *portable* `mcpServers` and should specify `type: stdio`; the older `.vscode/mcp.json` editor-managed format uses `servers` and is being phased out. **Codex** uses TOML under `[mcp_servers.reposafe]`. Do not reuse a JSON fragment as TOML or use the wrong VS Code configuration format.

The `npm run config` generator makes these four variants deterministically for the machine on which it runs; unit tests cover both Windows and macOS rendering, but do not imply successful GUI acceptance.

## v0.6 optional history parameters

For `scan_git_history` and `generate_report`, MCP callers may request a **bounded subset of Git history** without choosing a new root:

```json
{
  "historyDepth": 200,
  "since": "2026-01-01",
  "maxDiffSizeMiB": 8,
  "currentBranchOnly": true
}
```

There is still no tool argument for a repository path; the operator-approved `REPOSAFE_ROOT` remains fixed. The accepted depth/patch limits are hard-coded ceilings (5,000 commits and 16 MiB per batch). This protocol-level capability does not constitute a Cursor/Claude Desktop GUI acceptance test.

**GUI verification remains NOT VERIFIED:** document actual client version, OS, required approvals and redacted output only after a person runs the workflow inside each application.

## v0.7 machine-readable first-run config

`reposafe init --root ABSOLUTE_PATH --client cursor|claude|vscode|codex --json` first performs an actual MCP `stdio` handshake and then outputs JSON with the target configuration file and the generated entry. `verifiedProtocol: true` means only the SDK handshake/tool discovery passed. `verifiedGUI: false` remains true until a real client GUI session has been tested and documented. `writesFiles: false` confirms the initialization command never changes user client files.

The standalone `npm run config -- --client ... --root ... --json` can render a configuration without invoking a server; it correctly sets `verifiedProtocol: false`.

Install using the precompiled GitHub archive and `--ignore-scripts` in [FIRST_RUN.md](FIRST_RUN.md) to avoid local lifecycle builds. Client-specific launch, approval prompts and UI details are still unverified, and user-supplied installation experiences should not be treated as security guarantees without reproducible evidence.

See [LOCAL_MCP.md](LOCAL_MCP.md) for tested configuration commands and [UNINSTALL.md](UNINSTALL.md) for complete removal. Codex local connect does not invoke the Codex CLI binary.
