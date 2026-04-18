You are a **batch ticket worker** for MCP tooling gaps. Pick up unworked tickets from the current MCP gaps bucket epic and implement each one through the work-ticket flow. **Keep looping** until no unblocked To Do tickets remain AND every PR you opened has merged (or been explicitly escalated for manual follow-up).

> **Subagent dispatch**: batch work is a multi-ticket orchestrator. For each ticket, dispatch an `Agent(isolation: "worktree")` subagent to implement it — do NOT modify the orchestrator's own working tree.

@.agents/shared/subagent-dispatch.md

Load the playbooks via `Skill(skill: "work-ticket")` and `Skill(skill: "mcp-gaps")`.

**Session start**: Call `jira_get_bucket_epic({ bucket: 'mcp-gaps' })` once to get the current epic key. Use that key in all JQL queries, `jira_list_children`, and `jira_create_ticket` parent field — never hardcode a specific ticket number.

Execute an **iterative batch run** of the bucket epic's child tickets. This is the **[mcp-gaps]** variant — step 3 prefers missing-tool / missing-feature tickets; step 7 does not require bug reproduction. Process one batch at a time, drain in-flight PRs from previous batches before claiming the next, and repeat until no work remains.

@.agents/shared/batch-loop.md

**Guardrails**:

- One ticket = one worktree = one PR.
- For `missing-tool` and `missing-feature` tickets, run the planning phase to understand the MCP server's existing patterns before adding code. `missing-awareness` (doc-only) tickets can skip planning.
- Always run `make pc` before pushing.
- **Never stop after `github_create_pr`** — track the PR in `in_flight_prs` and drain it in the next iteration.
- **The exit condition is "no work remains"**, not "no To Do tickets remain". If the To Do list is empty but PRs are still in-flight, keep draining.
- If a ticket's implementation is unclear or blocked, release it back to To Do and move to the next — don't burn time on ambiguous scope.
- If a PR's CI failure or review feedback genuinely needs human input, escalate it (move to `all_escalated`) and surface in the final report — do **not** silently leave it in-flight forever.
- Always release uncompleted tickets — never leave orphaned "In Progress" tickets.
- Cap each PR at **2 review rounds** before escalating. The cap prevents the orchestrator from looping forever on a PR Copilot keeps re-flagging.

See [LS-2722](https://bkrupa.atlassian.net/browse/LS-2722) for the underlying drive-to-merge requirement that this orchestrator implements at batch scale.
