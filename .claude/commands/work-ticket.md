Your job: implement Jira ticket **$ARGUMENTS**. Load the playbook with `Skill(skill: "work-ticket")`, then follow it.

> ⚠️ **You are implementing the ticket in `$ARGUMENTS`, not this command file.**
> Do **not** modify `.claude/commands/work-ticket.md`, `.agents/skills/work-ticket/SKILL.md`, or any other agent-tooling files unless the ticket explicitly asks for that. If you find yourself planning to edit those paths, stop and re-read the ticket.

> **Preferred session mode (Leaf tickets)**: spawn Claude Code with the launcher's `worktree` checkbox checked. The session starts in an ephemeral `.claude/worktrees/<name>/` worktree and Claude Code's header/`Create PR` button track the branch natively. Keep the auto-generated `claude/<random>` branch name as-is (do not rename; Claude Code caches it at session start). If you're orchestrating a **parent** ticket with children, stay in the main repo session and use sibling worktrees — native checkbox pins the orchestrator to one worktree, which breaks multi-child iteration.

1. Inspect the ticket with `jira_view` and `jira_list_children`
2. **Claim the ticket (MANDATORY before any implementation)**:
   - If `jira_view` shows `status: "In Progress"`, run `github_list_prs(search: "LS-####")`.
   - If any matching PR for the ticket key is open, **STOP** — the ticket is already claimed.
   - If no matching PR is open, use `jira_view.updated` as the single source of truth for recency: if it is within the last 60 minutes, **STOP** and treat the ticket as actively owned but not yet in PR.
   - Only continue an already-`In Progress` ticket when there is no open PR and `jira_view.updated` is more than 60 minutes old; treat that as an orphaned ticket, proceed without re-transitioning, and note in your report that you reclaimed an orphaned in-progress ticket.
   - If `jira_view` shows `status: "In Review"` or `status: "Done"`, **STOP** — do not move reviewing/completed work back to "In Progress".
   - If `jira_view` shows `status: "To Do"`, run `jira_transition(key: "LS-####", status: "In Progress")`, then verify with `jira_view` that the ticket now shows `status: "In Progress"`.
   - If the transition errors, or verification does not show `status: "In Progress"`, retry the transition once, then verify again with `jira_view`.
   - If the second attempt errors or the ticket still is not confirmed as `status: "In Progress"`, **STOP** and report that the claim could not be confirmed. Do not implement anything until the claim is confirmed.
   - For any other unexpected status, **STOP** and report the ticket's state; do not guess or force a transition.
   - Do NOT skip this step — leaving a ticket in "To Do" while working it causes other agents to pick up the same ticket. Never proceed without a confirmed claim.
3. **Planning phase**: run the planning skill (Step 1b) — scope assessment, code reconnaissance, risk classification. Skip for trivial tasks.
4. **Completeness check** (Step 1c): if the ticket lacks Acceptance Criteria, a Technical Approach, or a clear Problem statement, automatically invoke the `define` skill in enrich mode to fill in the gaps — no user confirmation needed. Exception: bug tickets with clear repro steps and an expected behavior description are sufficient even without formal AC.
5. **Leaf ticket** (no children): implement it end-to-end using the worktree workflow — blocker check, worktree, code, validate, PR, watch through merge, Jira "Done"
6. **Parent ticket** (has children): iterate through child tickets in batches of up to 5, looping until no unblocked To Do children remain. Update parent status based on children state.
7. **MCP gap audit** (mandatory): after all PRs are merged, run `mcp-gap-audit` Phase 1 (Audit) to identify and ticket any MCP tooling gaps from this session.
8. Report results: tickets worked, merged PRs, tickets skipped, remaining work, MCP gaps filed.

**Guardrails**: One ticket = one worktree = one PR. Always run the planning phase after inspecting the ticket (skip for trivial tasks). Always check blockers before starting. Always run `make pc` before pushing. Never stop at `make pc`, PR creation, or PR ready state — drive to merge. Clean up worktrees after each child. Update parent Jira status to reflect children state (In Progress while children are being worked, In Review when all children are at least In Review, Done when all are Done). Always run the MCP gap audit after merge and before finishing — this is how we continuously improve the agentic environment. The completeness check (step 4) invokes `define` autonomously without user confirmation — this is the expected autonomous mode; see the `define` skill for details.
