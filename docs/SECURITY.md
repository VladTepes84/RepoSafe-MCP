# Security model and responsible use

For the independent assessment checklist and evidence requirements see [SECURITY_REVIEW_SCOPE.md](SECURITY_REVIEW_SCOPE.md). No external security audit or certification is claimed.

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
| Read and output budgets | 10,000 files / 20,000 dirs / depth 20 / 4 MiB per file / 64 MiB total / 5,000 retained findings / line length 65,536 | Oversized files are skipped; overlength text lines receive bounded overlapping heuristic checks only, not complete structural parsing. Coverage remains flagged incomplete |
| Redaction | Never serialize matching source text; sanitize sensitive-looking file names | Heuristic matching can miss secrets concealed in filenames or unsupported formats |
| Git safety | Local Git metadata via `execFile` and history via streaming `spawn`, literal args and no shell; inherited `GIT_*` overrides stripped, fsmonitor/external diffs/lazy fetch disabled; up to 5,000 requested commits, batches of at most 100, 1–16 MiB per batch, 12s subprocess timeout and 120s overall history budget | Git still parses local metadata/config; it is not a malicious-repo sandbox and does not inspect unreferenced objects or remote secrets |
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

## v0.6 history controls and structured formats

- At the v0.6 baseline, requested history windows were capped at 500 commits and 16 MiB of patch output for the invocation. No arbitrary Git command, revision string or new filesystem root was accepted. **PR #10 (now merged into `main`) changes these limits** as detailed below; the v0.6 baseline is historical only.
- Contextual Terraform and Kubernetes detection examines already-bounded text within the approved repository. No template execution, YAML deserialization, shell, filesystem write or network operation is added.
- Base64 values are decoded **in memory only for heuristic detection**, not returned to an AI client, GitHub Action or SARIF. Encoding is not encryption and does not make secrets safe to commit.
- Windows junction/reparse-point races remain an unproven boundary; the existing canonical-path/handle checks are mitigations, not an OS sandbox. For hostile repositories use a nonprivileged VM/container with read-only mounts and disabled network access.
- A `--since` / branch-only scan intentionally examines less history. Its output includes scope warnings; the absence of findings is never proof that older or other-branch objects are safe.

## v0.7 GitHub-source installation and onboarding boundaries

- Recommended installation uses an HTTPS GitHub source archive pinned to a reviewed 40-character commit SHA, with `npm --ignore-scripts` and precompiled `dist/` committed in the source. This avoids executing lifecycle build/prepare scripts, but **does write** to the chosen installation prefix and npm cache and **does require network downloads** from GitHub/npm. A pinned SHA is not a signed or independently attested release. Other source-install modes may execute lifecycle scripts unless explicitly disabled.
- `npm install --prefix DIR` creates files only in the selected installation prefix and npm's cache (subject to npm behavior), whereas RepoSafe scans the **separate** approved `REPOSAFE_ROOT` without modifying it.
- The `init` command never writes client configuration; `--json` does not imply automatic registration. Do not let an untrusted script merge or overwrite existing MCP servers.
- An actual MCP SDK handshake is not an end-to-end GUI acceptance test. No client user permissions or approvals have been independently exercised.


## Isolation hardening (22 Nov 2026)

- Git subprocesses strip **all inherited `GIT_*` environment variables**, including `GIT_DIR`, `GIT_WORK_TREE`, alternate object directories, index overrides and trace settings; RepoSafe then sets explicit safe Git controls. The scanner also checks that the Git working-tree root matches the user-approved root. Synthetic tests exercise an attempted redirect to an unrelated repository.
- Optional history checkpoints now store **history-specific** warnings and completion state only. Working-tree, tracked-file and Git configuration checks run again on every invocation and cannot inherit stale warnings from cached history. Future-dated or insecure checkpoint metadata is rejected; a group/world-writable `~/.reposafe` parent is refused for opt-in checkpoint storage.
- Codex TOML editing refuses ambiguous nested/quoted/inline RepoSafe definitions rather than silently introducing duplicate or partially managed MCP entries. This is deliberately conservative: users with advanced TOML layouts can configure the server manually.

## Private checkpoint and MCP configuration writes (merged PR #10)

- The default CLI and all MCP scanner tools remain read-only with respect to the inspected repository. The **opt-in** CLI `--resume-history` is different: it creates a private cache of **already-redacted finding metadata and commit progress**, eligible for reuse for seven days but **not automatically deleted** under `~/.reposafe/checkpoints/`. It never stores raw Git patches, matched values or the absolute repository path inside the checkpoint JSON. The hashed identity includes root, ref tips and scan policy. This is **local metadata, not encryption**; use ordinary scans without `--resume-history` for fresh verification. Invalid, expired, insecure, inaccessible or changed checkpoints are never trusted as clean coverage.
- Explicit MCP `connect`/`disconnect` updates may write a private snapshot of the **complete previous IDE configuration** (which may contain unrelated credentials), next to that config. The operation creates a fail-closed lock, rereads the file and refuses changed/symlinked/unsafe configurations before an atomic rename. No automatic deletion of backup files occurs. Non-cooperating IDE writes and filesystem races are not a fully proven OS-level transaction; retain backups for manual recovery and confirm file ownership/permissions. No Gatekeeper bypass or Codex binary execution is involved.
- Machine-readable CLI outputs and MCP reports never contain terminal color codes or progress messages. Neither automated STDIO tests nor GitHub CI certify GUI integration or third-party client privacy.

## PR #10 — expanded local MCP and bounded scanning (merged 22 Nov 2026)

- Requested history depth is capped at **5,000 commits**, processed in sequential batches of at most **100 commits**. Each Git batch has its own **1–16 MiB** patch budget and 12-second subprocess timeout; the entire history traversal has a **120-second** budget. The scanner retains completed commits on partial batches; only the opt-in CLI `--resume-history` can reuse validated redacted history checkpoints across process exits. Default CLI and all MCP calls do not persist scan state. An oversized single commit or another exceeded budget results in incomplete coverage, never a clean certification.
- Working-tree traversal is bounded to 10,000 files, 64 MiB scanned in total, 4 MiB per file and 5,000 retained findings. Truncated or skipped content must be surfaced in coverage warnings; missing findings never imply absence of secrets.
- The CLI intentionally remains minimal. `get_findings_page` exposes bounded pages from the most recent report **in memory** of the running local MCP server; it does not upload findings or persist a report to disk. An AI client may transmit the redacted metadata it receives under its own privacy policy.
- Explicit `connect` and `disconnect` operations **do write user-level MCP configuration** for the named client. These are different from read-only `doctor`, `init`, and repository scanning. Preview changes with `--dry-run`. The implementation writes only the RepoSafe entry and refuses unsafe symlinked/invalid configurations, with private recovery backups, a fail-closed lock, and pre-replace consistency checks verified by synthetic tests. Non-cooperating concurrent writers and OS-level races remain residual risks.
- Automated MCP SDK tests are **not** acceptance tests for Codex Desktop, Cursor, VS Code, or Claude Desktop GUIs. Do not bypass OS warnings or grant broader AI-client permissions to compensate for integration failures.
- The script-free GitHub archive described in the README installs from `main` unless a reviewed PR commit SHA is specified. These features are on `main` since PR #10; no npm registry publication or signed artifact is claimed.
