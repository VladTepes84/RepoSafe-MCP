# RepoSafe MCP — quick start

RepoSafe audits a **specific local repository** with a standalone CLI or an optional local STDIO MCP server. It does **not** upload code, repair findings or certify publication safety. Node.js **22+**, npm and Git required (Git history checks need Git). **Seven MCP tools** are exposed at protocol level; actual GUI-client tool visibility must be tested separately.

## 1. Install precompiled code, no lifecycle scripts

macOS/Linux:

~~~sh
npm install --prefix "$HOME/.reposafe" --ignore-scripts --no-audit --no-fund \
  "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
RS="$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js"
node "$RS" --help
~~~

Windows PowerShell:

~~~powershell
npm.cmd install --prefix "$HOME\.reposafe" --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
$RS = "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js"
node $RS --help
~~~

**Supply-chain:** `main` is mutable. Replace the archive's final segment with a reviewed **full commit SHA** to pin it; a commit pin is not signed release attestation. Install writes into your prefix/npm cache, never the target repository.

## 2. Verify the server, then scan

Select a real absolute directory that you **own or are authorized to inspect**; not your entire home, a system folder or a filesystem root.

~~~sh
REPO="/ABSOLUTE/PATH/TO/REPO"
node "$RS" doctor --root "$REPO"   # protocol handshake and 7 tools; no scan
node "$RS" scan --root "$REPO"     # real read-only scan
~~~

The default human view is severity-grouped and includes coverage plus remediation. Useful alternatives:

~~~sh
node "$RS" scan --root "$REPO" --summary
node "$RS" scan --root "$REPO" --compact --group-by file
node "$RS" scan --root "$REPO" --history-depth 250 --max-diff-size 8
node "$RS" scan --root "$REPO" --json > "/SAFE/OUTPUT/report.json"
node "$RS" scan --root "$REPO" --sarif > "/SAFE/OUTPUT/report.sarif"
~~~

Redirect JSON/SARIF to a directory **outside** the repository being scanned. Exit `0` = no findings within bounded scope; `1` = review required/incomplete; `2` = error. Check all warnings: `0` is never certification.

For every CLI flag and limit see [CLI reference](CLI_REFERENCE.md).

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
