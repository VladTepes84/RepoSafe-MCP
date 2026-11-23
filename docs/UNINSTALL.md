# RepoSafe MCP — safe uninstall, disconnect and rollback

This guide covers **macOS, Linux and Windows**. RepoSafe is not a daemon or system-wide service; the default recommended installation uses a dedicated user-owned npm prefix. **Do not remove Node.js, Git, unrelated MCP servers, whole home folders or shared npm directories.**

RepoSafe uses three **different** storage locations, depending on the action:

| Component | When it exists | Reversal |
| --- | --- | --- |
| `$HOME/.reposafe/node_modules/reposafe-mcp` | Recommended precompiled archive install | `npm uninstall --prefix ... reposafe-mcp` |
| Your source clone, e.g. `reposafe-pro20-src.*` | If you explicitly cloned the repository | Remove only that reviewed, dedicated checkout |
| Client MCP config, e.g. `~/.codex/config.toml` | Only after explicit `connect` or manual config edits | `disconnect --client ...` or careful manual removal of the `reposafe` entry |
| `~/.reposafe/checkpoints/` | Only after CLI `scan --resume-history` | Inspect and remove *only* selected RepoSafe checkpoint files |
| `*.reposafe-backup-UUID` next to client config | When a managed config operation updates an existing file | Keep until rollback is no longer needed; inspect before deletion |
| Disposable synthetic test folders/results | Only if created by the user/test procedure | Inspect and remove only exactly identified directories |


**Public GitHub URL mode:** RepoSafe normally deletes temporary extracted snapshots after each scan. Forced termination or cleanup failure can leave a private folder in the OS temporary directory with a `reposafe-remote-` prefix. Inspect the **exact** path and ownership before removing any leftover. Never run wildcard recursive deletion commands.

## 1. Disconnect only clients you actually connected

**Important:** `init` and `connect --dry-run` do **not** change a configuration. If you never used `connect` or manually installed an MCP entry, there's nothing to disconnect.

macOS/Linux installed runtime:

~~~sh
RS="$HOME/.reposafe/node_modules/reposafe-mcp/dist/cli.js"
node "$RS" disconnect --client codex --dry-run
node "$RS" disconnect --client codex
~~~

Replace `codex` with `cursor`, `vscode` or `claude` **only if configured**. The CLI is designed to remove the RepoSafe entry while preserving other settings. The `--dry-run` preview should be inspected first. Managed edits create private backups if an existing config is changed.

Windows PowerShell:

~~~powershell
$RS = "$HOME\.reposafe\node_modules\reposafe-mcp\dist\cli.js"
node $RS disconnect --client codex --dry-run
node $RS disconnect --client codex
~~~

If you are running from an **isolated source checkout** rather than the npm-installed prefix, set `RS` to that checkout's actual `dist/cli.js` path. Do not assume a copy under `.reposafe` exists.

**Verify:** restart/reload the client and check its MCP server list. The `reposafe` entry should be absent and **other MCP servers must remain**. The operation does not invoke the Codex binary, remove user accounts, disable Gatekeeper or delete a repository.

## 2. Uninstall the dedicated npm runtime

macOS/Linux:

~~~sh
npm uninstall --prefix "$HOME/.reposafe" reposafe-mcp \
  --ignore-scripts --no-audit --no-fund
~~~

Windows:

~~~powershell
npm.cmd uninstall --prefix "$HOME\.reposafe" reposafe-mcp --ignore-scripts --no-audit --no-fund
~~~

These commands operate only on the **specified prefix**. They may leave empty folders, cached npm packages, checkpoints and user settings; that's intentional. Do **not** remove a shared prefix. If you installed a different version in `.reposafe-v2` or another dedicated prefix, use that real path instead.

Check that the entrypoint is no longer installed in that prefix; do not mistake a remaining **source clone** for a failed uninstall.

## 3. Review private checkpoints and backups

CLI `--resume-history` (off by default) stores **redacted, potentially sensitive metadata**, not matched token values, under `~/.reposafe/checkpoints/`. Seven days is a **reuse eligibility limit**, **not automatic disk deletion**. List and inspect the directory before selecting files for deletion. Never blindly remove the whole `~/.reposafe` prefix if it also contains a runtime or other files.

macOS/Linux inspection, **read-only**:

~~~sh
ls -ld "$HOME/.reposafe" "$HOME/.reposafe/checkpoints" 2>/dev/null
find "$HOME/.reposafe/checkpoints" -maxdepth 1 -type f -print 2>/dev/null
~~~

Client configuration backups are named `*.reposafe-backup-UUID` beside the original config. They may contain credentials belonging to **other** MCP servers, so don't paste their contents, upload them or publish screenshots of them. Keep backups until you have tested client rollback; remove only explicitly reviewed backup filenames.

A crashed configuration change can leave a `*.reposafe.lock`. Confirm no configuration operation is still active before treating a lock as stale.

## 4. Remove an isolated source checkout (if you used Git clone)

Example from a previous manual trial:

~~~sh
SRC="/ABSOLUTE/PATH/TO/reposafe-pro20-src.YOUR_SUFFIX"
ls -ld "$SRC"
git -C "$SRC" status --short
git -C "$SRC" rev-parse --show-toplevel
~~~

Check that the printed canonical root is **exactly the disposable RepoSafe checkout**, and that it contains no personal changes you intend to keep. Then remove that **one directory** using Finder/File Explorer, or another explicitly reviewed removal method. **Do not** automatically delete a wildcard matching `reposafe-*`, the repository you're auditing, or a parent workspace.

For disposable fixtures/results, inspect the literal directories created by `mktemp` (e.g. `reposafe-pro20-fixture.*` and `reposafe-pro20-results.*`) and remove only those exact directories. In the absence of saved path variables, list names first; never assume the correct suffix.

## 5. Verify completion

- The relevant AI client has been restarted; RepoSafe is no longer listed.
- Other MCP servers still work.
- The dedicated npm prefix no longer contains the RepoSafe runtime.
- Any **intentionally** removed source clone, test fixture and report folder was checked before deletion.
- Any private checkpoint/backup data you no longer need is reviewed and securely handled.

**If a managed disconnect fails** because a config is malformed or ambiguous, it should not overwrite unrelated entries. Inspect the original settings and contact the maintainer with a **sanitized** description; do not paste config files containing secrets. There is no need to disable macOS security protections or reinstall Codex.

See [First run](FIRST_RUN.md), [CLI reference](CLI_REFERENCE.md), and [Security boundaries](SECURITY.md).
