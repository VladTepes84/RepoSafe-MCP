## CLI-first closure decision (23 November 2026)

**Verified final CLI source integration (2026-11-23):** PR [#34](https://github.com/VladTepes84/RepoSafe-MCP/pull/34) and [#35](https://github.com/VladTepes84/RepoSafe-MCP/pull/35) are both **MERGED**. Final `main` merge commit `5eb48fd2c4299f5e01d197fffa008250e95e6099` passed [post-merge CI 4/4 #45200166977](https://github.com/VladTepes84/RepoSafe-MCP/actions/runs/45200166977) on Ubuntu Node 22, Windows Node 22, and macOS Node 22/24. An operator on macOS successfully scanned a local tree and a public GitHub snapshot; the subsequent private-prefix follow-up command fix passed CI but has **not** been manually retested in that Mac shell. Real-world detection accuracy, independent security audit and GUI MCP client acceptance are **not** established. No GitHub Release, tag, npm publication or signed artifact exists.

## Previous CLI-first release gate (historical)

The CLI acceptance gate required one-command local use, a legible all-rule dashboard, CRITICAL/HIGH review and redacted JSON/SARIF output. Those behaviors were exercised in CI and the local Mac test within the stated limits. Snapshot URL input is additional, requires explicit outbound HTTPS, and cannot inspect remote Git history. Graphical MCP integrations remain deferred; a passing SDK handshake must not be advertised as GUI support.

The independent audit is not claimed: user-led validation is explicitly **internal**, and real-world detector precision/recall cannot be inferred from seeded synthetic cases alone. The original scanner limitations (history budget, skipped/overlength files, incomplete verdict) remain release documentation requirements.

# RepoSafe Professional Readiness — acceptance gates

RepoSafe is a **locally executing, read-only scanner** distributed as CLI and local stdio MCP server. The optional public GitHub URL mode explicitly downloads a bounded temporary source snapshot over HTTPS; local-directory scans remain offline. This document is an engineering acceptance plan, **not a claim of security certification**. Any evidence must link to a specific commit, CI run, client build and OS. Never mark a manual acceptance test as passed because an SDK handshake passed.

## Non-negotiable boundaries

- No hosted scanner, cloud source upload, telemetry, API key, privileged installer, background daemon, auto-fix, remote Git command, or arbitrary tool-supplied root.
- The configured absolute `REPOSAFE_ROOT` scopes all reads. Treat repository files, Git metadata, filenames and tool inputs as untrusted. Reports contain metadata, never matched secret values or source snippets.
- No hidden fallthrough on incomplete scans, skipped files, exceeded budgets, interrupted history or retention truncation: preserve a review-required verdict and explain the limitation.
- MCP scanning remains read-only; CLI checkpoint reuse and explicit client `connect`/`disconnect` are separate opt-in local writes, disclosed and reversible.
- Never bypass macOS security warnings or depend on the Codex executable as part of normal scanner operation.
- No publishing, branch protection changes or deploy until individually reviewed and explicitly approved.

## Acceptance matrix

| Gate | Evidence required | Current status on 2026-11-23 |
| --- | --- | --- |
| P0 — Post-merge integrity | CI on exact `main` SHA, four OS/Node jobs, typecheck/build/tests/archive/runtime/audit | **PR #34 and PR #35 merged**. Exact `main` commit `5eb48fd2c4299f5e01d197fffa008250e95e6099` passed [post-merge CI #45200166977](https://github.com/VladTepes84/RepoSafe-MCP/actions/runs/45200166977) **4/4**, including runtime/package and the live public GitHub URL smoke test. Source integration is verified; release artifact signing/publication are separate gates. |
| P0 — Security boundaries | Adversarial path/symlink/hardlink/Git env tests, secret redaction, fail-closed limits, config locks and checkpoint corruption tests | Synthetic Git/config and adversarial traversal, junction, hardlink and GIT_COMMON_DIR regression checks were merged in [PR #31](https://github.com/VladTepes84/RepoSafe-MCP/pull/31), with four passing post-merge CI jobs. **Independent external audit has not occurred**; see [scope](SECURITY_REVIEW_SCOPE.md). |
| Future — IDE/GUI MCP integrations | Actual GUI acceptance before claiming individual client compatibility; **not a 1.0 CLI release gate** | MCP stdio protocol and seven-tool SDK checks exist, but no graphical client is accepted. Codex/Cursor/VS Code/Claude GUI support is deferred and must not be marketed as verified. |
| P1 — Detection precision | Authorized labeled real-repository reports, independent cross-tool adjudication, TP/FP/FN/unknown and coverage; no raw source upload | Synthetic 25-positive/23-benign matrix passed at PR #29 and exact main merge `9ced134350302aa9964c74b251eea6473abb9e3a` ([4/4 CI](https://github.com/VladTepes84/RepoSafe-MCP/actions/runs/45137216537)). Offline scoring tool merged in [PR #30](https://github.com/VladTepes84/RepoSafe-MCP/pull/30); **no representative real-world precision/recall measured**. |
| P1 — Report contract | JSON schema versioning, SARIF validation with consumers, deterministic pagination, counts, omission reporting and redact-only guarantee | JSON/SARIF smoke checked locally; independent interoperability outstanding |
| P1 — Large-repository performance | Representative real-world authorized local datasets; p50/p95 runtime, peak RSS, cancellation, history limits and coverage | Synthetic small/medium/large CI benchmark only |
| P1 — GitHub governance | Reviewed branch rules, required checks, Dependabot PR process, disclosure path and supply-chain audit | Repository workflow and security guide present; platform rules/settings require separate verification |
| P1 — Onboarding/uninstall | Pinned archives, supported OS CLI paths, restoration of unrelated MCP servers, private backup handling | CLI/config regressions pass across platforms. User-run macOS standalone CLI acceptance also **PASSED** at PR #34 code head `bfa03c839c725292248c758562dfdfafbed3b3e5` (progress, completed current-file scan, numbered Next Actions and appropriately disclosed incomplete Git coverage). [PR-head CI #45164169801](https://github.com/VladTepes84/RepoSafe-MCP/actions/runs/45164169801) 4/4 PASS. Git metadata unavailable on the tested directory; other OS manual journeys unverified. |
| P2 — Release supply chain | SemVer, changelog, source tag, checksums, independently verifiable provenance/SBOM, install/rollback and license | Version `1.0.0` is an **unpublished source candidate**. The old manual [candidate run #45158828933](https://github.com/VladTepes84/RepoSafe-MCP/actions/runs/45158828933) was successful but generated at obsolete SHA `f6f6da794537ac5666a43f776d7d51432863c07b`. It does not cover final `main` `5eb48fd2c4299f5e01d197fffa008250e95e6099`. The final source CI is green, but a new manual candidate workflow, independent package/SBOM/checksum inspection and separate publication authorization are still required for any tagged release. No tag, signature, provenance attestation or npm registry publication exists. |
| P2 — UX and regressions | Bounded clear CLI output, actionable errors, no ANSI in JSON/SARIF, property/fuzz/regression corpus | Final CLI/remote snapshot code integrated at `5eb48fd2c4299f5e01d197fffa008250e95e6099`; [post-merge CI #45200166977](https://github.com/VladTepes84/RepoSafe-MCP/actions/runs/45200166977) **4/4 PASS**. Real macOS local-root and public URL scan acceptance passed; latest PATH-free follow-up rendering was automated-tested but not operator-retested. Wider fuzz, independent field-quality and performance matrix remain outstanding. |

## Deferred manual GUI-client test (not a 1.0 CLI gate)

Use only a **synthetic disposable local repository**. Install RepoSafe from a reviewed immutable SHA in a separate prefix; do not reuse real user secrets. Record OS, Node/Git versions and client build, and follow [CLIENT_ACCEPTANCE.md](CLIENT_ACCEPTANCE.md). Test seven tool calls, full and category-scoped reports, paging, metadata-only output, scope boundaries, restart, error messages and clean disconnect. A text-only answer from an AI agent, or `doctor PASS`, is not evidence of an in-product tool call.

## Measurement protocol

- Synthetic positive/negative fixtures must contain dummy/non-live credentials. Per detector, report TP, FP and FN against explicit fixture labels. Do not call all findings in `tests/` harmless without inspecting them.
- Do **not** silently exclude test directories: malicious credentials can reside there. Improve confidence with per-rule context and explicitly governed exact-match baselines.
- Define reference hardware, dataset scale, commit count and scan options before benchmarking. Report elapsed time, RSS, scanned/skipped files, omitted findings, scanned commits and whether coverage is complete.
- Compare fresh history and opt-in resumed history on unchanged and changed refs. Check that fresh working-tree checks cannot be replaced by cached state.
- Never publish real report data or a private-repo path to public GitHub issues. Use only redacted summaries and synthetic reproductions.

## GitHub review/release policy

Each change uses a scoped PR and immutable evidence link. Keep `main` protected with review and required CI where available; this document cannot itself configure GitHub settings. Check `npm audit --omit=dev`, dependency update PRs, third-party Action revision integrity and branch head before merging. A merged feature is not automatically a stable release or a successful manual client test.

**Version scope:** PR #26 adds path/Git-index context and overlength counts. PR #27 adds best-effort overlapping checks on long current-file and tracked-excluded-file lines. Neither guarantees complete coverage of arbitrary-length secrets or structured/multiline patterns; partial scans must stay review-required. Existing synthetic precision tests do not measure real-world accuracy.

**Release blockers:** unbounded/unspecified scan scope, potential raw secret disclosure, false clean verdict on incomplete coverage, unsafe client-config overwrite, broken archive install or failing cross-platform CI. Do not claim GUI compatibility without actual GUI evidence, but missing GUI acceptance does **not** block the standalone CLI 1.0 release.
