# RepoSafe MCP — macOS installation and local testing

**Supported design:** Apple Silicon or Intel macOS, Node.js 22+, npm and Git. RepoSafe performs local, read-only repository audits; no AI key, daemon, remote API or special macOS permission is required to scan an approved project. You can use it **without** Codex or any GUI client.

## 1. Check prerequisites (Terminal / zsh)

~~~zsh
node --version
npm --version
git --version
~~~

Node.js 22+ is required. If missing, use a trusted Node.js distribution from [nodejs.org](https://nodejs.org/). Git can be supplied by Apple's developer command-line tools or another trusted source. RepoSafe does **not** require `curl | sh`, Rosetta, administrator privileges, disabling Gatekeeper, or installing a new Node version when an existing 22+ runtime works.

## 2. Recommended local installation

~~~zsh
npm install --prefix "$HOME/.reposafe" --ignore-scripts --no-audit --no-fund \
  "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"

RS="$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js"
node "$RS" --help
~~~

The source archive includes precompiled JavaScript. `--ignore-scripts` disables npm lifecycle scripts; package downloads still use GitHub/npm over HTTPS. The prefix is user-owned and separate from target repositories. **Pinning:** replace `main` at the end of the URL with a reviewed **40-character commit SHA** to avoid a mutable install. No signed release or npm-registry publication is implied.

## 3. Scope and scan

~~~zsh
REPO="/ABSOLUTE/PATH/TO/REPOSITORY"
node "$RS" doctor --root "$REPO"
node "$RS" scan --root "$REPO"
node "$RS" scan --root "$REPO" --summary
node "$RS" scan --root "$REPO" --compact --group-by file
~~~

Use only an **existing repository you own or are authorized to inspect**; never scan your whole home folder or system root. `doctor` checks the real STDIO MCP handshake and discovers **seven tools**, but **does not run a scan** or prove Codex Desktop can see them.

Expected human report sections: verdict, bounded coverage, severity counts, local Git history window, and optional severity- or file-grouped findings. Exit `0` = clean *within examined scope* (not certification), `1` = findings or incomplete coverage, `2` = error.

## 4. Development checkout, regression and performance

For contributors who want to inspect source and tests (separate from prefix installation):

~~~zsh
git clone https://github.com/VladTepes84/RepoSafe-MCP.git
cd RepoSafe-MCP
npm ci --ignore-scripts
npm run check
npm run verify:runtime
npm run benchmark
npm run audit:deps
~~~

`npm run check` includes typecheck, build, security tests, Git fixtures, MCP SDK handshake and offline demo. `benchmark` uses synthetic repositories, not your private projects. `npm audit` retrieves package advisories online. A successful test cannot prove that all secrets or all Git objects were examined.

## 5. Optional local MCP connection

**Not required for CLI auditing.** Inspect the setup before changing configuration:

~~~zsh
node "$RS" init --root "$REPO" --client codex --json
node "$RS" connect --root "$REPO" --client codex --dry-run
~~~

Only after reviewing the dry-run may you explicitly use:

~~~zsh
node "$RS" connect --root "$REPO" --client codex
~~~

Other config targets are `cursor`, `claude` and `vscode`. The managed client connection writes just the RepoSafe entry and may create a private backup of existing config. The native client **must** be restarted and must actually expose and invoke `generate_report` and `get_findings_page` before GUI acceptance can be claimed.

**Known observed limitation (22 Nov 2026):** Mac `doctor` passed but a Codex Desktop conversation **did not expose RepoSafe tools**. The cause is undiagnosed and integration is deferred; the CLI remains operational. Do not bypass macOS protections or assume the executable is malicious/benign based on protocol tests.

## 6. JSON/SARIF and resource boundaries

~~~zsh
node "$RS" scan --root "$REPO" --history-depth 500 --max-diff-size 8
node "$RS" scan --root "$REPO" --json > "/SAFE/OUTSIDE/REPO/report.json"
node "$RS" scan --root "$REPO" --sarif > "/SAFE/OUTSIDE/REPO/report.sarif"
~~~

Reports must be redirected **outside** the target repository. They contain redacted finding metadata and may remain sensitive. Depth is capped at 5,000; Git patch batch budget at 16 MiB; retained findings at 5,000. `--resume-history` is opt-in and writes redacted private metadata under `~/.reposafe/checkpoints/`.

## 7. Uninstall safely

~~~zsh
node "$RS" disconnect --client codex --dry-run
node "$RS" disconnect --client codex
npm uninstall --prefix "$HOME/.reposafe" reposafe-mcp --ignore-scripts --no-audit --no-fund
~~~

Disconnect **only clients you configured**. Source clone, test fixtures, checkpoint files and private config backups require separate inspection/cleanup; don't use a wildcard `rm -rf`. Follow [Uninstall and rollback](UNINSTALL.md) for details.

Further: [Quick start](QUICKSTART.md) · [CLI reference](CLI_REFERENCE.md) · [Security model](SECURITY.md) · [MCP client status](CLIENTS.md).
