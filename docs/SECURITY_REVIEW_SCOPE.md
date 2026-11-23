# Security review scope and evidence (candidate 1.0)

**Status: NOT independently audited.** This document is an audit handoff and checklist, not an audit report, certification, or guarantee. A reviewer must be independent of the code author to sign off as an external audit.

## Scope and strict boundaries

- Target: exact reviewed Git commit SHA, compiled distribution and npm archive, Node.js 22+ on supported operating systems.
- Components: CLI scanning, filesystem traversal, Git history subprocesses, MCP STDIO read-only tools, baseline/suppression, redacted reports (JSON v2 and SARIF 2.1.0), optional private history checkpoint, and opt-in configuration changes.
- Out of scope for 1.0 release: GUI integration with Codex, Cursor, Claude Desktop and IDE clients, hosted scanning, provider key validation and external repository synchronization.
- Test only disposable authorized repositories containing non-live dummy credentials. No pentesting unrelated infrastructure or exfiltration of actual tokens.
- Target repo must never be modified by the scanner. Optional CLI checkpoint or client connect/disconnect writes are separately consented and tested for rollback.

## Minimum independent reviewer checklist

| Risk | Attack / acceptance probe | Required evidence |
| --- | --- | --- |
| Filesystem escape | Absolute/relative traversal, symlinked parents, Windows junctions, hardlinks, renamed files and race windows | Synthetic proof that outside files were never returned; documented residual TOCTOU risk |
| Git execution and scope | GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_COMMON_DIR, fsmonitor, textconv/external diff, config include, untrusted refs | No invocation of hostile helpers, no out-of-root reads; complete/incomplete flags |
| Report data leakage | Credential-shaped filenames, long Unicode names, source snippets, error paths, stdin/stdout/stderr, SARIF/JSON, pagination | Exact redaction tests, no raw values or absolute paths in exported reports |
| Resource exhaustion | Oversized file, overlength line, diff budget, 5k finding retention, timer/kill, malformed Git metadata | Explicit budget and incomplete verdict, bounded runtime/RSS measurements |
| Accuracy and baseline | Known positives and benign samples, high-severity findings in tests, exact-match suppressions and expiry | TP/FP/FN counts from labeled authorized samples; no unsupported accuracy claims |
| Distribution/supply chain | Locked npm dependencies, no install lifecycle scripts, pinned archive, SBOM/checksum, build reproducibility, known advisories | Reproducible commands and immutable hashes, checked release candidate artifacts |
| Configuration safety | Manual connect/disconnect, backup privacy, no overwrite of unrelated MCP entries, checkpoint tampering | Reversible tests and a clear distinction between read-only scanning and opt-in writes |

## Reviewer report template

A complete independent report should include the reviewer/organization and statement of independence, reviewed SHA, date, OS/Node/Git versions, methodology, test coverage, number and severity of findings, reproducible *synthetic* proofs of concept, remediation evidence, residual risks and a final conclusion.

Severity labels must not be conflated with provider-validated live key exposure. A clean CI matrix and a passing SDK handshake **do not** establish independent review.

## Current evidence and gaps

- Existing test suites cover file scope, Git injection, relative path validation, redaction, incomplete coverage and protocol limits; CI is tracked at specific immutable commits.
- Additional adversarial filesystem and GIT_COMMON_DIR regressions are being proposed; they are **internal automated tests**, not external assessment.
- **Independent review: NOT PERFORMED.** No named qualified outside reviewer, signed report, or completed external test campaign is available.
- Windows junction tests may skip on restricted runners; such skips must be disclosed rather than counted as full security acceptance.
- A signed distribution/provenance attestation and representative field detection accuracy are not yet evidenced.

A versioned open-source release may truthfully state that independent audit has **not** occurred. It must not claim security certification, zero false negatives or suitability as a sole publication gate.
