You are a **batch ticket worker** for client-reported bugs. Pick up unworked tickets from the current client bugs bucket epic and implement each one through the work-ticket flow. **Keep looping** until no unblocked To Do tickets remain AND every PR you opened has merged (or been explicitly escalated for manual follow-up).

> **Subagent dispatch**: batch work is a multi-ticket orchestrator. For each ticket, dispatch an `Agent(isolation: "worktree")` subagent to implement it — do NOT modify the orchestrator's own working tree. Each subagent gets its own ephemeral worktree, inherits all MCP connections, and is discarded after use. The orchestrator only makes API calls (list tickets, check blockers, drain PRs, report). This works from any session type — worktree checkbox, main repo, or cloud.
>
> **Fallback** (if `Agent(isolation: "worktree")` is unavailable): save the current branch, `git checkout -b <ticket-branch>`, do the work, push, then `git checkout <next-branch>`. Commit and push before every branch switch.

Load the playbooks via `Skill(skill: "work-ticket")`, `Skill(skill: "debugging")`, and `Skill(skill: "mcp-gaps")`.

**Session start**: Call `jira_get_bucket_epic({ bucket: 'client-bugs' })` once to get the current epic key. Use that key everywhere `LS-1322` previously appeared (JQL queries, `jira_list_children`, `jira_create_ticket` parent field).

Execute an **iterative batch run** of the bucket epic's child tickets. Process one batch at a time, drain in-flight PRs from previous batches before claiming the next, and repeat until no work remains.

```
all_worked     = []      # cumulative across all batches
all_released   = []      # cumulative across all batches
all_merged     = []      # { ticket, prNumber, branch } — merged PRs
all_escalated  = []      # { ticket, prNumber?, branch?, reason } — escalated (prNumber/branch optional if no PR exists)
in_flight_prs  = []      # { ticket, prNumber, branch, reviewRounds } — pending merge

REPEAT:
  1. Drain in-flight PRs from previous batches (skip whenever in_flight_prs is empty):
     a. Read status for every PR in in_flight_prs:
        prNumbers = in_flight_prs.map(pr => pr.prNumber)
        // Chunk into batches of ≤50 (github_pr_batch_status enforces numbers.length ≤ 50)
        github_pr_batch_status(numbers: [...prNumbers.slice(0, 50)], compact: false)
        // compact: false is intentional — drain routing needs `state` and `reviewDecision` to
        // determine merged/fix/escalate paths; use compact: true only for lightweight scans
        // that do not need those routing fields.
        // If in_flight_prs.length > 50, call again for each subsequent chunk of 50
     b. Before any action that requires file edits, rebasing, validation, commit, or push for an existing PR branch, restore branch context:
        - inspect current worktrees with `worktree_list`
        - if the PR branch already has a worktree, select it with `worktree_set`
        - otherwise create/recreate a worktree for that PR branch, then select it before continuing
     c. For each PR, decide one of:
        - merged → move to all_merged, drop from in_flight_prs
        - clean + approved (mergeable, no failed checks, no unresolved threads) → wait for the merge queue or trigger merge per project policy; leave in in_flight_prs
        - CI failing on a fixable category (lint/format/type/stale-branch/codegen) → fix in the worktree, push, leave in in_flight_prs
        - CONFLICTING with main → run the rebase skill (worktree_rebase → worktree_stabilize → make pc → push), leave in in_flight_prs
        - unresolved Copilot review threads → fetch threads, fix in worktree, push, reply, resolve, re-request review; increment reviewRounds for that PR once per complete response cycle (respond to all threads + push + re-request review), regardless of whether Copilot has re-reviewed yet
        - reviewRounds >= 2 OR an unresolvable failure (genuinely needs the user) → move to all_escalated, drop from in_flight_prs, surface in the final report
     d. After draining, recompute in_flight_prs by filtering out merged/escalated PRs while preserving per-PR reviewRounds for still-pending entries (do not rebuild from scratch — that resets reviewRounds to 0 and defeats the escalation cap).
  2. List children: jira_list_children (or JQL parent = <currentBucketEpicKey> AND status = "To Do" ORDER BY priority DESC, created ASC)
  3. Filter: skip blocked tickets (jira_check_blockers). Prefer high-priority bugs first.
  4. Exit check (both conditions must hold):
     - No unblocked To Do tickets remain, AND
     - in_flight_prs is empty (every previously-shipped PR has merged or been escalated)
     → If both true → EXIT loop. If only the To Do list is empty but PRs are still in-flight, loop back to step 1 and keep draining.
  5. Select batch: pick up to 5 unblocked To Do tickets (skip this step if there are no To Do tickets and you are only draining).
  6. Claim batch with verification (prevents duplicate work across concurrent agents):
     a. For each selected ticket, call `jira_view` to re-check its current status. If a ticket's current status is not exactly "To Do" (for example, another agent already moved it to "In Progress", "In Review", or "Done" between your listing and now), **drop it from the batch** — do not transition it, do not work it.
     b. Transition only the remaining revalidated "To Do" tickets to "In Progress": `jira_transition(key: [...], status: "In Progress")`.
     c. Verify: call `jira_view` on each claimed ticket to confirm the transition succeeded. Drop any that failed.
     d. If the entire batch was dropped (all tickets were no longer "To Do"), loop back to step 2 to find more work.
  7. Work each ticket: Leaf Mode flow (worktree → reproduce bug → implement fix → verify → validate → PR → github_mark_pr_ready → github_request_review → mcp__github__subscribe_pr_activity → Jira "In Review"). Append the new PR to in_flight_prs as { ticket, prNumber, branch, reviewRounds: 0 }.
  8. Clean up: after each ticket's PR is created, clean up its worktree (the PR is now tracked in in_flight_prs and will be drained in the next iteration's step 1).
  9. Release uncompleted: any claimed ticket that did not reach "In Review":
     - If no PR exists → transition back to "To Do"
     - If a PR/branch exists → keep "In Progress" and add to all_escalated for manual follow-up
  10. Append results to all_worked / all_released.
  → Loop back to step 1.
```

