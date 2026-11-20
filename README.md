# RepoSafe MCP

**Before you publish, discover what your source code and Git history could expose.**

RepoSafe is a privacy-first, read-only repository scanner available as a **local Model Context Protocol (MCP) server** and **standalone CLI**. It flags possible secrets, private infrastructure references, Git-tracked credential files, ineffective `.gitignore` rules, and secrets left in *recent Git commits*. It returns **metadata only**: never source snippets or matched secret values.

**Release status: v0.5.0 beta source (pre-release). Not a security certification.** A clean scan is *not* evidence that a repository is safe to publish.

[![Support RepoSafe MCP on GitHub Sponsors](https://img.shields.io/badge/Support%20RepoSafe%20MCP-GitHub%20Sponsors-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/VladTepes84)

**Support this open-source project:** RepoSafe MCP is free and MIT-licensed. If it helps you audit repositories, you can [sponsor the maintainer on GitHub](https://github.com/sponsors/VladTepes84) to support maintenance, security testing, and documentation. Contributions are **entirely optional** and do not unlock extra features, hosted services, or privileged access.

## Important: Cursor and Claude Desktop are NOT yet manually verified

> **Integration validation pending.** RepoSafe's installation, TypeScript build, scanner tests, actual MCP `stdio` handshake using the official MCP SDK, and synthetic Git-repository demo have passed automated CI on **Windows, macOS and Ubuntu**.
>
> **Cursor and Claude Desktop have NOT yet been manually tested end-to-end in their actual application interfaces.** The configuration examples below are documented and configuration generation is unit-tested, but **successful GUI integration, permissions, prompts and user experience remain UNVERIFIED**. Do not interpret protocol-level MCP testing as proof that these apps work out of the box. Other client GUI integrations are also not verified.
>
> This is **beta software**. Do not assume it detects all secrets, guarantees privacy in the AI host, or certifies a repository as safe to publish.

### Help validate real AI clients

1. Follow the exact [macOS](docs/INSTALL_MAC.md) or [Windows](docs/INSTALL_WINDOWS.md) installation guide with **Node.js 22+, npm and Git**.
2. Run `npm ci && npm run check && npm run demo` (in PowerShell, invoke the commands separately if needed). All must pass before connecting a client.
3. Generate the client configuration using `npm run config -- --client cursor --root ABSOLUTE_PROJECT_PATH` or replace `cursor` with `claude`; use a small **synthetic test repository**, never real credentials.
4. Add the generated entry to the client's MCP configuration, restart/reload the client as documented, and ask it to list RepoSafe tools and call `generate_report`.
5. Verify all six tools are visible, the report is returned, the dummy secret is never disclosed and out-of-scope paths are inaccessible. Report the operating system and client version plus **redacted** logs in a GitHub issue. Do not upload private code, credentials, or unredacted configuration.

See [client compatibility and explicit verification status](docs/CLIENTS.md) and [security limitations](docs/SECURITY.md).

## A 60-second real use case

You created a web app and want to publish its GitHub repository. You connect RepoSafe to Cursor / Claude Desktop / VS Code / Codex, then ask:

> Use RepoSafe `generate_report` on the pre-authorized project. Explain critical findings first, and never request or print token values.

RepoSafe checks the working tree, validates Git ignore rules, inspects tracked credential-file names and bounded local Git history. Imagine that you deleted a token from today's code, but it is still in a commit from yesterday. RepoSafe flags the **historic exposure**, even when the working tree is clean. You rotate the token, address the exposure, and scan again. The demo script reproduces this workflow with a **synthetic** token—no cloud keys or real projects needed.

```text
You / AI client (Cursor, Claude, Copilot, Codex)
         | local stdio / MCP
         v
RepoSafe MCP (local Node.js process; read-only tools)
         | scoped to REPOSAFE_ROOT
         v
Current files + local Git metadata / bounded history
         | no cloud upload, no shell, no repository modification
         v
JSON report: severity, relative file, rule, action, coverage
```

## Features

| Tool | Purpose |
| --- | --- |
| `scan_secrets` | Flag recognizable API token patterns, private keys and suspicious assignments in local files |
| `scan_private_refs` | Detect internal hostnames, local user paths and GitHub links requiring verification |
| `check_repo_readiness` | Check README, license, `.gitignore` and real Git ignore behavior |
| `check_git_exposure` | Identify tracked sensitive filenames and ineffective `.env` ignore rules |
| `scan_git_history` | Scan up to 100 local commits / 4 MiB of diffs for possible lingering credentials; show a safe 12-character introducing commit ID |
| `generate_report` | Consolidate all findings, scope, coverage and warnings |

Additional CLI: `node dist/cli.js scan --root ABSOLUTE_PATH [--json|--sarif] [--no-history] [--no-git]`. The default view is a severity-sorted actionable human report.

**No edits, auto-fixes, Git checkout, push, remote API calls or background processes.** The AI client cannot pass an arbitrary filesystem path to tools. All operations are restricted to the operator-defined absolute `REPOSAFE_ROOT` set when the server starts.

### v0.5 usability and GitHub integration

- Human-friendly CLI report sorted by severity, with a recommended action for each finding; use `--json` for structured data.
- Redacted **SARIF 2.1.0** via `scan --sarif`, including an explicit `incomplete_scan` result when coverage fails closed.
- npm packaging is **prepared, not published**: `bin` exposes `reposafe` and `reposafe-mcp`, restricted `files` whitelist and `prepack` build; `private: true` remains. CI checks `npm pack --dry-run`.
- A local **composite GitHub Action** (`action.yml`) scans pull-request checkouts with read-only content permissions and writes SARIF to the runner's temporary folder. Automatic upload is **not** enabled. See [GitHub Action guide](docs/ACTIONS.md).

**Remaining steps:** manual Cursor/Claude Desktop GUI validation and a separately approved npm registry publication. Source-only CI cannot prove either.

### v0.4 coverage and onboarding improvements

- Expanded database/broker URL credential detection for **MySQL, MariaDB, MongoDB/SRV, Redis/TLS and AMQP/TLS**, retaining the existing PostgreSQL rule.
- Added heuristic indicators for **GitLab, Hugging Face, DigitalOcean, Twilio API key IDs, Slack/Discord webhook URLs, Azure Storage account keys and GCP service-account key material**.
- Git-tracked files under excluded dependency/cache directories are now **read directly within strict file/byte/path budgets**, with a review warning. Unsafe links, binary files, and unreadable content fail closed.
- Strict `.reposafe.json` exact-path/exact-rule exceptions with mandatory explanation, optional expiration and suppression counts. High/critical exceptions never yield a clean verdict; malformed policies fail closed.
- `reposafe doctor` validates Node, Git, the authorized folder and actually connects to the local server via the official MCP client to discover all six tools.
- `reposafe init` performs the same handshake and **prints** an exact client configuration without writing or changing any host files.

**Neither `doctor` nor `init` proves Cursor/Claude Desktop GUI functionality.** Those app tests remain pending. See [the v0.4 user guide](docs/QUICKSTART.md) and [baseline security rules](docs/BASELINE.md).

### v0.3 detection improvements

- Heuristic coverage now includes **JWT, SendGrid, npm tokens (including `.npmrc` auth entries), PostgreSQL connection URI passwords**, and high-entropy bearer credentials, in addition to existing providers.
- **Provider-specific findings are deduplicated** against generic assignments (including Anthropic vs. OpenAI `sk-` patterns).
- `dist/`, `build/`, and `vendor/` **are scanned**, because generated or vendored content can be committed and published.
- If Git tracks content in omitted dependency/cache directories (e.g. `node_modules/`), RepoSafe reports **incomplete coverage**, not a clean bill of health.
- Local Git operations ignore host Git config injections, disable filesystem-monitor hooks and automatic lazy fetches, and associate history findings with the introducing commit.

**Coverage is intentionally incomplete:** not every secret syntax or binary format is recognized; entropy detection is conservative. See [detection matrix and false-negative policy](docs/DETECTION.md). A beta scan never certifies that a repository is safe.

## Install and verify

Requires **Node.js 22+, npm and Git** (Git is needed for history checks). The source is public; clone it directly from GitHub. An npm-compatible tarball and binaries are prepared and tested, but **no package has been published to the npm registry**.

```bash
git clone https://github.com/VladTepes84/RepoSafe-MCP.git
cd RepoSafe-MCP
npm ci
npm run check
npm run demo
```

The committed `package-lock.json` pins npm dependencies with integrity hashes; `npm ci` verifies them.

`npm run check` performs TypeScript typecheck, build, unit/security regression tests, an actual stdio MCP handshake with the official client SDK, and the synthetic Git-history scenario. `npm run demo` repeats the scenario independently and prints three expected stages. CI runs the same commands on **Ubuntu, Windows and macOS**. **CI is not a substitute for verifying the GUI client on your machine.**

### Run the self-check and generate a verified client configuration

After `npm ci && npm run build`, run:

```bash
node dist/cli.js doctor --root "/absolute/path/to/project"
node dist/cli.js init --root "/absolute/path/to/project" --client cursor
```

`doctor` actually starts RepoSafe over stdio and discovers six MCP tools. `init` also prints the target client configuration but **does not overwrite** any user files or claim the GUI application itself was tested. The authorized directory must be a specific existing absolute path.

### Generate a real MCP configuration for your computer

Instead of manually copying placeholders, let RepoSafe print the **actual absolute paths** for your Node executable, compiled server and approved target directory:

```bash
npm run config -- --client cursor --root "/absolute/path/to/your/project"
```

Supported `--client`: `cursor`, `claude`, `vscode`, `codex` (TOML). The configuration generator **prints only** and does **not** overwrite your client's configuration. Merge its `reposafe` entry with any existing servers. See the OS-specific guides:

- **[macOS: tested commands and client configuration](docs/INSTALL_MAC.md)**
- **[Windows PowerShell: exact installation and client configuration](docs/INSTALL_WINDOWS.md)**
- **[Current client support and authoritative documentation](docs/CLIENTS.md)**

### Scan without any AI

```bash
node dist/cli.js scan --root "/absolute/path/to/your/project"
node dist/cli.js scan --root "/absolute/path/to/your/project" --json
```

Exit status: **0** = no findings *in the examined scope*, **1** = review required or incomplete coverage, **2** = invalid arguments or scan error. This allows adding RepoSafe to other workflows while keeping the server itself read-only.

### Actionable CLI and SARIF

```sh
node dist/cli.js scan --root "/ABSOLUTE/PATH/TO/APP"
node dist/cli.js scan --root "/ABSOLUTE/PATH/TO/APP" --sarif > reposafe.sarif
```

**Careful:** writing `reposafe.sarif` inside the scanned repository is a user shell action, not a write performed by RepoSafe; for audits prefer a file outside the target repo. SARIF contains finding metadata, not credential values. It can be uploaded to GitHub Code Scanning only when that feature is enabled and the workflow is given the required rights. The repository's example action never uploads automatically.

For a read-only pull-request check, see [GitHub Actions setup](docs/ACTIONS.md).

## Real proof, not screenshots

```bash
npm run demo
```

The demo **actually** (1) initializes a temporary Git repository with no findings; (2) commits a synthetic token and detects it; (3) removes the token from current files but finds it in Git history. It asserts the expected exit statuses and checks that the token never appears in output, then cleans up the disposable repo. See [TESTING](docs/TESTING.md) for the executable tests and honest coverage limits.

## Security design and boundaries

- Local-only, no authentication secret, no listening port, no telemetry, no runtime network calls.
- Git is invoked **only for read-only local operations** (`rev-parse`, `ls-files`, `check-ignore`, `log`), with `execFile` (not a shell), timeout, bounded output, an isolated global/system Git configuration, disabled fsmonitor/textconv/external diffs and lazy fetches, no fetch, and no checkout.
- The filesystem scope is explicitly approved; root-of-drive scans are refused. Symlinks are skipped; hard-linked files are skipped as incomplete. File and output budgets limit resource use.
- Tools never return matching token values or source snippets; suspected secret-containing filenames are redacted. Errors do not expose absolute paths or file contents.
- Incomplete scans are **not** classified as clean. Repositories with inaccessible Git history or too much data require manual review.

**Limitations are important:** this is *not an OS sandbox*; a malicious local process can race filesystem changes; Git history coverage is bounded (100 recent commits across refs, 4 MiB of patch output), not every blob or dangling object. Detection is heuristic and can miss encoded/binary values and credential formats. Running Git reads repository metadata; use only projects you trust. The AI host may have *other* tools with broader permissions. Do not use RepoSafe as a substitute for manual review and established Git secret scanners.

Read the complete [security model, threat scenarios and safe operations](docs/SECURITY.md), [use cases](docs/USE_CASES.md), [changelog](CHANGELOG.md), and [contributing guidelines](CONTRIBUTING.md).

## Test scope and disclosure

The automated v0.4 corpus covers at least 30 synthetic positive credential cases and 20 benign examples, alongside baseline, tracked-file and CLI handshake tests. These are fixtures, **not a measured accuracy rate on real-world repositories**. Live tokens are never required.

`npm ci`, `npm run check`, `npm run audit:deps` and the GitHub Actions matrix must all pass for release readiness. GUI apps still require separate verification and must not be marked as validated on that basis.

## Licensing and costs

MIT License. No database, hosting or paid API is required; Node.js and Git are free. The AI client may have its own plan or usage costs. Running GitHub Actions on private repositories uses the account's applicable minutes quota; verify your plan before large CI usage.

## Project scope

RepoSafe is **independent of any other private software repository**. The project does not include third-party credentials or reference code from other user projects. Report issues using **synthetic test data only**.