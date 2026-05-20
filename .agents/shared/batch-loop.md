<!-- OBSOLETE: Canonical batch orchestration loop. Previously imported by work-bugs and work-mcp-gaps.
     Both orchestrators now dispatch chips (`mcp__ccd_session__spawn_task`) — one chip per ticket —
     and no longer drain in-flight PRs in their own session. Kept as historical reference only.
     Lines marked [client-bugs] / [mcp-gaps] are variant-specific. -->

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
        - unresolved bot review threads → fetch threads, apply FIX:/JUSTIFY: replies per author-agent contract, fix in worktree, push, apply `bot:ready-for-review` label; increment reviewRounds for that PR once per complete response cycle (respond to all threads + push + label), regardless of whether the bot has re-reviewed yet
        - reviewRounds >= 2 OR an unresolvable failure (genuinely needs the user) → move to all_escalated, drop from in_flight_prs, surface in the final report
     d. After draining, recompute in_flight_prs by filtering out merged/escalated PRs while preserving per-PR reviewRounds for still-pending entries (do not rebuild from scratch — that resets reviewRounds to 0 and defeats the escalation cap).
  2. List children: jira_list_children (or JQL parent = <currentBucketEpicKey> AND status = "To Do" ORDER BY priority DESC, created ASC)
  3. Filter: skip blocked tickets (jira_check_blockers).
     [client-bugs] Prefer high-priority bugs first.
     [mcp-gaps]    Prefer missing-tool / missing-feature over missing-awareness (doc-only).
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
  7. Work each ticket: dispatch a subagent that loads `Skill(skill: "work-ticket")` FIRST and follows it (Leaf Mode flow). The skill is authoritative — it owns the read-the-full-ticket gate (quote back ACs as AC1, AC2, ... before any state-changing tool call), the scope discipline rules (Out of Scope is a hard boundary; one ticket = one PR), and the AC verification gate that runs before self-review. Use the subagent prompt template at the bottom of `.agents/skills/work-ticket/SKILL.md` (Gotchas section); do not paraphrase a shorter version. Append the new PR to in_flight_prs as { ticket, prNumber, branch, reviewRounds: 0 }.
     [client-bugs] (worktree → reproduce bug → implement fix → verify → validate → PR → github_mark_pr_ready → github_request_review → Jira "In Review")
     [mcp-gaps]    (worktree → implement → validate → PR → github_mark_pr_ready → github_request_review → Jira "In Review")
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
