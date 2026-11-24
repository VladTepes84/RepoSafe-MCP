# Manual MCP client acceptance matrix

**Status re-evaluated 2026-11-24:** A chat attempt on 22 November did not expose RepoSafe tools, but the evidence does **not establish that it ran in an actual local Codex Desktop session** rather than an ordinary ChatGPT conversation. Neither `generate_report` nor `get_findings_page` was invoked from that chat. Local Mac `doctor` and MCP SDK calls passed; the new Codex-config STDIO SDK test checks the generated command, **not the Codex application itself**. Real Codex/ChatGPT UI acceptance is **NOT VERIFIED**. Other client UIs are not verified.

## Immediate macOS acceptance test (local desktop)

1. Select an explicitly authorized **synthetic Git repository**. Set `REPO` to its absolute path, and use the already installed runtime. No private production data is required.
2. Run these **read-only** checks:

   ```sh
   RS="$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js"
   REPO="/ABSOLUTE/PATH/TO/SYNTHETIC-GIT-REPOSITORY"
   node "$RS" doctor --root "$REPO" --json
   node "$RS" connect --root "$REPO" --client codex --dry-run
   ```

3. Inspect the dry-run. If RepoSafe is not configured and you explicitly choose to connect, run `node "$RS" connect --root "$REPO" --client codex`. This **writes to the user's Codex configuration**, makes a private backup where needed and does not modify the repository. Do not repeat a connection if it is already configured correctly. Never share the full TOML or personal paths.
4. Launch an actual supported **local** ChatGPT desktop/Codex host and check its MCP server list (Settings → MCP servers for supported desktop ChatGPT; `/mcp` in supported Codex client). The web or mobile ChatGPT conversation is a different environment. Use `codex mcp list` only if the `codex` executable is independently trusted and **not blocked by macOS security**; never circumvent Gatekeeper or antivirus.
5. Request: **"Use RepoSafe MCP generate_report on the preconfigured synthetic repository; then invoke get_findings_page with offset 0 and limit 10. Show the actual tool-call receipts, total, severities and coverage without revealing file contents or secrets."**
6. Mark **PASS** only when the real application shows both successful tool calls. Otherwise record only a redacted error category, tool discovery result and client version. Do not upload absolute paths, TOML contents or real findings.

If `doctor` fails, investigate the server/runtime. If `doctor` passes but the app cannot discover tools, inspect **which app/session/host is being used**, whether config was reloaded and whether its local MCP integration is enabled. A simulator/SDK pass does not certify GUI integration.

## Test environment and safeguards

Record: date, OS version, Node version, Git version, RepoSafe commit SHA, client name/build, exact client configuration location, and whether the client uses a local or hosted model. **Do not publish real machine usernames, credentials, absolute private paths or captured source.**

Use a disposable repository with dummy non-live patterns and at least two synthetic Git commits: an added synthetic secret followed by its removal. Keep a second disposable repository outside `REPOSAFE_ROOT` with a unique marker and verify it is never scanned. Use the CLI to obtain a local expected result first. Use `connect --dry-run`, then `connect`; only later remove RepoSafe with `disconnect`. No Gatekeeper or AV bypass.

## Repeat for each client

| Client | Connection method | Actual in-product test |
| --- | --- | --- |
| Codex Desktop/CLI | Managed `--client codex`; inspect `~/.codex/config.toml` without leaking other entries | **Not verified in Codex; 22 Nov assistant session type uncertain, no tool calls** |
| Cursor | Managed `--client cursor`; validate local MCP approvals | Not verified |
| VS Code/Copilot | Managed `--client vscode`; honor `COPILOT_HOME` where applicable | Not verified |
| Claude Desktop | Managed `--client claude`; confirm OS-specific config location | Not verified |

For each configured client, require actual tool invocation receipts, not explanations:

1. Confirm RepoSafe is visible and **seven exact tools** are discovered: `scan_secrets`, `scan_private_refs`, `check_repo_readiness`, `scan_git_history`, `check_git_exposure`, `generate_report`, `get_findings_page`.
2. Invoke `generate_report` with no arbitrary directory argument; record verdict, counts, coverage and warnings. Compare against a fresh CLI scan of the same synthetic root.
3. Invoke `get_findings_page` with `offset:0, limit:10`; check pagination total, number returned, ordering and metadata-only output.
4. Invoke each remaining tool with accepted arguments and ensure errors and input limits are handled without raw source text or credentials appearing.
5. Attempt to request a second, unapproved repository via natural language; the RepoSafe MCP tool schema must **not** expose any root/path override. Other AI-host tools are outside RepoSafe's control.
6. Restart the AI client and check tool rediscovery. Disconnect RepoSafe, restart, confirm other MCP connections survive and RepoSafe is absent.
7. Record whether the client received/redacted metadata over a provider network under the client's privacy policy; `stdio` does not imply the host model is offline.

## Acceptance report template

| Field | Result |
| --- | --- |
| Client / build / OS | NOT VERIFIED |
| RepoSafe commit / Node / Git | NOT VERIFIED |
| Seven tools discovered in actual client | NOT VERIFIED |
| Real `generate_report` call | NOT VERIFIED |
| Real `get_findings_page` call | NOT VERIFIED |
| Remaining five tools actually called | NOT VERIFIED |
| Scope/redaction and incomplete verdict | NOT VERIFIED |
| Restart and uninstall isolation | NOT VERIFIED |
| Evidence link (redacted) | NOT VERIFIED |

In a 2026-11-22 assistant chat attempt with unconfirmed client/session identity, tool discovery did not expose `reposafe` despite a successful local `doctor` protocol test. No `generate_report` or `get_findings_page` call executed in that chat. **This is evidence of an unmet GUI acceptance gate, not proof of the underlying transport/configuration root cause.** The product feature is deferred, not reported as passed.

The client passes only when all applicable checks have observed evidence. Otherwise report **NOT VERIFIED** or **FAILED**, never **PASS** by inference.
