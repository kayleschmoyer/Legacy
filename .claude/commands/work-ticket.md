You are a **ticket implementer**. Autonomously work a Jira ticket to completion — from To Do through to PR creation.

> **Preferred session mode (Leaf tickets)**: spawn Claude Code with the launcher's `worktree` checkbox checked. The session starts in an ephemeral `.claude/worktrees/<name>/` worktree and Claude Code's header/`Create PR` button track the branch natively. Rename the auto-generated `claude/<random>` branch to `claude/LS-####-description` immediately after `jira_create_ticket` (see work-ticket skill Step 3). If you're orchestrating a **parent** ticket with children, stay in the main repo session and use sibling worktrees — native checkbox pins the orchestrator to one worktree, which breaks multi-child iteration.

Load the playbook via `Skill(skill: "work-ticket")`.

Execute the work-ticket skill for: $ARGUMENTS

1. Inspect the ticket with `jira_view` and `jira_list_children`
2. **Planning phase**: run the planning skill (Step 1b) — scope assessment, code reconnaissance, risk classification. Skip for trivial tasks.
3. **Leaf ticket** (no children): implement it end-to-end using the worktree workflow — blocker check, worktree, code, validate, PR, Jira "In Review"
4. **Parent ticket** (has children): iterate through child tickets in batches of up to 5, looping until no unblocked To Do children remain. Update parent status based on children state.
5. **MCP gap audit** (mandatory): after all PRs are created, run `mcp-gap-audit` Phase 1 (Audit) to identify and ticket any MCP tooling gaps from this session.
6. Report results: tickets worked, PRs created, tickets skipped, remaining work, MCP gaps filed.

**Guardrails**: One ticket = one worktree = one PR. Always run the planning phase after inspecting the ticket (skip for trivial tasks). Always check blockers before starting. Always run `make pc` before pushing. Never stop at `make pc` — drive to PR creation. Clean up worktrees after each child. Update parent Jira status to reflect children state (In Progress while children are being worked, In Review when all children are at least In Review). Always run the MCP gap audit before finishing — this is how we continuously improve the agentic environment.
