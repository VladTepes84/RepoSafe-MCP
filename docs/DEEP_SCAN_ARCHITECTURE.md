# Deep Scan: NEEDS_ARCHITECTURE

The current public GitHub feature downloads a bounded source archive. The local Git
scanner assumes an operator-approved working tree and explicitly trusts its Git
configuration. A Git fetch adds an unbounded pack and object expansion to disk;
the existing history output limits do not bound that download or unpacking. The
current architecture therefore cannot establish the requested remote disk and
execution boundaries. No remote Git fetch or deep-scan option is enabled.

## Proposed design and acceptance gates

1. Build a dedicated public GitHub transport that accepts only the existing strict
   HTTPS owner/repository parser, with fixed GitHub endpoints, no credentials,
   redirects, credential helpers, hooks, checkout, filters or shell. Resolve and
   pin repository identity, selected refs and commit IDs before retrieving data.
2. Enforce a hard transport byte ceiling while streaming and a separately enforced
   filesystem quota covering temporary pack files, indexes and expanded objects.
   Abort before either limit is exceeded, bound wall time and concurrency, and
   remove the private temporary area on success, error and cancellation. A process
   timeout or post-fetch size check alone is not a disk quota.
3. Enumerate bounded public branch and tag refs and reachable commits, recording
   all caps and truncation. Never use an untrusted baseline. Do not inspect LFS or
   submodules without a separately designed authorization and bounded transport;
   explicitly report them as uninspected.
4. Refactor the history scanner to accept approved immutable objects rather than
   an untrusted working-tree Git configuration. Keep source and secret values out
   of outputs. Preserve default snapshot behavior and all seven MCP tools.
5. Gate remote MCP deep scans behind operator opt-in and explicit approval for the
   exact URL. Bind reportId, SHA, ref identity, limits and coverage to each report.
   Add JSON/SARIF only after defining and testing equivalent remote contracts.
6. Verify hostile refs, large and highly compressible packs, slow streams,
   cancellation, cleanup, credential/config injection, redirects, concurrent
   scans and limit exhaustion on Windows, macOS and Linux. Validate disk ceilings
   during the transfer, not only after it. Require the existing full CI matrix.

An implementation needs a portable way to enforce the filesystem quota or a
transport that can prove an equivalent bound for all intermediate representations.
Until then the deep mode must fail closed and must not fall back to a local scan.