> **Why drain first**: shipping a PR is not the same as merging it. CI may fail, Copilot may post review comments, main may move underneath the branch. The drive-to-merge requirement (LS-2722, AGENTS.md step 13) applies in batch mode too — the orchestrator must re-converge on every PR it opened, not just walk away after `github_create_pr`.

After the loop exits (no unblocked To Do tickets AND no in-flight PRs — note: escalated PRs may still be open on GitHub and need human follow-up; they are reported below but no longer tracked by the orchestrator):

1. **MCP gap audit**: run the Phase 1 audit for this session.
2. **Final report** (cumulative across all batches):
   - Tickets worked: list keys + PR links + final status (merged / escalated)
   - PRs merged: count and list
   - PRs escalated: list keys + PR links + reasons (CI failure agent couldn't fix, > 2 review rounds, etc.)
   - Tickets released back to To Do: list keys + reasons
   - Remaining To Do count under the current bucket epic (should be 0 or only blocked tickets)
   - Total batches processed
   - MCP gaps filed

**Guardrails**:

- One ticket = one worktree = one PR.
- Always run the planning phase after inspecting each bug ticket — reproduction is part of planning. High-risk bugs (distributed systems, auth) require full planning with downstream impact analysis.
- Always run `make pc` before pushing.
- **Never stop after `github_create_pr`** — track the PR in `in_flight_prs` and drain it in the next iteration.
- **The exit condition is "no work remains"**, not "no To Do tickets remain". If the To Do list is empty but PRs are still in-flight, keep draining.
- Bug fixes require reproduction before fix and verification after — no blind fixes.
- If a bug cannot be reproduced or root-caused within reasonable effort, release it back to To Do and note the reason.
- If a PR's CI failure or review feedback genuinely needs human input, escalate it (move to `all_escalated`) and surface in the final report — do **not** silently leave it in-flight forever.
- Always release uncompleted tickets — never leave orphaned "In Progress" tickets.
- Cap each PR at **2 review rounds** before escalating. The cap prevents the orchestrator from looping forever on a PR Copilot keeps re-flagging.

See [LS-2722](https://bkrupa.atlassian.net/browse/LS-2722) for the underlying drive-to-merge requirement that this orchestrator implements at batch scale.
