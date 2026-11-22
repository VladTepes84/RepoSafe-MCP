
# Uninstall RepoSafe MCP — macOS, Linux, Windows

**The `disconnect` subcommand below belongs to draft PR #10; it is not available in the current `main` baseline.** For baseline installations, inspect and manually remove only the RepoSafe MCP entry from each client configuration, preserving other servers.

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

## Private checkpoint and configuration-backup cleanup

The optional CLI `--resume-history` creates private redacted checkpoints under `~/.reposafe/checkpoints/`. The seven-day limit controls **reuse**, not file retention: expired snapshots remain on disk until explicitly removed. Review that exact directory before removing **only its RepoSafe checkpoint files**. Do not remove `~/.reposafe` if it also contains the installed runtime or unrelated files. No checkpoint is written during normal CLI/MCP scanning.

Explicit `connect`/`disconnect` operations create uniquely named, user-private `*.reposafe-backup-UUID` snapshots **beside the original client configuration** when modifying an existing file. These backups can include tokens from unrelated MCP servers; do not upload or paste them. Keep them for rollback until the client works, then review and remove only the exact intended snapshots. A crashed setup may leave a `*.reposafe.lock` file; inspect whether another setup is active before manually clearing a stale lock. Never blindly delete arbitrary lock files.

## Optional cleanup and verification

If this was a **dedicated** prefix containing only RepoSafe and its dependencies, you may inspect it and remove the now-unneeded directory manually. Never delete an entire home, Downloads, workspace or shared npm prefix. Leave pre-existing Node.js, Git and IDE applications installed.

After disconnecting, restart the AI client. Check that reposafe is absent and other MCP tools remain available. Disconnect is idempotent and does not invoke Codex CLI, change macOS security controls, execute a repository scan or modify the audited repository.

If an existing config file is malformed or has ambiguous duplicate RepoSafe sections, the operation fails safely rather than overwriting unrelated settings. No credential content should be pasted into bug reports.
