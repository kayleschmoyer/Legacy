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

After `jira_view` returns, **rename the current session** to include the ticket key and summary:

```
worktree_rename_session(title: "LS-#### <summary, truncated to 80 chars>")
```

**⚠️ Critical — read the full description before continuing.** The ticket summary is never sufficient. Immediately after the rename, extract and internalize the following from the `jira_view` response body:

- **Problem / Context** — why does this work need to happen?
- **Acceptance Criteria** — what conditions must be true for the ticket to be Done?
- **Technical Approach** — what files, systems, or APIs are involved?
- **Out of Scope** — what explicitly should _not_ change?
- **Open Questions** — anything still unresolved?

If the `jira_view` response truncates the description, call `jira_get_comments(key: "LS-####")` as well — implementation details are sometimes clarified there.

> **Do NOT proceed to Step 1b until you can answer:** "What specifically must be true when this ticket is Done, and what must I build or change to get there?" If you cannot answer that from the ticket body alone, the ticket is underspecified — go to Step 1c for clarification **before planning begins**.

Determine the ticket type and whether it has children:

```
jira_list_children(key: "LS-####", limit: 100)
```

> **Pagination required**: if the response contains `nextPageToken`, you must paginate (pass `pageToken` to subsequent calls) until `nextPageToken` is absent. Never assume the first page is complete — default limits (10-25) will silently truncate large epics.

| Condition                                           | Mode                                           |
| --------------------------------------------------- | ---------------------------------------------- |
| No children (or `jira_list_children` returns empty) | **Leaf mode** — implement this ticket directly |
| Has children                                        | **Parent mode** — work the children            |

### Step 1b: Planning phase

After inspecting the ticket, run the [planning skill](../planning/SKILL.md) before implementation.

**Why**: agents that skip planning produce code that works in isolation but misses constraints, breaks adjacent systems, or solves the wrong problem. A 5-minute planning phase prevents 45-minute rework cycles.

1. **Scope assessment** — classify as Trivial/Low/Medium/High based on what the ticket touches (see planning skill Step 1). Trivial tickets (typo fix, doc-only) skip planning entirely.
2. **Code reconnaissance** — read the target files, their imports, consumers, and tests. Build a mental model of the current state before proposing changes.
3. **Risk classification** — classify the change and set a time budget:
   - **Low** (2-3 min): single-file, single-concern, no schema/infra
   - **Medium** (5-10 min): multi-file, business logic, schema changes, new components
   - **High** (10-15 min): auth, payments, infra, migrations, cross-service
4. **Planning output** — carry forward: goal statement ("I am changing X because Y"), risk level, file plan, constraints, verification plan.

