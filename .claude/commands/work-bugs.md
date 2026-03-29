You are a **batch ticket worker** for client-reported bugs. Pick up unworked tickets from the client bugs epic (LS-1322) and implement each one through the work-ticket flow.

!`cat .agents/skills/work-ticket/SKILL.md`

!`cat .agents/skills/debugging/SKILL.md`

Execute a **batch run** of LS-1322 child tickets:

1. **List children**: use `jira_list_children` (or `jira_search` with JQL `parent = LS-1322 AND status = "To Do" ORDER BY priority DESC, created ASC`) to find all unworked child tickets under LS-1322.
2. **Filter**: skip tickets that are blocked (use `jira_check_blockers`). Prefer high-priority bugs first.
3. **Select batch**: pick up to **5** unblocked To Do tickets for this session. If more remain, report the remaining count in the final summary.
4. **Claim all tickets upfront**: transition **every** selected ticket to "In Progress" (`jira_transition(key: KEY, status: "In Progress")`) **before starting work on any of them**. This reserves the tickets so parallel agents working the same epic don't pick up the same ones. Track which tickets were claimed in a local list, along with their PR URL once created.
5. **Work each ticket**: for each claimed ticket, run the **Leaf Mode** flow from the work-ticket skill — blocker check, worktree, implement, validate (`make pc`), self-review, commit, push, create PR (draft then ready), transition Jira to "In Review". One ticket = one worktree = one PR. If a ticket fails mid-work (errors, timeouts), release it back to "To Do" immediately before moving to the next.
   - **Bug verification (mandatory)**: before fixing, reproduce the broken behavior (write a failing test or confirm the bug via code inspection). After fixing, verify the fix resolves the issue. See the debugging skill for methodology.
6. **Clean up**: after each ticket's PR is created, clean up its worktree before moving to the next.
7. **Release uncompleted tickets**: after the batch loop ends, check each claimed ticket. Any ticket that was transitioned to "In Progress" but did **not** reach "In Review" **and** has no PR created must be transitioned back to "To Do" (`jira_transition(key: KEY, status: "To Do")`). This prevents tickets from being permanently stuck in "In Progress" when the agent hits errors, timeouts, or skips a ticket mid-batch.
8. **MCP gap audit**: after all tickets are worked, run the Phase 1 audit for this session.
9. **Report**: summarize tickets worked, PRs created, tickets released back to To Do (with reasons), and remaining To Do count under LS-1322.

**Guardrails**: One ticket = one worktree = one PR. Always run `make pc` before pushing. Never stop at code changes — drive each ticket to PR creation and Jira "In Review". Bug fixes require reproduction before fix and verification after — no blind fixes. If a bug cannot be reproduced or root-caused within reasonable effort, release it back to To Do and note the reason. Always release uncompleted tickets — never leave orphaned "In Progress" tickets.
