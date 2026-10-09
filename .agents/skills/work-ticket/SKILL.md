---
name: work-ticket
description: 'Autonomously implement a Jira ticket end-to-end. For leaf tickets (task/story/bug with no children): blocker check, auto-enrich the ticket via an isolated research subagent if underspecified, worktree, code, validate, PR, Jira transition. For all Epics: auto-batch-dispatch chips for all unblocked To Do descendants without asking the user. For Story/Task parents with To Do children: never implements the parent itself — gathers To Do descendants and asks the user how to dispatch (chips for all / pick one / chips for a subset). Pass --batch to skip the prompt and chip-dispatch every unblocked To Do descendant. Updates ticket and parent statuses automatically. Runs MCP gap audit before finishing. Load when the user gives a ticket key and expects autonomous completion.'
metadata:
  scope: '**'
---

# Skill: Work Ticket

You are the **chief operator** for this ticket. The operator loop:

**Orient** (read everything, quote the ACs back) → **Route** (leaf vs parent) → **Delegate or execute** → **Verify** (validation + AC evidence + self-review) → **Hand off** (drive to merge, durable notes, gap audit).

This file owns orientation and routing. Each mode's execution playbook lives in a reference — read the matching reference **end to end** before executing that mode:

| Mode                                                    | When                                                                                  | Playbook                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Leaf** — implement solo                               | task/story/bug with no To Do leaf descendants                                         | [references/leaf-mode.md](references/leaf-mode.md)                                     |
| **Parent Dispatch** — enumerate, then ask the user      | Story/Task with To Do children, no `--batch`                                          | [references/dispatch-modes.md](references/dispatch-modes.md)                           |
| **Sliced-tracking** — repair or report, never implement | Story/Task with no descendants but `sliced` label / `Sliced into:` comment (LS-11007) | [references/orient.md](references/orient.md#sliced-story-with-relates-linked-children) |
| **Batch dispatch** — one chip per child, no prompt      | any Epic (always); `--batch`; or phrasing like "work all tickets under LS-####"       | [references/dispatch-modes.md](references/dispatch-modes.md)                           |

**Never implement a sliced ticket itself** (an Epic, or a Story/Task marked `sliced`) — it routes to dispatch or sliced-tracking.

**Never implement an Epic itself.** Epic input always routes to dispatch — the user's intent when targeting an epic key is "work down this backlog", never "implement the first child in my session".

## When to Use

- User provides a Jira ticket key and expects autonomous implementation
- User says "work on LS-####" or "implement LS-####"
- Processing a backlog of tickets under an epic

## Arguments

```
work-ticket <ticket-key> [--batch]
```

| Argument       | Required | Description                                                                                                                                                                                        |
| -------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<ticket-key>` | Yes      | Jira ticket key to work (e.g. `LS-1234`)                                                                                                                                                           |
| `--batch`      | No       | For parent tickets: skip the user prompt and dispatch one chip per unblocked To Do descendant. Mechanics: [references/dispatch-modes.md](references/dispatch-modes.md). No effect on leaf tickets. |

`--batch` is implied when the input ticket is an **Epic**, or the user's phrasing says "work all tickets under…", "process the full backlog", or "implement all children of…".

## Completion contract

> **Precondition: write the full completion checklist into TaskCreate before starting.** Any ticket that produces a code change is complete only when the PR is **merged**, Jira is **Done**, and the MCP gap audit has run. At the start of work, create these tasks (and do not mark the parent ticket complete until each is `completed`):
>
> 1. `Open draft PR` — `github_open_pr({ draft: true })`
> 2. `Mark PR ready for review` — `github_mark_pr_ready({ number })` + apply `bot:ready-for-review`
> 3. `Reply to every Reviewer Bot thread` — `FIX: <sha>` / `JUSTIFY:` / `CANNOT-COMPLY:`
> 4. `PR merged` — `github_view_pr` returns `state: "MERGED"`
> 5. `Jira Done` — auto-transition fires on merge; verify
> 6. `MCP gap audit` — run or skip-with-reason per `.agents/skills/mcp-first/references/gaps.md`
>
> Each task is the gate to the next. `make pc` passing closes no tasks. PR open closes only task 1. Stopping before task 4 leaves the ticket unfinished — this is the single most common agent failure mode.

## Delegation rules

> **Child-ticket dispatch uses `mcp__ccd_session__spawn_task` — never `Agent`.** Only `spawn_task` produces a separate session with its own worktree, its own context window, and a visible UI chip — all required for the child to drive a PR to merge independently. `Agent(...)` creates an in-context subagent sharing this session's context and worktree: a categorically different operation that will not produce the right result. If `spawn_task` is unavailable (ToolSearch returns no result), stop and inform the user; do not substitute `Agent(...)`.
>
> **Exception — the Step 1c enrichment subagent is not chip dispatch.** Fleshing out an underspecified ticket intentionally uses an in-context `Agent(...)` subagent so its codebase research stays out of the working agent's context; it writes only a Jira description and never claims a ticket or drives a PR. See [references/enrich-ticket.md](references/enrich-ticket.md).

## Step 0: Session initialization

Register the active worktree before any worktree MCP tool, then verify Jira auth (including the retry-once rule for a plain connection error, and the stop-condition when the hosted connector never registers at all): **[references/session-init.md](references/session-init.md)**.

## Step 1: Orient — read the whole ticket

Read the ticket end to end — the summary is never sufficient — resolve the parent/child shape, check blockers, and decide the dispatch mode: **[references/orient.md](references/orient.md)**.

## Step 1b: Plan

After inspecting the ticket, run the [planning reference](../plan-ticket/references/planning.md) before implementation. Agents that skip planning produce code that works in isolation but misses constraints, breaks adjacent systems, or solves the wrong problem — a 5-minute planning phase prevents 45-minute rework cycles.

1. **Scope assessment** — classify as Trivial/Low/Medium/High (see planning skill Step 1). Trivial tickets (typo fix, doc-only) skip planning entirely — don't over-plan.
2. **Code reconnaissance** — read the target files, their imports, consumers, and tests before proposing changes.
3. **Risk classification** — Low (2-3 min): single-file, no schema/infra · Medium (5-10 min): multi-file, business logic, schema, new components · High (10-15 min): auth, payments, infra, migrations, cross-service.
4. **Planning output** — carry forward: goal statement ("I am changing X because Y"), risk level, file plan, constraints, verification plan.

When creating the Jira ticket (if one doesn't exist), capture planning context in the structured fields:

```
jira_create_ticket(summary: "type(scope): description", context: "<why>", risk: "<Low|Medium|High> — <reasoning>", planningNotes: "<files, constraints, dependencies>", sprint: "current")
```

## Step 1c: Underspecified? Enrich via a research subagent

A ticket is **complete** if it has all three of:

1. **Acceptance Criteria** — at least one testable `- [ ]` condition (or equivalent unambiguously verifiable prose)
2. **Technical Approach** — _what_ to change and _where_ (file paths, systems, APIs), even if brief
3. **A clear Problem statement** — why this work exists, not just what to do

> **Exception — Bug tickets**: a clear repro scenario plus expected-vs-actual behaviour satisfies the completeness check even without a formal `## Acceptance Criteria` section.

If the ticket is complete, continue to Step 2. If **any** of the three is missing, enrich it now — dispatch the in-context research subagent per [references/enrich-ticket.md](references/enrich-ticket.md) (do not ask the user for permission; proceed autonomously). Do not skip this step to save time: an underspecified ticket produces an underspecified implementation, and fixing misaligned scope after a PR is open costs more than enriching the ticket now.

When the subagent returns, **re-read the enriched ticket into your own context** (`jira_view(key: "LS-####")`) before continuing. If its summary flags an Open Question that blocks safe implementation, **stop and surface it to the user** rather than guessing.

## Step 2: Execute the mode

- **Leaf** → follow [references/leaf-mode.md](references/leaf-mode.md) steps 1–11: claim → worktree → TodoWrite spine checklist → implement → commit/push/draft PR → migrations + validate → AC verification + self-review → mark ready → watch to merge → gap audit → tracking tasks.
- **Parent Dispatch / Batch dispatch** → follow [references/dispatch-modes.md](references/dispatch-modes.md): enumerate To Do descendants, skip blocked ones, spawn one chip per child (chips claim their own tickets atomically), report the dispatched/skipped sets, stop.

## Step 3: MCP gap audit

After the leaf PR merges (or all dispatched work is reported), invoke `Skill(skill: "mcp-gap-audit")` to run Phase 1 (Audit): review all Bash commands and MCP overflows from this session, classify gaps (`missing-tool` / `missing-feature` / `missing-awareness`), check for existing tickets under the current bucket epic (`jira_get_bucket_epic({ bucket: 'mcp-gaps' })`), and file new ones. Check the **minimum threshold** in that skill first — skip if the session was shallow (< 10 Bash calls, no tool failures, no novel shell patterns). This is how the system gets patched — it is **mandatory** above the threshold.

## Step 4: Report results

Summarize: tickets worked (keys + PR links) · tickets released back to To Do (+ reasons) · tickets skipped (+ blockers) · parent status and remaining blocked children · gap audit outcome (gaps found, tickets created).

## Status Transition Rules

These rules apply to both leaf and parent tickets:

| Transition               | When                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| To Do -> In Progress     | Work begins (after blocker check passes)                                                                                                              |
| In Progress -> In Review | PR is created, marked ready, and PR activity subscribed                                                                                               |
| In Review -> Done        | PR is merged. Usually handled automatically by Jira Branch Sync on merge — fall back to `jira_transition(key: "LS-####", status: "Done")` if it lags. |

The skill shepherds the PR all the way to "merged" (Leaf Mode step 9). It does NOT exit at "In Review".

**Parent status mirrors children:** parent moves to In Progress when the first child starts; to In Review only when ALL children are at least In Review; to Done only when ALL children are Done. Never transition a parent ahead of its children.

## Cross-cutting gotchas

- **Always check blockers before starting** — working a ticket whose blocker is still in progress wastes effort; `jira_get_all_descendants` returns blocker state inline.
- **One ticket = one worktree = one PR** — never combine children into one branch; unrelated findings become a follow-up ticket + chip (see leaf-mode).
- **Paginate child listings** — `jira_list_children` defaults to 25 results/page, `jira_search` to 15. Always pass `limit: 100` and paginate via `pageToken` until `nextPageToken` is absent (the absence of `nextPageToken`, not a `total` comparison, is the truncation signal — `total` reflects page size). Failing to paginate caused the LS-2079 premature-epic-Done incident.
- **Checkpoints are not the finish line** — `github_open_pr`, `make pc` green, and `github_mark_pr_ready` each close at most one completion-contract task. The skill ends at **merged** + gap audit + tracking tasks complete.

## Provenance and maintenance

- 2026-07-06 (LS-8356): restructured into a lean chief-operator loop — SKILL.md keeps orientation + routing; Leaf Mode moved to `references/leaf-mode.md`, Parent Dispatch + batch modes and chip templates to `references/dispatch-modes.md`, the Step 1c enrichment subagent prompt to `references/enrich-ticket.md`. Content moved verbatim, not rewritten.
- 2026-07-06: Step 1c enrichment moved from an inline `Skill(skill: "define")` call to a dispatched in-context `Agent` subagent (see `references/enrich-ticket.md` for rationale and prompt).
- 2026-07-02: Leaf Mode step ordering and the TodoWrite checklist re-derived from the ticket-to-merge spine (draft PR **before** validation) during the skills audit; Epic→Epic parentage reworded as an empirically-observed fact of this Jira project.
- Verify ordering: diff the numbered steps in `references/leaf-mode.md` against `.agents/skills/workflow-overview/references/ticket-to-merge-spine.md` — on any disagreement the spine wins.
- Verify pc chunks exist: `grep -nE '^pc-[a-z-]+:' Makefile`
