# RepoSafe MCP — quick start (CLI first)

RepoSafe scans **local, authorized Git repositories** without uploading code or requiring an AI client, account, or API key. Requirements: Node.js 22+, npm, Git. Seven existing MCP STDIO tools are optional and remain unchanged.

## 1. Install from reviewed GitHub source

Install into a user-controlled npm prefix. The global route below requires that npm's global prefix be user-writable; **never use sudo**:

~~~sh
npm install -g --ignore-scripts --no-audit --no-fund \
  "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
~~~

The archive ref main is mutable: replace it with the *reviewed 40-character commit SHA* for reproducibility. The npm registry package has **not** been published. If global installation is unavailable, the dedicated per-user prefix procedure is documented in [First run](FIRST_RUN.md).

## Optional: scan a public GitHub URL (separate feature candidate)

~~~sh
reposafe scan https://github.com/OWNER/REPO
reposafe scan https://github.com/OWNER/REPO --high
~~~

The URL is **not executed**. RepoSafe verifies it is a simple public GitHub repository URL, obtains a specific commit SHA, downloads a bounded tar.gz snapshot over HTTPS, extracts regular files into a private system temp directory, runs the existing current-file scanner and attempts to remove the snapshot. No `git clone`, scripts, submodules, hooks or shell expansion are used. Source code is downloaded to the operator's machine; scanning does not upload it. History, Git index, Git LFS and submodule content **are not checked**; coverage stays INCOMPLETE. Non-GitHub URLs, private repos, size/budget breaches and malformed archives fail without a scan. Remote machine-readable formats are intentionally deferred.

## 2. Open the Git repository and run one command

~~~sh
cd /ABSOLUTE/PATH/TO/YOUR/GIT-REPOSITORY
reposafe scan                 # dashboard and all findings grouped by severity/rule
reposafe scan --high          # high-priority details and actions
reposafe scan --details       # individual locations and remediation
reposafe scan --details --group-by file   # inspect relative file paths/lines
reposafe scan --all-findings   # show all retained results, not just 50
reposafe scan --summary       # counts/coverage only
reposafe scan --no-history    # faster current-state evaluation
reposafe scan --json          # automation without ANSI or extra text
reposafe scan --sarif         # machine-readable SARIF 2.1.0
~~~

The default current-directory scan **requires a .git marker in that exact directory**. It does not ascend into a parent directory. For a different authorized scope, pass --root ABSOLUTE_PATH; to scan an explicitly approved non-Git folder, add --no-git. The CLI never edits the target, rotates credentials or certifies publishing safety. Exit 0 = no findings in selected scope; 1 = findings or incomplete coverage; 2 = usage/runtime error. Check history windows, file limits, omissions and all coverage warnings.

### How to use the numbered Next Actions

After the first scan, review `STATUS`, the severity overview and any `COVERAGE WARNINGS`. The **PRIORITY** action prints CRITICAL/HIGH findings with relative paths, lines, reasons and recommended steps. **BY FILE** groups the first 50 findings by file; add `--all-findings` to list every retained finding. **COVERAGE** explains remaining limitations, including unavailable Git metadata. The generated commands preserve `--no-history` or other supported scan-scope options. Running one is a **new local read-only scan**, not a selection from cached results.

A pattern match is **not proof of a valid exposed credential**. Review test fixtures separately from real secrets; rotate or revoke only where warranted. If Git inspection fails, `Tracked: 0` and `Untracked: 0` do **not** mean no files are tracked. No automatic security certification is provided.

## 3. Reproduce the security regression locally (developers)

~~~sh
git clone https://github.com/VladTepes84/RepoSafe-MCP.git
cd RepoSafe-MCP
npm ci --ignore-scripts
npm run check
npm run verify:runtime
npm run benchmark
npm run audit:deps
~~~

The test suite creates disposable synthetic Git repositories, not live keys. `npm run check` includes typecheck, build, protocol tests, scanner/security tests and the offline demo. `npm audit` needs network access; the scanner does not.

## 4. Optional MCP clients, with explicit caveat

~~~sh
node "$RS" init --root "$REPO" --client codex --json     # protocol check + preview, no config write
node "$RS" connect --root "$REPO" --client codex --dry-run
node "$RS" connect --root "$REPO" --client codex         # writes the RepoSafe entry
node "$RS" disconnect --client codex                     # reversible
~~~

Also supported in the **configuration generator**: `cursor`, `claude` and `vscode`. This is a local STDIO server, **not** a remotely hosted ChatGPT plugin.

**Current evidence:** RepoSafe passed SDK STDIO tests and local doctor on a Mac, but **was not exposed as a tool in an observed Codex Desktop conversation** on 2026-11-22. Do not mistake a successful `doctor` for a passed GUI test. See [MCP client acceptance](CLIENT_ACCEPTANCE.md). The CLI works without Codex.

## 5. Interpret and clean up

- **Critical/High:** investigate possible exposed live secrets, rotate/revoke credentials if necessary; Git rewriting does not revoke a token.
- **Medium/Low:** inspect ignore rules, tracked files, private infrastructure references and publication readiness.
- **Incomplete:** adjust scope/budgets knowingly, rerun, and do manual review before publishing.
- **Local checkpoint:** `scan --resume-history` opts into private metadata writes under `~/.reposafe/checkpoints/`; current files are always rescanned.
- **Remove:** follow [Uninstall](UNINSTALL.md), which distinguishes npm install, source clone, temporary test repositories, client backup files and checkpoints.

Further: [Full README](../README.md) · [Security](SECURITY.md) · [Detection](DETECTION.md) · [Remediation](REMEDIATION.md).
