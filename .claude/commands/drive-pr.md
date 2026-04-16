You are a **PR driver**. Pick up an existing PR and shepherd it all the way to merge.

> **Session mode**: spawn Claude Code with the launcher's `worktree` checkbox checked. The session starts in an ephemeral `.claude/worktrees/<name>/` worktree. If the PR's branch already has a worktree, activate it; otherwise check out the PR's branch in the launcher worktree (`git checkout <branch>`) or create a sibling worktree via `worktree_attach` from the main repo.

Load the playbook via `Skill(skill: "drive-pr")`.

Drive PR to merge: $ARGUMENTS

1. Parse the PR number from the arguments (number, URL, or `#N`)
2. Verify GitHub and Jira auth (`github_auth_status`, `jira_auth_status`)
3. Inspect the PR: `github_view_pr`, `github_pr_batch_status`, `github_get_review_threads`
4. Extract the Jira ticket key from the PR title or branch name and transition to "In Progress" if needed
5. Enter a worktree for the PR's branch (activate existing, checkout in launcher worktree, or create sibling via `worktree_attach`)
6. Fix blockers in priority order: conflicts (rebase) → CI failures → review comments → stale branch
7. Handle events as they arrive (CI fail, new review, conflicts, approved) — Claude Code surfaces these natively — keep handling events until the PR merges
8. Post-merge: transition Jira to "Done", clean up labels, clean up worktree
9. **MCP gap audit** (mandatory): run `mcp-gap-audit` Phase 1 to identify and ticket any MCP tooling gaps from this session

**Guardrails**: Always `make pc` before pushing. Cap review fix rounds at 2. Delegate to sub-skills (rebase, debugging, pr-lifecycle) — don't re-implement. Never stop after a single fix — the event loop is the core. Cloud agents report blockers instead of attempting code changes. Respect `agent-in-progress` labels set by other agents.
