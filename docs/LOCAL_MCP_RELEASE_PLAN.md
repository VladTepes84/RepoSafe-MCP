# Local-first CLI and MCP release acceptance plan

Status: implementation checklist, not a claim of completed support. RepoSafe remains a read-only local Node.js CLI and stdio MCP server. No GUI, web dashboard, cloud hosting, telemetry or remote scanner is part of this plan.

## Release gates

- [ ] Verify Codex Desktop and Codex CLI separately with a real `generate_report` invocation on a synthetic repository. A passing SDK handshake alone is insufficient.
- [ ] Verify Cursor, Claude Desktop, VS Code and supported IDE clients individually. Record OS, client version, permissions and redacted outcomes; never mark untested clients as verified.
- [ ] Add a safe `connect` workflow with explicit user confirmation, backup, atomic write, idempotent insertion and preservation of unrelated MCP servers. Do not silently modify client configuration.
- [ ] Add `disconnect` that removes only the RepoSafe-owned entry and never deletes another server.
- [ ] Add bounded, resumable Git-history traversal with checkpoints under RepoSafe's own local state directory. Checkpoints must be tied to repository identity, ref tips and scan policy; invalidate on changes.
- [ ] Replace early finding truncation with deterministic severity ordering, deduplication and paginated output. Keep bounded RAM and output size. Report total counts only when actually known.
- [ ] Report full/partial/skipped file coverage, line-length omissions, commit counts, byte budgets and explicit incomplete status. Never silently equate 881 visited files with 881 fully inspected files.
- [ ] Keep a compact terminal interface: plain text default, optional progress to stderr for TTY only, JSON/SARIF machine-readable stdout, no ANSI escapes in machine-readable output.
- [ ] Benchmark small, medium and large synthetic repositories on macOS, Windows and Linux; measure elapsed time and peak memory. Test cancellation and resume.
- [ ] Document installation, integrity checks, safe updates and complete selective uninstall on each OS; verify clean install/uninstall in CI.
- [ ] Check that no report emits matched secret values, source snippets, sensitive paths or credentials, including errors, caches and checkpoints.
- [ ] Diagnose macOS Gatekeeper warnings by inspecting the exact blocked binary's origin/signature; never disable Gatekeeper or claim a `codex` warning proves RepoSafe is malware.

## Safe removal of the current source-archive installation

These are manual steps for the documented dedicated-prefix installation; verify the prefix before removing anything. They do not remove Node.js, Git, Codex or any other IDE.

1. Disconnect the `reposafe` MCP entry from each client first. Back up the client configuration and remove **only** that entry. Do not delete the entire JSON/TOML configuration.
2. On macOS/Linux, if RepoSafe was installed only into the documented dedicated prefix, remove that prefix with a file manager or a reviewed command. For example, `$HOME/.reposafe` is the README example, whereas `$HOME/.reposafe-v2` may be a separate installation. Never remove an unknown directory.
3. On Windows, remove only the specific dedicated installation directory chosen at install time using File Explorer. Do not recursively delete a general npm prefix.
4. Remove RepoSafe-specific checkpoints and cached reports only after confirming their exact locations; a future installer must document these paths. Existing versions may not create such state.
5. Verify the client no longer lists `reposafe`; preserve unrelated MCP servers and user projects.

## Threat model and privacy boundary

RepoSafe reads authorized local repositories and returns metadata-only findings. The client AI may transmit those findings to a remote model; local scanning does not imply offline AI interpretation. No server-side hosting is required for stdio MCP. Keep the authorized root fixed at startup and do not accept arbitrary scan paths through tool arguments.

## Current limitations (baseline v0.7)

The existing `init` prints configuration and does not install it. Git depth is bounded to 500 commits per request and 16 MiB of diff data; file scan and finding caps can produce incomplete coverage. None of the planned improvements above should be described as implemented until code, tests and client acceptance evidence exist.
