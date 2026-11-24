# RepoSafe MCP

**Audit local Git repositories and public GitHub code before publication.** RepoSafe identifies possible credentials, internal references, readiness gaps and (for local Git roots) bounded Git history. The scan runs locally and shows severity, file, reason and recommended action, **never matched secret values or source snippets**.

**Node.js 22+**, npm, Git for local history checks · macOS / Linux / Windows · MIT · no account, paid plan, AI key or hosted scanner. **Source candidate v1.0.0**: not yet released to npm, not tagged or signed. Findings are aids to manual review, **not a safety certificate**.

## Install once

**macOS / Linux** — paste in Terminal (installs in your own home directory, no sudo):

~~~sh
npm install --prefix "$HOME/.reposafe" --ignore-scripts --no-audit --no-fund \
  "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
export PATH="$HOME/.reposafe/node_modules/.bin:$PATH"
reposafe --help
~~~

**Windows 11** — paste in PowerShell (no administrator rights):

~~~powershell
npm.cmd install --prefix "$HOME\.reposafe" --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
$env:PATH = "$HOME\.reposafe\node_modules\.bin;$env:PATH"
reposafe --help
~~~

The PATH setting applies **only to that terminal session**; see [First run](docs/FIRST_RUN.md) for alternatives. Do not use `sudo` or bypass macOS/Windows security controls. Installation needs GitHub/npm network access. The `main` source URL can change; for production pin a reviewed **40-character commit SHA**. A SHA is not a signed release.

## Scan in one command

**Local Git repository** (works offline after installation; the current directory must contain its own `.git` marker):

~~~sh
cd /ABSOLUTE/PATH/TO/YOUR/GIT-REPOSITORY
reposafe scan
~~~

**Public GitHub repository** — paste the URL; no manual `git clone` needed:

~~~sh
reposafe scan https://github.com/octocat/Hello-World
~~~

**Investigate findings** (the CLI prints copyable `NEXT ACTIONS` automatically):

~~~sh
reposafe scan --high                         # local CRITICAL/HIGH
reposafe scan --details --group-by file      # local file and line details
reposafe scan https://github.com/OWNER/REPO --details
~~~

Use `--all-findings` to display every *retained* finding rather than the default first 50. Each follow-up runs a **new read-only scan**, not a cached report. If installed at `$HOME/.reposafe`, Next Actions show copyable commands using that private executable even if PATH is not set.

**Remote URL boundaries:** RepoSafe explicitly downloads a size-limited, commit-pinned public GitHub TAR snapshot via HTTPS, extracts only ordinary files into a private temporary folder, scans locally, then attempts cleanup. It does **not execute downloaded code**. Git history/index, submodules and Git LFS contents are **not checked**; remote coverage is always **INCOMPLETE**. Abrupt system termination may leave temporary files. Only public `https://github.com/OWNER/REPO` URLs are accepted, without tokens or arbitrary hosts. Remote JSON/SARIF and history flags are unsupported; local scans support JSON v2, SARIF 2.1.0 and bounded history.

**Exit codes:** `0` no recognized findings within inspected scope, `1` findings **or incomplete coverage**, `2` usage/runtime error. Zero findings is **not** proof a repository is safe to publish. Local scanning reads only an approved root; specify `--root ABSOLUTE_PATH` to inspect a different authorized directory (`--no-git` for an explicitly approved non-Git directory).

## Guides

| Need | Reference |
| --- | --- |
| First use, installation and PATH | [First run](docs/FIRST_RUN.md) · [macOS](docs/INSTALL_MAC.md) · [Windows](docs/INSTALL_WINDOWS.md) |
| CLI options and real examples | [CLI reference](docs/CLI_REFERENCE.md) · [Quickstart](docs/QUICKSTART.md) |
| Findings and remediation | [Detection](docs/DETECTION.md) · [Remediation](docs/REMEDIATION.md) · [Baseline](docs/BASELINE.md) |
| Local seven-tool MCP server | [MCP setup](docs/LOCAL_MCP.md) · [Client tests](docs/CLIENT_ACCEPTANCE.md) · [Other devices](docs/MCP_REMOTE_ACCESS.md) |
| Threat model, coverage and testing | [Security](docs/SECURITY.md) · [Testing](docs/TESTING.md) · [Readiness](docs/PRO_READINESS.md) |
| Cleanup, updates and rollback | [Uninstall](docs/UNINSTALL.md) · [Changelog](CHANGELOG.md) |

