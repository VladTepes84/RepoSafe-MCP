# RepoSafe MCP — CLI reference

**Scope:** local, read-only repository auditing. Runtime: Node.js 22+ and Git for history checks. This page documents the **1.0.0 source release candidate** (not yet published) and the one-command public CLI. The CLI scanner never uploads repository content.

## Experimental public URL input (separate unmerged candidate)

~~~sh
reposafe scan https://github.com/OWNER/REPO
reposafe scan https://github.com/OWNER/REPO --high
reposafe scan https://github.com/OWNER/REPO --details --group-by file
~~~

For the **separate feature PR only**, GitHub public repository URLs are accepted as an argument. The URL is validated before network access: GitHub.com HTTPS only, two path components, no userinfo/port/query/fragment/encoded paths. RepoSafe requests repository metadata and a specific default-branch commit via `api.github.com`, then retrieves a pinned tar.gz snapshot from `codeload.github.com` without following redirects. A private temporary directory contains **regular extracted files only**; filenames are validated to prevent traversal or link extraction. Maximum reported GitHub repository size: 64 MiB; compressed archive 32 MiB; uncompressed stream 96 MiB; extracted content 64 MiB total, maximum 4 MiB per file and 10,000 files; transfer deadline 45 seconds. Breaches and unsupported entries are errors, **never clean reports**.

The current-file scanner remains unchanged. The report names the source URL and immutable commit, always marks coverage **INCOMPLETE**, and discloses that Git history, index status, Git LFS blobs and submodule contents are unavailable. `--json`, `--sarif`, `--root`, `--no-git`, `--no-history` and Git history options are intentionally **unsupported with URL input** in this candidate. Local `reposafe scan` and MCP commands retain their existing semantics. Downloaded source is deleted after normal completion or handled failure; abrupt process termination or cleanup failure can leave files in the OS temp directory. No absolute guarantee of safety is implied.

## Recommended public CLI (one command)

After installation, enter the Git repository root and run:

~~~sh
cd /ABSOLUTE/PATH/TO/REPO
reposafe scan
reposafe scan --high
reposafe scan --details
~~~

The public CLI scans the current directory **only if it contains its own .git marker**; it never searches parent directories. An explicit approved absolute --root is still supported. Its terminal dashboard groups **all retained findings by rule** with severity counts, Git/test context, coverage, warnings and next actions. The --high view prints HIGH/CRITICAL details, --details prints file locations and remediation, and --summary shows counts only.

The original dist/cli.js remains supported for existing scripts and protocol integrations and still requires --root. The public CLI preserves JSON v2, SARIF 2.1.0 and the same scanner exit codes.

**Next Actions:** after the dashboard, numbered suggestions show the priority findings (file:line, reason and action), a by-file view (first 50, with an explicit `--all-findings` option), and a coverage warning only when required. A grouped severity overview is not the same as individual findings: use `--high` or `--details` to inspect paths and line numbers. Suggested commands preserve `--no-history`/`--no-git` and supported Git history scope options. For explicitly supplied roots, commands display `--root ABSOLUTE_PATH` instead of a private absolute path; replace this placeholder with the same approved directory. **Each suggested command performs a new read-only scan**; there is no cached interactive report or automatic remediation.

**Interactive progress:** While attached to a terminal, the CLI shows elapsed time, the current phase (file scan, Git checks, finalizing) and aggregate file/directory counts. There is no interactive choice menu, and suggested commands do not reuse an in-memory completed scan. These are observed counters, **not a completion percentage**. An interrupted or timed-out scan has no completed report. Progress events never contain paths, source content or matched secret values; JSON/SARIF stdout remains unchanged.

Set `RS` to the **actual absolute** path to your installed `dist/cli.js`, and `REPO` to a **specific approved repository**, not the filesystem root.

~~~sh
RS="$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js"
REPO="/ABSOLUTE/PATH/TO/REPO"
node "$RS" --help
node "$RS" doctor --root "$REPO"
node "$RS" scan --root "$REPO"
~~~

Development checkout: run `npm ci --ignore-scripts && npm run build` first, then use `RS="$PWD/dist/cli.js"` (inside the checkout).

## Commands

| Command | Reads / writes | Purpose |
| --- | --- | --- |
| `--help` | None | Print syntax and supported flags |
| `doctor --root ABS_PATH [--json]` | Reads approved root; launches local STDIO server | Verify Node, Git, MCP handshake and **seven** tool names; **no scan** |
| `scan --root ABS_PATH [options]` | **Reads** repository/current Git history; optional private checkpoint write | Produce human report, JSON or SARIF; inspect limits and findings |
| `init --root ABS_PATH --client CLIENT [--dry-run] [--json]` | No config writes | Verify handshake and **print** client configuration |
| `connect --root ABS_PATH --client CLIENT [--dry-run] [--json]` | Writes user-level MCP configuration **unless dry-run** | Verify protocol and add just the RepoSafe entry; backup previous settings |
| `disconnect --client CLIENT [--dry-run] [--json]` | Writes user-level MCP configuration **unless dry-run** | Remove only RepoSafe entry; preserve unrelated servers |

`CLIENT`: `codex`, `cursor`, `vscode`, `claude`. These commands don't invoke the Codex binary or change macOS security controls. **Protocol success is not GUI acceptance.**

## Scan flags

