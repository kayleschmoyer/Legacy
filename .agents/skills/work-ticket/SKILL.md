---
name: work-ticket
description: 'Autonomously implement a Jira ticket end-to-end. For leaf tickets (task/story with no children): blocker check, worktree, code, validate, PR, Jira transition. For parent tickets (epic/story with children): iterate through child tickets, working each one to completion. Updates ticket and parent statuses automatically. Runs MCP gap audit before finishing. Load when the user gives a ticket key and expects autonomous completion.'
---

# Skill: Work Ticket

## Overview

Autonomously work a Jira ticket from To Do through to merge (or Done). Handles two modes:

1. **Leaf ticket** (task/story/bug with no children) — implement it solo using the standard worktree workflow
2. **Parent ticket** (epic/story with children) — iterate through child tickets, implementing each one

## When to Use

- User provides a Jira ticket key and expects autonomous implementation
- User says "work on LS-####" or "implement LS-####"
- Processing a backlog of tickets under an epic

## Steps

### Step 0: Verify Jira auth

```
jira_auth_status()
```

If `configured: false` or the call fails, **stop immediately** and tell the user:

> "Jira authentication is not configured or has expired. Please check your `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, and `JIRA_CLOUD_ID` env vars. Let me know once it's fixed and I'll continue — or if you're on Claude Code on the web and want me to fall back to the Atlassian plugin, just say so."

Do not proceed until auth is confirmed working or the user explicitly opts in to a fallback.

### Step 1: Inspect the ticket

```
jira_view(key: "LS-####")
```

Determine the ticket type and whether it has children:

```
jira_list_children(key: "LS-####", limit: 100)
```

> **Pagination required**: if the response contains `nextPageToken`, you must paginate (pass `pageToken` to subsequent calls) until `nextPageToken` is absent. Never assume the first page is complete — default limits (10-25) will silently truncate large epics.

| Condition                                           | Mode                                           |
| --------------------------------------------------- | ---------------------------------------------- |
| No children (or `jira_list_children` returns empty) | **Leaf mode** — implement this ticket directly |
| Has children                                        | **Parent mode** — work the children            |

### Step 2: Route to the correct mode

#### Leaf Mode (no children)

Follow the full [worktree-workflow skill](../worktree-workflow/SKILL.md):

