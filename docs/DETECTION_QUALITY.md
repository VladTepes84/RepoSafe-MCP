# Detection quality: ground truth and measurement

RepoSafe uses bounded heuristic detectors, not credential validation. Results are **candidates for human review**, not confirmed vulnerabilities.

## Automated synthetic corpus

`npm run test:precision` checks a small, labeled corpus of **non-live** synthetic examples covering common provider token formats, database URI passwords and generic assignments. It records TP (expected rule present), FN (expected rule absent) and FP (any secret finding on a benign fixture). This is a **regression test**, not an estimate of performance on production repositories. A score of 100% on this toy corpus must never be advertised as real-world precision or recall.

## Production-quality acceptance (future manual/authorized work)

Before changing rules or public quality claims:

1. Assemble a diversified, authorized, sanitized and labeled corpus covering languages, formats, test fixtures, comments, templates, current files and Git histories. Never upload actual credentials.
2. Review disputed labels independently. Explicitly distinguish harmless fixture patterns, real exposed values, and uncertain cases.
3. Measure per-rule TP, FP, FN, false-positive rate, precision, recall and duplicate burden. Show raw counts, prevalence, uncertainty and coverage exclusions.
4. Validate priority ordering, `findingsOmitted`, exact-match baseline exceptions, report redaction and SARIF/JSON output with each change.
5. Do **not** globally skip `tests/`, fixtures or generated source: a real secret can exist there. Govern exact-match exceptions with a reason and optional expiry; high-severity suppression must remain review-required.
6. Benchmark CPU/RSS on realistic local repositories; performance claims need scope and platform data.

No production false-positive or recall rate has been verified. See [Professional Readiness](PRO_READINESS.md) for release gates.
