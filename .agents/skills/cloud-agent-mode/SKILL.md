---
name: cloud-agent-mode
description: 'Cloud tool binding for the ticket-to-merge spine, organized as a per-platform decision tree (Copilot Coding Agent / connector Claude Code web / default degraded Claude Code web). Single home for cloud platform facts: validation binding per platform, mark-ready label mechanics, Jira transition IDs, egress quirks, degraded-mode fallbacks. Load when: operating in any cloud environment, choosing a validation path in cloud, or troubleshooting cloud-agent auth or MCP availability.'
metadata:
  scope: '**'
---

# Skill: Cloud Agent Mode

Cloud implementation of the [ticket-to-merge spine](../workflow-overview/references/ticket-to-merge-spine.md). The spine owns the **ordering** (Steps 0–16, five gates, mandatory tracking-task graph) — nothing here restates it; this file binds each spine action to the tools your cloud platform actually has, and is the single home for cloud platform facts (quirks, auth, transition IDs, label mechanics).

Common to all cloud platforms: Linux, bash, `/` paths; no worktrees, no `twig`, no `acli`; work on a branch off `origin/main` in the repo root; pnpm 9.12.1 via corepack.

## Step 0: identify your platform

Three configurations hide behind "cloud agent". Identify yours **before** following any workflow — the validation binding differs and picking wrong wastes the session.

```
Is `mcp__legacy-sports-nx__nx_run_pc_chunk` present?
   (check the deferred-tools <system-reminder>, or run ToolSearch("select:nx_run_pc_chunk"))
│
├─ YES, and built-in Bash/Read/Edit are present
│     → CONNECTOR CC WEB (Claude Code on the web with custom remote connectors)
│
├─ YES, and there is no Claude Code shell (worktree_*/make_* tools instead of Bash)
│     → COPILOT CODING AGENT
│
└─ NO
      ├─ `mcp__Claude_Code_Remote__*` tools present (e.g. `create_trigger`, `list_repos`, `send_later`) alongside hosted `legacy-sports-{jira,github,ci}` connectors
      │     → CLAUDE CODE REMOTE (CCR) — see [below](#claude-code-remote-ccr)
      │
      └─ No custom MCP servers of any kind
            → DEFAULT (DEGRADED) CC WEB
```

Secondary confirmation for default CC web: `jira_*` tools absent, `Glob`/`Grep` may be absent (probe with `ToolSearch("select:Glob,Grep")`), no Docker socket, no `gh` CLI. Three diagnostic probes (LS-4358 + two reprobes) confirmed default CC web ignores project `.mcp.json` (stdio servers never load) and `.devcontainer/devcontainer.json` entirely.

## Validation binding (safety-critical — read before running anything)

The seven `pc-*` chunks in canonical order — `pc-db-prep` → `pc-typecheck` → `pc-format` → `pc-lint` → `pc-workflows` → `pc-test` → `pc-build` — are the only validation path in cloud. They are the same nine steps as `make pc`, and equivalent to it **only if all seven run in order** (LS-7906). The chunk list's source of truth is `PC_CHUNKS` in `tools/mcp/nx-server/src/tools/run-pc-chunk.ts` and the `pc-*` targets in the Makefile.

| Platform             | Binding (owner ruling 2026-07-02)                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copilot Coding Agent | `nx_run_pc_chunk({ chunk: "pc-db-prep" })` → … → `({ chunk: "pc-build" })` — **mandatory** wherever the tool exists (30-min runaway backstop, structured pass/fail)                                                                               |
| Connector CC web     | Same — `nx_run_pc_chunk` per chunk, **mandatory**                                                                                                                                                                                                 |
| Default CC web       | `nx_run_pc_chunk` does not exist here. Sanctioned path: Bash `make pc-<chunk>` with **`run_in_background: true`**, one chunk at a time, waiting for each background completion before starting the next. This is the only compliant degraded path |

Preconditions that hold on every platform:

