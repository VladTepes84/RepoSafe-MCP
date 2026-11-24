# RepoSafe MCP — access from another device

**Current implementation (2026-11-24):** RepoSafe ships a local Node.js CLI and a local STDIO MCP server. It does not provide a public HTTPS endpoint, remote scan service, network tunnel, shared filesystem service or multi-user server. Local execution remains the default; no new remote access has been implemented or tested.

## Distinguish the goals

| Goal | Works without original Mac? | How |
| --- | --- | --- |
| Scan a public GitHub repository from a second computer | Yes | Install RepoSafe there (Node.js 22+) and run `reposafe scan https://github.com/OWNER/REPO`. Git history, LFS and submodules are not inspected in this mode. |
| Scan a private repository from another computer | Yes | Install RepoSafe on that computer and supply an authorized local Git checkout. Code stays on that computer. |
| Use a single persistent MCP instance from another device | Only if a separate authorized host stays running | Requires an additional authenticated remote transport and an available host. Not shipped. |
| Connect ChatGPT web to a server running on a private network | Depends on a running host/tunnel | A supported remote MCP endpoint or Secure MCP Tunnel and suitable ChatGPT/Platform permissions. Not tested for RepoSafe. |

A device cannot execute a scanner without a running execution environment. To avoid depending on the original Mac, run RepoSafe on the other computer or on a separate always-on trusted host. Using a VPS means the source and scanning are on that VPS, **not exclusively local to the user's Mac**; hosting has cost, data-transfer and privacy implications. There is no native iPhone CLI distribution.

## Local Codex versus ChatGPT web

The supported Codex/ChatGPT **desktop local host** can use a local STDIO MCP server from its `~/.codex/config.toml` when the selected product actually supports local execution. ChatGPT web and mobile do **not** automatically load that file.

For a custom server connection on ChatGPT web, OpenAI documents a supported HTTPS MCP service or eligible private Secure MCP Tunnel. A tunnel does not remove dependency on the host running RepoSafe: a client on that host must stay active. Eligibility and cost are not verified for this project.

See official documentation:
- https://learn.chatgpt.com/docs/extend/mcp
- https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels

## Security boundary before any remote prototype

Do **not** expose the local STDIO process as an unauthenticated HTTP endpoint. A separate future proposal must specify user authentication, approved repository roots, isolation per user/session, bounded requests and responses, timeouts, cancellation, egress restrictions, safe logs and costs. RepoSafe MCP tools currently use a fixed approved local `REPOSAFE_ROOT`; do not add arbitrary repository-root selection to the AI tool schema. No remote deployment, new network listener, credentials or permission grants are authorized by this document.

**Next step:** verify actual tool calls from a supported *local* Codex/ChatGPT desktop session using an authorized synthetic repository. The SDK protocol test alone is not client acceptance.
