# RepoSafe MCP

**Find what a Git repository could expose *before* you publish it.** RepoSafe is a **local-first, read-only** security auditor for repository files and reachable Git history. Run it as a standalone command-line tool or as a local **Model Context Protocol (MCP) STDIO server**. The scanner reports finding metadata and remediation guidance, **never matching credential values or source snippets**.

**Status:** v0.7.0 beta source · MIT license · Node.js **22+** · macOS, Linux, Windows. **No npm-registry publication, paid plan, AI key, hosted scanner, telemetry or mandatory GUI.** The source archive contains precompiled JavaScript. RepoSafe **does not certify** that a repository is safe to publish.

[![GitHub Sponsors](https://img.shields.io/badge/Support-optional%20GitHub%20Sponsors-EA4AAA?logo=githubsponsors)](https://github.com/sponsors/VladTepes84)

## Start here

| I want to… | Read |
| --- | --- |
| Install without compiling (macOS/Linux/Windows) | [First run](docs/FIRST_RUN.md) |
| Understand every CLI command and display mode | [CLI reference](docs/CLI_REFERENCE.md) |
| Audit a repository with a realistic example | [Quick start](docs/QUICKSTART.md) |
| Configure or diagnose a local MCP client | [Local MCP setup](docs/LOCAL_MCP.md) · [Client status](docs/CLIENTS.md) |
| Interpret findings, suppress known benign examples | [Detection rules](docs/DETECTION.md) · [Baseline policy](docs/BASELINE.md) · [Remediation](docs/REMEDIATION.md) |
| Understand limits and privacy | [Security model](docs/SECURITY.md) · [Report contract](docs/REPORT_CONTRACT.md) |
| Run tests or assess readiness for release | [Testing](docs/TESTING.md) · [Offline detection benchmark](docs/QUALITY_BENCHMARK.md) · [Readiness](docs/PRO_READINESS.md) |
| Completely disconnect/uninstall without harming other software | [Uninstall / rollback](docs/UNINSTALL.md) |

### Install once, scan with one command

**Prerequisites:** Node.js 22+, npm and Git. No AI subscription, cloud scanner, API key or GUI is needed.

On macOS/Linux, install the precompiled source archive with npm (no package lifecycle scripts):

~~~sh
npm install -g --ignore-scripts --no-audit --no-fund \
  "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
~~~

Then open the **root of a Git repository** you own or are authorized to audit:

~~~sh
cd /PATH/TO/YOUR/GIT-REPOSITORY
reposafe scan
~~~

This runs the same bounded, read-only scanner, now with a terminal dashboard: severity overview, **all findings grouped by rule**, tracked/untracked/test-like context, Git coverage, warnings and next actions. No separate script, MCP configuration or manual JSON interpretation.

~~~sh
reposafe scan --high            # HIGH/CRITICAL findings with paths and actions
reposafe scan --details         # detailed findings and remediation (first 50)
reposafe scan --all-findings    # all retained findings, including files and lines
reposafe scan --summary         # counts/coverage only
reposafe scan --no-history      # skip Git history for a faster current-state review
reposafe scan --json            # pure JSON v2 for automated workflows
reposafe scan --sarif           # pure SARIF 2.1.0 for compatible consumers
~~~

**Security and installation limits:** The main archive ref is mutable. Before production use, replace main in the archive URL with the **reviewed 40-character commit SHA** or a vetted immutable release. A GitHub commit pin is not a signed distribution. GitHub/npm downloads require network; repository scans do not upload source. Global npm installation requires a *writable user-controlled npm prefix*. **Do not use sudo to work around permissions.** For a private per-user installation without global npm changes, see [First run](docs/FIRST_RUN.md).

Windows PowerShell installation (when npm's global prefix is user-writable):

~~~powershell
npm.cmd install -g --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
Set-Location "C:\PATH\TO\YOUR\GIT-REPOSITORY"
reposafe scan
~~~

The scan command without --root is allowed **only when your current directory itself contains a Git root marker** (a .git directory or worktree file). It never silently ascends to your home directory or another parent. From elsewhere, use an explicit approved --root ABSOLUTE_PATH, or cd to the Git root. No repository files are changed. If --resume-history is explicitly enabled, private scan metadata is saved outside the repository; otherwise scanning is read-only.

The classic engine remains available via dist/cli.js for backward compatibility and the existing MCP protocol. GUI/IDE integrations (Codex, Cursor, VS Code, etc.) are **future** work, not required for standalone CLI use.

**Exit codes:** 0 = no findings within the scanned scope; 1 = review required or incomplete coverage; 2 = usage/runtime error. **Neither a clean report nor a successful CLI test certifies the repository as safe to publish.** A history depth limit, unreadable file, omitted findings or long-line warning must be reviewed.

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

**The engine is not a remotely hosted service.** Running the CLI scanner requires no AI or network. It does not fix files, rotate credentials, execute code found inside the target repository, commit, push, fetch remote Git objects, or upload source. Installation and dependency audits require network access. Untrusted repository content is treated as data, never instructions.

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

Local setup, optional and **not required** for standalone scanning:

~~~sh
node "$RS" init --root "$REPO" --client codex --json     # preview only; no settings changed
node "$RS" connect --root "$REPO" --client codex --dry-run
node "$RS" connect --root "$REPO" --client codex         # explicit user-level config write
node "$RS" disconnect --client codex --dry-run
node "$RS" disconnect --client codex                    # reversible removal
~~~

Choose `codex`, `cursor`, `vscode` or `claude`. Inspect the preview and preserve unrelated MCP entries. Restart/reload the actual AI client after configuring it. `doctor` verifies a real SDK STDIO handshake and seven-tool discovery; it **does not** prove the AI application exposes those tools.

**Observed 22 Nov 2026:** protocol-level tests and the local Mac `doctor` succeeded, but RepoSafe's seven tools were **not exposed in a Codex Desktop conversation session**. Actual Codex GUI acceptance therefore **has not passed**; the specific cause remains undiagnosed. Other client GUIs have not been accepted end-to-end. No Codex workaround, macOS Gatekeeper bypass, or cloud MCP deployment is implied. The CLI remains independently usable. See [manual client acceptance](docs/CLIENT_ACCEPTANCE.md).

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
