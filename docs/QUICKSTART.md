# RepoSafe — quick start

Node.js 22+ and npm are required; Git is needed for local history. Use only repositories you own or are authorized to audit.

## 1. Install (private user directory)

~~~sh
# macOS/Linux
npm install --prefix "$HOME/.reposafe" --ignore-scripts --no-audit --no-fund \
  "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
export PATH="$HOME/.reposafe/node_modules/.bin:$PATH"
~~~

For Windows PowerShell:

~~~powershell
npm.cmd install --prefix "$HOME\.reposafe" --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
$env:PATH = "$HOME\.reposafe\node_modules\.bin;$env:PATH"
~~~

`main` is mutable. Pin a reviewed 40-character SHA for production use. No administrator, AI account or npm registry publication required.

## 2. Scan

~~~sh
# Local Git root: analyze current files and bounded local Git history
cd /ABSOLUTE/PATH/TO/GIT-REPOSITORY
reposafe scan

# Public GitHub URL: no manual clone required
reposafe scan https://github.com/octocat/Hello-World
~~~

The remote mode downloads a bounded public snapshot into temporary local storage; it does not execute code or upload findings. It **cannot check Git history/index, submodules or LFS** and always marks coverage incomplete. A forced process termination may leave temporary files. Private repositories and arbitrary URLs are unsupported.

## 3. Follow the Next Actions

~~~sh
reposafe scan --high                    # local priority findings
reposafe scan --details --group-by file # local file/line details
reposafe scan https://github.com/OWNER/REPO --details
~~~

Each suggested command scans again. `--all-findings` shows all retained results (up to the scanner's limit). Local-only `--json` and `--sarif` output are intended for automation. Exit 0 means no recognized finding in inspected scope; 1 means findings/incomplete coverage; 2 means an error. **Never infer that a zero-finding scan is safe to publish.**

Guides: [First run](FIRST_RUN.md), [CLI reference](CLI_REFERENCE.md), [Security](SECURITY.md), [Uninstall](UNINSTALL.md).

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
RS="$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js"
REPO="/ABSOLUTE/PATH/TO/GIT-REPOSITORY"
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
