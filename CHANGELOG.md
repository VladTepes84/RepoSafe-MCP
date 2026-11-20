# Changelog

Changes describe the committed source and automated test evidence, **not a security certification**.

## [0.4.0] — 2026-11-20 (beta feature branch; CI/review required)

- Broader database/broker URI checks and provider secret indicators.
- Bounded symlink-safe inspection of exact Git-tracked paths under normally skipped dependency/cache directories.
- `.reposafe.json` exact-path/rule baseline with strict parser, expiration, visible counts and high-risk fail-closed behavior.
- `doctor` does an actual MCP stdio handshake; `init` prints configurations after that handshake without writing to the user machine.
- Synthetic positive/benign benchmark fixtures, baseline and tracked-file regressions and CLI user-flow tests.
- No npm publication, GUI verification, or silent host configuration edits.

## [0.3.0] — 2026-11-20 (public beta)

### Detection engineering
- Add JWT, SendGrid, npm access tokens, unprefixed `.npmrc` auth values, PostgreSQL connection URI passwords and conservative entropy-based Bearer detection.
- Suppress overlapping provider/generic findings (especially Anthropic vs. generic OpenAI `sk-`).
- Inspect text in `dist/`, `build/`, and `vendor/`; report tracked files still excluded by dependency/cache skipping as incomplete coverage.
- Emit short commit IDs on history findings; only attribute exposures to **added lines** in a commit diff.

### Git safety and assurance
- Ignore inherited Git configuration-injection environment variables; disable fsmonitor and lazy fetch, suppress external Git diff behavior.
- Add synthetic provider, false-positive, filename-redaction, history-provenance and hostile Git-config regression tests.
- Continue official MCP stdio integration and Windows/macOS/Linux GitHub Actions checks.

### Limitations
- No cloud credential verification, no complete Git object scan, no GUI client acceptance test, and no assurance against all hostile repository configurations.

## [0.2.0] — 2026-11-20 (public beta)
- Read-only tracked-file and `.gitignore` checks; bounded Git history scan.
- Standalone CLI, client config generator, synthetic demo, OS-specific guides and 3-OS CI.
- Fail-closed resource limits and audit of locked production dependencies.

## [0.1.0] — 2026-11-20
- Initial local read-only MCP scanner with four tools, README, MIT and CI tests.
