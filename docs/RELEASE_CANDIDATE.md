# Manual release candidate — no publish, no deploy

RepoSafe remains beta. The optional GitHub Actions workflow [release-candidate.yml](../.github/workflows/release-candidate.yml) is **manual only** (`workflow_dispatch`), not triggered by a push or PR. It **does not** tag a release, publish to npm, sign an artifact, deploy a server or alter clients.

## What the workflow does when explicitly launched

1. Checks out the selected commit and uses SHA-pinned official Actions with `contents: read` permissions.
2. Runs `npm ci --ignore-scripts`, `npm run check`, `npm run verify:runtime` and production dependency auditing.
3. Creates a local `npm pack` tarball **without lifecycle scripts** and a CycloneDX npm dependency SBOM.
4. Produces a candidate manifest recording the GitHub commit and package filename plus `SHA256SUMS`.
5. Uploads these outputs as a **temporary GitHub Actions artifact**, retained for seven days.

**Recorded run (23 November 2026):** [workflow #45158828933](https://github.com/VladTepes84/RepoSafe-MCP/actions/runs/45158828933) completed successfully on the former `main` commit `f6f6da794537ac5666a43f776d7d51432863c07b`. GitHub reported an unexpired temporary artifact named `reposafe-candidate-f6f6da794537ac5666a43f776d7d51432863c07b`. **The packaged bytes/SBOM/checksums were not independently inspected.** That artifact does **not** include draft PR #34's CLI improvements and cannot be treated as the final candidate.

When PR #34 is separately accepted/merged, require fresh post-merge CI and a **new explicit manual workflow run** against the final exact commit. Inspect the newly generated package, CycloneDX SBOM, checksum manifest and provenance limitations before creating any tag or GitHub Release. The workflow by itself **never publishes**.

GitHub-hosted runner execution is not local to the user's laptop: sources are checked out from this public GitHub repository onto GitHub Actions; it is **not** a remote scanner service for private user repositories.

## Quality gates before accepting any candidate

- Complete, green matrix CI on the exact candidate commit and independently checked package manifest.
- Local source archive installation from an immutable full commit SHA, plus `doctor`/CLI/MCP regression.
- Actual client in-product acceptance for each claimed supported GUI; an SDK handshake is insufficient.
- Review of security boundaries, false-positive corpus, scan coverage, Git history limits, runtime costs and dependency changes.
- Record release note changes and identify any schema or user-config compatibility impact.

**Limitations:** SHA256SUMS alone is not an independent cryptographic signature or provenance attestation. Reproducible builds across different hosts have not been independently established. The workflow cannot guarantee the npm registry, GitHub, runner, dependency supply chain, or client host has not been compromised. Publishing/tagging requires a separate, explicit authorization and validation.
