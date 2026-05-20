<!-- Canonical subagent dispatch boilerplate. Used by parent-ticket orchestrators and any fallback path
     where chips (mcp__ccd_session__spawn_task) are unavailable.
     `/sweep-prs`, `/work-bugs`, and `/work-mcp-gaps` no longer import this — they dispatch chips instead. -->

> Each subagent gets its own ephemeral worktree, inherits all MCP connections, and is discarded after use. The orchestrator only makes API calls (list tickets / scan PRs, check status, route decisions, drain PRs, report). This works from any session type — worktree checkbox, main repo, or cloud.
>
> **Fallback** (if `Agent(isolation: "worktree")` is unavailable): save the current branch, `git checkout -b <branch>` (or `git checkout <existing-branch>` for PRs), do the work, push, then `git checkout <original-branch>`. Commit and push before every branch switch to avoid contamination.
