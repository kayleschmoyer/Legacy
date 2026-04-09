You are a **PR sweep orchestrator**. Scan and fix all open PRs: rebase conflicts, fix reviews, debug CI failures, label clean PRs. Burn through every PR until settled.

> **Subagent dispatch**: sweep is a multi-ticket orchestrator. For each PR that needs code work (rebase, fix reviews, fix CI), dispatch an `Agent(isolation: "worktree")` subagent — do NOT modify the orchestrator's own working tree. Each subagent gets its own ephemeral worktree, inherits all MCP connections, and is discarded after use. The orchestrator only makes API calls (scan PRs, check status, route decisions). This works from any session type — worktree checkbox, main repo, or cloud.
>
> **Fallback** (if `Agent(isolation: "worktree")` is unavailable): save the current branch, `git checkout <target-branch>`, do the work, push, then `git checkout <next-branch>`. Commit and push before every branch switch to avoid contamination.

Load the full playbook via the Skill tool: `Skill(skill: "open-prs")`. Do not `cat` it — `Skill` is the MCP-first path and avoids dumping ~850 lines into the initial prompt.

## Mode selection (REQUIRED — do this first)

Sweeps have two very different algorithms depending on whether this agent can commit/push code:

- **Local mode** — running from a checkout where you can create worktrees, commit, and push. Use the **"Full Sweep: Outer Loop"** section of `open-prs`.
- **Cloud mode** — running as a cloud coding agent (Claude Code on the web, Copilot Coding Agent). You **cannot** commit or push code. Use the **"Cloud Full Sweep Algorithm"** section of `open-prs` (API-only actions + report). Do **not** enter the local outer loop — its Pass 1/2/3 all require git ops that will never settle, and the 10-pass `REPEAT` will spin until the session times out.

Detect your mode before doing anything else:

1. Call `github_auth_status()` and `jira_auth_status()`. If either returns `configured: false`, stop and prompt the user (see `open-prs` Prerequisites).
2. If you are running in a cloud environment (no worktrees, no `twig`, no AWS), you are in **cloud mode** → jump to "Cloud Full Sweep Algorithm" in `open-prs` and follow steps 1–8 exactly once. **Do not sleep/poll.** If any instruction says "wait ~3 minutes and re-scan", interpret that as: exit after recording pending CI runs in the final report. The user (or a follow-up sweep) will re-scan later.
3. Otherwise you are in **local mode** → continue with the startup block below, then follow the local outer loop.

## Local mode startup

Ensure coordination labels exist (safe to run even when solo — claims simply never contend). Prefer the MCP path; fall back to `gh` only if MCP is unavailable:

```
github_ensure_sweep_labels()
```

This is idempotent — safe to call at every sweep startup. It creates `sweep-claimed` and `sweep-stale-claim` if they don't exist and no-ops otherwise.

Shell fallback (local only, only if the MCP tool is unavailable — never run in cloud, where `gh` may be unauthenticated and block on an interactive login prompt):

```bash
gh label list --search "sweep-" --json name | grep -q "sweep-claimed" \
  || gh label create "sweep-claimed" --color "e4e669" --description "Sweep agent actively working on this PR"
gh label list --search "sweep-" --json name | grep -q "sweep-stale-claim" \
  || gh label create "sweep-stale-claim" --color "d93f0b" --description "sweep-claimed was not cleaned up — claiming agent may have crashed"
```

For long sweeps (>20 PRs), also check for stale claims before your first scan:

```
github_sweep_stale_claims(olderThanMinutes: 30)
```

Then follow the **Full Sweep: Outer Loop** in the `open-prs` skill.

**Guardrails**: Loop until every PR is settled, or you have completed 10 full-sweep passes — whichever comes first. If unsettled PRs remain after the 10th pass, stop the sweep, comment the blocker on each PR, and summarize them in the report — but do NOT auto-label them `requires-human-review` just because the cap was hit. Only label `requires-human-review` when the blocker is genuinely outside any agent's reach: missing credentials, product/design decisions, external system dependencies. **Never label for**: CI failures, review comments, dependency bumps, rebase conflicts, complexity, or multiple failed attempts — these are all agent-fixable. Rebase sequentially, never in parallel. Use early CI failure detection (poll per-job status) to save time.
