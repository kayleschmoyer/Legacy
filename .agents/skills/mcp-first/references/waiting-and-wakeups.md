---
name: waiting-and-wakeups
description: 'Single home for how an agent session waits for external work and what it does when woken. Load when: arming a PR watch, idling on an open PR, scheduling a check-in, waiting on a CI run or background job, or deciding whether a wake needs action.'
---

# Waiting and Wake-ups

> **This file is the single home for wake doctrine.** Every other skill links here rather than restating it. If you are about to write "arm the watch", "schedule a check-in", or "do not poll" somewhere else, link instead — this fact has drifted across six files before (see [Provenance](#provenance-and-maintenance)).

## The rule

**Never poll in-context.** No `sleep`/`Start-Sleep` loops, no repeated `ci_view_run` / `github_view_pr` reads, no capped "retry 5 times with 30-second gaps". Every such read re-sends the whole conversation context; a loop of them burns 1–2M tokens per session. Wait harness-side, or arm a wake and end the turn.

## Choosing a wake source

| Situation                                                               | Use                                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded wait on a known run or job (seconds to minutes)                 | The tool's own blocking wait: `ci_wait_run`, `ci_dispatch_workflow({ waitForCompletion: true })`, `make_run_wait`, `nx_job_wait`, `worktree_job_wait`. Resolves in-turn — cheapest option there is        |
| Long-running local command                                              | `Bash(run_in_background: true)` — the harness re-invokes you on exit. **Never** also schedule a check-in for it                                                                                           |
| Open PR, `gh` CLI available (local, standard cloud)                     | `Monitor` + `scripts/watch-pr.sh` by **absolute** path — event-filtered, deduped, polls harness-side at zero tokens. The primary wake source wherever it runs                                             |
| Open PR, no `gh` (Claude Code Remote)                                   | [Periodic Wake Protocol](#periodic-wake-protocol) below — chained one-shot reminders                                                                                                                      |
| User asked for a "trigger" instead of a `Monitor` watch                 | `CronCreate({ recurring: false })`, chained — it fires back into **this** session with full MCP. **Not** a cloud routine: see [Three different scheduling channels](#three-different-scheduling-channels) |
| Non-PR condition nothing will push (blocker ticket, main-branch health) | `Monitor` long-poll — the sanctioned carve-out. See [e2e-hold Phase D](../../pr-lifecycle/references/e2e-hold.md)                                                                                         |

`watch-pr.sh` cannot run in CCR: `gh` is absent and the proxy injects real GitHub credentials only for pinned `gh`/GitHub-MCP operations, so direct REST/GraphQL 403s. It fails fast and loud there rather than watching silently.

## Two different `subscribe_pr_activity` tools

A name collision that has produced contradictory guidance across skills — they are **not** the same tool:

- `mcp__github__subscribe_pr_activity` — a **Claude Code built-in**, absent from most sessions and never part of the custom `legacy-sports-github` server. Its absence is not a monitoring failure; PR events reach a bound session without it.
- `mcp__Claude_Code_Remote__subscribe_pr_activity` — the **CCR** server tool, present only in Claude Code Remote sessions.

Before citing either, probe the session with `ToolSearch` rather than assuming. Neither is a substitute for an armed wake: delivery is an accelerant, and merge-conflict transitions from `main` advancing are never delivered at all — see [Conflicted and behind](#conflicted-and-behind-ls-10377).

## Periodic Wake Protocol

> **Applies to any wake — timer or notification.** The classification reads the PR's current state and the stored previous state; it never asks what woke you. Written this way, the wake source is a tuning knob rather than a precondition.

### Cadence

~20 minutes between wakes. **Which primitive gets you there is the part that has gone wrong in practice** — see below.

### Three different scheduling channels

Several similarly-named primitives can "schedule a check-in", and they differ on **two** axes, not one. Durability is the obvious axis; **MCP reach is the decisive one**, because the [Wake procedure](#wake-procedure--one-turn-two-calls) below — and the on-merge spine steps it hands off to (transition Jira, run the gap audit) — are built entirely out of `mcp__*` calls. A channel without them can report; it can never close the loop.

| Channel                                                     | Where it runs                                       | MCP access                                  | Survives session end                                                                  |
| ----------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `CronCreate` (harness built-in)                             | locally, fires back into **the current session**    | **Full** — every tool this session has      | **No** — in-memory; dies with the session (its `durable` flag is a documented no-op)  |
| `mcp__scheduled-tasks__create_scheduled_task` (`fireAt`)    | locally, a **fresh session per run**                | this machine's local MCP config             | Yes — but only while the app runs; a task due while it is closed fires on next launch |
| `RemoteTrigger` routine (`run_once_at` / `cron_expression`) | Anthropic cloud, isolated checkout                  | **None of this repo's servers** — see below | Yes                                                                                   |
| `mcp__Claude_Code_Remote__send_later`                       | CCR only — **absent from local and standard cloud** | the CCR session's own surface               | n/a — posts back into the CCR session                                                 |

**Default for PR follow-up is environment-conditional — the two channels are not interchangeable:**

- **Local sessions:** `CronCreate` with `recurring: false`, one link at a time. It is the only channel there that puts the Wake procedure's own tools in reach, and it persists correctly across session boundaries in this environment. Its one stated weakness — dying with the session — is real but orthogonal to a check-in measured in tens of minutes, and the loop is already bounded (`cycleCount >= 12`).
- **CCR (cloud) sessions:** `mcp__Claude_Code_Remote__send_later`, per the [Periodic Wake Protocol](#periodic-wake-protocol) above. `CronCreate` in a CCR session dies along with the session itself — it is **not** durable there, so it must never be used as the CCR default. This is not hypothetical: a CronCreate-based follow-up in a CCR session silently dropped once, leaving a PR dormant for 37 hours and 113 commits behind main (LS-10054) — see AGENTS.md's own documented rule on this.

Reach for `scheduled-tasks` (`fireAt`) only when the follow-up genuinely must **outlive** this session, accepting that each run starts cold: no transcript, no context beyond what the prompt and `.claude/.pr-state-<N>.json` carry.

**Do not use a cloud routine for PR follow-up.** Two independent reasons:

- **Reach.** The MCP servers configured in Claude Code — `legacy-sports-*`, `worktree`, `nx`, `make` — are **never** attachable to a routine. Routines can only use **claude.ai** connectors, a separate set the user manages at <https://claude.ai/customize/connectors>. So even on an account with connectors configured, a routine has no `github_pr_batch_status`, no `jira_transition`, no `nx_run_pc_chunk`. (Whether _any_ claude.ai connector is attachable varies by account, and the `schedule` skill cannot always enumerate them — it reports the list as unloadable when the session's login token lacks the MCP-connectors permission. The repo-server exclusion holds either way, which is why it, not the connector count, is the load-bearing fact.)
- **Cadence.** Recurring routines enforce a **one-hour minimum** ([routines docs](https://code.claude.com/docs/en/routines#add-a-schedule-trigger), verified 2026-09-03); `*/20 * * * *` is rejected. Only `run_once_at` escapes it, which forces chaining anyway.

### If you do need a routine: the `environment_id` trap

For legitimately cloud-shaped work (a nightly sweep, anything that must run with this machine off), the `RemoteTrigger` create schema and the account's environment IDs live in the **`schedule` skill** — `Skill(skill: "schedule")` — not here. One trap it documents and the tool description does not:

`job_config.ccr.environment_id` is **required**, but `RemoteTrigger`'s own tool description omits it, and a create without it fails with `job_config must set ccr.environment_id`. You cannot recover the shape from `action: "list"` either: pre-existing routines were created under the **v1** `job_config` schema and carry no `environment_id`, and the server translates v1→v2 on read — so copying a listed routine's shape yields a body that `create` rejects. Take the schema from the skill, not from a listing.

### Wake procedure — one turn, two calls

Issue both in a single turn:

1. `github_pr_batch_status({ prs: [N], compact: true })` — `mergeable`, `ciSummary`, `failedJobs`, `unresolvedThreads`, `labels` in one call. The compact `ciSummary` is authoritative: since LS-10116 it counts only genuine failures (FAILURE/ERROR/TIMED_OUT/ACTION_REQUIRED/STARTUP_FAILURE), so a CANCELLED merge-queue attempt no longer reads as `fail` and there is no need to re-call the full form to check `ciJobs`. Superseded jobs appear in `cancelledJobs` when you need them.
2. `Read` `.claude/.pr-state-<N>.json` — `{ sha, mergeable, conflicted, behind, ciSummary, unresolvedThreads, idleCount, cycleCount, lastCheckedAt }`

`conflicted` and `behind` are booleans the wake computes and writes back each time (see [Conflicted and behind](#conflicted-and-behind-ls-10377)); a state file written before this schema lacks them — treat a missing field as `false` and write it on this wake. `sha` is the head SHA the other fields were read at.

The **state file is the memory, not the transcript** — it survives compaction and keeps every wake cheap.

### Classification

| Condition                                                         | Action                                                                                                                                                                                                                                                                                                                                   | Re-arm?           |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Burst guard: `lastCheckedAt` < 5 min ago **and** state unchanged  | Return immediately — **zero further tool calls**                                                                                                                                                                                                                                                                                         | No (one is armed) |
| `MERGED` / `CLOSED`                                               | Post-merge cleanup ([drive.md Step 7](../../pr-lifecycle/references/drive.md#step-7-post-merge)); delete the state file                                                                                                                                                                                                                  | **No**            |
| **Conflicted** (any of the three signals — see below)             | Rebase onto `main` per the [rebase-vs-merge rule](../../worktree-workflow/references/rebase.md#rebase-vs-merge-main-one-rule-ls-10377), stabilize, validate, push. Set `conflicted: true` until the next wake confirms it cleared. **Do not** re-apply `bot:ready-for-review` as the response to a conflict                              | Yes               |
| **Behind** (`mergeable` clean, branch behind `main`, no conflict) | Same rebase, but only when it is cheap to do now (no review in flight — [force-push warning](../../pr-lifecycle/references/common-review-patterns.md#ci--reviewer-infrastructure-recovery-recipes)). The merge queue does not require up-to-date (`strict=false`), so behind alone never blocks merge — do not rebase just to be current | Yes               |
| CI failure, unresolved threads, or `CHANGES_REQUESTED`            | Fix it. Triage per the [Triage Table](../../pr-lifecycle/references/ci-event-response.md#triage-table)                                                                                                                                                                                                                                   | Yes               |
| `ciSummary: pending` / checks still running                       | Nothing to do — waiting _is_ working. Reset `idleCount` to 0                                                                                                                                                                                                                                                                             | Yes, **silent**   |
| No change, nothing running, `idleCount` < 3                       | Increment `idleCount`. Nothing else                                                                                                                                                                                                                                                                                                      | Yes, **silent**   |
| No change, nothing running, `idleCount` == 3                      | Stall playbook: re-apply `bot:ready-for-review` as the **last** label op, per [Pipeline Skipped / Never Ran](../../pr-lifecycle/references/ci-event-response.md#pipeline-skipped--never-ran)                                                                                                                                             | Yes               |
| `idleCount` >= 6 (~2h) with the stall playbook already tried      | Genuine wedge: apply `requires-human-review` and post the blocker naming what a human must do                                                                                                                                                                                                                                            | **No — terminal** |
| `cycleCount` >= 12                                                | Budget exhausted — same as above                                                                                                                                                                                                                                                                                                         | **No — terminal** |

Increment `cycleCount` on every wake; write the state file back on every branch except the burst guard.

### Conflicted and behind (LS-10377)

`mergeable` alone is not a conflict signal — it flips to `UNKNOWN` every time `main` advances and can stay stale for minutes, and no event is ever delivered for a conflict that `main` advancing caused. Classify **conflicted** when **any one** of these holds (the same union `github_pr_why_blocked` / `github_pr_diagnose` / `github_pr_scan` use — [conflict-signals.ts](../../../../tools/mcp/github-server/src/conflict-signals.ts)):

1. `mergeable: CONFLICTING`
2. the `CI: Conflicts` label is present (in `labels`)
3. the required **No Merge Conflicts** check is failing (`failedJobs`)

`mergeable: UNKNOWN` with none of 2–3 present is **not** yet conflicted: write `mergeable: UNKNOWN`, treat it as pending, and re-evaluate on the next wake — the label and check come from a deterministic local `git merge` test and are authoritative when they disagree with the GraphQL hint. If `UNKNOWN` persists across two consecutive wakes (~40 min), run `github_pr_why_blocked({ prNumber: N })` once to get the unioned verdict, and act on that. The label and check clear on their own after the rebase push — never remove the label yourself.

**Behind**: the head is not a descendant of `origin/main` (`git merge-base --is-ancestor origin/main HEAD` non-zero, or the batch status reports it behind). Record it in `behind`; it is informational unless something else needs a push anyway.

**Never re-apply `bot:ready-for-review` as the response to a conflict.** A conflict is fixed by pushing the rebased branch; the `synchronize` event re-fires CI and review by itself, and the label should already be on. Check the label is present on the new head and add it only if it is missing — the single sanctioned exception is the [stall playbook](../../pr-lifecycle/references/ci-event-response.md#pipeline-skipped--never-ran) above.

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

## The stop hook recognizes three idle channels (LS-9961)

`.claude/hooks/check-open-pr.sh` (the stop hook backing [Drive to merge](../../../../AGENTS.md)) used to recognize only an armed `Monitor` watch on `scripts/watch-pr.sh` (`.claude/.pr-watch-armed-<N>`, heartbeated every poll) as proof a session is safe to idle on an open PR. CCR sessions have no `gh` CLI, so that channel never applies to them — they follow the Periodic Wake Protocol above instead — and the hook wrongly blocked them even when they were doing exactly the right thing.

The hook now also treats a fresh `.claude/.pr-state-<N>.json` — the Periodic Wake Protocol's own [state file](#wake-procedure--one-turn-two-calls) — as proof that a chained CronCreate/scheduled-task one-shot reminder is outstanding. No new breadcrumb format was invented: the protocol's [invariant #2](#invariants) ("exactly one outstanding reminder") already guarantees that a non-terminal PR has a live reminder chained at all times, so the state file's own mtime is sufficient evidence. Concretely, the hook allows stop when:

- `.claude/.pr-state-<N>.json` exists,
- its mtime is less than 1800s (30 min — the ~20 min cadence plus buffer for a wake still in flight) old, and
- it does **not** record a terminal condition (`idleCount >= 6` or `cycleCount >= 12`) — those branches deliberately do not re-arm, so a stale-but-recent terminal file must NOT be read as "a reminder is armed."

This makes writing/refreshing the state file on every wake (as the protocol already requires) double as the detectability breadcrumb — no extra file, no extra write. A session following the protocol correctly is automatically unblocked; a session that stops writing the state file (i.e. actually abandons the loop) falls through to the normal block/bypass guard, which is the desired behavior.

The (a) Monitor-watch and (b)/(c) state-file channels are checked independently and either one is sufficient — a session is never required to run both. When neither is fresh, the hook's blocking message names all three sanctioned idle channels ((a) Monitor watch where `gh` is available, (b) the Periodic Wake Protocol's chained one-shot with a fresh state file, (c) "any equivalent breadcrumb this hook recognizes" as a forward-compatible catch-all) rather than only the `gh`-dependent one.

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
- Whether a cloud routine can reach any MCP tooling on **this** account: `Skill(skill: "schedule")` and read its Setup Notes. This repo's own MCP servers are excluded unconditionally; the claude.ai connector list is account-scoped, and was unloadable when checked 2026-09-04
- `watch-pr.sh` emission contract: header comment in `scripts/watch-pr.sh`

2026-09-04 (LS-9835): §Cadence previously ranked scheduling channels on durability alone, named `send_later` / `run_once_at` (a CCR-only tool and a cloud-routine field, neither reachable from a local session), and mentioned `CronCreate` only as a disqualifier — so it steered a local session to a cloud routine, which structurally cannot run the Wake procedure defined three sections below it. Replaced with the three-channel comparison above, modelled on [Two different `subscribe_pr_activity` tools](#two-different-subscribe_pr_activity-tools).

2026-09-09 (LS-9961): The stop hook only recognized the `Monitor`-watch channel, wrongly blocking CCR sessions correctly following this file's own Periodic Wake Protocol. Added [The stop hook recognizes three idle channels](#the-stop-hook-recognizes-three-idle-channels-ls-9961) documenting that the hook now also treats a fresh, non-terminal `.claude/.pr-state-<N>.json` as proof a reminder is armed.

2026-09-11 (LS-10054): §Three different scheduling channels named `CronCreate` as the unconditional default for PR follow-up, contradicting AGENTS.md's documented rule that `CronCreate` dies with the session in CCR and is not durable there. A CronCreate-based follow-up in a CCR session silently dropped, leaving a PR dormant 37 hours and 113 commits behind main. Made the default environment-conditional: `CronCreate` for local sessions, `mcp__Claude_Code_Remote__send_later` (Periodic Wake Protocol) for CCR.

2026-10-02 (LS-10377): the wake classification had one combined "Conflicts, CI failure, threads" row, no conflicted/behind state, and a state file with no conflict field — so a conflict caused by `main` advancing (never delivered as an event) was invisible, and `mergeable: UNKNOWN` was read as "wait". Added the `conflicted`/`behind` state fields, the three-signal conflicted test, a behind row, and the never-re-apply-`bot:ready-for-review`-on-conflict rule. Same ticket settled rebase-vs-merge-main ([rebase.md](../../worktree-workflow/references/rebase.md#rebase-vs-merge-main-one-rule-ls-10377)), added the `strict=false` note to merge-queue-guide, and moved rebase validation to chunked `pc-*`.
