---
name: subagent-templates
description: Copy-paste template blocks for spawning subagents via the Agent tool — tool preference hints, setup steps for work subagents, and recovery patterns for parent agents. Load when spawning subagents or dispatching parallel work.
metadata:
  scope: '**'
---

# Skill: Subagent Tool Preferences

Subagents spawned via the `Agent` tool do **not** inherit AGENTS.md context. When spawning subagents (especially `Explore` type), **always include tool preference hints in the prompt**:

```
Agent(subagent_type: "Explore", prompt: """
  <task description here>

  Search root: <worktree-path>   ← REQUIRED when called from a worktree session (see path note below)

  Tool rules: Use Glob (not find/ls), Grep (not grep/rg), Read (not cat/head/tail).

  Tool preferences:
  - Use Glob (not find/ls) for file discovery — `find . -name "*.tsx"` → `Glob(pattern: "**/*.tsx", path: "<worktree-path>")`, `find $wt -name "*.ts"` → `Glob(pattern: "src/**/*.ts", path: "<worktree-path>")`. Always pass path: "<worktree-path>" when running in a worktree session so returned paths belong to the worktree, not the main repo. Glob is purpose-built: faster, returns results sorted by modification time, requires no shell spawning, and gives a cleaner permission prompt. On absolute Windows worktree paths, fall back to worktree_ls_tree or worktree_run(command: "dir <dir>") (use `dir` not `ls` — worktree_run may resolve to cmd.exe where `ls` is unavailable)
  - Use Grep (not grep/rg/`find | xargs grep`) for content search — Grep accepts both pattern and glob filter in one call, so `find | xargs grep` is never needed. Common mappings: `grep -n "pattern" file` → `Grep(pattern: "pattern", path: "<worktree-path>", output_mode: "content")`; `grep -rn "pattern" dir/` → `Grep(pattern: "pattern", path: "<worktree-path>/dir", output_mode: "content")` (line numbers are on by default); `grep -i "pattern"` → `Grep(pattern: "pattern", path: "...", "-i": true, output_mode: "content")`
  - Use Read (not cat/head/tail) for reading files — including uncommitted changes and untracked/new files
  - Use worktree_show_file(path: "...", ref: "HEAD") for **tracked** files at a **local** Git ref when a worktree is active (worktree_set has been called) — it runs `git show <ref>:<path>` so it does NOT see uncommitted working-tree changes or untracked files, but avoids needing absolute paths. `ref` accepts local git refs only — HEAD, commit SHAs, local branch names, or tags (e.g. `worktree_show_file(path: ".claude/hooks/guard-bash-mcp-first.sh", ref: "abc1234")` reads the file at that commit)
  - Use worktree_show_remote(ref: "origin/main", path: "...") for files at **remote** branch refs (e.g. `origin/main:path`, `origin/<branch>:path`) — this is the MCP-first replacement for `git show origin/main:<path>` via Bash; run `git fetch` first if the remote may be stale
  - Return paths as absolute paths under <worktree-path> — never return bare main-repo paths (e.g. /d/code/legacy-sports/...) when running in a worktree session
""")
```

These lines eliminate the most common subagent Bash anti-patterns (`find` 56x/session, `grep` 23x, `ls` 8x, `cat` on worktree paths 4x, `git show origin/main:path` 5x+ in production audits). Without them, subagents default to shell commands because they lack the project's MCP-first context.

