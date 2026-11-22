# Manual MCP client acceptance matrix

**Status (2026-11-22): a Codex Desktop conversation was attempted and reported that RepoSafe tools were not exposed. No actual RepoSafe MCP tools were invoked. Codex in-product acceptance is therefore **NOT PASSED / UNAVAILABLE IN OBSERVED SESSION**; root cause remains undetermined. Cursor, Claude Desktop and VS Code/Copilot GUI checks remain not performed.** The MCP SDK tests prove stdio protocol and seven tool calls in an isolated Node test client; they do not prove that Codex Desktop, Cursor, Claude Desktop or VS Code/Copilot exposes the server to an AI session.

## Test environment and safeguards

Record: date, OS version, Node version, Git version, RepoSafe commit SHA, client name/build, exact client configuration location, and whether the client uses a local or hosted model. **Do not publish real machine usernames, credentials, absolute private paths or captured source.**

Use a disposable repository with dummy non-live patterns and at least two synthetic Git commits: an added synthetic secret followed by its removal. Keep a second disposable repository outside `REPOSAFE_ROOT` with a unique marker and verify it is never scanned. Use the CLI to obtain a local expected result first. Use `connect --dry-run`, then `connect`; only later remove RepoSafe with `disconnect`. No Gatekeeper or AV bypass.

## Repeat for each client

| Client | Connection method | Actual in-product test |
| --- | --- | --- |
| Codex Desktop/CLI | Managed `--client codex`; inspect `~/.codex/config.toml` without leaking other entries | **Observed unavailable in a Codex Desktop conversation on 2026-11-22; no tool calls** |
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

In a 2026-11-22 Codex Desktop chat attempt, tool discovery in the assistant session did not expose `reposafe` despite a successful Mac local `doctor` protocol test. No `generate_report` or `get_findings_page` call executed in that chat. **This is evidence of an unmet GUI acceptance gate, not proof of the underlying transport/configuration root cause.** The product feature is deferred, not reported as passed.

The client passes only when all applicable checks have observed evidence. Otherwise report **NOT VERIFIED** or **FAILED**, never **PASS** by inference.
