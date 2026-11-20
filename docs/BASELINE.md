# RepoSafe .reposafe.json — strict baseline exceptions

This file is **optional**. It is read from the authorized repository root. It must never contain secrets. The file is untrusted repository content: **review every change to it in pull requests**, especially when contributors can edit it.

```json
{
  "version": 1,
  "exceptions": [
    {
      "path": "docs/examples.txt",
      "rule": "generic_secret_assignment",
      "reason": "Reviewed synthetic documentation example.",
      "expires": "2027-01-31"
    }
  ]
}
```

Security requirements:
- Exact path and exact rule only. **No glob, wildcard, parent traversal, absolute path or directory-wide exception**.
- Reason required (8–160 characters), and optional strict UTC date `YYYY-MM-DD` expiry. Invalid, oversized, duplicated or symlinked baseline files cause `review_required` with no exception applied.
- Maximum 100 entries and 16 KiB. The scanner does not return exception reasons to the AI.
- The report includes a `baseline` object with `entries`, `suppressed`, `highSuppressed`, `expired`. Suppressions are also announced in warnings.
- High/critical findings can be filtered from the output, but **the report verdict remains `review_required` if any high/critical finding is suppressed**. This is deliberate to prevent bypassing PR security gates.
- A clean report means only no *unsuppressed* findings in the completed bounded scope. It is never a certification of repository safety.

The baseline is not a universal allowlist for arbitrary code, filenames or paths. For higher-assurance workflows, independently inspect baseline changes with protected branches and additional scanning.
