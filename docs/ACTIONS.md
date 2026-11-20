# RepoSafe MCP — GitHub Actions integration (v0.5 beta)

RepoSafe offers an **opt-in composite action** at the repository root `action.yml`. It scans the GitHub Actions checkout with the same local Node.js/Git scanner used by the CLI. It does **not** modify the source repository, commit code, publish a package, upload raw source, or upload SARIF automatically.

## 1. Pull-request gate — minimal permissions

In the repository you want to protect, create `.github/workflows/reposafe.yml`:

```yaml
name: RepoSafe review
on:
  pull_request:
permissions:
  contents: read
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: VladTepes84/RepoSafe-MCP@main
        id: reposafe
        with:
          fail-on-findings: 'true'
```

**Supply-chain warning:** `@main` illustrates the wiring, but is mutable. For production, replace it with an immutable reviewed **40-character commit SHA**. Choose the SHA corresponding to a tested release/commit, and review changes before updating it.

The Action runs `npm ci` and compiles RepoSafe under `GITHUB_ACTION_PATH`. It scans only `GITHUB_WORKSPACE`; it does not accept an arbitrary action input scan root. CLI exit statuses: 0 scoped no-findings, 1 findings/incomplete coverage, 2 operational error. The Action's `fail-on-findings` defaults to true. Set to false only for report-only evaluation.

The SARIF file is stored under runner `RUNNER_TEMP`, exposed as `steps.reposafe.outputs.sarif-file`. It is not automatically uploaded or publicly shared.

## 2. Optional GitHub Code Scanning integration

To upload SARIF, GitHub Code Scanning must be available and enabled for the repository. An explicitly opted-in workflow can grant `security-events: write` and add a step after the scan:

```yaml
permissions:
  contents: read
  security-events: write
# in steps (after the checkout and RepoSafe action):
- name: Upload redacted SARIF
  if: always()
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: "${{ steps.reposafe.outputs.sarif-file }}"
```

Do not copy the upload step unless you understand the permissions and availability requirements. The default example intentionally does not upload anything. GitHub-hosted runners may consume billed or quota-limited Actions minutes depending on the repository/account. RepoSafe itself does not require cloud services or paid AI APIs.

## 3. Redaction and coverage

SARIF contains rule/priority, sanitized relative file locations and remediation, not matched credential values. Historical findings can lack a meaningful current file line. Incomplete scans produce an explicit SARIF finding to prevent a misleading clean result. A successful workflow is not proof that the repository is safe to publish.

The composite action has a Linux smoke test in RepoSafe's CI, while the cross-platform CLI, package manifest and SARIF tests run on Ubuntu, macOS and Windows. This does **not** count as Cursor or Claude Desktop GUI integration testing.
