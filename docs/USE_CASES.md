# Practical scenarios

## 1. The deleted token that still exists in history

1. Developer accidentally commits a synthetic GitHub-style token in `app.js`.
2. Developer deletes it in a later commit.
3. `generate_report` flags `git_history_github_token` even though the current file is clean.
4. Developer **revokes/rotates** the real credential if it was ever valid and reviews the history before publishing. Removing it from the latest commit is insufficient.
5. This workflow is **executable**: `npm run demo` creates commits and tests these assertions in a disposable local Git repository.

## 2. `.gitignore` exists but is ineffective

A project has `.gitignore` containing only `node_modules/`, and `.env` is staged. RepoSafe flags `env_not_gitignored` and `tracked_sensitive_file`. The developer adds the correct ignore rules and untracks the file. The scan does **not** automatically alter either `.gitignore` or the index.

## 3. Credentials in source, without copying them to AI

A local file contains a synthetic `AKIA...` pattern or a `GITHUB_TOKEN` assignment. RepoSafe outputs a finding such as `{ "category": "secrets", "rule": "github_token", "file": "app.js", "line": 4 }` **without the token** or surrounding text. The AI can explain the next safe action without quoting source.

## 4. Checking a public-facing README

RepoSafe flags internal `.corp` / `.internal` hostnames, personal absolute paths and GitHub links for manual verification. A GitHub link is not proof that the linked repository is private; low-severity suggestions are review prompts, not a definitive classification.

## 5. Safe pre-publication checklist

- Run `npm run check` on RepoSafe itself after updating it.
- Run `node dist/cli.js scan --root YOUR_REPO --json` on the repository **you own**.
- Review all findings; specifically check `stats.complete`, `git.complete`, `git.historyChecked` and warnings.
- Use a dedicated established scanner as additional independent coverage and inspect GitHub security/visibility settings manually.
- Rotate real leaked credentials, consider whether history rewriting is needed, then repeat scans. **No scan certifies safety.**

## What RepoSafe deliberately refuses to do

It never pushes code, creates PRs, removes secrets, rewrites Git history, calls vendor credential-validation endpoints, opens arbitrary paths chosen by AI, or sends repository contents over HTTP. All high-impact remediation is an explicit decision by the repository owner.
