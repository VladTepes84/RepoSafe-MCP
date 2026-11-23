# Offline detection-quality assessment (v1.0 acceptance)

Built-in synthetic tests verify regression behavior, **not real-world accuracy**. Use this opt-in evaluator to score findings on repositories you own or are authorized to audit. It does not scan directories itself, install or execute external tools, upload source, or fetch Git objects.

## Procedure: authorized local evidence

1. Record the authorized repository's exact local Git revision, operating system, Node/Git versions and RepoSafe commit. Use the same history selection and comparable scope across scanners. Keep paths, filenames and raw reports private.
2. Generate a RepoSafe JSON v2 report into a **private directory outside the scanned repository**:

   ~~~sh
   node "$RS" scan --root "$REPO" --history-depth 1000 --json > "$PRIVATE_DIR/reposafe.json"
   ~~~

   Exit code 1 normally means findings or incomplete coverage. Do not mistake it for a failed command; do not commit reports.
3. Manually review each secrets/history finding. In a separate private JSON file, record one adjudication per unique finding: true_positive (genuinely relevant), false_positive (confirmed not relevant) or unverified. A test-like path is not automatically harmless. Provider key validity is a separate question.
4. Review known exposures missed by RepoSafe using dummy credentials or independently confirmed authorized evidence. Record them in the missed array; a third-party scanner hit is a lead, **not automatically ground truth**.
5. Evaluate the report **offline**:

   ~~~sh
   npm run quality:score -- --report "$PRIVATE_DIR/reposafe.json" --labels "$PRIVATE_DIR/labels.json"
   ~~~

   Output is only aggregated per-rule counts: no filenames, matched values, paths, line numbers or commit IDs.

## Label file (private, never committed)

All example paths are invented and contain no credentials.

~~~json
{
  "schemaVersion": 1,
  "scope": "working-tree",
  "adjudications": [
    {
      "category": "secrets",
      "rule": "github_token",
      "file": "src/example.ts",
      "line": 10,
      "classification": "true_positive"
    },
    {
      "category": "secrets",
      "rule": "aws_access_key_id",
      "file": "tests/sample.test.ts",
      "line": 25,
      "classification": "unverified"
    }
  ],
  "missed": [
    {
      "category": "secrets",
      "rule": "generic_secret_assignment",
      "file": "src/other.ts",
      "line": 12
    }
  ]
}
~~~

Every adjudication must match an actual finding in the report using category, rule, relative file, optional line and optional 12-character commit. For history findings, use scope "working-tree-and-history" and the matching history metadata.

Do not put plaintext secrets or source excerpts in labels. If two original paths have the same redacted filename, metadata identity can collide: mark review inconclusive, not passed. Unsupported categories (privacy, readiness, git) are outside this credential-quality scorer.

## Metrics and interpretation

| Name | Definition | Caveat |
| --- | --- | --- |
| TP | Relevant finding, manually confirmed | Requires human judgment |
| FP | Finding confirmed not relevant | Test path alone is not proof |
| FN | Known relevant case missed | Needs independently established positive or controlled injection |
| Unverified | Reported finding without confident classification | Excluded from denominator; review remains incomplete |
| Precision | TP / (TP + FP) | null when no adjudicated positive reports |
| Recall | TP / (TP + FN) | null when no known positives |
| Duplicates | Same metadata identity emitted more than once | Redacted paths may collapse distinct findings |
| Coverage | Requested working-tree and history completeness, omissions, suppressions | Incomplete coverage precludes full-review status |

The output flag fullyReviewed means that every eligible finding was classified, metadata did not duplicate, and requested coverage was complete with no omissions/suppressions. **It does not establish a passing accuracy threshold or representative sampling.** The metrics are sample-scoped, never global guarantees.

## Proposed final validation protocol

- Test 6–10 authorized repositories across different languages and Git histories, with a meaningful volume of manually adjudicated HIGH findings. Record uncertainty and sample size, and never publish private metadata.
- Compare locally with Gitleaks and TruffleHog if separately approved/installed. Review disagreements manually. Avoid hosted validation of potentially active keys.
- Seed non-live credentials and deletions to test known positives and Git history recall. Report missed supported rules and distinguish out-of-scope formats from detector failures.
- After privacy review, publish only aggregate sample size, TP/FP/FN, uncertainty, coverage, versions, p50/p95 latency and peak RSS.
- A proposed 1.0 target is at least 90% precision on independently confirmed HIGH alerts, on a representative sample, and no missed mandatory synthetic fixtures. This is a **project target, not an achieved result or a recognized certification**.

## Security and governance

The scorer executes no scans or subprocesses and makes no network calls. It reads only the two operator-supplied JSON files (16 MiB each). Raw reports and label files stay on the operator's machine. Mismatched and invented classifications are rejected.

An AI-assisted implementation review is **not an independent security audit**. That requires a qualified reviewer external to development, an explicit scope, reproducible attack cases and a report with findings and residual risks. No independent audit is claimed before this evidence exists.

Codex and other IDE/GUI-client integrations are **deferred future features** and are **not** release 1.0 CLI gates. The existing MCP STDIO protocol still has automated tests.
