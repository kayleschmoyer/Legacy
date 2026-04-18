---
name: subagent-templates
description: Copy-paste template blocks for spawning subagents via the Agent tool — tool preference hints, setup steps for work subagents, and recovery patterns for parent agents. Load when spawning subagents or dispatching parallel work.
---

# Skill: Subagent Tool Preferences

Subagents spawned via the `Agent` tool do **not** inherit AGENTS.md context. When spawning subagents (especially `Explore` type), **always include tool preference hints in the prompt**:

```
Agent(subagent_type: "Explore", prompt: """
  <task description here>

  Tool preferences:
  - Use Glob (not find/ls) for file discovery; if Glob returns empty on an absolute Windows worktree path, fall back to worktree_ls_tree or worktree_run(command: "dir <dir>") (use `dir` not `ls` — worktree_run may resolve to cmd.exe where `ls` is unavailable)
  - Use Grep (not grep/rg/`find | xargs grep`) for content search — Grep accepts both pattern and glob filter in one call, so `find | xargs grep` is never needed
  - Use Read (not cat/head/tail) for reading files — including uncommitted changes and untracked/new files
  - Use worktree_show_file(path: "...", ref: "HEAD") for **tracked** files at a Git ref when a worktree is active (worktree_set has been called) — it runs `git show <ref>:<path>` so it does NOT see uncommitted working-tree changes or untracked files, but avoids needing absolute paths. `ref` accepts **any git ref** — HEAD, commit SHAs, branch names, or tags (e.g. `worktree_show_file(path: ".claude/hooks/guard-bash-mcp-first.sh", ref: "abc1234")` reads the file at that commit)
""")
```

These four lines eliminate the most common subagent Bash anti-patterns (`find` 56x/session, `grep` 23x, `ls` 8x, `cat` on worktree paths 4x in production audits). Without them, subagents default to shell commands because they lack the project's MCP-first context.

## Scoped Explore Agents (Narrow Prompts)

Explore subagents default to broad sweeps when given vague prompts — reading dozens of files instead of the 2–3 actually needed. Every extra file read re-enters the subagent's context and gets returned to the parent, accumulating 1–2M tokens per broad Explore call across a session.

**Before spawning an Explore agent**, check [`.agents/skills/architecture/FILE-MAP.md`](../architecture/FILE-MAP.md) — if the canonical path is listed there, read it directly instead of delegating.

When you do need an Explore agent, **always include a stopping condition and a max-file hint:**

```
Agent(subagent_type: "Explore", prompt: """
  <Specific, narrow question — e.g. "Find which file exports the `refreshJwt` function">

  Stopping condition: stop as soon as you find the answer — do NOT read the entire module.
  Max files: read at most 5 files. If you haven't found it in 5 files, report what you found
  and the most likely next location rather than continuing.

  Start with: check .agents/skills/architecture/FILE-MAP.md first — the canonical path
  may already be listed there.

  Tool preferences:
  - Use Grep to search for the symbol/pattern directly before using Glob
  - Use Glob (not find/ls) for file discovery
  - Use Read (not cat/head/tail) for reading files
  - Report the exact file path and line number, not just the file
""")
```

**Anti-patterns to avoid in Explore prompts:**

- ❌ "Explore the auth system" — reads everything under auth/
- ❌ "Understand how GraphQL resolvers work" — reads all resolver files
- ❌ "Find where X is used" without a stopping condition — reads all callers
- ✅ "Find the file that defines `AuthService.validateToken` — stop after finding it"
- ✅ "Check if `apps/web/src/hooks/useAuth.ts` imports from `oauth-proxy` — just read that one file"

## Git Operations in Worktrees

For subagents that perform git operations in worktrees, also include:

```
  - Use worktree_run for git commands (preferred over git -C via Bash; git -C is the shell fallback when MCP tools are unavailable)
  - Use worktree_commit/worktree_push for commits and pushes
  - Use worktree_diff({ base: "HEAD" }) to inspect uncommitted changes (replaces git -C <wt> diff HEAD)
  - Use worktree_status() to get current branch and working-tree status (replaces git -C <wt> branch --show-current / git status)
```

## PR Sweep Subagents

For subagents running PR sweeps (open-prs skill), also include:

```
  - For scanning open PRs, use github_pr_dashboard(state: "open", limit: 100, excludeDrafts: true) instead of scan-prs.ps1 or github_pr_scan — it returns richer CI/review/label data in one MCP/tool call (the tool may make multiple underlying GitHub API requests)
```

## MCP Server Code Exploration

For subagents that explore or modify **MCP server code** (e.g. adding a new tool to `tools/mcp/github-server/`), include:

```
  - When exploring MCP server structure, use Glob/Read/Grep instead of ls/cat/grep:
    - List tool files: Glob(pattern: "**/*.ts", path: "tools/mcp/<server>/src/tools")
    - Read a tool file: Read(file_path: "tools/mcp/<server>/src/tools/<tool>.ts")
    - Find tool registrations: Grep(pattern: "server\\.tool\\(", path: "tools/mcp/<server>/src/index.ts")
    - Find imports: Grep(pattern: "^import", path: "tools/mcp/<server>/src/index.ts")
```

## Work Subagents (Multi-Ticket Orchestrators)

For **work subagents** dispatched by multi-ticket orchestrators (`/sweep-prs`, `/work-bugs`, `/work-mcp-gaps`, `/work-ticket` Parent Mode) via `Agent(isolation: "worktree")`, always include **setup steps** before the work instructions — the subagent's ephemeral worktree starts empty.

The canonical setup + tool preferences block lives in [`.agents/shared/subagent-setup.md`](../../shared/subagent-setup.md) (symlinked as `references/subagent-setup.md` in skills that use it):

@../../shared/subagent-setup.md

Work subagents inherit all MCP connections from the parent session (all 9 servers), so `github_create_pr`, `worktree_commit`, `make_run`, `jira_transition` etc. are all available. Multi-ticket orchestrators should always use `Agent(isolation: "worktree")` rather than session-launcher worktrees for each ticket.

## Parent-Agent Recovery

**When a subagent fails to push or create a PR**, the parent agent should prefer MCP tools to recover; use `gh` CLI only when MCP is unavailable:

```
worktree_push(worktree: "<subagent-worktree-path>", setUpstream: true)
github_create_pr(worktreePath: "<absolute-subagent-worktree-path>", title: "...", body: "...", draft: true)
github_manage_labels(prs: [<PR#>], add: ["agent-in-progress"])
github_mark_pr_ready(number: <PR#>)
github_request_review(prs: [<PR#>])
```

The `legacy-sports-github` MCP server exposes all required operations as first-class tools (`github_create_pr`, `github_mark_pr_ready`, `github_manage_labels`, `github_request_review`) and should always be preferred. Using `gh pr create` / `gh pr ready` / `gh pr edit --add-label` is the shell fallback for when MCP is unavailable. See `skills/pr-lifecycle/SKILL.md` ("Parent-Agent PR Recovery") for the full recovery workflow.
