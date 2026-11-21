# Detection matrix and reliability limits (v0.6)

**Rule-based detection is a safety aid, not a formal guarantee of absence.**
Only use synthetic fixtures in public issues. No token values or source snippets are returned in findings.

| Input type | Rule(s) | Scope | Known limits |
| --- | --- | --- | --- |
| GitHub tokens | `github_token` | Current text and Git diff additions | Provider formats may change |
| Anthropic and OpenAI keys | `anthropic_key`, `openai_key` | Current text and Git diff additions | Patterns do not validate live keys; duplicates are suppressed |
| AWS IDs, Stripe, Google, Slack, private key headings | Existing provider rules | Current text and Git diff additions | Not every credential type/key body |
| SendGrid keys | `sendgrid_api_key` | Current text and Git diff additions | Expected `SG.<part>.<part>` forms |
| npm tokens | `npm_access_token`, `npmrc_auth_token` | Prefixed tokens and `_authToken=` lines | Unusual registry auth configurations and base64 forms may be missed |
| JWT | `jwt_token` | Three long Base64URL segments starting with `eyJ` in header/payload | Tokens with different encodings/short signatures may be missed; a match does not prove the token remains valid |
| PostgreSQL connection password | `postgres_connection_password` | URI userinfo in `postgres://` or `postgresql://` | Other SQL protocols, interpolated secrets and unusual syntaxes may be missed |
| Unknown bearer credential | `high_entropy_bearer` | Long `Bearer` values with Shannon entropy >=3.5 | Low-entropy secrets, placeholders and unknown encodings are deliberately not flagged |
| Generic assignments | `generic_secret_assignment` | Credential-like key names and non-example values | Only the first generic assignment per line is checked |

**Directories:** `dist/`, `build/`, and `vendor/` are scanned as text. Standard dependency/cache directories like `node_modules/` are omitted for resource safety. If Git tracks excluded-directory files, the Git-aware report fails closed and requires separate review. Binary formats, huge files and lines can be skipped with a coverage warning.

**History:** added diff lines are examined within a bounded window (default: 100 recent commits and 4 MiB; operator caps: 500 commits and 16 MiB). Findings include a 12-character introducing commit prefix, not a matched value. Rewriting history alone does not revoke credentials.

**Validation:** run `npm ci`, `npm run check`, `npm run audit:deps` and inspect cross-platform CI results. Use independent security scanners (for example, Gitleaks and TruffleHog) and human review for higher assurance. Successful CI does not verify Cursor or Claude Desktop graphical integrations.

## v0.4 additions (heuristics)

- Database/broker URI userinfo passwords for MySQL/MariaDB, MongoDB/SRV, Redis/TLS and AMQP/TLS. PostgreSQL remains reported as `postgres_connection_password` for compatibility; other protocols use `database_uri_password`.
- GitLab `glpat-`, Hugging Face `hf_`, DigitalOcean token prefixes, Twilio API key SID (metadata identifier, **not** itself proof of credential exposure), Slack and Discord incoming webhook URLs, Azure Storage `AccountKey=` and GCP JSON private-key headers.
- The scanner does not verify whether a token is active. Some providers use other credential formats; unknown formats can be missed.

**False-positive control:** read `docs/BASELINE.md` before enabling any exceptions. An exception is exact-match and always visible in suppressed counters; high/critical matches cannot make the overall verdict clean.

**Tracked files:** Git-tracked files in normally skipped dependency/cache directories are now scanned directly under budgets. Even where readable, the existing `tracked_excluded_file` alert remains to highlight that such files are tracked. Missing, binary, linked or excessive files cause incomplete scan status.

## v0.6 bounded structured-configuration scanning

- `application.properties`, YAML, `.env*`, Terraform and selected other configuration files: detect dotted sensitive keys such as `spring.datasource.password`; simple unquoted assignments were supported previously.
- Terraform `.tf` `variable "db_password" { default = "..." }` patterns can span lines. This is a conservative **heuristic**, not a general HCL parser.
- Kubernetes YAML with `kind: Secret`, a nested `data:` map and a credential-like key: detect plausible Base64-encoded secret bytes. Ordinary ConfigMaps and obvious placeholders must not be promoted to high-severity encoded-secret findings.
- The decoder never returns the Base64 input or decoded content. It rejects malformed, overlong, non-printable and obvious placeholder cases. It does **not** handle all Kubernetes templating, nested overlays, `SecretProviderClass` or arbitrarily encoded values.

These checks work for current text files and targeted Git-tracked files, under existing path and byte limits. Git **patch history** remains line-oriented and does not reconstruct contextual `kind: Secret` or Terraform variable blocks from historical changes.

## History selection limits

- Defaults: 100 commits, 4 MiB patch output, all local refs.
- Operator controls: `historyDepth` (1–500), `since` (strict `YYYY-MM-DD`), `maxDiffSizeMiB` (1–16), `currentBranchOnly`.
- Too many commits, excessive diff output or unreadable Git metadata produce an incomplete review state. A `since` or branch-only selection explicitly records limited scope, even if no findings are found.
- Excludes unreferenced/dangling objects and remote-hosted history. Increasing a cap increases resource use; this remains **bounded scanning**, not credential certification.
