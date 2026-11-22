
# Uninstall RepoSafe MCP — macOS, Linux, Windows

**First disconnect** RepoSafe from each AI client where it was configured. These commands remove only the RepoSafe entry, preserving other local MCP servers and user preferences. All examples use the dedicated installation prefix .reposafe. Replace it with .reposafe-v2 or your actual prefix where appropriate.

## macOS and Linux (Terminal)

    RS="$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js"
    node "$RS" disconnect --client codex --dry-run
    node "$RS" disconnect --client codex
    node "$RS" disconnect --client cursor
    node "$RS" disconnect --client vscode
    node "$RS" disconnect --client claude
    npm uninstall --prefix "$HOME/.reposafe" reposafe-mcp --ignore-scripts --no-audit --no-fund

## Windows (PowerShell)

    $RS = "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js"
    node $RS disconnect --client codex --dry-run
    node $RS disconnect --client codex
    node $RS disconnect --client cursor
    node $RS disconnect --client vscode
    node $RS disconnect --client claude
    npm.cmd uninstall --prefix "$HOME\.reposafe" reposafe-mcp --ignore-scripts --no-audit --no-fund

## Optional cleanup and verification

If this was a **dedicated** prefix containing only RepoSafe and its dependencies, you may inspect it and remove the now-unneeded directory manually. Never delete an entire home, Downloads, workspace or shared npm prefix. Leave pre-existing Node.js, Git and IDE applications installed.

After disconnecting, restart the AI client. Check that reposafe is absent and other MCP tools remain available. Disconnect is idempotent and does not invoke Codex CLI, change macOS security controls, execute a repository scan or modify the audited repository.

If an existing config file is malformed or has ambiguous duplicate RepoSafe sections, the operation fails safely rather than overwriting unrelated settings. No credential content should be pasted into bug reports.