1. **Blocker check**: `jira_check_blockers(key: "LS-####")` — STOP if blockers are not In Review/Done
2. **Jira "In Progress"**: `jira_transition(key: "LS-####", status: "In Progress")`
3. **Worktree**: `make_worktree_create(ticket: "####", description: "desc")` (add `parent: "LS-####"` if blocker is In Review). Shell fallback: `make worktree TICKET=#### DESC=description`
4. **Setup**: `make_wt_setup(worktreePath: "$wt")`. Shell fallback: `make wt-setup WT=$wt`
5. **Implement**: read the ticket description, investigate the codebase, write code + tests
   - **Bug tickets**: follow the [bug verification workflow](../debugging/SKILL.md#verification-by-bug-type) — reproduce the bug **before** writing any fix, then verify the fix resolves the reported behavior **after**. Include before/after evidence in the PR body under a `## Verification` section (appended after the standard template). `make pc` passing is necessary but not sufficient for bugs. The `## Verification` section is not part of the standard PR template -- add it manually for bug-fix PRs.
     5a. **Write implementation notes to Jira**: after completing the implementation (before committing), append an `## Implementation Notes` section to the Jira ticket description so sweep agents have context when fixing review feedback later. First read the current description via `jira_view`, then append:
   ```
   jira_edit_ticket(key: "LS-####", fields: { description: "<existing description>\n\n## Implementation Notes\n\n**Approach:** <1-2 sentences on what was done and why>\n\n**Key files changed:**\n- `path/to/file.ts` — reason\n- ...\n\n**Design decisions / constraints discovered:**\n- <any non-obvious choices, tradeoffs, or codebase constraints the agent found>\n\n**Testing:** <how correctness was verified — unit tests, manual repro, etc.>" })
   ```
   Preserve the original description and only append/refresh the `## Implementation Notes` section at the end. Keep notes factual and brief. Focus on information that is _not_ derivable from reading the diff: constraints, considered alternatives, and context that informs whether a review comment's suggested change is safe or problematic.
6. **Self-review**: run the [self-review phase](../pr-lifecycle/references/self-review.md) to catch rule violations
7. **Validate**: `db_migration_status(worktreePath: "$wt")` + `db_migrate(worktreePath: "$wt")`, then `make_run(target: "pc", worktreePath: "$wt")`. Shell fallback: `make pc`

   > **⛔ Do NOT stop here.** `make pc` passing is a checkpoint, not the finish line. If you exit the workflow at this point, the work is unfinished — keep going.

8. **Ship**: `worktree_commit({ message: "type(scope): msg" })` → `worktree_push()` → `github_create_pr(title: "LS-#### type(scope): msg", body: "<markdown>", worktreePath: "$wt", draft: true)` → `github_manage_labels(number: <PR#>, add: ["agent-in-progress"])` → `github_mark_pr_ready(number: <PR#>)` → `github_request_review(number: <PR#>)` → `mcp__github__subscribe_pr_activity({ owner, repo, pullNumber: <PR#> })` → `jira_transition(key: "LS-####", status: "In Review")`. Apply the label while still a draft so the PR is already labeled when it becomes visible to sweeps. See [create PR](../pr-lifecycle/references/create-pr.md) only for PR body/title formatting and PR mechanics — this skill's step ordering overrides that reference: after PR creation, complete step 9 (watch to merge) first, then run the MCP gap audit in step 10 after merge.

   > **⛔ Do NOT stop here.** Creating the PR is also not the finish line. Subscribing to PR activity is mandatory — without it, CI failures and review comments do not stream back into the session and the watch-to-merge step in step 9 cannot react. If you exit after `github_create_pr` without subscribing and watching, the ticket is unfinished.

9. **Watch the PR through to merge** (REQUIRED — this step replaces "stop after PR"):
   - Monitor PR activity from the subscription. CI failures and Copilot review comments arrive as `<github-webhook-activity>` messages. When no events arrive for a while, poll explicitly: `github_view_pr({ number: <PR#> })` for status, `ci_list_runs({ branch: "<branch>", limit: 1 })` + `ci_view_run({ runId: <id>, includeJobs: true })` for CI.
   - **Investigate and fix every CI failure**. Use `ci_get_logs({ runId, errorSummary: true })` to grab the failed-step output. Common categories that this skill should fix automatically without escalation:
     - Stale branch / lint / format / type errors → fix locally, push (`worktree_commit` + `worktree_push`)
     - Branch behind `main` → run the [rebase skill](../rebase/SKILL.md) (`worktree_rebase` → `worktree_stabilize` → `make pc` → push)
     - Flaky tests → re-run via `ci_rerun({ runId, failedOnly: true })`; if persistent, dig in
   - **Respond to Copilot review comments**. Read threads with `github_get_review_threads({ number: <PR#>, unresolvedOnly: true })`, fix each issue in the worktree, push, reply via `github_reply_to_thread({ threadId, body: "addressed in <sha>" })`, then resolve via `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })`. Re-request review with `github_request_review({ number: <PR#> })` when the round is done. Cap at 2 review rounds before escalating to the user.
   - **Rebase against `main` as needed**. If the PR turns CONFLICTING after a merge, re-run the rebase skill — do not just label it for the sweep.
   - **Do not start unrelated work** while this PR is open. Do not exit the workflow. Do not mark the tracking task completed.
   - When the PR is merged (visible via the subscription or `github_view_pr` showing `merged: true`), proceed to step 10.

10. **MCP gap audit (after merge)**: follow [`skills/mcp-gaps/SKILL.md`](../mcp-gaps/SKILL.md) Phase 1 — review all Bash commands and MCP overflows from this session, classify gaps, file any new tickets under LS-1455. Mandatory.
11. **Complete tracking tasks**: call `TaskUpdate(taskId: <id>, status: "completed")` for every task tracking this ticket — **only after the PR is merged and the gap audit is complete**, never before. Marking the task complete while the PR is still open is a failure mode.

> After step 11, if this ticket is a child of a parent being processed in Parent Mode, return to the parent loop.

#### Parent Mode (has children)

Process children in iterative batches until the backlog is empty.

1. **Transition parent to In Progress** (if not already):

   ```
   jira_transition(key: "LS-####", status: "In Progress")
   ```

2. **Iterative batch loop** — repeat until no unblocked To Do children remain:

   ```
   all_worked = []      # cumulative across all batches
   all_released = []    # cumulative across all batches

   REPEAT:
     a. Enumerate ALL children (paginate if needed):
        jira_list_children(key: "LS-####", limit: 100)
        If nextPageToken is present, continue paginating until all pages
        are collected. Log: "Found N total children: X To Do, Y In Progress,
        Z In Review, W Done". Verify total == sum of status counts.
     b. Filter to unblocked To Do tickets (jira_check_blockers).
        Prefer tickets without dependencies on other children.
        Process in dependency order (blockers first).
     c. Select batch: pick up to 5 unblocked To Do tickets (use batch size 1 when using the drive-to-merge flow, since you must shepherd each PR to merge before claiming the next — bulk-claiming multiple tickets leaves them sitting "In Progress" without active work).
        → If none found → EXIT loop (no unblocked To Do tickets remain).
          Before exiting, verify pagination was fully exhausted (no
          `nextPageToken` remained after the last page) — if you exited
          pagination early, you have a pagination bug; do NOT exit the
          batch loop. If remaining children are blocked, report them. If
          some are already In Progress (e.g., being worked by another
          agent), skip and report those keys.
     d. Claim batch upfront: transition ALL selected tickets to "In Progress"
        before starting work on any of them. Use a single bulk call:
        jira_bulk_transition(keys: [...batch keys], status: "In Progress")
        Do not call jira_transition per ticket — one bulk call saves N round-trips.
     e. Work each child ticket via Leaf Mode (Step 2 above):
        - Each child gets its own worktree + branch + PR (one ticket = one PR)
        - After completing Leaf Mode step 8 for each child (mark PR ready, request
          Copilot review, and subscribe to PR activity), transition it to "In Review"
          via individual jira_transition — this happens one child at a time as each PR ships
        - Shepherd each child PR through to merge (watch CI, fix review comments, rebase as needed)
          before starting the next child — the child is not done until its PR is merged
        - Mark the child's tracking task completed (`TaskUpdate(taskId: <id>, status: "completed")`)
          **after the child PR merges and the gap audit is complete**, never at PR creation —
          marking tasks complete while the PR is still open is a failure mode
        - Clean up the worktree after the PR merges, before starting the next child
     f. Release uncompleted: any claimed ticket that did not reach "In Review":
        - If no PR exists → transition back to "To Do" via individual jira_transition
          (note: jira_bulk_transition does not support "To Do"; use single calls here)
        - If a PR/branch exists → keep "In Progress" and report for manual follow-up
     g. Append results to all_worked / all_released.
     → Loop back to step a.
   ```

3. **Update parent status** after all batches complete:

   > **Guard**: before transitioning parent, enumerate ALL children one final time by exhausting pagination (`nextPageToken` absent after last page). Confirm every child is In Review or Done — if even one is To Do or In Progress, do NOT transition parent to In Review.

   | Children state                                          | Parent status                                        |
   | ------------------------------------------------------- | ---------------------------------------------------- |
   | All children Done                                       | Transition parent to **Done**                        |
   | All children In Review or Done (none To Do/In Progress) | Transition parent to **In Review**                   |
   | Some children still In Progress                         | Keep parent **In Progress** — report those keys      |
   | Some children still To Do (all blocked)                 | Keep parent **In Progress** — report blocked tickets |

### Step 3: MCP gap audit

After all child PRs are merged, run the [mcp-gaps skill](../mcp-gaps/SKILL.md) Phase 1 (Audit):

1. Review all Bash commands from this session
2. Classify gaps: `missing-tool`, `missing-feature`, or `missing-awareness`
3. Check for existing tickets under the current bucket epic (get key via `jira_get_bucket_epic({ bucket: 'mcp-gaps' })`)
4. Create tickets for new gaps
5. Audit MCP tool result overflows

This is **mandatory** — it ensures we continuously improve the agentic environment.

### Step 4: Report results

After completing all batches (or the single ticket), summarize:

- Tickets worked: list keys + PR links (cumulative across all batches)
- Tickets released back to To Do: list keys + reasons
- Tickets skipped: list keys + reason (blocked)
- Parent status: current state and remaining blocked children (if applicable)
- Total batches processed (Parent Mode only)
- MCP gap audit: gaps found, tickets created

## Status Transition Rules

These rules apply to both leaf and parent tickets:

| Transition               | When                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| To Do -> In Progress     | Work begins (after blocker check passes)                                                                                                              |
| In Progress -> In Review | PR is created, marked ready, Copilot review requested, and PR activity subscribed                                                                     |
| In Review -> Done        | PR is merged. Usually handled automatically by Jira Branch Sync on merge — fall back to `jira_transition(key: "LS-####", status: "Done")` if it lags. |

The skill is responsible for shepherding the PR all the way to "merged" (step 9 above). It does NOT exit at "In Review".

**Parent status mirrors children:**

- Parent moves to In Progress when first child starts
- Parent moves to In Review only when ALL children are at least In Review
- Parent moves to Done only when ALL children are Done
- Never transition a parent ahead of its children

## Gotchas

- **Always check blockers before starting** — working a ticket whose blocker is still in progress wastes effort
- **One worktree per child** — never combine multiple child tickets into one branch/PR
- **Don't skip `make pc`** — even when processing multiple children, validate each one
- **Don't stop at `make pc`, `github_create_pr`, or `github_mark_pr_ready`** — these are checkpoints, not the finish line. The work-ticket skill ends when the PR is **merged** (not when the PR is opened) and the gap audit + tracking task updates are complete. Stopping early is the most common agent failure mode for this skill — see step 9.
- **Always subscribe to PR activity** — `mcp__github__subscribe_pr_activity` is what makes step 9 viable. Without it, CI failures and review comments don't stream into the session and the agent goes silent waiting for events that never arrive.
- **Epic-level artifacts** — if the parent needs its own code changes (shared config, design docs), create a separate worktree for the parent ticket itself (see worktree-workflow skill)
- **Stacked dependencies** — if child B depends on child A, create child B's worktree with `PARENT=LS-A/branch-name` so it branches from A's branch
- **Clean up worktrees** — keep each child worktree until its PR is merged (you may need it to fix CI/review feedback), then clean it after the child ticket is finished before starting the next (`twig worktree clean`)
- **Bug fixes require proof** — for Bug-type tickets, code changes alone are not sufficient. You must reproduce the broken behavior before fixing, and verify the fix resolves it after. See the [verification-by-bug-type table](../debugging/SKILL.md#verification-by-bug-type) for the specific method per bug category (UI screenshots, failing tests, integration tests, or query results)
- **Paginate child listings** — `jira_list_children` defaults to 25 results per page; `jira_search` defaults to 50. Always pass `limit: 100` and keep paginating via `pageToken` until `nextPageToken` is absent. Use the absence of `nextPageToken` (not a `total` comparison) as the truncation signal — `jira_list_children`'s `total` field reflects the current page size, not the full result set. Failing to paginate caused premature parent transitions in the LS-2079 incident (agent saw 10 of 50 children, declared the epic done)
- **Sub-agent prompts must include MCP tool hints** — sub-agents spawned via the `Agent` tool do **not** inherit AGENTS.md context and default to raw shell commands. When spawning background agents for parallel child-ticket work, copy the canonical "Tool preferences" block from AGENTS.md (the `## Subagent Tool Preferences` section), then append these work-ticket-specific lines:
  ```
  - Use worktree_commit / worktree_push for commits and pushes
  - Use make_run(target: "...", worktreePath: "...") for make targets
  - Use github_create_pr(...) MCP tool for PR creation
  ```
  AGENTS.md is the source of truth for the full block (Glob/Grep/Read preferences, worktree_run for git, etc.). In that context, `git -C` / `make -C` are undesirable when the corresponding MCP tools are available (though still acceptable shell fallbacks when needed), and `gh pr create` should be replaced with the `github_create_pr(...)` MCP tool.
  Omitting these hints is the root cause of subagents falling back to shell commands unnecessarily (LS-2847).