> **Worktree path hazard**: Explore subagents default to scanning from the main repo root (`D:\code\legacy-sports`) and return main-repo absolute paths (e.g. `/d/code/legacy-sports/tools/mcp/worktree-server/src/index.ts`). If the parent agent passes those paths directly to `Edit`/`Write`, changes land in the **main repo working tree**, not the active worktree — and `git status` on the worktree shows clean. Two safeguards:
>
> 1. **Pass the worktree `path:` explicitly** in every Glob/Grep call in the Explore prompt (see template above).
> 2. **Substitute before editing**: after receiving any file path from an Explore subagent, replace the main-repo prefix (`D:\code\legacy-sports\` / `/d/code/legacy-sports/`) with the active worktree path before passing to `Edit`/`Write`. Never assume a path returned by a subagent targets the worktree.

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

  Tool rules: Use Glob (not find/ls), Grep (not grep/rg), Read (not cat/head/tail).

  Tool preferences:
  - Use Grep to search for the symbol/pattern directly before using Glob
  - Use Glob (not find/ls) for file discovery — `find . -name "*.tsx"` → `Glob(pattern: "**/*.tsx")`
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
  - Use dedicated worktree_* tools for git operations (preferred over git -C via Bash or worktree_run); git -C is the shell fallback when MCP tools are unavailable
  - Use worktree_commit/worktree_push for commits and pushes
  - Use worktree_fetch() instead of git fetch origin (or worktree_run for fetch)
  - Use worktree_stash()/worktree_stash_pop() instead of git stash/git stash pop
  - Use worktree_unstage({ files }) instead of git reset HEAD -- <files>
  - Use worktree_rm({ path }) instead of git rm or file deletion
  - Use worktree_is_tracked({ paths }) instead of git ls-files
  - Use worktree_diff({ base: "HEAD" }) to inspect uncommitted changes (replaces git -C <wt> diff HEAD)
  - Use worktree_status() to get current branch and working-tree status (replaces git -C <wt> branch --show-current / git status)
  - Use worktree_reset({ sha: "<sha>", mode: "mixed" }) for mixed reset (replaces git reset <ref> / git reset origin/main); use worktree_reset({ sha: "<sha>" }) for hard reset (mode defaults to 'hard'; replaces git reset --hard <ref>)
  - Use worktree_run only as a last resort for git operations without a dedicated tool (e.g. git merge-base, git cherry-pick, git tag, git add after manual conflict resolution)
```

> **Hard rule — same-ticket fan-out across a shared worktree (LS-9308).** The `worktree_*` tools above are MCP-wrapped equivalents of raw git, not a safety boundary: `worktree_stash`/`worktree_reset` (like `git stash`/`git reset`) operate on the **entire working tree**, not a per-caller scope. When multiple subagents are dispatched into the **same** worktree — e.g. fanning out one subagent per disjoint file-list within a single ticket/PR, a pattern large mechanical cleanups (lint/type fixes, codemod-style tickets) naturally take — a single subagent calling `worktree_stash()` or `worktree_reset()` (or their raw `git stash`/`git reset` counterparts) silently snapshots or discards **every other concurrent subagent's uncommitted edits**, not just its own. This is not hypothetical: it caused a live data-loss incident during LS-9296 (58-file ESLint cleanup, 6 concurrent subagents, no per-agent isolation) — one subagent ran `git stash` to "check something in isolation," scooped up ~40+ files of other subagents' uncommitted work, and the resulting `stash pop` conflict/abort was only diagnosable via `git reflog` forensics.
>
> This pattern is distinct from the "Work Subagents (Multi-Ticket Orchestrators)" section below — that section's `isolation: "worktree"` guidance is framed around dispatching **one subagent per ticket**. The rule here applies whenever **multiple subagents share one worktree on the same ticket**, whether or not `isolation: "worktree"` is set for the ticket-level dispatch itself. Two compliant options, pick one per dispatch:
>
> 1. **Prefer:** give each fanned-out subagent its own isolated worktree (`Agent(isolation: "worktree", ...)`) even though all subagents serve the same ticket/PR — the orchestrating session merges/cherry-picks their disjoint-file diffs back onto the shared branch itself once each subagent reports done.
> 2. **If a single shared worktree is intentional** (e.g. isolation overhead isn't worth it for a small fan-out): fanned-out subagents **must never run any git state-mutating command** — no `worktree_stash`/`worktree_reset`/`git stash`/`git reset`/`git checkout` of paths outside their assigned file list, not even "to check something in isolation." Subagents in this mode edit their assigned files only; all git operations (commit, stash, reset, checkout) stay owned exclusively by the orchestrating session, which serializes them after each subagent reports its edits complete. State this restriction explicitly in every such subagent's prompt — do not rely on it being inferred from the tool-preference block above.
>
> `worktree_stash()`/`worktree_reset()` themselves have no mechanism to detect or warn about other live sessions/processes attached to the same worktree — do not rely on them to fail safe; the rule above is the only guard.

## PR Sweep Subagents

For subagents running PR sweeps (pr-lifecycle skill, `references/sweep.md`), also include:

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

> **Note on dispatch model**: all current multi-ticket orchestrators — `/sweep-prs`, `/work-bugs`, `/work-mcp-gaps`, and `/work-ticket` Parent Mode — dispatch **chips** via `mcp__ccd_session__spawn_task`. Each chip is its own Claude Code session that runs the native worktree flow internally — it does NOT need the setup block below. The work-subagent template here is the **fallback** for any orchestrator running in an environment where `mcp__ccd_session__spawn_task` is unavailable (ToolSearch returns no result).

For **work subagents** dispatched via `Agent(isolation: "worktree")`, always include **setup steps** before the work instructions — the subagent's ephemeral worktree starts empty.

The canonical setup + tool preferences block lives in [`.agents/shared/subagent-setup.md`](../../shared/subagent-setup.md) (symlinked as `references/subagent-setup.md` in skills that use it):

@../../shared/subagent-setup.md

Work subagents inherit all MCP connections from the parent session (the full stdio + connector surface — see [mcp-first → Tool Surfaces](../mcp-first/references/tool-surfaces.md#tool-surfaces)), so `github_open_pr`, `worktree_commit`, `make_run`, `jira_transition` etc. are all available. Use this pattern only when `mcp__ccd_session__spawn_task` is confirmed unavailable — chips are always preferred over `Agent(isolation: "worktree")` for multi-ticket orchestration.

## Parent-Agent Recovery

**When a subagent fails to push or create a PR**, the parent agent should prefer MCP tools to recover; use `gh` CLI only when MCP is unavailable:

```
worktree_push(worktree: "<subagent-worktree-path>", setUpstream: true)
github_open_pr(head: "<branch-name>", title: "...", body: "...", draft: true)  # branch-name from subagent's worktree_status().headRefName
github_manage_labels(prs: [<PR#>], add: ["agent-in-progress"])
github_mark_pr_ready(number: <PR#>)
```

The `legacy-sports-github` MCP server exposes all required operations as first-class tools (`github_open_pr`, `github_mark_pr_ready`, `github_manage_labels`) and should always be preferred. Using `gh pr create` / `gh pr ready` / `gh pr edit --add-label` is the shell fallback for when MCP is unavailable. See `skills/pr-lifecycle/SKILL.md` ("Parent-Agent PR Recovery") for the full recovery workflow.
