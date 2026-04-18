---
name: mcp-first
description: Per-server MCP-first operation mapping — which MCP tools to prefer over shell commands for Nx, Make, Git, GitHub PR, CI, DB, AWS, browser, and Claude built-in integrations. Load when you need to know which MCP tool replaces a specific gh/pnpm/aws/nx CLI command.
---

# Skill: MCP-First

> **MCP-first principle**: the shell commands shown in AGENTS.md (Workflow, Commands sections) are **fallbacks** for when MCP servers are unavailable. When MCP tools are available, always prefer them.

## MCP Servers

| Server                  | Purpose                                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| `worktree`              | Worktree lifecycle: list, set active, run, guard, rebase, stabilize, push         |
| `legacy-sports-github`  | PR and review lifecycle (GitHub REST/GraphQL API)                                 |
| `legacy-sports-make`    | Makefile targets: validation, build, install, worktree setup                      |
| `legacy-sports-nx`      | Nx project discovery, affected analysis, target execution                         |
| `legacy-sports-jira`    | Ticket CRUD, transitions, blocker checks                                          |
| `legacy-sports-db`      | Database queries, migrations, schema generation                                   |
| `legacy-sports-ci`      | CI log queries, workflow reruns; `ci_audit_session_bash` for MCP gap audits       |
| `legacy-sports-aws`     | CloudWatch log tailing, AWS SSO status checks                                     |
| `legacy-sports-browser` | Dev server lifecycle, headless screenshots, GitHub image upload                   |
| `claude_ai_Stripe`      | Claude Code built-in Stripe integration                                           |
| `claude_ai_Atlassian`   | Jira + Confluence via OAuth 2.1. Cloud ID: `fb294606-6c8f-4b52-9a41-11fe45b77528` |

> **Server load order matters in native-worktree sessions**: Claude Code's worktree-spawned sessions only connect the first few servers from `.mcp.json` at session start (LS-2902). The load order in `.mcp.json` is: `worktree` → `legacy-sports-github` → `legacy-sports-jira` → `legacy-sports-make` → `legacy-sports-nx` → others. Each server is independently available or unavailable — a missing `worktree` server does **not** mean `legacy-sports-jira` is also missing. If a native session is missing a server, check availability with the server's status/ping tool before falling back to shell equivalents; for Jira specifically, always try `jira_auth_status` first (see Jira Operations below).

## Tool-First Concrete Substitutions

These are the specific built-in tool substitutions agents should reach for automatically instead of the Bash equivalents:

