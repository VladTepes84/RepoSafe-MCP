# RepoSafe v0.4 — verify, scan and connect

**Requirements:** Node.js 22+, npm, Git and permission to read only the target repository. No paid API key, cloud account or hosted service is required.

## 1. Recommended: precompiled installation without npm lifecycle scripts

For normal users, follow [FIRST_RUN](FIRST_RUN.md). The GitHub HTTPS archive includes compiled JS and installs with `npm --ignore-scripts` without cloning or running TypeScript:

```sh
npm install --prefix "$HOME/.reposafe" --ignore-scripts --no-audit --no-fund "https://codeload.github.com/VladTepes84/RepoSafe-MCP/tar.gz/main"
```

This convenience URL points to mutable `main`; replace the final segment with a reviewed 40-character commit SHA for reproducibility. Use `node "$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js" doctor --root ABS_PATH` and then `scan --root ABS_PATH`. See [FIRST_RUN](FIRST_RUN.md) for Windows and MCP client setup.

## Source development: clone, compile and test

```sh
git clone https://github.com/VladTepes84/RepoSafe-MCP.git
cd RepoSafe-MCP
npm ci
npm run build
npm run check
```

On Windows PowerShell execute the same commands in a PowerShell session with `git`, `node` and `npm` on PATH. No bash-specific syntax is required.

## 2. Verify the actual MCP handshake

macOS example:
```sh
node dist/cli.js doctor --root "$HOME/Projects/example-app"
```
Windows PowerShell example:
```powershell
node dist/cli.js doctor --root "$HOME\Projects\example-app"
```
Replace the path with an existing non-system folder. Expected result includes `RepoSafe doctor PASS` and **six MCP tools**. This is a real stdio protocol connection, not a graphical Cursor/Claude acceptance test.

## 3. Generate an exact configuration without overwriting any files

```sh
node dist/cli.js init --root "/ABSOLUTE/PATH/TO/APP" --client cursor
node dist/cli.js init --root "/ABSOLUTE/PATH/TO/APP" --client claude
```

On Windows use the corresponding absolute drive path (e.g. `C:\Users\tester\Projects\example-app`). The program prints the appropriate configuration and the destination client config path. **The command is read-only and does not change user files.**

## 4. Real GUI smoke test (manual, not yet verified)

- Merge the printed `reposafe` server entry into Cursor/Claude Desktop's MCP configuration, preserving existing servers.
- Restart the app, approve the locally scoped tool and ask: "List RepoSafe's tools. Call generate_report on the previously authorized project. Never quote source or credential values."
- Confirm tool discovery, a redacted structured report and no requests for directories outside `REPOSAFE_ROOT`.
- Note exact OS, client version, approval behavior and *sanitized* errors. Never share passwords, private code or file content in an issue.
- **Until these GUI steps have actually been run and evidenced, client usability remains NOT VERIFIED.**

## 5. Scan without an AI client

```sh
node dist/cli.js scan --root "/ABSOLUTE/PATH/TO/APP" --json
```

Exit 0 means no unsuppressed findings **in the bounded scope**, not safe-to-publish certification. Exit 1 requires review, including incomplete scans. Exit 2 means invalid invocation or runtime failure.

## 6. Baseline for narrowly scoped false positives

See [BASELINE](BASELINE.md). Entries must reference one exact relative file and rule, with a reason. High/critical suppression cannot turn a report clean.

## v0.5: shorter actionable output and optional SARIF

```sh
node dist/cli.js scan --root "/ABSOLUTE/PATH/TO/APP"
node dist/cli.js scan --root "/ABSOLUTE/PATH/TO/APP" --sarif
```

Default output shows severity counts and recommended actions. JSON and SARIF are mutually exclusive. SARIF can be redirected to a file **outside** the scanned repository. The npm tarball now declares `reposafe` and `reposafe-mcp` executable names, but npm publication is not yet performed; clone/build remains the verified install route.

See [GitHub Actions](ACTIONS.md) for automatic PR scanning without enabling uploads or write permissions.

## v0.6: choose a bounded Git history window

```sh
node dist/cli.js scan --root "/ABSOLUTE/PATH/TO/APP" --history-depth 250 --max-diff-size 8 --current-branch
node dist/cli.js scan --root "/ABSOLUTE/PATH/TO/APP" --since 2026-01-01 --json
```

The diff size parameter is in **MiB** and is capped at 16; maximum commit count is 500. A date or branch selection does not imply coverage outside the selected window. Avoid unnecessary high caps on large repositories.

`init` is already read-only; optional `--dry-run` makes that guarantee explicit:
```sh
node dist/cli.js init --root "/ABSOLUTE/PATH/TO/APP" --client cursor --dry-run
```

No client settings are written. See [remediation guidance](REMEDIATION.md) for practical follow-up actions that RepoSafe does **not** perform for you.

## v0.7 GitHub-source installation (no clone/build steps)

See [FIRST_RUN.md](FIRST_RUN.md) for a concise macOS/Windows installation, verified MCP `init` and first GUI tool call.

Machine-readable config generation:

```sh
node dist/cli.js init --root "/ABSOLUTE/PATH/TO/APP" --client cursor --json
```

Its JSON object includes `targetFile`, `format`, `content`, `discoveredTools`, `verifiedProtocol`, `verifiedGUI` and `writesFiles`. The server is actually contacted, but the GUI application is **not**. Scripts must not interpret `verifiedProtocol` as permission to edit or overwrite the user's existing client config.
