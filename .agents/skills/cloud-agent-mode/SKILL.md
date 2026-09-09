---
name: cloud-agent-mode
description: 'Cloud tool binding for the ticket-to-merge spine, organized as a per-platform decision tree (Copilot Coding Agent / connector Claude Code web / default degraded Claude Code web / Claude Code Remote). Single home for cloud platform facts: validation binding per platform, mark-ready label mechanics, Jira transition IDs, egress quirks, degraded-mode fallbacks. Load when: operating in any cloud environment, choosing a validation path in cloud, or troubleshooting cloud-agent auth or MCP availability.'
metadata:
  scope: '**'
---

# Skill: Cloud Agent Mode

Cloud implementation of the [ticket-to-merge spine](../workflow-overview/references/ticket-to-merge-spine.md). The spine owns the **ordering** (Steps 0–16, five gates, mandatory tracking-task graph) — nothing here restates it; this file (and its references) bind each spine action to the tools your cloud platform actually has, and is the single home for cloud platform facts (quirks, auth, transition IDs, label mechanics).

Common to all cloud platforms: Linux, bash, `/` paths; no worktrees, no `twig`, no `acli`; work on a branch off `origin/main` in the repo root; pnpm 9.12.1 via corepack.

## Step 0: identify your platform

Four configurations hide behind "cloud agent" — identify yours **before** following any workflow, since the validation binding differs and picking wrong wastes the session:

```
Is `mcp__legacy-sports-nx__nx_run_pc_chunk` present?
│
├─ YES, built-in Bash/Read/Edit present  → CONNECTOR CC WEB
├─ YES, no Claude Code shell (worktree_*/make_* instead) → COPILOT CODING AGENT
└─ NO
      ├─ `mcp__Claude_Code_Remote__*` tools present → CLAUDE CODE REMOTE (CCR)
      └─ No custom MCP servers of any kind         → DEFAULT (DEGRADED) CC WEB
```

Full decision tree with secondary confirmation probes: [references/platform-detection.md](references/platform-detection.md#step-0-identify-your-platform).

**Validation is safety-critical and platform-dependent** — never run monolithic `make pc` in cloud on any platform; read [references/platform-detection.md](references/platform-detection.md#validation-binding-safety-critical--read-before-running-anything) before running any `pc-*` chunk.

## E2E auth: use `E2E_AUTH_MODE=ci`, not `make e2e-auth`

`apps/web-e2e/src/global-setup.ts` picks its auth path via `CI || E2E_AUTH_MODE === 'ci'`: when set, it uses a hermetic JWT and needs no OAuth proxy URL and no human interaction. `make e2e-auth` is a **different, interactive** path (device-flow OAuth handshake) that an agent cannot complete — never run it from a cloud session. If `scripts/e2e-auth.mjs` throws "Neither VITE_OAUTH_PROXY_URL nor OAUTH_PROXY_URL is set", that error is naming the live-OAuth path's requirements only; the actual fix for a cloud/CI run is `E2E_AUTH_MODE=ci`, not sourcing a proxy URL.

## References

| Topic                                                                                         | File                                                                                     |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Step 0 decision tree, validation binding, spine step binding table                            | [references/platform-detection.md](references/platform-detection.md)                     |
| Copilot Coding Agent (bootstrap, servers, preflight)                                          | [references/copilot-coding-agent.md](references/copilot-coding-agent.md)                 |
| Connector CC web (OAuth, tool routing)                                                        | [references/connector-cc-web.md](references/connector-cc-web.md)                         |
| Default CC web / degraded mode (spine bindings, unexecutable table)                           | [references/default-cc-web-degraded.md](references/default-cc-web-degraded.md)           |
| Claude Code Remote (CCR): platform overview, AWS/Packer gap, chip dispatch, trigger lifecycle | [references/claude-code-remote.md](references/claude-code-remote.md)                     |
| CCR known failure modes (dead sessions, OAuth expiry, stale Nx cache)                         | [references/ccr-known-failures.md](references/ccr-known-failures.md)                     |
| Container timeout resilience + restart-kills-background-jobs                                  | [references/container-timeout-resilience.md](references/container-timeout-resilience.md) |
| GitHub identity/auth + mark-ready label mechanics + Jira binding                              | [references/github-jira-binding.md](references/github-jira-binding.md)                   |
| Known cloud-environment quirks (Quirks 1–11)                                                  | [references/known-quirks.md](references/known-quirks.md)                                 |
| Provenance, maintenance log, re-verification commands                                         | [references/provenance.md](references/provenance.md)                                     |

## Cloud-to-Local Teleport

When a task needs AWS credentials, real database access, Terraform, or thread resolution from degraded mode, do not skip the step or fail silently — follow [cloud-teleport](../cloud-teleport/SKILL.md): commit progress, write a structured handoff artifact, alert the user to continue locally.

## Related skills

- [workflow-overview](../workflow-overview/SKILL.md) — local (Windows) binding of the same spine.
- [pr-lifecycle](../pr-lifecycle/SKILL.md) — Author Agent Contract, review-thread reply protocol.
- [mcp-first](../mcp-first/SKILL.md) — server list, tool routing, mid-session-401 diagnostics.
- [cloud-teleport](../cloud-teleport/SKILL.md) — capability-gap handoff to local.