| Shell command                                                                                  | Built-in tool replacement                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grep -r "pattern" dir/`                                                                       | `Grep(pattern: "pattern", path: "dir", output_mode: "content")`                                                                                                                                                                                                                          |
| `grep -rl "pattern" dir/`                                                                      | `Grep(pattern: "pattern", path: "dir", output_mode: "files_with_matches")`                                                                                                                                                                                                               |
| `grep -rl "pattern" dir/ --include="*.ts"`                                                     | `Grep(pattern: "pattern", path: "dir", glob: "**/*.ts", output_mode: "files_with_matches")`                                                                                                                                                                                              |
| `cat file`                                                                                     | `Read(file_path: "...")`                                                                                                                                                                                                                                                                 |
| `head -N file`                                                                                 | `Read(file_path: "...", limit: N)`                                                                                                                                                                                                                                                       |
| `tail -N file`                                                                                 | `Read(file_path: "...", offset: <approx_line>, limit: N)` — use `worktree_file_info` to get line count, then `offset: total_lines - N`; when line count is unknown, estimate offset from file size or use a generous offset (e.g. 9999); for small files, omit `offset` and read in full |
| `find . -name "*.ts"`                                                                          | `Glob(pattern: "**/*.ts")`                                                                                                                                                                                                                                                               |
| `ls <dir>` (list directory contents)                                                           | `Glob(pattern: "*", path: "<dir>")` — shallow listing; use `Glob(pattern: "**/*", path: "<dir>")` for recursive                                                                                                                                                                          |
| `ls <wt-path>`, `dir <wt-path>`, `Get-ChildItem <wt-path>`                                     | `worktree_ls_tree(path: "...")` — lists Git-tracked files inside a worktree directory                                                                                                                                                                                                    |
| `Test-Path <wt-path>`, `ls <path> 2>/dev/null \|\| echo missing`                               | `worktree_file_info(paths: ["..."])` — checks existence, size, and line count without spawning a shell                                                                                                                                                                                   |
| `git -C <wt> log --oneline -- <file>`                                                          | `worktree_log({ file: "<file>" })` — restrict log to commits that touched a specific path                                                                                                                                                                                                |
| `git -C <wt> log --oneline \| grep "LS-####"`                                                  | `worktree_log({ grep: "LS-####" })` — filter commits whose message matches a pattern (e.g. Jira ticket key); case-insensitive                                                                                                                                                            |
| `git checkout -- <file>` / `git checkout HEAD -- <file>`                                       | `worktree_checkout_file(files: ["..."], worktree: "...")` — restores from HEAD, discarding both staged and unstaged changes                                                                                                                                                              |
| `git show <ref>:<file>` or `git -C <wt> show <sha>:"<path>"`                                   | `worktree_show_file(path: "...", ref: "<ref>")` — `ref` accepts any git ref (HEAD, SHA, branch, tag)                                                                                                                                                                                     |
| `git push -u origin HEAD` / `git push -u origin <branch>` (first push)                         | `worktree_push({ setUpstream: true })` — push as-is, no `remoteBranch` override needed; Jira links via PR title + commits; never pass an explicit branch name — worktree_push resolves the current branch automatically                                                                  |
| `git branch -m <newName>` (sibling worktrees only)                                             | `worktree_rename_branch({ newName: "..." })` — **do not use in native-checkbox sessions** (breaks PR detection)                                                                                                                                                                          |
| `git add <file> && git commit -m "..."`                                                        | `worktree_commit({ files: ["<file>"], message: "..." })`                                                                                                                                                                                                                                 |
| `git commit --amend -m "..."`                                                                  | `worktree_commit({ amend: true, message: "..." })` — replaces commit message; omit `message` to keep existing (`--no-edit`)                                                                                                                                                              |
| `git diff HEAD`                                                                                | `worktree_diff({ base: "HEAD" })`                                                                                                                                                                                                                                                        |
| `git branch --show-current` / `git status`                                                     | `worktree_status()`                                                                                                                                                                                                                                                                      |
| `git reset <ref>` / `git reset origin/main` (mixed — discard stale commits, keep working tree) | `worktree_reset({ ref: "<ref>" })`                                                                                                                                                                                                                                                       |
| `git reset --hard <ref>` (discard commits AND working-tree changes)                            | `worktree_reset({ ref: "<ref>", hard: true })`                                                                                                                                                                                                                                           |
| `tail ~/.claude/.../tasks/<taskId>.output`                                                     | `TaskOutput(taskId: "<taskId>")`                                                                                                                                                                                                                                                         |

**Glob limitation on Windows worktrees**: `Glob` with `path=` set to an absolute Windows worktree path may silently return empty results due to symlink traversal issues. Fall back to `worktree_ls_tree({ ref: "HEAD", path: "<dir>" })` (Git-tracked files only) or `worktree_run(command: "dir <dir>")`.

## Nx Targets

Prefer the `nx_run` MCP tool over `pnpm exec nx run <project>:<target>`. For affected targets, prefer `nx_run_affected` over `pnpm exec nx affected -t <target>`. Fall back to shell commands only when the MCP server is unavailable.

| Shell command                               | MCP tool (use this)                                        |
| ------------------------------------------- | ---------------------------------------------------------- |
| `pnpm exec nx typecheck web`                | `nx_run({ target: "typecheck", project: "web" })`          |
| `pnpm exec nx run web:typecheck`            | `nx_run({ target: "typecheck", project: "web" })`          |
| `pnpm exec nx test shared-components`       | `nx_run({ target: "test", project: "shared-components" })` |
| `pnpm exec nx build api`                    | `nx_run({ target: "build", project: "api" })`              |
| `pnpm exec nx affected -t typecheck`        | `nx_run_affected({ targets: ["typecheck"] })`              |
| `pnpm exec nx affected -t test --base=main` | `nx_run_affected({ targets: ["test"], base: "main" })`     |

> **If you find yourself writing `pnpm exec nx` in a Bash tool call during a local session, treat this as a signal that the `legacy-sports-nx` MCP server is not connected.** Check server connectivity rather than falling back silently — `nx` lives in `node_modules/.bin` and will fail with a PATH error if the symlink is missing or broken. Verify the `node_modules` symlink exists (see `.agents/skills/mcp-first/SKILL.md` — MCP Servers section), then restart the session.

## Make Targets

Prefer `make_run` MCP tool over running `make <target>` via Bash. The MCP tool enforces a target whitelist, sets appropriate timeouts, and provides structured output. For worktree creation use `make_worktree_create`; for worktree setup use `make_wt_setup` (supports symlink removal + independent `make install`).

| Shell command  | MCP tool (use this)               |
| -------------- | --------------------------------- |
| `make pc`      | `make_run({ target: "pc" })`      |
| `make test`    | `make_run({ target: "test" })`    |
| `make codegen` | `make_run({ target: "codegen" })` |
| `make install` | `make_run({ target: "install" })` |

> **If you find yourself writing `make <target>` in a Bash tool call during a local session, treat this as a signal that the `legacy-sports-make` MCP server is not connected.** Check server connectivity rather than falling back silently — raw `make pc` will fail with `nx: not found` or similar PATH errors when `node_modules/.bin` is not in `$PATH`. Using `make_run` via MCP avoids this PATH resolution problem entirely. Verify the `node_modules` symlink exists, then restart the session.

## Git Operations in Worktrees

Use `worktree_commit` instead of `git add`/`git commit` via Bash — it handles staging and committing in one operation, refuses to stage likely credential/secret files (e.g., `.env`, `credentials.*`, `*.pem`, `*.key`), and supports `amend: true` to fix commit messages before push (pass `message` to replace, omit it to keep the existing message with `--no-edit`). Use `worktree_checkout_file` instead of `git checkout [HEAD] -- <file>` to restore files to HEAD (discarding both staged and unstaged changes). Use `worktree_push` (supports `setUpstream`) instead of `git push`, `worktree_rebase` instead of `git fetch && twig rebase`, and `worktree_run` as the **catch-all for any git command not covered by a dedicated tool** (e.g., `git rm`, `git ls-files`, `git status --short`, `git stash`). These tools auto-resolve the worktree directory, refuse dangerous operations (pushing `main`, pushing during rebase), and require no manual `cd` or `-C` flags. Never use `git -C $wt <command>` via Bash when `worktree_run` can handle it.

**`worktree_run` shell on Windows**: uses Git Bash (`bash.exe` from Git for Windows) when available, falling back to `cmd.exe`. When Git Bash is used, common Unix shell idioms and utilities such as `&&`, `|`, `head`, and `grep` are available. When it falls back to `cmd.exe`, only cmd built-ins and operators like `&&` and `|` are supported — do not rely on Unix utilities (`head`, `grep`, etc.). Avoid PowerShell-specific syntax in `worktree_run` commands.

## File Size & Line Count

Use `worktree_file_info({ paths: [...] })` instead of `wc -l file1 file2 ...` via Bash to get byte sizes and, when available, line counts and approximate token counts for one or more files in a single round-trip. For files larger than 10MB, the tool returns only `bytes` (no `lines` or `approxTokens`); if `approxTokens` is omitted, fall back to `bytes` (dividing by 4 gives a rough token estimate) to decide whether `Read` will fit within its 10k-token limit or whether `offset`/`limit` chunking is needed. Accepts both relative paths (resolved against the worktree root) and absolute paths within the worktree root.

## GitHub PR Operations

> **⛔ `gh pr create` is an anti-pattern** — always use `github_create_pr` MCP tool. `gh pr create` silently targets the shell's working directory and ignores `worktreePath`, causing PRs to be created from the wrong branch in multi-worktree sessions. It is also flagged by the MCP gap auditor as a missing-awareness gap. The CLI is a fallback only for when the MCP server is confirmed unavailable.

Use the MCP tools below instead of `gh` CLI. These tools handle temp file body encoding, GraphQL thread IDs, and structured output. Fall back to `gh` CLI **only** when the MCP server is unavailable.

| `gh` CLI command                              | MCP tool (use this)                                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `gh pr create`                                | `github_create_pr` (with `draft: true`)                                                                     |
| `gh pr ready`                                 | `github_mark_pr_ready`                                                                                      |
| `gh pr edit --add-label`                      | `github_manage_labels` (supports both `add` and `remove` arrays)                                            |
| `gh pr edit --remove-label`                   | `github_manage_labels` (supports both `add` and `remove` arrays)                                            |
| `gh pr merge`                                 | `github_merge_pr` (default: merge queue; use `strategy: "direct"` for admin merge)                          |
| Remove all `ci-failure-*` labels              | `github_clear_ci_failure_labels`                                                                            |
| `gh api graphql` (resolve thread)             | `github_resolve_thread` / `github_resolve_threads`                                                          |
| `gh api` (review threads)                     | `github_get_review_threads`                                                                                 |
| `gh api` (PR reviews)                         | `github_list_reviews`                                                                                       |
| `gh pr view N --json mergeable,...`           | `github_pr_batch_status({ numbers: [N] })` — returns `mergeable`, `ciSummary`, `reviewDecision` in one call |
| `gh pr view`                                  | `github_view_pr`                                                                                            |
| `gh pr list`                                  | `github_list_prs` / `github_pr_dashboard`                                                                   |
| `gh run list` / `gh run list --branch BRANCH` | `ci_list_runs` / `ci_list_runs(branch: "BRANCH", limit: 5)`                                                 |
| `gh run view`                                 | `ci_view_run`                                                                                               |
| `gh run rerun`                                | `ci_rerun`                                                                                                  |
| `gh pr edit --body-file`                      | No MCP equivalent — `gh` CLI is correct here                                                                |

**GitHub auth-aware routing**: call `github_auth_status` at the start of any GitHub workflow. If `configured: true`, use our custom GitHub MCP tools. If `configured: false`, **stop and prompt the user** — do not silently fall back. Tell them their GitHub credentials are missing or expired, and direct them to set `GH_TOKEN`/`GITHUB_TOKEN`, run `gh auth login`, or configure `AGENT_AUTHOR_APP_PRIVATE_KEY` (see `.agents/skills/cloud-agent-mode/SKILL.md`). Only fall back to `gh` CLI after the user confirms their `gh` auth is working or explicitly asks you to try the CLI fallback.

## Built-in GitHub Tools (Claude Code on the web)

On Claude Code on the web, Claude provides built-in `mcp__github__*` tools that authenticate via the platform's own token. **Prefer these for operations where authorship is visible** (replying to threads, requesting Copilot review) — the custom `legacy-sports-github` MCP server's token fallback chain can inadvertently use the user's personal OAuth token, causing agent actions to appear under the user's GitHub username.

| Custom MCP tool                                           | Built-in equivalent (Claude Code on the web)                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `github_create_pr`                                        | `mcp__github__create_pull_request({ owner, repo, title, head, base, body, draft })`            |
| `github_mark_pr_ready`                                    | `mcp__github__update_pull_request({ owner, repo, pullNumber, draft: false })`                  |
| `github_view_pr`                                          | `mcp__github__pull_request_read({ method: "get", owner, repo, pullNumber })`                   |
| `github_get_review_threads`                               | `mcp__github__pull_request_read({ method: "get_review_comments", owner, repo, pullNumber })`   |
| `github_reply_to_review`                                  | `mcp__github__add_reply_to_pull_request_comment({ owner, repo, pullNumber, commentId, body })` |
| `github_resolve_thread`                                   | `mcp__github__resolve_review_thread({ threadId })`                                             |
| `github_resolve_threads` (batch)                          | Loop: `mcp__github__resolve_review_thread({ threadId })` per thread                            |
| `github_request_review({ prs: [number], copilot: true })` | `mcp__github__request_copilot_review({ owner, repo, pullNumber })`                             |
| `github_list_prs`                                         | `mcp__github__list_pull_requests({ owner, repo })`                                             |
| `github_list_reviews`                                     | `mcp__github__pull_request_read({ method: "get_reviews", owner, repo, pullNumber })`           |

> **Note:** Built-in `mcp__github__*` tools are NOT available on Copilot Coding Agent — use the custom `legacy-sports-github` MCP server there. See [`cloud-agent-mode/SKILL.md`](../cloud-agent-mode/SKILL.md) for the full cloud review lifecycle workflow.

## CI Operations

Use `ci_list_runs`, `ci_view_run`, `ci_get_logs`, `ci_search_logs`, and `ci_rerun` instead of `gh run` commands via Bash. These tools parse and structure log output for agent consumption.

| `gh` CLI command                           | MCP tool (use this)                             |
| ------------------------------------------ | ----------------------------------------------- |
| `gh run list --branch BRANCH --limit N`    | `ci_list_runs(branch: "BRANCH", limit: N)`      |
| `gh run list --json databaseId,status,...` | `ci_list_runs(branch: "BRANCH", limit: N)`      |
| `gh run view RUN_ID --log-failed`          | `ci_get_logs(runId: RUN_ID, failedOnly: true)`  |
| `gh run view RUN_ID --log`                 | `ci_get_logs(runId: RUN_ID, failedOnly: false)` |
| `gh run rerun RUN_ID --failed`             | `ci_rerun(runId: RUN_ID, onlyFailedJobs: true)` |

**CI status and PR events are surfaced natively by Claude Code** — no wait tool needed. After pushing, Claude Code automatically receives and surfaces CI failures, review events, and merge status. Never use `sleep` + polling loops (`sleep N && gh run view`, `sleep N && gh pr view`, `sleep N && gh pr checks <pr>`, `ci_view_run` in a loop, `github_view_pr` in a loop) — these waste context and shell round-trips.

## Jira Operations

**Auth-aware routing and fallback order**: always call `jira_auth_status` before any Jira operation — even when other MCP servers (e.g. `worktree`) failed to load. The `legacy-sports-jira` server is independently available. Fallback chain: `jira_*` MCP tools → Atlassian plugin (`mcp__claude_ai_Atlassian__*`) → `acli` CLI (last resort, local-only). Never skip to `acli` just because `worktree_*` tools are unavailable.

Use `jira_list_children` instead of `searchJiraIssuesUsingJql` with `parent = LS-####` to list children of an epic or story. Raw JQL returns verbose markdown-formatted output that can overflow the MCP context limit (~192K chars for 50 results); `jira_list_children` returns compact structured JSON with pagination support.