| Flag | Effect |
| --- | --- |
| `--root ABS_PATH` | Explicit approved absolute directory; optional in public CLI when cwd itself is a Git root, required by the legacy engine |
| `--high` (public CLI) | Only HIGH/CRITICAL grouped rules and individual priority findings; full counts remain visible |
| `--details` (public CLI) | Detailed locations and remediation for up to 50 retained findings |
| `--summary` | Counts, coverage and warnings; hide individual findings |
| `--compact` | One line per finding, no reason/action expansion |
| `--group-by severity` | Default: severity-first, then relative file, line and rule |
| `--group-by file` | Relative file-first, then severity, line and rule |
| `--all-findings` | Show all **retained** findings instead of first 50 in human output |
| `--no-color` | Suppress ANSI colors; `NO_COLOR` environment also disables them |
| `--json` | Emit JSON report schema version 2 (no ANSI/progress on stdout) |
| `--sarif` | Emit SARIF 2.1.0 (no ANSI/progress on stdout) |
| `--no-history` | Skip Git history while retaining applicable current Git checks |
| `--no-git` | Skip Git integration; non-Git folder scanning possible |
| `--history-depth 1..5000` | Requested maximum number of local reachable commits (default 100) |
| `--since YYYY-MM-DD` | Limit Git history to this date or newer |
| `--current-branch` | Limit history to the current branch |
| `--max-diff-size 1..16` | Maximum history diff MiB **per 100-commit batch** (default 4) |
| `--resume-history` | Explicitly save/reuse local redacted checkpoint under `~/.reposafe/checkpoints/`; CLI-only |

The formatter uses **no extra npm packages**. It prints TTY-only colored severity labels; redaction and bounded finding retention happen in the underlying scanner, not in the pretty printer.

### Compatible combinations

~~~sh
node "$RS" scan --root "$REPO" --summary
node "$RS" scan --root "$REPO" --compact --group-by file
node "$RS" scan --root "$REPO" --all-findings --group-by severity
node "$RS" scan --root "$REPO" --history-depth 1000 --max-diff-size 8 --current-branch
node "$RS" scan --root "$REPO" --resume-history --json > "/SAFE/OUTPUT/report.json"
node "$RS" scan --root "$REPO" --sarif > "/SAFE/OUTPUT/report.sarif"
~~~

Invalid combinations: `--json` and `--sarif` together; `--summary` and `--compact` together; machine-readable output with `--summary` / `--compact` / `--group-by`; `--resume-history` or other history parameters with `--no-git` / `--no-history`. Invalid display grouping (anything other than `severity` or `file`) produces exit 2.

**Important:** a shell redirection such as `> report.json` creates a file in the selected *output directory*. Keep output **outside** the repository being scanned to avoid scanning generated reports and committing them accidentally.

## Reading the result

The first line is the **verdict**. Then come coverage, files scanned, finding retention, severity totals, history window and any checkpoint reuse. Human findings are grouped and sorted; each full finding supplies a rule, relative file, optional line/commit, reason and action.

Severity groups are rendered in priority order **critical > high > medium > low**; grouping by file orders files lexically, then items by severity/line. For performance and usability, the default shows at most 50 entries. `--all-findings` shows all retained (up to the scanner limit), **not** everything that exceeded retention. Where limits are reached, omission counts and incomplete status must be reviewed.

- **REVIEW REQUIRED / exit 1:** at least one actionable finding, high-risk suppression or incomplete coverage. Review high-severity issues before publication.
- **NO FINDINGS IN SCANNED SCOPE / exit 0:** no unsuppressed finding within the bounded inspected data. It is **not** proof of publication safety.
- **Usage or runtime error / exit 2:** invalid arguments, unavailable path/Git/Node or a failed local check.

**v0.7 finding context:** detailed human output may annotate a test-like path (`testFile`) or local Git index membership (`gitTracked`). Neither verifies a live secret or remote publication; these are independent triage hints, and severity is unchanged. The coverage header shows `Long lines skipped: N` when relevant; a nonzero value means incomplete analysis. JSON schema v2 includes the optional `testFile`, `gitTracked` and `stats.overlengthLinesSkipped` fields.

Check these limitations: skipped binary/oversize files, unreadable files, history depth, patch budget, local refs, retained finding cap, links/hardlinks and any scan warnings. There is no cloud search of deleted Git objects or unreachable remote histories.

## Sensitive information and automation

- No terminal output should contain matched token bytes or source snippets. Only **redacted metadata** is returned.
- Redacted relative file paths and rule names can still be sensitive; handle JSON/SARIF, screenshots and MCP reports accordingly.
- Never put real keys in test fixtures or publish a raw `.reposafe` checkpoint/config backup.
- Use `--json` / `--sarif` for machine parsing; don't scrape colored human output.
- CI and integrations must fail closed on incomplete coverage. A zero vulnerability count from `npm audit` applies only to known advisories and versions at check time.

## Repair and rollback

RepoSafe supplies recommendations but **does not modify code, rotate tokens, scrub history or fix ignore patterns**. Rotate exposed live credentials yourself, then review the relevant Git history and permissions. See [remediation](REMEDIATION.md).

Use [Uninstall and cleanup](UNINSTALL.md) for configuration backups, checkpoints, isolated source checkouts, npm prefixes and safe reversal. MCP client exposure must be validated in the actual client; see [client acceptance](CLIENT_ACCEPTANCE.md).
