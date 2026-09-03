---
name: waiting-and-wakeups
description: 'Single home for how an agent session waits for external work and what it does when woken. Load when: arming a PR watch, idling on an open PR, scheduling a check-in, waiting on a CI run or background job, or deciding whether a wake needs action.'
---

# Waiting and Wake-ups

> **This file is the single home for wake doctrine.** Every other skill links here rather than restating it. If you are about to write "arm the watch", "schedule a check-in", or "do not poll" somewhere else, link instead — this fact has drifted across six files before (see [Provenance](#provenance-and-maintenance)).

## The rule

**Never poll in-context.** No `sleep`/`Start-Sleep` loops, no repeated `ci_view_run` / `github_view_pr` reads, no capped "retry 5 times with 30-second gaps". Every such read re-sends the whole conversation context; a loop of them burns 1–2M tokens per session. Wait harness-side, or arm a wake and end the turn.

## Choosing a wake source

| Situation                                                               | Use                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded wait on a known run or job (seconds to minutes)                 | The tool's own blocking wait: `ci_wait_run`, `ci_dispatch_workflow({ waitForCompletion: true })`, `make_run_wait`, `nx_job_wait`, `worktree_job_wait`. Resolves in-turn — cheapest option there is |
| Long-running local command                                              | `Bash(run_in_background: true)` — the harness re-invokes you on exit. **Never** also schedule a check-in for it                                                                                    |
| Open PR, `gh` CLI available (local, standard cloud)                     | `Monitor` + `scripts/watch-pr.sh` by **absolute** path — event-filtered, deduped, polls harness-side at zero tokens. The primary wake source wherever it runs                                      |
| Open PR, no `gh` (Claude Code Remote)                                   | [Periodic Wake Protocol](#periodic-wake-protocol) below — chained one-shot reminders                                                                                                               |
| Non-PR condition nothing will push (blocker ticket, main-branch health) | `Monitor` long-poll — the sanctioned carve-out. See [e2e-hold Phase D](../../pr-lifecycle/references/e2e-hold.md)                                                                                  |

`watch-pr.sh` cannot run in CCR: `gh` is absent and the proxy injects real GitHub credentials only for pinned `gh`/GitHub-MCP operations, so direct REST/GraphQL 403s. It fails fast and loud there rather than watching silently.

## Two different `subscribe_pr_activity` tools

A name collision that has produced contradictory guidance across skills — they are **not** the same tool:

- `mcp__github__subscribe_pr_activity` — a **Claude Code built-in**, absent from most sessions and never part of the custom `legacy-sports-github` server. Its absence is not a monitoring failure; PR events reach a bound session without it.
- `mcp__Claude_Code_Remote__subscribe_pr_activity` — the **CCR** server tool, present only in Claude Code Remote sessions.

Before citing either, probe the session with `ToolSearch` rather than assuming. Neither is a substitute for an armed wake: delivery is an accelerant, and merge-conflict transitions from `main` advancing are never delivered at all.

## Periodic Wake Protocol

> **Applies to any wake — timer or notification.** The classification reads the PR's current state and the stored previous state; it never asks what woke you. Written this way, the wake source is a tuning knob rather than a precondition.

### Cadence

Cloud **routines** enforce a **one-hour minimum** on recurring schedules — a recurring 20-minute routine is rejected ([routines docs](https://code.claude.com/docs/en/routines#add-a-schedule-trigger), verified 2026-09-03). Use chained **one-shot** reminders (`send_later` / `run_once_at`, no minimum) at ~20 minutes. `CronCreate` is session-only and in-memory, so it dies with the session — never use it for a watch that must outlive one.

### Wake procedure — one turn, two calls

Issue both in a single turn:

1. `github_pr_batch_status({ numbers: [N], compact: true })` — `mergeable`, `ciSummary`, `failedJobs`, `unresolvedThreads` in one call
2. `Read` `.claude/.pr-state-<N>.json` — `{ sha, mergeable, ciSummary, unresolvedThreads, idleCount, cycleCount, lastCheckedAt }`

The **state file is the memory, not the transcript** — it survives compaction and keeps every wake cheap.

### Classification

| Condition                                                         | Action                                                                                                                                                                                       | Re-arm?           |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Burst guard: `lastCheckedAt` < 5 min ago **and** state unchanged  | Return immediately — **zero further tool calls**                                                                                                                                             | No (one is armed) |
| `MERGED` / `CLOSED`                                               | Post-merge cleanup ([drive.md Step 7](../../pr-lifecycle/references/drive.md#step-7-post-merge)); delete the state file                                                                      | **No**            |
| Conflicts, CI failure, unresolved threads, or `CHANGES_REQUESTED` | Fix it — the only branch that does work. Triage per the [Triage Table](../../pr-lifecycle/references/ci-event-response.md#triage-table)                                                      | Yes               |
| `ciSummary: pending` / checks still running                       | Nothing to do — waiting _is_ working. Reset `idleCount` to 0                                                                                                                                 | Yes, **silent**   |
| No change, nothing running, `idleCount` < 3                       | Increment `idleCount`. Nothing else                                                                                                                                                          | Yes, **silent**   |
| No change, nothing running, `idleCount` == 3                      | Stall playbook: re-apply `bot:ready-for-review` as the **last** label op, per [Pipeline Skipped / Never Ran](../../pr-lifecycle/references/ci-event-response.md#pipeline-skipped--never-ran) | Yes               |
| `idleCount` >= 6 (~2h) with the stall playbook already tried      | Genuine wedge: apply `requires-human-review` and post the blocker naming what a human must do                                                                                                | **No — terminal** |
| `cycleCount` >= 12                                                | Budget exhausted — same as above                                                                                                                                                             | **No — terminal** |

Increment `cycleCount` on every wake; write the state file back on every branch except the burst guard.

### Invariants

1. **Re-arming is conditional.** Terminal and wedge branches do **not** re-arm. Unconditional re-arm is what produces chains like `Re-check PR #7477 after rebase #17` — every fire creating the next regardless of outcome.
2. **Exactly one outstanding reminder.** Never create the next before the current has fired. Two live reminders double every subsequent wake.
3. **Silent branches are silent.** No prose, no PR comment, no Jira note, no status post. Most wakes should produce zero output — a no-op wake that narrates its own no-op is the noise this protocol exists to remove.
4. **"Nothing running" is not "nothing to do".** `ciSummary: pending` means waiting is correct. Nothing running _and_ no change means either the pipeline never fired (fixable — the stall playbook) or the PR is wedged (not fixable by re-arming; surface it).

### Ending the turn vs abandoning the loop

Ending your **turn** on a no-op is correct and expected — with the next wake armed, that is what makes a quiet wake cost nothing. Ending the **loop** means nothing is armed while the PR is still non-terminal; that is the abandonment failure. See [terminal states](../../pr-lifecycle/references/drive.md#terminal-states-the-only-places-this-loop-may-stop).

### Rollout: safe to run alongside existing notification wakes

The classification is wake-source-agnostic and the burst guard collapses a webhook burst into one real evaluation, so the timer path can be stood up **while** account-level PR monitoring (claude.ai `Auto-fix pull requests`, and any `subscribe_pr_activity` subscription) is still enabled — extra wakes cost one state-file read and return.

1. Ship the protocol; run with both channels.
2. Confirm the timer path alone catches what matters — in particular a **merge conflict from `main` advancing**, which is never delivered as a notification.
3. Only then disable account-level monitoring.

**Do not disable notification delivery before step 2** — until the timer path is proven it is the only wake source, and a silent failure there is an abandoned PR.

## Sanctioned carve-outs

Exactly two, both `Monitor`-based and both long-poll by design:

- **`scripts/watch-pr.sh`** — the canonical PR watch. Emits only actionable transitions (deduped per key+SHA, conflicts corroborated over 2 polls, informational labels ignored), heartbeats `.claude/.pr-watch-armed-<PR#>`, and dies loudly.
- **[e2e-hold Phase D](../../pr-lifecycle/references/e2e-hold.md)** — a 10-minute long-poll on blocker-ticket resolution and main-branch E2E health. These are genuinely not push events: nothing wakes the session when someone else's fix merges.

Anything else that polls is a bug.

## Provenance and maintenance

Created 2026-09-03 (branch `claude/reduce-agent-pr-noise-44c47a`) to end doctrine drift: wake guidance was restated across `AGENTS.md`, `pr-lifecycle/SKILL.md`, `pr-lifecycle/references/{ci-event-response,drive,create-pr,e2e-hold}.md`, `cloud-agent-mode/SKILL.md`, and `workflow-overview/references/error-recovery.md`, having drifted into two direct contradictions: a sanctioned "poll at most 5 times with 30-second gaps" fallback against the Tier-2 never-poll rule, and `subscribe_pr_activity` described as both required in CCR and optional/absent.

Re-verify volatile facts:

- Routines one-hour minimum and GitHub-trigger event list: <https://code.claude.com/docs/en/routines>
- Whether `subscribe_pr_activity` can be disabled from a CCR session: `ToolSearch("subscribe pr activity unsubscribe")` in a live CCR session — **OPEN as of 2026-09-03**
- `watch-pr.sh` emission contract: header comment in `scripts/watch-pr.sh`
