# RepoSafe MCP

**Before you publish, discover what your source code and Git history could expose.**

RepoSafe is a privacy-first, read-only repository scanner available as a **local Model Context Protocol (MCP) server** and **standalone CLI**. It flags possible secrets, private infrastructure references, Git-tracked credential files, ineffective `.gitignore` rules, and secrets left in *recent Git commits*. It returns **metadata only**: never source snippets or matched secret values.

**Current status: v0.2.0 development / private beta. Not a security certification.** A clean scan is *not* evidence that a repository is safe to publish.

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
| `scan_git_history` | Scan up to 100 local commits / 4 MiB of diffs for possible lingering credentials |
| `generate_report` | Consolidate all findings, scope, coverage and warnings |

Additional CLI: `node dist/cli.js scan --root ABSOLUTE_PATH [--json] [--no-history] [--no-git]`.

**No edits, auto-fixes, Git checkout, push, remote API calls or background processes.** The AI client cannot pass an arbitrary filesystem path to tools. All operations are restricted to the operator-defined absolute `REPOSAFE_ROOT` set when the server starts.

## Install and verify

Requires **Node.js 22+, npm and Git** (Git is needed for history checks). RepoSafe is currently private: only authorized collaborators can clone it. Once published, the same commands apply.

```bash
git clone https://github.com/VladTepes84/RepoSafe-MCP.git
cd RepoSafe-MCP
npm ci
npm run check
npm run demo
```

The committed `package-lock.json` pins npm dependencies with integrity hashes; `npm ci` verifies them.

`npm run check` performs TypeScript typecheck, build, unit/security regression tests, an actual stdio MCP handshake with the official client SDK, and the synthetic Git-history scenario. `npm run demo` repeats the scenario independently and prints three expected stages. CI runs the same commands on **Ubuntu, Windows and macOS**. **CI is not a substitute for verifying the GUI client on your machine.**

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

## Real proof, not screenshots

```bash
npm run demo
```

The demo **actually** (1) initializes a temporary Git repository with no findings; (2) commits a synthetic token and detects it; (3) removes the token from current files but finds it in Git history. It asserts the expected exit statuses and checks that the token never appears in output, then cleans up the disposable repo. See [TESTING](docs/TESTING.md) for the executable tests and honest coverage limits.

## Security design and boundaries

- Local-only, no authentication secret, no listening port, no telemetry, no runtime network calls.
- Git is invoked **only for read-only local operations** (`rev-parse`, `ls-files`, `check-ignore`, `log`), with `execFile` (not a shell), timeout, bounded output, no textconv or external diffs, no fetch, and no checkout.
- The filesystem scope is explicitly approved; root-of-drive scans are refused. Symlinks are skipped; hard-linked files are skipped as incomplete. File and output budgets limit resource use.
- Tools never return matching token values or source snippets; suspected secret-containing filenames are redacted. Errors do not expose absolute paths or file contents.
- Incomplete scans are **not** classified as clean. Repositories with inaccessible Git history or too much data require manual review.

**Limitations are important:** this is *not an OS sandbox*; a malicious local process can race filesystem changes; Git history coverage is bounded (100 recent commits across refs, 4 MiB of patch output), not every blob or dangling object. Detection is heuristic and can miss encoded/binary values and credential formats. Running Git reads repository metadata; use only projects you trust. The AI host may have *other* tools with broader permissions. Do not use RepoSafe as a substitute for manual review and established Git secret scanners.

Read the complete [security model, threat scenarios and safe operations](docs/SECURITY.md), [use cases](docs/USE_CASES.md), [changelog](CHANGELOG.md), and [contributing guidelines](CONTRIBUTING.md).

## Licensing and costs

MIT License. No database, hosting or paid API is required; Node.js and Git are free. The AI client may have its own plan or usage costs. Running GitHub Actions on private repositories uses the account's applicable minutes quota; verify your plan before large CI usage.

## Project scope

RepoSafe is **independent of any other private software repository**. The project does not include third-party credentials or reference code from other user projects. Report issues using **synthetic test data only**.