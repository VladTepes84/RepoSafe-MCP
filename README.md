# RepoSafe MCP

**Before you publish, check what your repository might expose.** RepoSafe is a small, free, read-only, local Model Context Protocol (MCP) server that flags possible secrets, internal references and missing publication basics. It does not upload or modify the repository being scanned.

> **Not a security certification.** This lightweight scanner detects only certain patterns in the current working tree. It does not inspect Git history, remotes, repository permissions or all possible credential formats. An empty report does not mean the repository is safe to publish.

## What it does

| MCP tool | Purpose |
| --- | --- |
| `scan_secrets` | Flags known token/key patterns and some suspicious credential assignments without returning secret values |
| `scan_private_refs` | Flags workstation paths, possible internal hostnames and GitHub URLs that should be reviewed (a URL alone **cannot** prove a repo is private) |
| `check_repo_readiness` | Checks for root `README.md`, `LICENSE`, and `.gitignore` |
| `generate_report` | Returns consolidated findings, scan coverage, warnings and limitations |

All tools are **read-only**, accept **no path parameters**, and use a single operator-approved directory (`REPOSAFE_ROOT`). Output is JSON in an MCP text response: category, rule, relative path, line number, severity, suggested action, scan coverage and limitations. **Matched credential values and file snippets are never included in the output.**

## Quick start

Requirements: **Node.js 22+** and npm.

```bash
npm install
npm run build
```

Define the root to scan as an **absolute directory** in your MCP client's environment and launch the compiled server:

```json
{
  "mcpServers": {
    "reposafe": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/RepoSafe-MCP/dist/server.js"],
      "env": {
        "REPOSAFE_ROOT": "/ABSOLUTE/PATH/TO/YOUR/APP"
      }
    }
  }
}
```

The above is a generic **stdio** MCP configuration example. Client-specific config file locations and accepted schemas vary; see your client documentation. An example is also provided in [`examples/mcp-client-config.json`](examples/mcp-client-config.json).

Ask your MCP-capable AI client: **“Run RepoSafe's `generate_report` tool on the approved repository and summarize the highest priority findings, without copying any secrets.”**

For a local development run (the server stays open waiting for a client):

```bash
REPOSAFE_ROOT="/absolute/path/to/your/repo" node dist/server.js
```

No database, cloud-hosted service, AI API key or paid API is required. The server has no network calls in its own scanning logic. Dependency installation requires access to the npm registry.

## Security model

- **Explicit scope:** startup fails unless `REPOSAFE_ROOT` names an existing absolute directory. Tool callers cannot choose another path or escalate to another repository.
- **Read-only:** no write, checkout, git, shell, token validation, subprocess execution, network access or modification of the target repo.
- **No intentional traversal through links:** symlinks are skipped, files with multiple hard links are skipped with an incomplete-coverage warning; paths are canonicalized and files are opened with `O_NOFOLLOW` where supported.
- **Controlled resource use:** maximum 1,000 scanned files, 2,000 visited directories, 512 KiB per file, 10 MiB total file content, depth 10, and 100 findings; ignored directories and common binary types are skipped. When a budget or read fails, results say the scan was **incomplete**.
- **Privacy-first output:** never return matching values or surrounding source lines. Note that the AI client still receives names of affected relative files, line numbers and rule descriptions.
- **No execution of repo content:** files are treated as untrusted data and inspected as text only; embedded instructions are not followed.

**Threat model limitations:** This is a pre-publication helper, not a sandbox or audit boundary. It does not protect against a malicious concurrent local process racing filesystem changes, non-obvious binary/encoded secrets, Git history leaks, or a malicious/infected AI host. Run with the least privileges possible, only against directories you trust and authorize. A caller that can alter the server process environment, executable or filesystem permissions already has capabilities outside this tool's security boundary.

The generic assignment detector may produce false positives and miss other patterns. It should not be treated as equivalent to Gitleaks, TruffleHog, GitHub secret scanning or manual review. If credentials were ever committed, **rotate** them and inspect history before publishing.

## Development

```bash
npm run typecheck
npm test
npm run build
npm run test:integration
```

Unit tests use Node's built-in test runner and experimental TypeScript stripping on Node 22. The additional integration test launches the compiled MCP server via the official MCP client SDK. Build before running `npm run test:integration`. CI runs both test suites. For protocol-level manual testing after installation, use the [official MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
REPOSAFE_ROOT="/absolute/path/to/your/test/repo" npx @modelcontextprotocol/inspector node dist/server.js
```

Use a synthetic test repo rather than your sensitive data when testing with an unfamiliar client.

## Design boundaries

- Current working directory files only; **no Git history** inspection in v0.1.
- No external paid services, no remote MCP hosting, no web UI.
- No dependencies on other user projects or private code.
- Improvements welcome via issues and small PRs. Please use dummy credentials in bug reports and tests.

## License

MIT. See [LICENSE](LICENSE).