| Pattern to avoid                                                              | Correct MCP tool                                                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `searchJiraIssuesUsingJql(jql: "parent = LS-#### ORDER BY created ASC", ...)` | `jira_list_children(key: "LS-####")` — supports `status` filter and pagination via `pageToken`                     |
| `acli jira workitem view LS-####`                                             | `jira_view(key: "LS-####")` — always try MCP first; `acli` is last resort after both MCP and Atlassian plugin fail |
| `acli jira workitem transition --key LS-#### --status "In Progress"`          | `jira_transition(key: "LS-####", status: "In Progress")` — same fallback order as above                            |

## Database Operations

Use `db_migration_status` instead of `pnpm --prefix lib/db-client run db:status` via Bash, `db_migrate` instead of `pnpm --prefix lib/db-client run db:up`, `db_query` for ad-hoc SQL, `db_codegen` for GraphQL codegen, and `db_print_schema` for schema regeneration.

## AWS Operations

Use `aws_logs_tail` instead of `aws logs tail` via Bash, and `aws_sso_status` to check credentials before any AWS operation. If `aws_sso_status` returns expired or unconfigured, **stop immediately and prompt the user to run `aws sso login`** — do not retry the failing command. See `.agents/skills/infrastructure/references/aws-sso-login.md` for the exact prompt pattern.