When creating the Jira ticket (if one doesn't exist), use the structured fields to capture planning context:

```
jira_create_ticket(
  summary: "type(scope): description",
  context: "<why this work matters>",
  risk: "<Low|Medium|High> — <reasoning>",
  planningNotes: "<relevant files, constraints, dependencies>",
  sprint: "current"
)
```

### Step 1c: Completeness check — auto-enrich if the ticket is underspecified

Assess whether the ticket contains enough structure to implement safely. This step runs before or after planning — if the Step 1 gate redirected you here, the ticket needs enrichment before planning can begin. A ticket is considered **complete** if it has all three of:

1. **Acceptance Criteria** — at least one testable `- [ ]` condition (or equivalent prose that is unambiguously verifiable)
2. **Technical Approach** — a description of _what_ to change and _where_ (file paths, systems, APIs), even if brief
3. **A clear Problem statement** — why this work exists, not just what to do

> **Exception — Bug tickets**: if the ticket type is Bug and the description contains a clear repro scenario and expected vs. actual behaviour, that satisfies the completeness check even without a formal `## Acceptance Criteria` section.

If any of the above are missing, **automatically invoke the define skill in enrich mode** before proceeding:

```
Skill(skill: "define")
// Pass the ticket key; the define skill will read the current description,
// identify gaps, draft the missing sections, and update the Jira ticket.
// Do NOT ask the user for permission — proceed autonomously.
// After the define skill completes, re-read the ticket via jira_view to get the updated description.
```

Do not skip this step to save time. An underspecified ticket produces an underspecified implementation — fixing misaligned scope after a PR is open costs more than enriching the ticket now.

After the define skill updates the ticket, re-read it:

```
jira_view(key: "LS-####")
```

Then continue to Step 2 with the enriched description.

### Step 2: Route to the correct mode

#### Leaf Mode (no children)

Follow the full [worktree-workflow skill](../worktree-workflow/SKILL.md):

1. **Blocker check**: `jira_check_blockers(key: "LS-####")` — STOP if blockers are not In Review/Done
2. **Claim and verify** (prevents duplicate work when multiple agents scan the same backlog):
   a. Check current status with `jira_view`. If it already shows `status: "In Progress"`, another agent likely claimed it. Search for existing PRs (`github_list_prs(search: "LS-####")`). If a PR exists, **STOP** — the ticket is already being worked. If no PR exists, inspect `jira_view.updated`: if it is within the last 60 minutes, **STOP** — assume another agent just claimed it. Only proceed if `jira_view.updated` is more than 60 minutes old (orphaned ticket) — note in the PR body that you picked up an apparently-abandoned ticket, and continue without re-transitioning the Jira issue. If the current status is anything other than `"In Progress"`, proceed to step (b) to claim it.
   b. Transition only if step (a) found the current status is not already `"In Progress"`: `jira_transition(key: "LS-####", status: "In Progress")`
   c. Verify with `jira_view(key: "LS-####")`. If step (b) performed a transition, confirm `status == "In Progress"`; if the transition failed silently (status unchanged), retry once. If it still fails, **STOP** and report the failure — do not proceed without the claim. If step (a) already found `"In Progress"` and you decided it was orphaned, just confirm it is still `"In Progress"` and continue.
3. **Worktree** — two flows:
   - **Native ephemeral (default)**: if the session was spawned with the launcher's `worktree` checkbox checked, `pwd` should already return `.claude/worktrees/<name>/`. The branch is already set to `claude/<random-name>`. **Do not rename it** — Claude Code caches the branch name at session start; renaming breaks PR detection (anthropics/claude-code#18690). Jira links via PR title and commit messages containing `LS-####`. Call `worktree_set(key: "<absolute .claude/worktrees/... path>")` so the worktree MCP tools target the right tree.
   - **Sibling (parallel/batch work only)**: `make_worktree_create(ticket: "####", description: "desc")` (add `parent: "LS-####"` if blocker is In Review). Shell fallback: `make worktree TICKET=#### DESC=description`. Then call `worktree_set(key: "LS-####")`.
4. **Setup**:
   - **Native flow (REQUIRED before any pnpm/make command)**: `.claude/worktrees/<name>/` has no `node_modules`. Symlink from the main repo first (LS-2903/LS-3003):
     ```
     worktree_setup_node_modules()
     ```
     Idempotent, no escaping needed. Fallback if MCP unavailable (run from the worktree root): `cmd /c "mklink /D node_modules D:\code\legacy-sports\node_modules"` (directory symlink — do NOT use `mklink /J` or `New-Item -ItemType Junction`). After that `pnpm exec nx`, `make typecheck`, `make pc` all work. Do NOT call `make_wt_setup` — it's sibling-only.
   - **Sibling flow**: `make_wt_setup(worktreePath: "$wt")`. Shell fallback: `make wt-setup WT=$wt`.
5. **Implement**: Before writing any code, re-read the **full ticket description** from the `jira_view` response (not just the summary). Confirm you are implementing against the Acceptance Criteria — if you cannot cite at least one AC from the description, stop and return to Step 1c. Then investigate the codebase and write code + tests.
   - **Bug tickets**: follow the [bug verification workflow](../debugging/SKILL.md#verification-by-bug-type) — reproduce the bug **before** writing any fix, then verify the fix resolves the reported behavior **after**. Include before/after evidence in the PR body under a `## Verification` section (appended after the standard template). `make pc` passing is necessary but not sufficient for bugs. The `## Verification` section is not part of the standard PR template -- add it manually for bug-fix PRs.
     5a. **Write implementation notes to Jira**: after completing the implementation (before committing), append an `## Implementation Notes` section to the Jira ticket description so sweep agents have context when fixing review feedback later. First read the current description via `jira_view`, then append:
   ```
   jira_edit_ticket(key: "LS-####", fields: { description: "<existing description>\n\n## Implementation Notes\n\n**Approach:** <1-2 sentences on what was done and why>\n\n**Key files changed:**\n- `path/to/file.ts` — reason\n- ...\n\n**Design decisions / constraints discovered:**\n- <any non-obvious choices, tradeoffs, or codebase constraints the agent found>\n\n**Testing:** <how correctness was verified — unit tests, manual repro, etc.>" })
   ```
   Preserve the original description and only append/refresh the `## Implementation Notes` section at the end. Keep notes factual and brief. Focus on information that is _not_ derivable from reading the diff: constraints, considered alternatives, and context that informs whether a review comment's suggested change is safe or problematic.
6. **Self-review** (MANDATORY — do not skip): invoke the `/review` skill to catch rule violations and common review patterns before proceeding. This is not optional reading — execute `Skill(skill: "review")` and let it run its full checklist (project rules, code quality scan, reuse check, and common Copilot patterns). Fix all issues it identifies before moving to step 7.
7. **Validate**: `db_migration_status(worktreePath: "$wt")` + `db_migrate(worktreePath: "$wt")`, then `make_run(target: "pc", worktreePath: "$wt")`. Shell fallback: `make pc`

   > **⛔ Do NOT run individual targets (`format`, `lint`, `typecheck`, `test`) instead of or before `make pc`.** `make pc` runs all steps in one shot and handles formatter auto-commits internally. Running targets individually multiplies turns and bypasses the auto-commit logic. If `make pc` fails, read the `steps[]` JSON to find the failing step, fix the code — you may optionally run that specific failing target to iterate faster — then always finish with a full `make_run(target: "pc")` pass before pushing.

   > **⛔ Do NOT stop here.** `make pc` passing is a checkpoint, not the finish line. If you exit the workflow at this point, the work is unfinished — keep going.

8. **Ship** (prerequisite: step 6 self-review was executed and all issues fixed — if you skipped step 6, go back now; do NOT create a PR without completing self-review): `worktree_commit({ message: "type(scope): msg" })` → `worktree_push()` → `github_create_pr(title: "LS-#### type(scope): msg", body: "<markdown>", worktreePath: "$wt", draft: true)` → `github_manage_labels(prs: [<PR#>], add: ["agent-in-progress"])` → `github_mark_pr_ready(number: <PR#>)` → `github_request_review(prs: [<PR#>])` → subscribe to PR activity → `jira_transition(key: "LS-####", status: "In Review")`. Apply the label while still a draft so the PR is already labeled when it becomes visible to sweeps. See [create PR](../pr-lifecycle/references/create-pr.md) only for PR body/title formatting and PR mechanics — this skill's step ordering overrides that reference: after PR creation, complete step 9 (watch to merge) first, then run the MCP gap audit in step 10 after merge.
   - **Subscribe to PR activity (environment-aware)**: Local agents proceed directly to Step 9's `github_wait_for_pr_event` loop — the blocking call itself serves as the watch mechanism. Cloud agents (Claude Code on the web) call `mcp__github__subscribe_pr_activity({ owner, repo, pullNumber: <PR#> })` to receive real-time `<github-webhook-activity>` messages, then react to incoming messages in Step 9. Do not mix mechanisms — local agents poll via `github_wait_for_pr_event`, cloud agents subscribe via `mcp__github__subscribe_pr_activity`.

   > **⛔ Do NOT stop here.** Creating the PR is also not the finish line. Subscribing to PR activity is mandatory — without it, CI failures and review comments do not stream back into the session and the watch-to-merge step in step 9 cannot react. If you exit after `github_create_pr` without subscribing and watching, the ticket is unfinished.

9. **Watch the PR through to merge** (REQUIRED — this step replaces "stop after PR"):
   - Call `github_wait_for_pr_event({ number: <PR#> })`. It blocks until something agent-actionable occurs and returns `{ event, pr, ... }`. Handle the event, then call it again. This covers both Check Runs (Actions jobs) and Commit Statuses (bot/external CI like `bot-review`) — no polling loop needed. ⛔ Never use `Start-Sleep`, `sleep`, or any polling loop while waiting for CI or Copilot re-review; see [mcp-first CI substitution table](../mcp-first/SKILL.md).
   - Before **any** remediation push in this step, re-snapshot the PR's current blockers and batch them: classify the current failed checks, re-check unresolved review threads when review-related statuses are present, inspect the remaining non-review failures, then fix all currently known issues in one working pass, validate once, self-review once, and push once. Do not alternate "fix CI, push, then fix known review threads, push again" unless the first push is strictly required to reveal the next blocker.
   - **`checks_failed`**: the event payload gives you `failedChecks` with metadata such as `type`, `name`, `conclusion`, and `url`, but not a runId and not the status/check output text. If any failed check is `bot-review`, or otherwise looks review-related by name/context, do **not** assume the unresolved-comments state from the event payload alone. First inspect the status/check details by either calling `github_list_commit_statuses({ number: <PR#> })` and checking the relevant context (for example `bot-review`), or by opening `failedChecks.url`. Only if that inspection confirms `Copilot review blocked`, `Copilot review has unresolved comments`, or an equivalent unresolved-review-threads message should you fetch `github_get_review_threads({ number: <PR#>, unresolvedOnly: true })` before inspecting Actions logs. Treat those current threads as part of this remediation round, then inspect any remaining non-review failed checks so the next push covers both the review fixes and the real CI fixes already visible on the PR. For real CI failures, get the runId with `ci_list_runs({ branch: "<headRefName>", limit: 1 })`, then `ci_get_logs({ runId, errorSummary: true })` to grab failed-step output. Common fixes:
     - Lint / format / type errors → fix, push (`worktree_commit` + `worktree_push`)
     - Branch behind `main` → run the [rebase skill](../rebase/SKILL.md) (`worktree_rebase` → `worktree_stabilize` → `make pc` → push)
     - Flaky tests → re-run via `ci_rerun({ runId, failedOnly: true })`; if persistent, dig in
     - `failedChecks.type === "check_run"` → retrigger with `github_retrigger_check`; `type === "commit_status"` → push a new commit or dispatch the workflow
   - **`new_review_thread`**: the event payload includes thread body/path/line. Do **not** fix just that single thread and push immediately. Re-fetch **all** unresolved threads with `github_get_review_threads({ number: <PR#>, unresolvedOnly: true })`, batch the whole review round (plus any already-known CI/root-cause fixes), then push once, reply via `github_reply_to_review({ threadId, body: "addressed in <sha>" })`, and resolve via `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })`. Re-request review with `github_request_review({ prs: [<PR#>] })` when the round is done. Cap at 2 review rounds before escalating to the user. (Copilot feedback always arrives as `new_review_thread` — never as `review_changes_requested`.)
   - **`conflicts`**: re-run the rebase skill — do not just label it for the sweep.
   - **`review_approved`** + checks passing → merge.
   - **`merged`**: proceed to step 10.
   - **Do not start unrelated work** while this PR is open. Do not exit the workflow. Do not mark the tracking task completed.

10. **MCP gap audit (after merge)**: follow [`skills/mcp-gaps/SKILL.md`](../mcp-gaps/SKILL.md) Phase 1 — review all Bash commands and MCP overflows from this session, classify gaps, file any new tickets under the current bucket epic (get key via `jira_get_bucket_epic({ bucket: 'mcp-gaps' })`). Check the **minimum threshold** in that skill first — skip the audit if the session was shallow (< 10 Bash calls, no tool failures, no novel shell patterns).
11. **Complete tracking tasks**: call `TaskUpdate(taskId: <id>, status: "completed")` for every task tracking this ticket — **only after the PR is merged and the gap audit is complete**, never before. Marking the task complete while the PR is still open is a failure mode.

> After step 11, if this ticket is a child of a parent being processed in Parent Mode, return to the parent loop.

#### Parent Mode (has children)

Process children in iterative batches until the backlog is empty.

1. **Transition parent to In Progress** (if not already):

   ```
   jira_transition(key: "LS-####", status: "In Progress")
   ```

2. **Iterative batch loop** — repeat until no unblocked To Do children remain:

   ````
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
     d. Claim batch with verification (prevents duplicate work across concurrent agents):
        - First, re-check each candidate: call `jira_view` for each selected ticket. If any are not exactly "To Do" (another agent moved them to "In Progress", "In Review", or "Done" between listing and now), drop them from the batch.
        - Transition remaining To Do tickets: `jira_transition(key: [...batch keys], status: "In Progress")` (one call saves N round-trips).
        - Verify: call `jira_view` on each claimed ticket to confirm transition succeeded. Drop any that failed.
        - If the entire batch was dropped, loop back to step a.
     e. **Dispatch a subagent for each child ticket** — do NOT modify the orchestrator's
        own working tree. Each child gets its own isolated ephemeral worktree:

        ```
        Agent(
          isolation: "worktree",
          prompt: """
            Implement Jira ticket LS-<child_key>. Follow these steps:

            Setup:
            1. git fetch origin main
            2. worktree_setup_node_modules()
            3. Skip jira_transition — the orchestrator already claimed this ticket in step d.

            Work:
            4. Read the ticket: jira_view(key: "LS-<child_key>")
            5. Implement the ticket (code + tests)
            6. Self-review changes: read .agents/skills/pr-lifecycle/references/self-review.md
               and .agents/skills/pr-lifecycle/references/common-review-patterns.md,
               then run Skill(skill: "review") to execute the full self-review checklist
               and common review patterns against your changes. Fix all issues before proceeding.
            7. db_migration_status() + db_migrate()
            8. make_run(target: "pc") — must pass
            9. worktree_commit(message: "type(scope): LS-<child_key> description")
            10. worktree_push(setUpstream: true)
            11. github_create_pr(title: "LS-<child_key> ...", draft: true)
            12. github_manage_labels(add: ["agent-in-progress"])
            13. github_mark_pr_ready
            14. github_request_review
            15. jira_transition(key: "LS-<child_key>", status: "In Review")

            Return the PR number and any issues encountered.

            Tool preferences:
            - Use worktree_commit/worktree_push for commits and pushes
            - Use Glob (not find/ls) for file discovery
            - Use Grep (not grep/rg) for content search
            - Use Read (not cat/head/tail) for reading files
          """
        )
        ```

        After the subagent returns:
        - Record the PR number in the tracking list
        - Monitor the PR: watch CI, fix review comments (dispatch another subagent
          for fixes if needed), rebase as needed
        - Shepherd each child PR through to merge before starting the next child
        - Mark the child's tracking task completed (`TaskUpdate(taskId: <id>, status: "completed")`)
          **after the child PR merges and the gap audit is complete**, never at PR creation

        **Fallback** (if `Agent(isolation: "worktree")` is unavailable):
        save the current branch, `git checkout -b LS-<child_key>/description origin/main`,
        symlink node_modules, do the work, push, create PR, then
        `git checkout <original-branch>`. Commit and push before every switch.
     f. Release uncompleted: any claimed ticket that did not reach "In Review":
        - If no PR exists → transition back to "To Do" via the Jira REST API directly
          (note: jira_transition only supports "In Progress", "In Review", "Done" — "To Do" is not a valid target status under any circumstances)
        - If a PR/branch exists → keep "In Progress" and report for manual follow-up
     g. Append results to all_worked / all_released.
     → Loop back to step a.
   ````

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

- **Don't over-plan trivial tasks** — the planning skill has a scope assessment step that tells you when to skip. A typo fix does not need 10 minutes of reconnaissance.
- **Always check blockers before starting** — working a ticket whose blocker is still in progress wastes effort
- **One worktree per child** — never combine multiple child tickets into one branch/PR
- **Don't skip `make pc`** — even when processing multiple children, validate each one; always call `make_run(target: "pc")`, never chain individual targets (`format` → `lint` → `typecheck`) as a substitute
- **Don't stop at `make pc`, `github_create_pr`, or `github_mark_pr_ready`** — these are checkpoints, not the finish line. The work-ticket skill ends when the PR is **merged** (not when the PR is opened) and the gap audit + tracking task updates are complete. Stopping early is the most common agent failure mode for this skill — see step 9.
- **Always watch PR activity** — step 9 requires an active watch mechanism. **Local agents**: call `github_wait_for_pr_event({ number: <PR#> })` directly in step 9 — it blocks until an event fires, no separate subscribe step needed. **Cloud agents**: call `mcp__github__subscribe_pr_activity({ owner, repo, pullNumber: <PR#> })` to receive real-time webhook messages. Do not mix mechanisms — each environment uses exactly one. Without either, the agent goes silent after PR creation.
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
