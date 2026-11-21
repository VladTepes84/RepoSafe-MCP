# RepoSafe — manual remediation guide (v0.6)

RepoSafe is **read-only**. The commands below are examples for the repository owner, **never actions executed by RepoSafe or an AI tool**. Review the exact repository, paths, authorization and consequences before any Git operation. Never paste real credentials into issues, PRs, logs or AI prompts.

## 1. Credential still in the working tree

1. Identify the provider, affected account/service, scope and the safe replacement procedure. **Revoke/rotate any real exposed credential first**, because it may already exist in clones or CI logs.
2. Move the secret to protected runtime configuration (environment injected by CI, workload identity, secret store), then remove it from committed content.
3. If an entire sensitive file is tracked, `.gitignore` **does not untrack it**. After deliberate review, the owner can run:

```sh
git check-ignore -v -- .env
git ls-files -- .env
git rm --cached -- .env
```

`git rm --cached` **modifies the Git index** but leaves the working copy in place; execute it manually only if you intend to stop tracking the file. Review `git diff --cached` before committing. Do not run blindly on shared worktrees or with path globs.

## 2. Credential only in Git history

1. Revoke/rotate credentials even if deleted from the latest working tree. Deleting a line in a subsequent commit does not erase the original Git object.
2. Review the **introducing commit ID** from the RepoSafe report, using your normal local Git review process. Do not paste the old line or secret into chat or issue threads.
3. If a coordinated history rewrite is necessary, use established Git history tooling and a backup in an isolated repository. Rewriting commits changes hashes, can disrupt collaborators, invalidate signatures, and cannot retract forks/caches. Treat rewrite as a separately approved, high-risk operation; it is **not** an automatic RepoSafe feature.

## 3. Common configuration systems

- **Spring / properties / application YAML:** replace embedded passwords, API tokens and private keys with runtime-injected values. Avoid committing real example credentials.
- **Terraform:** avoid hardcoded `default` values on secret-bearing variables. Use protected CI mechanisms; Terraform state itself may contain sensitive material and needs separate access restrictions.
- **Kubernetes Secret:** Base64 is encoding, not encryption. Do not commit active Secret manifests with actual `data` values; rotate exposed credentials and use a managed secret source appropriate to your environment.

## 4. False positives and history window

A `.reposafe.json` baseline exception requires an exact path+rule and reason. High/critical suppression never produces a clean verdict. Prefer fixing misleading example content over globally disabling a rule.

A restricted `--history-depth`, `--since` or `--current-branch` request does **not** check older or other-branch credentials. Before any public release, increase the bounded scope as appropriate and supplement RepoSafe with an established secret scanner and human review.

## 5. Verify

Run a fresh read-only scan after manual remediation. Confirm GitHub Actions findings, baseline counts, scope warnings and the external provider's revocation state independently. No absence-of-findings report proves that a repository is safe to publish.