- **Before any chunk**: the draft PR exists and the branch is pushed (spine [draft-PR-before-validation gate](../workflow-overview/references/ticket-to-merge-spine.md#critical-gates-preconditions)). A container reap mid-validation is then non-fatal.
- **Before `pc-db-prep`**: migrations applied where a DB exists (Copilot: `pnpm --prefix lib/db-client run db:status` → `db:up` against local Docker Postgres; default CC web has no DB — see [degraded mode](#default-cc-web-degraded-mode)).
- **Before `pc-format`**: commit all your changes so the working tree is clean. `pc-format` runs `prettier --write .` repo-wide; with a dirty tree it exits 1 ("You have other uncommitted changes alongside the format fixes"); with a clean tree it commits any formatter rewrites as a new `style: apply formatting` commit on top of your tip commit — never an amend of the tip, since the tip is always already pushed by this point (LS-8367; verified in the Makefile `_PC_FORMAT_RECIPE`).
- **After each chunk**: refresh the continuation checkpoint; on failure, fix and re-run that chunk before moving on.
- Monolithic `make pc` / `make_run(target: "pc")` never runs in cloud on any platform — it exceeds transport windows and gets the container reaped mid-run.

Why the degraded path is background-only: the repo hook `.agents/hooks/enforce-background.mjs` exit-2 blocks foreground `make pc-<chunk>` (and foreground `pnpm exec nx affected|run-many`) because they exceed the Bash tool's ~120s inline timeout. `run_in_background: true` satisfies the hook and survives long chunks; completion arrives as a notification — do not poll output files while waiting. The companion hook `.claude/hooks/guard-make-pc.sh` warns (never blocks) on monolithic `make pc`.

Two guardrails on the background wait (LS-8542, from the PR #6190 stall):

- **Refresh the `<!-- continuation-plan -->` checkpoint before ending any turn that waits on a background chunk.** If the completion notification is missed or never processed, the session stalls permanently in draft; the `/sweep-prs` stalled-agent net ([sweep.md Step 2b](../pr-lifecycle/references/sweep.md)) is what recovers it, and it resumes from that checkpoint.
- **This degraded path is cloud-only.** A _local_ session where `nx_run_pc_chunk`/`make_run` are missing has a **broken worktree** (usually a dead `node_modules` link — stdio MCP servers fail silently without `node_modules/.bin/tsx`), not a degraded environment. Repair it (`node scripts/modules-pool/link.mjs`, then restart the session) instead of adopting background-Bash validation — see [workflow-overview local nuances](../workflow-overview/SKILL.md#local-only-step-nuances).

### Known failure mode: phantom typecheck/lint errors on unrelated files (LS-8384)

**Symptom**: `pc-typecheck` / `pc-lint` / `pc-build` / `pc-test` fail in a long-lived persistent cloud container, reporting errors in files with **zero diff** against `origin/main` for the current branch. `make clean-cache` (nx reset) does not fix it — errors reproduce identically after. A fresh worktree (or fresh clone) on the exact same source tree passes with zero errors, and the repo's real CI is confirmed green on the same commit throughout.

**Root cause**: unlike the [missing-`tsx`](../mcp-first/references/diagnostics.md#recovery-missing-node_modules) failure mode (`node_modules` absent or its pooled symlink broken, causing stdio MCP servers to silently fail to connect), this is a **present-but-corrupted** `node_modules` in a long-lived container — one or more specific packages have a broken/partial install (e.g. a stray nested `node_modules/<subdep>/` with no `package.json`/`dist` for the top-level package itself). Confirmed instances: `@aws-sdk/client-cloudwatch` (LS-6064), `recharts` (LS-8668). The underlying cause of the drift itself (partial/interrupted installs, stale `.pnpm` store entries) is **not identified** — this section documents the symptom and workaround, not a fix for the drift.

**Diagnose**: before trusting a local `pc-*` failure on a file your branch didn't touch, run `git diff --stat origin/main -- <file>` — zero output confirms the failure is unrelated to your change. Per LS-5895, a local persistent-container `pc-*` run can also misreport its own affected-project scope (e.g. claiming 26-30 affected projects for a 2-file change); when local and CI disagree, **trust CI's `nx affected` result**, not the local rerun. (One confirmed cause of affected-scope bloat: a stale local `origin/main` ref — `git fetch origin main` and re-diff before concluding the base itself is fine.)

**Why `make clean-cache` doesn't fix it**: its automatic node_modules re-link only fires when `.git` is a **file** (a git-worktree checkout) — see the Makefile's `clean-cache` recipe. In a long-lived container's **main-repo** checkout (`.git` is a directory, which is how cloud sessions run — no worktrees), `make clean-cache` reduces to a bare `pnpm exec nx reset` with no node_modules health check at all, so a corrupted install is never caught or repaired by it.

**Recover**: never manually `rm -rf` a package under `node_modules` — if it happens to be a pool-managed symlink (`.modules-pool/<hash>/node_modules`, see [modules-pool RFC](../../../docs/rfcs/modules-pool/README.md)), deleting inside it mutates a shared immutable slot other sessions/worktrees on the same lockfile hash rely on — the exact corruption class the pool exists to prevent. Instead run `node scripts/modules-pool/link.mjs` (safe to run from the main-repo root too, not just a worktree): it health-checks the current install for precisely this signature (orphaned pnpm `_tmp_` dirs, packages missing `package.json`) and auto-quarantines + rebuilds an unhealthy slot. Use `--check` first to see findings with no filesystem changes, or `--rebuild` to force a rebuild even when the health check doesn't flag anything.

**Related but distinct variant — total project-graph failure, not per-file phantom errors (LS-8473)**: the corruption signature above is _present-but-partial_ (a package directory exists but is missing files), which nx tolerates well enough to still build a project graph and run `tsc`, just against the wrong module resolution. A **more broken** slot — `link.mjs --check` reports `slot not built` rather than listing specific unhealthy packages — fails earlier and louder: `nx` cannot process the project graph at all (e.g. `Cannot find module 'react-native/jest-preset'` while resolving `apps/app/jest.config.ts` for the `@nx/jest` plugin), so **every** `nx` target errors out, including `typecheck` for projects that have nothing to do with the missing module. This is easy to misdiagnose as ~hundreds of pre-existing source-level `tsc` errors if the failing command's output is skimmed rather than read — the actual error is a single project-graph-construction failure, not a list of per-file diagnostics. Same recovery as above (`node scripts/modules-pool/link.mjs --rebuild`); afterward, `tsc --noEmit` run directly (bypassing nx) is the fastest way to confirm a project is genuinely clean.

## Spine step binding by platform

| Spine step          | Copilot                                                                                                                | Connector CC web                                                                                                                                                                                                                                                                           | Default CC web                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Claim ticket        | `jira_transition({ keys, status: "In Progress", action: "claim", assignee })`                                          | Same if `jira_*` connected; else Atlassian plugin                                                                                                                                                                                                                                          | Atlassian plugin ([Jira binding](#jira-binding))                                                               |
| Commit / push       | `worktree_commit` / `worktree_push({ setUpstream: true })`                                                             | Bash `git add <files> && git commit -m "type(scope): msg (LS-####)" && git push -u origin HEAD`                                                                                                                                                                                            | Same Bash                                                                                                      |
| Open draft PR       | `github_create_pr({ title, body, draft: true })`                                                                       | `mcp__github__create_pull_request({ owner, repo, head, base, title, body, draft: true })` (built-in, bot identity) — ⚠️ omits the `jira-link` marker; add it manually per the [marker format](../pr-lifecycle/references/create-pr.md#jira-link-marker-source-of-truth-for-ticket-linkage) | Same built-in — same marker gap, same fix                                                                      |
| `agent-in-progress` | `github_manage_labels({ prs: [N], add: ["agent-in-progress"] })`                                                       | Same (hosted `legacy-sports-github` connector)                                                                                                                                                                                                                                             | Unavailable — note it in the PR body                                                                           |
| Checkpoint          | `github_comment_pr` with a `<!-- continuation-plan -->` body (see [timeout resilience](#container-timeout-resilience)) | Same                                                                                                                                                                                                                                                                                       | Same, via `mcp__github__add_issue_comment`                                                                     |
| Validate            | `nx_run_pc_chunk` per chunk                                                                                            | `nx_run_pc_chunk` per chunk                                                                                                                                                                                                                                                                | Bash `make pc-<chunk>` in background, per chunk                                                                |
| Mark ready          | `github_mark_pr_ready({ number: N })` — applies the trigger label itself                                               | `mcp__github__update_pull_request({ draft: false })` **then** `github_manage_labels({ prs: [N], add: ["bot:ready-for-review"] })`                                                                                                                                                          | `update_pull_request({ draft: false })` only — see [label mechanics](#mark-ready-and-the-review-trigger-label) |
| Jira → In Review    | `jira_transition({ key, status: "In Review" })`                                                                        | Same or Atlassian plugin                                                                                                                                                                                                                                                                   | Atlassian plugin, transition id `2`                                                                            |

**Assignee**: before claiming, `echo "$JIRA_ASSIGNEE_EMAIL"` (Copilot exports it from the repo variable via `copilot-setup-steps.yml`). Non-empty → pass `assignee`; unset → omit. Claim results per the spine: `PROCEED` → use `branchRecommendation`; `STOP` → halt; `ALREADY_CLAIMED` → search for an open PR with the key, stop if one exists or `ticket.updated` < 60 min ago, else proceed and note the orphaned claim in the PR body.

**Self-review (mandatory gate, all platforms)**: before marking the PR ready — and before any push to a Ready (non-draft) PR — read every changed file in full against [common-review-patterns.md](../pr-lifecycle/references/common-review-patterns.md) (at minimum patterns #3, #4, #7, #8, #9, #19, #20) and the checklist in [self-review.md](../pr-lifecycle/references/self-review.md). Draft-checkpoint pushes legitimately precede it — the spine opens the draft PR before validation; spine Step 13 is where the review runs. No `/review` slash command in cloud does not waive the gate — inline the checklist.

## Copilot Coding Agent

**Bootstrap**: `.github/workflows/copilot-setup-steps.yml` runs before every task: Node 22 + pnpm + deps, local Docker Postgres (service container, `postgres:16` on 5432) with migrations applied, Agent Author GitHub App token exported as `GH_TOKEN`/`GITHUB_TOKEN`, and one short-lived Cognito machine-grant bearer minted per hosted MCP scope (`MCP_{JIRA,GITHUB,CI,DB}_BEARER`) from the `client_credentials` secret. The SigV4/OIDC Lambda-Function-URL path was retired in LS-5093 — **no AWS credentials exist or are needed anywhere in cloud**. The authoritative secret/variable list lives in the header comment of `copilot-setup-steps.yml`; the MCP config to paste into Settings → Copilot → Cloud agent lives in `.github/copilot/copilot-cloud-mcp-config.json` (paste only the `mcpServers` object).

**Servers available** (from `.github/copilot/copilot-cloud-mcp-config.json`): hosted `legacy-sports-{github,ci,jira,db-admin}` (API Gateway + Cognito bearer) and stdio `worktree`, `legacy-sports-nx`, `legacy-sports-make`. The `worktree` server runs an allow-listed subset — the `tools` array in that config is the authoritative list (as of 2026-07-21: `worktree_ping`/`_list`/`_set`/`_run`/`_job_status`/`_job_wait`/`_job_list`/`_guard`/`_commit`/`_rebase_continue`/`_stabilize`/`_push`/`_reset_to_remote` plus `auth_check_all`); everything else, including the twig-dependent `worktree_rebase`/`worktree_clean`/`worktree_remove_batch`, is excluded — route ad-hoc git (status/diff/log) through `worktree_run`. Like the ruleset, this file is **config, not necessarily live state**: `worktree_commit`/`worktree_reset_to_remote`/`auth_check_all` joined the allowlist 2026-07-03 and the `worktree_job_*` polling tools 2026-07-21 (LS-8559), so if a live session rejects them the pasted Settings JSON predates that — ask the owner to re-paste the `mcpServers` object. No `legacy-sports-aws`, no browser server by default, no built-in `mcp__github__*` or Atlassian plugin.

**Session preflight**: `auth_check_all` (worktree server) is available here — run it first per AGENTS.md. Individual probes: `github_auth_status()`, `ci_auth_status()`, `jira_auth_status()`, `nx_check_package_health()`, `db_query({ query: "SELECT 1" })`, `worktree_ping()`. If a hosted server is unreachable, check the bootstrap logs for the bearer-minting step and confirm the `copilot` environment secrets named in the workflow header are set.

## Connector CC web

Claude Code on the web where the hosted `legacy-sports-*` servers are attached as **custom remote MCP connectors** registered in claude.ai (epic LS-5089). Registration is owner-only and out-of-band (Org settings → Connectors); once registered, connectors auto-sync into local and CC-web sessions for that account — nothing is read from `.mcp.json` in either case. Onboarding: [docs/dev-process/mcp-connector-access.md](../../../docs/dev-process/mcp-connector-access.md).

- **Auth is OAuth** (MCP OAuth 2.0 spec, LS-5095), consented once per connector by the human in a browser. Claude Code does **not** auto-refresh MCP OAuth tokens mid-session ([claude-code#58607](https://github.com/anthropics/claude-code/issues/58607)): a mid-session 401 means the token expired — prompt the user to re-consent via `/mcp`; do not fall back to `gh`/`curl`.
- **Which connectors are attached varies by account** — trust the deferred-tools list over any static claim here. The hosted DB connector may display as `legacy-sports-db` rather than `legacy-sports-db-admin` (verified in a live 2026-07-02 connector session); identify servers by their tool names (`db_query`, `db_migrate`), not display names.
- **Tool routing**: built-in `mcp__github__*` (native GitHub connector, bot identity) is authoritative for every PR operation it covers — create PR, mark ready draft-flip, reply to review comments, request Copilot review, read PR/reviews. The hosted `legacy-sports-github` connector covers the gaps: `github_manage_labels` (no built-in equivalent), `github_get_review_threads` (only source of GraphQL thread node IDs), `github_resolve_threads` (batch resolve + bot-review recheck; a 403 on the recheck dispatch is non-fatal — threads still resolve and the recheck fires on the next push).
- `auth_check_all` lives in the **stdio** worktree server and is therefore absent in both CC-web modes. Fallback: verify each surface on first use (one Atlassian-plugin call, one `mcp__github__*` call, one hosted-connector call) instead of a single preflight.
- Validation: `nx_run_pc_chunk` per chunk (see [Validation binding](#validation-binding-safety-critical--read-before-running-anything)).

## Default CC web (degraded mode)

No custom MCP servers of any kind. Confirmed surface (LS-4358 + two reprobes): built-in `Read`/`Edit`/`Write`/`Bash`, built-in `mcp__github__*`, Atlassian plugin. `Glob`/`Grep` may be absent — probe with `ToolSearch("select:Glob,Grep")`; if absent, Bash `find`/`grep -r`/`ls -1` are the sanctioned fallback for file **discovery** (keep file **reads** on `Read`). No `gh` CLI, no `GH_TOKEN`/`GITHUB_TOKEN` in env, no Docker daemon (`/var/run/docker.sock` missing), no `twig`/`acli`. `node_modules` is populated by `.claude/cloud-setup.sh` (runs at cloud session setup and on session start per its header: deepens the shallow clone to establish an `origin/main` merge-base, runs `pnpm install` when `node_modules/.bin/tsx` is missing — LS-8113/LS-8209), so `pnpm exec nx|prettier|tsx` work.

Follow the spine with these bindings (also see the [spine step table](#spine-step-binding-by-platform)):

1. Ticket lookup: Atlassian plugin `searchJiraIssuesUsingJql({ cloudId: "<see Jira binding>", jql: "key = LS-####", maxResults: 1 })` — never `getJiraIssue` (returns wrong data, LS-3715).
2. Transition In Progress: `transitionJiraIssue({ ..., transition: { id: "21" } })` — object, not string; mind [Quirk 2](#quirk-2-atlassian-plugin-transitionjiraissuecreatejiraissue-reject-nested-object-parameters-on-cold-start).
3. Branch: `git fetch origin main && git checkout -b claude/ls-####-<desc> origin/main`.
4. Implement; commit specific files (never `git add .`); `git push -u origin HEAD` (push auth is provided by the CC-web sandbox). `.claude/cloud-setup.sh` proactively neutralizes a stale git-lfs pre-push hook stub when git-lfs is absent (LS-7773), so this should now be rare. **If `git push` is still blocked by git-lfs** (e.g. the SessionStart hook did not run, or the hook was manually recreated after setup): fall back to `mcp__github__push_files` to push via the GitHub API. After any API-based push the local branch is behind the remote — re-sync with `worktree_reset_to_remote()` where the worktree server is attached (Copilot; see the [mcp-first substitution table](../mcp-first/SKILL.md)); in degraded CC web (no worktree server) use Bash `git fetch origin <branch> && git reset --hard origin/<branch>`.
5. Draft PR via `mcp__github__create_pull_request({ ..., draft: true })`; checkpoint via `mcp__github__add_issue_comment` with a body starting `<!-- continuation-plan -->` ([format](../dev-process/artifacts/continuation-plan.md)). If the body was assembled in a scratch file, `Read` it back and inline the text — `body` is a literal JSON string, not shell-evaluated (see the [create-PR callout](../pr-lifecycle/references/create-pr.md#command)).
6. Validate: Bash `make pc-<chunk>` with `run_in_background: true`, one chunk per call, canonical order, waiting for each completion notification. `pnpm exec nx affected -t <target> --base=origin/main` also requires `run_in_background: true` (same hook).
7. Self-review, then mark ready: `mcp__github__update_pull_request({ draft: false })`.
8. Jira → In Review: `transitionJiraIssue({ ..., transition: { id: "2" } })`.
9. Watch review events (surfaced natively — no polling). Cycle-1 clean → merge via `mcp__github__merge_pull_request({ mergeMethod: "squash" })` if loaded, else ask the user.

### What is genuinely unexecutable in degraded mode, and the fallback per case

| Blocked capability                                 | Why                                                                                                                                                                                                                                                                                                                                                     | Fallback                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Resolve review threads**                         | No `mcp__github__*` read path returns GraphQL thread node IDs (verified across three probes); `mcp__github__resolve_review_thread` exists but has no ID source; no `gh`, no token in env. Upstream: [github-mcp-server#2229](https://github.com/github/github-mcp-server/issues/2229), [#2331](https://github.com/github/github-mcp-server/issues/2331) | Reply `FIX: <sha>` to each thread's top-level comment via `mcp__github__add_reply_to_pull_request_comment`, push fixes, then **STOP** with the [stop-point script](#stop-point-script-pr-hit-bot-mandates-in-degraded-mode)                                                                                                                                                       |
| `auth_check_all` preflight                         | Lives in the stdio worktree/dev-process servers, which never load here                                                                                                                                                                                                                                                                                  | Skip the single preflight; verify each surface on first use and treat failures per the [quirks](#known-cloud-environment-quirks)                                                                                                                                                                                                                                                  |
| Hosted-Jira dispatch (`jira_*` tools)              | Hosted connector not attached in default sessions                                                                                                                                                                                                                                                                                                       | Atlassian plugin for search/create/edit/transition (with the [static transition IDs](#discovering-transition-ids)); `jira_link_issues` has **no plugin equivalent** — record needed links in the PR body and tell the user                                                                                                                                                        |
| Trigger-label application (`github_manage_labels`) | Hosted GitHub connector absent; no `gh`                                                                                                                                                                                                                                                                                                                 | Mark ready anyway — Cycle 1 fires on the `ready_for_review` event. Fix-push re-review needs the label ([mechanics](#mark-ready-and-the-review-trigger-label)), so a mandate lands you at the thread-resolution stop anyway. OPEN: built-in `mcp__github__issue_write` may be able to set labels (PRs are issues in the REST API) — unverified; if you confirm it, update this row |
| DB migrations / `db_migrate`                       | No Docker daemon, no hosted DB connector                                                                                                                                                                                                                                                                                                                | State unapplied migrations in the PR body; the required CI check "Verify All Migrations Applied" gates the merge                                                                                                                                                                                                                                                                  |
| CI log text (`ci_get_logs`)                        | No CI connector, no `gh`, and log downloads are proxy-blocked anyway ([Quirk 3](#quirk-3-ci_get_logs-returns-step-summaries-instead-of-full-log-text-in-cloud-sessions))                                                                                                                                                                                | Rely on natively surfaced CI events; ask the user for log excerpts if the failure reason is opaque                                                                                                                                                                                                                                                                                |

Net posture: a **near-full driver for Cycle-1-clean PRs** and a research/ticketing/PR-author agent for anything that hits bot iteration. Set that expectation with the user at session start.

### Stop-point script (PR hit bot mandates in degraded mode)

Use verbatim when thread resolution is required:

> PR #N has unresolved review threads that I can reply to but cannot mark resolved from this session. `mcp__github__resolve_review_thread` is loaded, but no `mcp__github__*` read path returns the GraphQL thread node IDs it needs, and there is no `gh` CLI or token in the environment. I have replied to each open thread with `FIX: <sha>` and pushed the fix commits. To complete the PR, please either (a) resolve the threads in the GitHub UI and re-request review, or (b) hand off to a session with the `legacy-sports-github` server — its `github_resolve_threads` tool finishes the cycle.

For a structured handoff artifact instead of a chat message, follow [cloud-teleport](../cloud-teleport/SKILL.md). LS-4377 (wiring this stop into a slash command) is still OPEN.

## Claude Code Remote (CCR)

A fourth configuration, distinct from the three in [Step 0](#step-0-identify-your-platform): the managed remote execution product described in this session's own system prompt ("Your current remote execution environment"), reached via a dedicated `mcp__Claude_Code_Remote__*` server (`create_trigger`, `list_repos`, `add_repo`, `send_later`, `subscribe_pr_activity`, etc.) — **not** the `ccd_session` server that hosted "chip dispatch" sessions use. Identify it by: `mcp__Claude_Code_Remote__*` tools present; `mcp__ccd_session__spawn_task` and `nx_run_pc_chunk` both absent (confirm with `ToolSearch`); hosted `legacy-sports-{jira,github,ci}` connectors and built-in `mcp__github__*` present (same as Connector CC web). Only the chip-dispatch gap below is verified for CCR — everything else in this file (spine bindings, validation, Jira transition IDs) is unconfirmed here. In particular, do **not** assume Connector CC web's `nx_run_pc_chunk` validation binding — that tool is absent by definition in CCR (see the Step 0 check above); until verified, the safer assumption is Default CC web's degraded validation path (Bash `make pc-<chunk>` in background, one chunk at a time). Verify each capability against the tools actually present in your session rather than assuming any platform's full binding, and update this section with what you find.

### Chip dispatch substitute (LS-8510)

[work-ticket leaf-mode step 4](../work-ticket/references/leaf-mode.md) requires spawning a chip via `mcp__ccd_session__spawn_task` whenever a follow-up ticket is filed mid-implementation. That tool does not exist in CCR sessions and `ToolSearch` cannot locate it (confirmed LS-8510) — a platform capability gap in this product surface, not a repo bug to route around.

**Current compliant behavior**: file the follow-up ticket and add a one-line note (description or `jira_add_comment`) that it needs manual pickup — do not stop the current ticket to work it. leaf-mode.md step 4 branches to this fallback for CCR sessions; it satisfies the "MANDATORY" contract without a dispatch primitive.

**OPEN — untested substitute**: `mcp__Claude_Code_Remote__create_trigger({ name, prompt, create_new_session_on_fire: true, run_once_at: "<a minute or two from now, RFC3339>" })` spawns a fresh session in this environment once, then self-disables (`ended_reason: "run_once_fired"`) — structurally close to a one-shot `spawn_task`. It has **not** been verified end-to-end as a chip-dispatch substitute (does the fresh session pick up `prompt` the same way a chip's `prompt` does? does it need `environment_id` passed explicitly?). Firing one has a real side effect — a new billed session — so don't test it blind mid-ticket. Do not treat it as load-bearing until someone verifies it and updates this section plus the leaf-mode.md branch to prefer it over the file-only fallback.

## Container timeout resilience

Cloud containers can be reaped mid-run — most often during validation. The spine's ordering already absorbs this: branch pushed → draft PR → checkpoint comment → **then** validate, so a reap during a `pc-*` chunk loses nothing. The gate that still holds: **all seven chunks green before mark-ready** — a draft PR existing earlier is inert (CI and the Reviewer Bot are gated on `draft == false`).

The spine's tracking-task graph (Step 1c) is what survives compaction: with the validation task `blockedBy` the draft-PR task, an agent that loses prose context cannot reorder the gates. See [Read first](../workflow-overview/references/ticket-to-merge-spine.md#read-first-why-ordering-breaks-and-what-actually-holds-it).

**Checkpoint**: where the `legacy-sports-dev-process` stdio server is loaded (local only — it is in no cloud configuration), use `continuation_post` / `continuation_status`. In every cloud mode, post/read the checkpoint as a PR comment whose first line is `<!-- continuation-plan -->` ([artifact format](../dev-process/artifacts/continuation-plan.md)). **Resuming after a reap**: fresh container reattaches to the branch, reads the most recent `<!-- continuation-plan -->` comment, and continues from "what's left" — never restart from zero. A stalled-mid-validation session is what [/recover-stall](../../../.claude/commands/recover-stall.md) recovers.

> Distinct from [Cloud-to-Local Teleport](#cloud-to-local-teleport) (capability gap); this section handles the time gap.

## GitHub identity and auth

Two GitHub Apps split duties: **Agent Author** (App ID `3158619`) writes code, pushes, opens PRs; **Agent Reviewer** (App ID `3142924`) approves and merges (verified in `.github/actions/resolve-runner-label/action.yml`). The same app never both authors and approves.

| Platform         | GitHub auth                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Copilot          | Agent Author app token minted by `copilot-setup-steps.yml`, exported as `GH_TOKEN`/`GITHUB_TOKEN` — bot-attributed authorship                |
| CC web (both)    | Built-in `mcp__github__*` via Claude's native GitHub connector — no token config, bot identity. Never route PR authorship through a user PAT |
| Hosted connector | `legacy-sports-github` Lambda holds its own credentials server-side (Secrets Manager); the client sends only the OAuth/Cognito bearer        |

### Mark-ready and the review trigger label

`bot:ready-for-review` is the review trigger label. Verified against `.github/workflows/review.yml`: the Reviewer fires on `opened`/`ready_for_review`, and re-fires on `synchronize` **only when `bot:ready-for-review` (or the bot-owned `merge-when-ready`) is present**. Consequences:

- `github_mark_pr_ready` (hosted server) flips draft **and** applies the label — one call, done.
- Built-in `mcp__github__update_pull_request({ draft: false })` flips the draft flag **only**. Follow it with `github_manage_labels({ prs: [N], add: ["bot:ready-for-review"] })` wherever that tool exists. Without the label, Cycle 1 fires but fix-pushes never re-trigger review — Cycle-1 mandates stall permanently.
- Degraded mode cannot apply the label — see the [degraded fallback table](#what-is-genuinely-unexecutable-in-degraded-mode-and-the-fallback-per-case).

## Jira binding

Hosted `legacy-sports-jira` (`jira_*` tools) where attached; Atlassian plugin (`mcp__claude_ai_Atlassian__*`) on CC web. Site: `bkrupa.atlassian.net` (default in `tools/mcp/jira-server/src/netrc.ts`), cloud ID `fb294606-6c8f-4b52-9a41-11fe45b77528` — pass `cloudId` on every plugin call. On CC web the plugin is the **expected primary path**, not a fallback: it routes through Anthropic's plugin infrastructure and is unaffected by the session proxy that blocks the stdio server's egress ([Quirk 1](#quirk-1-legacy-sports-jira-stdio-server-fetch-failed-claude-code-on-the-web-only)).

Plugin equivalents: `searchJiraIssuesUsingJql` (view/search — never `getJiraIssue`, LS-3715 wrong-data bug; fetch comments via the `comment` field), `createJiraIssue` (avoid `additional_fields` — Quirk 2; prefer `jira_create_ticket({ parent: "LS-####" })` when hosted, else create then set parent via `editJiraIssue({ fields: { parent: { key } } })`), `editJiraIssue`, `transitionJiraIssue`. No plugin equivalent exists for `jira_link_issues`.

### Discovering transition IDs

`transitionJiraIssue` needs a numeric ID passed **as an object**: `transition: { id: "21" }` — a string never works and never resolves with retries. Look IDs up via `jira_view({ key, include: ["transitions"] })` (hosted server) — not the plugin's `getTransitionsForJiraIssue`, which returns full issue data instead of transitions. Stable LS-project table:

| Status        | ID   |
| ------------- | ---- |
| `To Do`       | `11` |
| `In Progress` | `21` |
| `In Review`   | `2`  |
| `Done`        | `31` |
| `Won't Do`    | `3`  |

If these stop working, re-discover via `jira_view` and update this table.

### Jira pagination (LS-2079)

`searchJiraIssuesUsingJql` defaults to `maxResults: 10`; `jira_list_children` defaults to 25 — both silently truncate large epics (LS-2079: an agent worked 10 of 50 children and prematurely transitioned the epic). Rules: always `maxResults: 100` / `limit: 100`; plugin paginates by `startAt` offset against a grand-total `total`; `jira_list_children` paginates by cursor — its `total` is the **page** size, so loop on `nextPageToken` until absent; log the per-status child counts and confirm the sum.

## Known cloud-environment quirks

Environment behaviors that look like bugs but are not. Recognize the symptom and switch strategy without declaring yourself blocked.

### Quirk 1: `legacy-sports-jira` stdio server `fetch failed` (Claude Code on the web only)

**Symptom**: every `jira_*` call from a _stdio_ jira server returns `fetch failed`, while `jira_auth_status` misleadingly reports `{"configured": true}`. **Root cause**: the CC-web session proxy blocks HTTPS egress to `api.atlassian.com` (CONNECT 403); credentials load fine but outbound calls die. **Fix**: switch to the Atlassian plugin immediately (primary path on CC web — see [Jira binding](#jira-binding)). Does not apply to the hosted jira Lambda (its egress happens on AWS) — Copilot and connector sessions are unaffected.

### Quirk 2: Atlassian plugin `transitionJiraIssue`/`createJiraIssue` reject nested-object parameters on cold start

**Symptom**: `MCP error -32602 ... "expected": "object", "received": "string", "path": ["transition"]` (or `["additional_fields"]`) on a correctly-formed call. Cold-start only; `editJiraIssue`/`createIssueLink`/`addCommentToJiraIssue` accept the same shapes concurrently. **Fix**: retry once after any other successful plugin call (~30s of activity warms it). `createJiraIssue.additional_fields` can stay broken longer — avoid it (parent-setting alternatives in [Jira binding](#jira-binding)). If a transition still fails: hosted `jira_transition` where attached; otherwise ask the user to transition in the Jira UI. Distinct from the never-resolves mistake of passing `transition` as a string.

### Quirk 3: `ci_get_logs` returns step summaries instead of full log text in cloud sessions

**Symptom**: output begins `[Log download unavailable: ... results-receiver.actions.githubusercontent.com ... blocked ...]` followed by per-step ✓/✗ conclusions. **Root cause** (LS-3040): GitHub's log endpoint 302-redirects to a host the cloud proxy blocks; the server intentionally falls back to step conclusions. You can see _which_ step failed, not _why_. **Fixes**: `ci_view_run(runId)` returns a `url` the user can open; or get logs from a local session.

### Quirk 4: `ci_dispatch_workflow` returns 403 in cloud — AGENT_AUTHOR_APP lacks `actions:write`

**Symptom**: `Cannot dispatch workflow ...: the GitHub App token lacks actions:write permission (HTTP 403)` / `Resource not accessible by integration`. **Root cause**: the Agent Author installation has `contents:write` + `pull_requests:write` but not `actions:write`; the dispatch endpoint requires it — permissions gap, not auth failure. **Do not loop-retry.** Alternatives: (1) empty commit to re-trigger (`git commit --allow-empty -m "chore: trigger merge queue (LS-####)" && git push`, or `worktree_commit`+`worktree_push` on Copilot); (2) remove/re-add the triggering label; (3) wait — the merge queue retries on its own cycle. **Waiting for CI**: CI and review events surface natively in Claude Code — continue with other work; never sleep+poll. For non-PR `workflow_dispatch` runs (no push notification), use `ci_dispatch_workflow({ ..., waitForCompletion: true })` where the CI server is attached (see AGENTS.md).

### Quirk 5: `AskUserQuestion` can fail outright in any autonomous session, not just webhook-subscribed ones

**Symptom** (LS-8378, broadened by LS-8400): `AskUserQuestion` fails immediately with `Tool permission stream closed before response received` — not a timeout, the call never completes. First observed (LS-8378) in a session with an active `github-webhook-activity` PR subscription while PR events were arriving concurrently, and originally suspected as contention between the webhook event channel and the interactive prompt channel. LS-8400 reproduced the identical error text in a plain autonomous session with **no** webhook subscription active — twice in a row, mid-decision on a rejected-push force-vs-new-commit choice — ruling out webhook contention as the sole cause. The same error string also hit the unrelated `delete_trigger` MCP tool (LS-8381, a stdio tool call with no interactive channel at all), pointing to the root cause being in permission-prompt plumbing shared across tool types in the core harness — not something fixable from this repo (LS-8381 was closed `Won't Do` on that basis). Treat this as a known limitation of autonomous/background-driven sessions generally (webhook-subscribed PR watches, Routines, dispatched chips, and plain unattended sessions alike), not something to retry through. **Do not retry in a loop.** Fallback and full protocol: [drive.md "AskUserQuestion may be unavailable in autonomous sessions"](../pr-lifecycle/references/drive.md#askuserquestion-may-be-unavailable-in-autonomous-sessions) — proceed with documented reasoning (PR comment + Jira note), or escalate via the "Genuine human-only blocker" terminal state instead of a blocking prompt.

### Quirk 6: `stop-hook-git-check.sh` false-positives "Unverified" on genuinely SSH-signed commits (LS-8589)

**Symptom**: after `git commit --amend` (or any local rewrite that keeps `upstream..HEAD` non-empty), the Stop hook fires: "There are commit(s) on branch '...' that GitHub will show as Unverified (missing signature, or committer email is not noreply@anthropic.com)" — even though `git cat-file commit HEAD` shows a populated `gpgsig` block and GitHub does show the commit as Verified once pushed. `git log --format='%G?' -1` reports `N` for the flagged commit.

**Root cause**: the hook (`~/.claude/stop-hook-git-check.sh` — a CCR-platform file, **not** tracked in this repo; confirmed absent from `.claude/hooks/` and `.claude/settings.json`) treats `%G? == "N"` as "unsigned." In this image, `gpg.format` is `ssh`, `gpg.ssh.program` is `/tmp/code-sign` (a remote-signing helper), and `commit.gpgsign=true`, but `gpg.ssh.allowedSignersFile` is unset and the only local pubkey (`~/.ssh/commit_signing_key.pub`) is empty (0 bytes) and owned by a different user than the session UID. With no signers file, git has no key to verify against — reproduced directly (isolated throwaway repo, same global signing config): `git verify-commit` prints `error: gpg.ssh.allowedSignersFile needs to be configured and exist for ssh signature verification`, and `%G?` reports `N` even though the commit's raw object has a valid `gpgsig` header. `%G?==N` is therefore ambiguous here between "actually unsigned" and "signed but unverifiable locally" — the hook's own guardrail comment assumed the latter case reports `B`/`U`/`E`, which holds for `gpg.format=gpg` but not for `gpg.format=ssh` with no signers file.

**Not fixable in this repo**: the buggy script lives entirely outside `bkrupa/legacy-sports` (not mirrored under `.claude/hooks/`), so no PR here can change its detection logic — and an agent patching a security-verification hook's live file outside the repo boundary is correctly blocked by the environment's own safety classifier, not a restriction to route around. The other candidate fix — provisioning a real `gpg.ssh.allowedSignersFile` + non-empty pubkey in the session image — is also infra-only: `/tmp/code-sign` only implements `-Y sign` (confirmed via `--help`), it has no way to export its public key for a session to build a signers file itself. Both fixes require a change to CCR's session-image/platform provisioning, not to this codebase.

**Do not misdiagnose this as a real signing failure and do not bypass signing to silence it** — `--no-gpg-sign` is explicitly forbidden by AGENTS.md, and the commit is in fact validly signed. **Recognize and proceed**: `git cat-file commit HEAD | grep '^gpgsig'` — a populated block means the commit is genuinely signed and this is the known false positive; the warning stops on its own once the branch is pushed (`upstream..HEAD` becomes empty), not because anything about the signature changed.

## Cloud-to-Local Teleport

When a task needs AWS credentials, real database access, Terraform, or thread resolution from degraded mode, do not skip the step or fail silently — follow [cloud-teleport](../cloud-teleport/SKILL.md): commit progress, write a structured handoff artifact, alert the user to continue locally.

## Related skills

- [workflow-overview](../workflow-overview/SKILL.md) — local (Windows) binding of the same spine.
- [pr-lifecycle](../pr-lifecycle/SKILL.md) — Author Agent Contract, review-thread reply protocol.
- [mcp-first](../mcp-first/SKILL.md) — server list, tool routing, mid-session-401 diagnostics.
- [cloud-teleport](../cloud-teleport/SKILL.md) — capability-gap handoff to local.

## Provenance and maintenance

Rewritten 2026-07-02 from the Phase-1 skills audit (cloud-agent-mode rebind): cut from ~687 lines to a per-platform decision tree; folded in the 2026-07-02 owner ruling on degraded-mode validation (Bash `make pc-<chunk>` background-only); fixed internal contradictions (SigV4 retirement vs Quirk-2 wording, Copilot worktree availability, ScheduleWakeup fossil). Prior LS provenance retained in-line: LS-7906 (pc chunks), LS-4358 (degraded probes), LS-5089/5093/5095/5096 (connector/auth model), LS-3715 (`getJiraIssue`), LS-2079 (pagination), LS-3040 (log proxy), LS-8113/LS-8209 (cloud-setup), LS-4377 (stop-point wiring, OPEN), LS-8378 (`AskUserQuestion` stream-closed failure in webhook-subscribed sessions, Quirk 5). 2026-07-26 (LS-8384): documented the persistent-container phantom typecheck/lint failure mode (symptom + workaround only — root cause of the underlying node_modules drift remains unidentified). 2026-07-27 (LS-8400): broadened Quirk 5 — the stream-closed failure reproduces without a webhook subscription and hit a second, unrelated tool (LS-8381, `delete_trigger`, closed `Won't Do`), confirming a shared core-harness root cause rather than a webhook-specific or single-server issue; not fixable in this repo, documentation-only update. 2026-07-27 (LS-8510): added the Claude Code Remote (CCR) platform to Step 0 and documented its chip-dispatch gap — `mcp__ccd_session__spawn_task` does not exist in CCR sessions; leaf-mode.md step 4 now branches to a file-and-note-for-manual-pickup fallback, with `create_trigger({ create_new_session_on_fire: true, run_once_at })` recorded as an unverified future substitute. Documentation-only; no dispatch primitive was wired or tested live. 2026-07-27 (LS-8589): added Quirk 6 — `~/.claude/stop-hook-git-check.sh` (a CCR-platform file, not tracked in this repo) false-positives "Unverified" on genuinely SSH-signed commits when `gpg.ssh.allowedSignersFile` is unset, because `%G?==N` is ambiguous between "unsigned" and "signed but locally unverifiable" for `gpg.format=ssh`. Confirmed by reproducing the exact `git verify-commit` error in an isolated throwaway repo under the same global signing config. Documentation-only — both candidate fixes (signers-file provisioning, hook detection logic) require CCR platform/session-image changes outside this repo's reach.

Re-verification commands for volatile facts:

- Chunk list/order: `grep -n "PC_CHUNKS" tools/mcp/nx-server/src/tools/run-pc-chunk.ts` and `grep -nE "^pc-[a-z-]+:" Makefile`
- Background hook behavior: `grep -n "make\\\\s+pc-" .agents/hooks/enforce-background.mjs` (exit 2 = block)
- Copilot server set + secrets: read `.github/copilot/copilot-cloud-mcp-config.json` and the header of `.github/workflows/copilot-setup-steps.yml`
- Review trigger semantics: `grep -n "bot:ready-for-review" .github/workflows/review.yml`
- App IDs: `grep -rn "3158619\|3142924" .github/actions/resolve-runner-label/action.yml`
- Cloud bootstrap contents: read `.claude/cloud-setup.sh` (gh/git-lfs installs removed 2026-07-02, commit "Remove GitHub CLI and git-lfs installation steps")
- pc-format auto-commit/dirty-tree behavior: `grep -n "_PC_FORMAT_RECIPE" Makefile`
- Jira site default: `grep -n "JIRA_SITE_URL_DEFAULT" tools/mcp/jira-server/src/netrc.ts`
