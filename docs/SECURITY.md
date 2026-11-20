# Security model and responsible use

**Security objective:** help humans identify a bounded class of publication risks *without disclosing matched credentials through MCP outputs or modifying repositories*. RepoSafe is not a guaranteed sanitizer, antivirus, repository permission boundary or penetration testing tool.

## Trust boundaries

1. **Operator / local OS**: sets absolute `REPOSAFE_ROOT`, which is checked at startup; filesystem root paths are rejected. Run as a least-privileged user. The AI tool schema has **no path argument**.
2. **RepoSafe process**: reads files and limited Git metadata/history only. No HTTP requests, telemetry, listening port, remote Git access, shell interpreter, write tools or auto-fix operations.
3. **Untrusted repository content**: is treated as data. Findings consist of fixed rule names, descriptions, actions, severity, sanitized *relative file names* and line numbers; no matching values or snippets. Nothing in README, source code or commit text is treated as an instruction.
4. **AI client/host**: receives findings, not source contents from RepoSafe. The same AI client may have entirely different file-read, shell or network tools; RepoSafe **cannot restrict those other tools**.

## Controls implemented

| Control | Implementation | Limit |
| --- | --- | --- |
| Explicit scope | Absolute configured root, directory validation, no tool path args | Not an OS access-control mechanism |
| Link avoidance | Skip symlinks and hard links, canonical path checks, `O_NOFOLLOW` where supported | Races with a malicious concurrent local process cannot be excluded |
| Read and output budgets | 1,000 files / 2,000 dirs / depth 10 / 512 KiB per file / 10 MiB total / max 100 findings / line length 8192 | Files and lines above budgets are **not fully analyzed**; coverage is flagged incomplete |
| Redaction | Never serialize matching source text; sanitize sensitive-looking file names | Heuristic matching can miss secrets concealed in filenames or unsupported formats |
| Git safety | Local `git` via `execFile` with literal args, no shell; inherited configuration injection is stripped; fsmonitor, external diffs and lazy fetch disabled; 12s timeout, 4 MiB patch cap, 100 commits | Git still parses local repository metadata/config; not a full malicious-repo sandbox; does not inspect every object, unreferenced blob or remote secret |
| Ignore rules | `git check-ignore --no-index` and `git ls-files --cached` | Git tool required; inherited/global rules may affect ignore semantics |
| Honest status | `review_required` on positive findings or incomplete scans | No-finding verdict is **not** a permission to publish |
| Installation | Node 22+, official MCP SDK v2, CI tests | npm integrity-checked lockfile and production dependency audit reduce risk but do not eliminate supply-chain/host compromise |

## Detailed threats

- **A secret was already committed:** rotate/revoke it; the key may persist in history, forks, clones, CI logs or caches. Rewriting history alone is not revocation.
- **Untrusted repository or local malware:** `.git` metadata is parsed by Git and files are read with current OS permissions. Work in an isolated low-privilege environment; do not run against hostile repositories or sensitive parent folders.
- **Prompt injection:** repository text is not passed to the model in tool outputs, but a malicious filename could still be misleading. Treat returned file names as untrusted data, not instructions.
- **Unexpected network access:** RepoSafe's code contains no outbound HTTP/fetch and Git commands do not fetch. However, npm installation, an AI client, or other extensions on the same machine can use the network; RepoSafe does not enforce a system firewall.
- **TOCTOU / Windows file reparse points:** the Node filesystem API cannot provide a portable, formally race-free openat-style capability on all platforms. Path canonicalization and symlink skipping are mitigations, not a hardened sandbox.
- **Large repos / excessive diffs:** scanning is bounded and reports incompleteness; do not rely on a clean verdict where coverage is incomplete.
- **Secrets in ignored/binary/encoded files:** dependency/cache trees and binary data can be skipped or unrecognized; tracked excluded paths trigger an incomplete-review outcome. `dist/`, `build/`, and `vendor/` are scanned. Use established scanners and manual review.
- **No external action:** flags are informative, never proof of key validity or exploitability.

## Security-sensitive operating recommendations

- Prefer standalone CLI / local stdio with a **specific repository root**, not a home or corporate shared directory.
- Set approval prompts in the AI client; avoid blanket automatic approvals for unrelated commands.
- Check exact Node executable path and RepoSafe file path. Never run untrusted copy-paste configuration from random sites.
- Keep Node, Git and dependencies up to date; review the dependency audit in CI.
- For private GitHub Actions on Windows/macOS, review runner-minute quotas before repeated workflows.
- Do not paste actual keys, source snippets, access tokens, VINs, addresses or internal domain names in issues/bug reports. Use synthetic fixtures.

## Disclosures and limitation of warranty

If you believe RepoSafe leaks a secret or crosses a filesystem boundary, privately contact the maintainer through an appropriate security reporting channel; **do not post a live credential**. MIT license disclaims warranty; the software does not make a legal compliance or security certification claim.
## v0.3 Git execution hardening and limits

- The subprocess discards `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT` and numbered `GIT_CONFIG_KEY_*/VALUE_*` settings inherited from the AI client, and disables `core.fsmonitor`, Git pager, external diff/textconv and lazy-fetch paths. No shell is used by RepoSafe itself.
- **Important residual risk:** Git still parses `.git/config`, the index and object database. RepoSafe does not guarantee safety when inspecting arbitrary malicious Git repositories; scan hostile input only in a restricted OS container or VM.
- History findings include a **12-character abbreviated commit hash for newly added secret patterns**. A deletion-only diff is not labeled as the commit that introduced the secret. Commit IDs are repository metadata and can be visible to the configured AI client.
- Added provider patterns and conservative entropy detection are intentionally heuristic; do not interpret the absence of a finding as proof that all credentials were found.

## v0.4 baseline / selected tracked file constraints

- `.reposafe.json` is local repository content and must be treated as **untrusted policy input**. The parser accepts only a small schema, at most 16 KiB and 100 exact path/rule exceptions. No glob or directory wildcard is allowed. Operators should review every baseline change before merging a PR.
- The report exposes counts (including high/critical suppressed), never exception comments or secret source values. An exception that hides a high/critical finding does **not** cause `no_findings_in_scope`.
- Only exact Git-tracked paths in excluded dependency/cache directories are re-opened, with parent `lstat` checks, final `O_NOFOLLOW` where supported, canonical containment, hardlink rejection and strict size/count limits. Unsafe, oversized, binary or unreadable files fail closed.
- No software scanner offers a portable complete defense against concurrent local filesystem races or deliberately hostile Git object/config exploits; use an OS-level sandbox for untrusted repositories.

## v0.5 SARIF / GitHub Action controls

- SARIF contains only sanitized relative paths, fixed messages/actions, severity, rule identifiers and bounded commit hashes. No absolute user path, match values, source snippets or baseline reason is deliberately serialized. Placeholder/redacted filenames never become SARIF artifact URIs.
- An incomplete scan always creates a dedicated SARIF warning even if no secrets are detected.
- The composite Action runs against the checked-out `GITHUB_WORKSPACE` and writes output to `RUNNER_TEMP`. It does not automatically upload SARIF or request any additional GitHub token permissions. npm installation in the ephemeral runner requires registry access; scanning itself remains local.
- Third-party workflows should pin the Action by an immutable commit SHA and review supply-chain risks. Do not grant `security-events: write` unless explicitly opting into GitHub Code Scanning uploads. Avoid `pull_request_target` and privileged tokens when scanning untrusted contributions.