## Claude Built-in Integrations

Claude Code provides native integrations that work without local credentials:

- **Stripe** (`mcp__claude_ai_Stripe__*`): Full Stripe API access — create/list customers, products, prices, invoices, subscriptions, payment links, refunds, coupons, and disputes. Use when working on `lambdas/stripe-webhook`, `lambdas/apple-iap`, or any billing/payment code. Search Stripe docs with `search_stripe_documentation`.
- **Atlassian** (`mcp__claude_ai_Atlassian__*`): Full Jira + Confluence access via the [Atlassian Plugin](https://claude.com/plugins/atlassian) (OAuth 2.1, no credentials needed). Site: `bkrupa.atlassian.net`, cloud ID: `fb294606-6c8f-4b52-9a41-11fe45b77528`. Provides JQL search, issue CRUD, transitions, comments, worklogs, and Confluence page management. **Preferred** on Claude Code on the web; use as fallback when the custom `legacy-sports-jira` MCP server is unavailable or its API calls fail. Tools require the `cloudId` parameter — always pass the cloud ID above.

## Browser Operations

Use `browser_dev_start` to start a dev server, `browser_navigate` + `browser_screenshot` to capture UI state, and `browser_screenshot_upload` to get GitHub-hosted image URLs for PR bodies. Always call `browser_cleanup` before ending a workflow. See `.agents/skills/pr-lifecycle/references/agent-screenshots.md` for the full workflow.
