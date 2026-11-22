# RepoSafe report contracts

The standalone CLI emits a **base metadata-only report** with `schemaVersion: "2"` using `reposafe scan --json`. Its machine-readable contract is [report-v2.schema.json](../schemas/report-v2.schema.json) (JSON Schema Draft 2020-12). This schema does **not** apply unchanged to a paginated MCP response: the latter additionally includes `pagination`, `category` and/or `note`.

## Semantics and privacy

- `findings` are **suspicions**, not confirmed active vulnerabilities. `severity` prioritizes review; no confidence calibration or precision guarantee is currently published.
- Optional `testFile: true` means only the path resembles a test/fixture. This is **not** evidence that a matching token is fake and never reduces severity.
- Optional `gitTracked: true|false` is **local Git index status for a current-file finding**, not proof of remote publication. An absent field means status was not established. An untracked file may have been present in older commits.
- Optional `stats.overlengthLinesSkipped` counts skipped overlength lines in regular working-tree traversal; targeted Git-tracked excluded files and historical patches have separate coverage warnings. `stats.complete` remains false when a line is skipped.
- `stats.complete` means requested scope examined **within declared scanner limits**. It is not a comprehensive code audit or a safe-to-publish certificate. Read `filesSkipped`, `warnings`, `findingsOmitted` and `limitations`.
- `verdict: "review_required"` is produced if findings exist or scanning was incomplete. No-finding reports cannot certify safety.
- `git` is optional (omitted when Git checks are disabled); Git history is bounded and may be incomplete. Check history scope/counts rather than treating the number of scanned commits as total repository history.
- `baseline`, when present, exposes only exception counts and never the reasons. High/critical suppressions preserve a review-required verdict.
- The schema enforces field names/types, **not redaction**. Redaction is an independent runtime invariant tested with synthetic credentials and must be reviewed separately. Never upload unredacted private reports to public issues.
- JSON/SARIF stdout remains uncolored; debug/progress text must not contaminate machine-readable output. CLI exit codes: `0` clean within scope; `1` review required; `2` usage/runtime error.

## Compatibility

Downstream consumers should validate `schemaVersion`, reject unsupported major versions, handle optional properties and not assume that future fields are present. If a breaking contract change is required, publish a new versioned schema and tests rather than silently altering v2. For SARIF, RepoSafe currently exports SARIF 2.1.0 with fixed rule messages, relative artifact URIs where safe, and explicit incomplete-scan warnings.

This document is an engineering contract; independent third-party SARIF interoperability and fuzzing are still pending.
