# RepoSafe Professional Readiness — acceptance gates

RepoSafe is a **local-only, read-only scanner** distributed as CLI and a local stdio MCP server. This document is an engineering acceptance plan, **not a claim of security certification**. Any evidence must link to a specific commit, CI run, client build and OS. Never mark a manual acceptance test as passed because an SDK handshake passed.

## Non-negotiable boundaries

- No hosted scanner, cloud source upload, telemetry, API key, privileged installer, background daemon, auto-fix, remote Git command, or arbitrary tool-supplied root.
- The configured absolute `REPOSAFE_ROOT` scopes all reads. Treat repository files, Git metadata, filenames and tool inputs as untrusted. Reports contain metadata, never matched secret values or source snippets.
- No hidden fallthrough on incomplete scans, skipped files, exceeded budgets, interrupted history or retention truncation: preserve a review-required verdict and explain the limitation.
- MCP scanning remains read-only; CLI checkpoint reuse and explicit client `connect`/`disconnect` are separate opt-in local writes, disclosed and reversible.
- Never bypass macOS security warnings or depend on the Codex executable as part of normal scanner operation.
- No publishing, branch protection changes or deploy until individually reviewed and explicitly approved.

## Acceptance matrix

| Gate | Evidence required | Current status on 2026-11-22 |
| --- | --- | --- |
| P0 — Post-merge integrity | CI run on exact `main` SHA, all four OS/Node jobs, typecheck, build, tests, archive smoke, runtime sync, dep audit | Pending CI evidence for squash SHA `66ba50d7b71c0b1432f755e6ef677c045399b94e` |
| P0 — Security boundaries | Adversarial path/symlink/hardlink/Git env tests, secret redaction, fail-closed limits, config locks and checkpoint corruption tests | Synthetic tests exist; independent threat review outstanding |
| P0 — Real MCP client integration | Actual client GUI tool calls and approvals on pinned app versions; scoped scans, pagination, reconnect/restart and uninstall | **NOT VERIFIED** for Codex Desktop, Cursor, Claude Desktop and VS Code/Copilot |
| P1 — Detection precision | Synthetic ground-truth corpus; per-rule precision/recall and duplicate-rate report; no silent global test-directory exclusions | No measured per-rule precision/recall baseline |
| P1 — Report contract | JSON schema versioning, SARIF validation with consumers, deterministic pagination, counts, omission reporting and redact-only guarantee | JSON/SARIF smoke checked locally; independent interoperability outstanding |
| P1 — Large-repository performance | Representative real-world authorized local datasets; p50/p95 runtime, peak RSS, cancellation, history limits and coverage | Synthetic small/medium/large CI benchmark only |
| P1 — GitHub governance | Reviewed branch rules, required checks, Dependabot PR process, disclosure path and supply-chain audit | Repository workflow and security guide present; platform rules/settings require separate verification |
| P1 — Onboarding/uninstall | Pinned archives, four OS/client-specific paths, restoration of unrelated MCP servers, private backup handling | CLI/config tests exist; manual user-journey tests outstanding |
| P2 — Release supply chain | SemVer, changelog, source tag, checksums, independently verifiable provenance/SBOM, install/rollback and license | Beta `0.7.0`; npm publication and signed release not performed |
| P2 — UX and regressions | Bounded clear CLI output, actionable errors, no ANSI in JSON/SARIF, property/fuzz/regression corpus | Automated CLI/protocol tests exist; usability and fuzz matrix outstanding |

## Required manual client test

Use only a **synthetic disposable local repository**. Install RepoSafe from a reviewed immutable SHA in a separate prefix; do not reuse real user secrets. Record OS, Node/Git versions and client build, and follow [CLIENT_ACCEPTANCE.md](CLIENT_ACCEPTANCE.md). Test seven tool calls, full and category-scoped reports, paging, metadata-only output, scope boundaries, restart, error messages and clean disconnect. A text-only answer from an AI agent, or `doctor PASS`, is not evidence of an in-product tool call.

## Measurement protocol

- Synthetic positive/negative fixtures must contain dummy/non-live credentials. Per detector, report TP, FP and FN against explicit fixture labels. Do not call all findings in `tests/` harmless without inspecting them.
- Do **not** silently exclude test directories: malicious credentials can reside there. Improve confidence with per-rule context and explicitly governed exact-match baselines.
- Define reference hardware, dataset scale, commit count and scan options before benchmarking. Report elapsed time, RSS, scanned/skipped files, omitted findings, scanned commits and whether coverage is complete.
- Compare fresh history and opt-in resumed history on unchanged and changed refs. Check that fresh working-tree checks cannot be replaced by cached state.
- Never publish real report data or a private-repo path to public GitHub issues. Use only redacted summaries and synthetic reproductions.

## GitHub review/release policy

Each change uses a scoped PR and immutable evidence link. Keep `main` protected with review and required CI where available; this document cannot itself configure GitHub settings. Check `npm audit --omit=dev`, dependency update PRs, third-party Action revision integrity and branch head before merging. A merged feature is not automatically a stable release or a successful manual client test.

**Release blockers:** unbounded/unspecified scan scope, potential raw secret disclosure, false clean verdict on incomplete coverage, unsafe client-config overwrite, broken archive install, failing cross-platform CI, or claims of GUI verification without actual GUI evidence.
