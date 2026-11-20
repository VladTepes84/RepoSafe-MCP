# Changelog

All notable changes are recorded here. Dates refer to implementation, **not a public release**.

## [Unreleased] — 2026-11-20 (private development)

### Added
- Git-aware read-only checks: tracked sensitive files and actual `.env` ignore behavior.
- Bounded Git diff-history search for previously committed secrets, without token values in output.
- Standalone CLI with readable/JSON output, stable exit codes, optional Git/history restrictions.
- Native macOS/Windows client-config generator for Cursor, Claude Desktop, VS Code Copilot harness and Codex.
- Real synthetic Git-history demo, Git and CLI tests, path/schema tests, more token patterns and filename redaction.
- Cross-platform CI matrix, production dependency audit and integrity-checked npm lockfile; separate security, usage and compatibility docs.

### Security
- Fail-closed reporting on insufficient scan coverage; cap unusually long lines.
- Existing symlink/hard-link safeguards and explicit `REPOSAFE_ROOT` remain enforced.

### Known limits
- Git history bounded to 100 commits/4 MiB patch; no full credential certification or GUI client verification.

## [0.1.0] — 2026-11-20
- Initial local read-only MCP scanner with four tools, README, MIT and first CI tests.