# Contributing safely

RepoSafe is a minimal-permissions, read-only security project. Prefer focused PRs, independent regression tests and explicit limits on new file- or Git-reading behavior.

Before proposing a change:

```bash
npm ci
npm run check
npm run demo
```

Use **synthetic credentials only** in code, test fixtures, logs, screenshots, PRs, issues and CI. Never include real credentials, private code, internal hostnames or personal paths. Explain security trade-offs, false-positive risks, new permissions and platform impact. Do not add arbitrary runtime network access, automatic remediation, server hosting or `shell: true` without an explicit threat-model review and maintainer approval. The existing opt-in public GitHub snapshot adapter is narrowly scoped to validated GitHub hosts/URLs, no redirects, bounded regular-file extraction and temporary local scanning. New hosts, private credentials, remote scan services or changed permissions require another security review.

CI should pass on Windows, macOS and Linux; the README must be updated for material behavior changes. Never describe a scan as a security certification.