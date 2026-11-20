# v0.3 detection matrix and reliability limits

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

**History:** only additions in the 100 most recent commits across local refs are examined, subject to the 4 MiB output limit. Findings include a 12-character introducing commit prefix, not a matched value. Rewriting history alone does not revoke credentials.

**Validation:** run `npm ci`, `npm run check`, `npm run audit:deps` and inspect cross-platform CI results. Use independent security scanners (for example, Gitleaks and TruffleHog) and human review for higher assurance. Successful CI does not verify Cursor or Claude Desktop graphical integrations.