**Disclaimer:** pattern matches are not proof credentials are valid. No independent security certification, representative real-world detection accuracy or general AI-client GUI compatibility is claimed. GitHub Sponsors is optional and does not unlock functionality.

## What RepoSafe checks

| MCP tool | What it does |
| --- | --- |
| `scan_secrets` | Detect recognizable tokens, credentials, keys, risky assignments and supported structured configurations |
| `scan_private_refs` | Flag internal hostnames, private links and local paths that may be unsafe to publish |
| `check_repo_readiness` | Review README, license, ignore rules and basic publication readiness |
| `check_git_exposure` | Find Git-tracked credential filenames and ineffective ignore rules |
| `scan_git_history` | Inspect bounded local commit diffs for credentials that remain after file deletion |
| `generate_report` | Consolidate findings, severities, coverage, exclusions, history and remediation |
| `get_findings_page` | Read retained results from the **last report of the same running MCP server**, in pages |

**Seven tools**, one locally authorized root. The MCP tool schemas do **not** let an AI agent select another directory or edit source. Tool reports are metadata-only; a connected **cloud AI host may still transmit those redacted findings according to its own privacy policy**.

Additional capabilities:
- Finding context (PR #26): `testFile` marks test/fixture-like paths without dismissing the alert; `gitTracked` reports **current local Git index membership**, not remote publication. A local-untracked file may still have appeared in past commits. Human reports also show the number of overlength lines skipped, if any. These are triage hints, not proof that a credential is valid or harmless. See [Detection](docs/DETECTION.md) and [Report contract](docs/REPORT_CONTRACT.md).
- Git history across local refs (default 100 commits, maximum requested 5,000), 100-commit batches, up to 16 MiB **per batch**; bounded scanning of tracked files under normally skipped paths.
- Resource limits: current-file budget 64 MiB aggregate, 4 MiB per file, maximum 5,000 retained findings. Limits, unreadable files, oversize inputs and omissions must be disclosed as **incomplete coverage** rather than a false-clean result.
- Exact-path, reasoned suppression of low/medium false positives; high/critical suppressions cannot create a clean outcome.
- JSON report schema version 2, SARIF 2.1.0, synthetic regression fixtures, and production dependency audit.
- Optional `scan --resume-history` reuses a **local private, redacted** checkpoint for CLI history scans; current files are rechecked each time. This option explicitly writes outside the repository under `~/.reposafe/checkpoints/`. Disabled by default and never enabled for MCP tools.
- Local `doctor` handshake, non-writing `init` preview, and explicit `connect` / `disconnect` for supported clients. Client configuration writes are opt-in and produce private backups when replacing an existing configuration.

## How the local architecture works

~~~text
Your terminal                  Optional AI client
     |                                |
     | scan                    local STDIO MCP
     |                                |
     +---------- RepoSafe ------------+
                      |
                approved root only
                      |
          working tree + local Git history
                      |
             metadata-only findings
                      |
         terminal / JSON / SARIF / MCP
~~~

**The engine is not a remotely hosted service.** Local-directory CLI scans require no AI or network; the optional public GitHub URL snapshot mode explicitly requires GitHub HTTPS access to retrieve temporary source files. It does not fix files, rotate credentials, execute code found inside the target repository, commit, push, fetch remote Git objects, or upload source. Installation and dependency audits require network access. Untrusted repository content is treated as data, never instructions.

## Example of a finding

~~~text
RepoSafe MCP — REVIEW REQUIRED
Coverage: complete within scanner limits | Files read: 4 | Findings kept: 3
Severity: critical=0  high=1  medium=2  low=0

FINDINGS & ACTIONS

SEVERITY  HIGH
1. [HIGH] git_history_github_token — fixture.txt (commit example)
   Reason: Possible credential remains in the Git history.
   Action: Treat the credential as exposed, rotate it, and review history before publishing.
~~~

This example is illustrative, **not** a promised identical output for every version or repository. Secrets are never displayed. A token remaining in Git history should be treated as exposed; history rewriting alone does not revoke it.

## MCP clients: status and limitations

Local setup, optional and **not required** for standalone scanning. If you installed in the documented private prefix, set `RS` and the approved `REPO` first:

~~~sh
RS="$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js"
REPO="/ABSOLUTE/PATH/TO/GIT-REPOSITORY"
node "$RS" init --root "$REPO" --client codex --json     # preview only; no settings changed
node "$RS" connect --root "$REPO" --client codex --dry-run
node "$RS" connect --root "$REPO" --client codex         # explicit user-level config write
node "$RS" disconnect --client codex --dry-run
node "$RS" disconnect --client codex                    # reversible removal
~~~

Choose `codex`, `cursor`, `vscode` or `claude`. Inspect the preview and preserve unrelated MCP entries. Restart/reload the actual AI client after configuring it. `doctor` verifies a real SDK STDIO handshake and seven-tool discovery; it **does not** prove the AI application exposes those tools.

**MCP client acceptance (24 Nov 2026):** local Mac `doctor` and MCP SDK tests passed, but a 22 Nov chat attempt did not expose RepoSafe tools. The observed chat **was not conclusively identified as a local Codex host**; no actual Codex or ChatGPT client tool invocation can be claimed. A new Codex-config SDK regression tests the generated STDIO command, not the real Codex application. See [real client acceptance](docs/CLIENT_ACCEPTANCE.md) and [using another device](docs/MCP_REMOTE_ACCESS.md). No remote endpoint or cloud scanner is included.

## Dependencies, development and evidence

| Component | Role | Version |
| --- | --- | --- |
| Node.js | Runtime | 22+ (tested locally with 24.19.0) |
| npm | Install/audit/scripts | Bundled with supported Node installations |
| Git | Local history/readiness checks | Git available in PATH |
| `@modelcontextprotocol/server` | Local STDIO MCP server | 2.4.0 |
| `@modelcontextprotocol/client` | Doctor/protocol SDK client | 2.4.0 |
| `zod` | MCP schema validation | 4.6.7 |
| TypeScript | Build-time (development only) | `^5.8.0` |
| `@types/node` | Build-time typings | `^22.0.0` |

No additional graphics/terminal packages are required: the CLI display uses built-in ANSI styling only on compatible interactive terminals. Install with `npm ci --ignore-scripts` for development; source clones require `npm run build` before running `dist/cli.js`.

~~~sh
git clone https://github.com/VladTepes84/RepoSafe-MCP.git
cd RepoSafe-MCP
npm ci --ignore-scripts
npm run check
npm run verify:runtime
npm run benchmark
npm run audit:deps
~~~

**Verified evidence (22 Nov 2026):** the merged update [PR #20](https://github.com/VladTepes84/RepoSafe-MCP/pull/20) consolidated PRs #11–#18, and passed four GitHub CI jobs. A user-run Mac M3 suite passed **146 automated tests**, offline synthetic demo, runtime sync, local small/medium/large benchmark, production audit reporting zero known vulnerabilities at the time, and manual CLI/history/checkpoint/JSON/SARIF scenarios. This evidence applies to the **PR #20 source commit**; subsequent CLI/README changes require their own CI validation. Synthetic tests do not establish real-world recall, a formal audit, or stable-release assurance.

## Uninstall, support and responsible use

Disconnect explicitly configured MCP clients, uninstall only the dedicated npm prefix, and optionally remove locally created checkpoint files **after inspecting paths and backups**. Do not remove Node.js, Git, entire home folders, or unrelated MCP settings. See [step-by-step uninstall/rollback](docs/UNINSTALL.md).

Security reports should not include live tokens, usernames, absolute private paths, unredacted reports or private source. See [security policy](docs/SECURITY.md) and [contribution guide](CONTRIBUTING.md). Optional sponsorship does not unlock features.

**RepoSafe is a review aid, not a guarantee against publication, supply-chain, or credential exposure risks.**
