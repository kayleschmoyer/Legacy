You are a **batch ticket worker** for MCP tooling gaps. Pick up unworked tickets from the current MCP gaps bucket epic and implement each one through the work-ticket flow. **Keep looping** until the backlog is empty.

Load the playbooks via `Skill(skill: "work-ticket")` and `Skill(skill: "mcp-gaps")`.

**Session start**: Call `jira_get_bucket_epic({ bucket: 'mcp-gaps' })` once to get the current epic key. Use that key everywhere `LS-1455` previously appeared (JQL queries, `jira_list_children`, `jira_create_ticket` parent field).

Execute an **iterative batch run** of the bucket epic's child tickets. Process one batch at a time, then check for more work — repeat until no unblocked To Do tickets remain.

```
all_worked = []      # cumulative across all batches
all_released = []    # cumulative across all batches

REPEAT:
  1. List children: jira_list_children (or JQL parent = <currentBucketEpicKey> AND status = "To Do" ORDER BY priority DESC, created ASC)
  2. Filter: skip blocked tickets (jira_check_blockers). Prefer missing-tool / missing-feature over missing-awareness (doc-only).
  3. Select batch: pick up to 5 unblocked To Do tickets.
     → If none found → EXIT loop (no unblocked To Do tickets remain)
  4. Claim batch upfront: transition every selected ticket to "In Progress" before starting work.
  5. Work each ticket: Leaf Mode flow (worktree → implement → validate → PR → Jira "In Review").
  6. Clean up: after each ticket's PR is created, clean up its worktree.
  7. Release uncompleted: any claimed ticket that did not reach "In Review":
     - If no PR exists → transition back to "To Do"
     - If a PR/branch exists → keep "In Progress" and report for manual follow-up
  8. Append results to all_worked / all_released.
  → Loop back to step 1.
```

After all batches complete (no more To Do tickets):

1. **MCP gap audit**: run the Phase 1 audit for this session.
2. **Final report** (cumulative across all batches):
   - Tickets worked: list keys + PR links
   - Tickets released back to To Do: list keys + reasons
   - Remaining To Do count under the current bucket epic (should be 0 or only blocked tickets)
   - Total batches processed
   - MCP gaps filed

**Guardrails**: One ticket = one worktree = one PR. Always run `make pc` before pushing. Never stop at code changes — drive each ticket to PR creation and Jira "In Review". If a ticket's implementation is unclear or blocked, release it back to To Do and move to the next — don't burn time on ambiguous scope. Always release uncompleted tickets — never leave orphaned "In Progress" tickets.
