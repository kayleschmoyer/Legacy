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

> **Server load order matters in native-worktree sessions**: Claude Code's worktree-spawned sessions only connect the first few servers from `.mcp.json` at session start (LS-2902). The ordering prioritizes ticket-work tools (`worktree`, `legacy-sports-github`, `legacy-sports-make`, `legacy-sports-nx`). If a native session is missing a server, fall back to shell or move to a sibling worktree.

## Tool-First Concrete Substitutions

These are the specific built-in tool substitutions agents should reach for automatically instead of the Bash equivalents:

| Shell command                                                | Built-in tool replacement                                                                                                   |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `grep -r "pattern" dir/`                                     | `Grep(pattern: "pattern", path: "dir", output_mode: "content")`                                                             |
| `grep -rl "pattern" dir/`                                    | `Grep(pattern: "pattern", path: "dir", output_mode: "files_with_matches")`                                                  |
| `grep -rl "pattern" dir/ --include="*.ts"`                   | `Grep(pattern: "pattern", path: "dir", glob: "**/*.ts", output_mode: "files_with_matches")`                                 |
| `cat file`                                                   | `Read(file_path: "...")`                                                                                                    |
| `head -N file`                                               | `Read(file_path: "...", limit: N)`                                                                                          |
| `tail -N file`                                               | `Read` to determine `total_lines`, then `Read(offset: <total_lines - N>, limit: N)`                                         |
| `find . -name "*.ts"`                                        | `Glob(pattern: "**/*.ts")`                                                                                                  |
| `git checkout -- <file>` / `git checkout HEAD -- <file>`     | `worktree_checkout_file(files: ["..."], worktree: "...")` — restores from HEAD, discarding both staged and unstaged changes |
| `git show <ref>:<file>` or `git -C <wt> show <sha>:"<path>"` | `worktree_show_file(path: "...", ref: "<ref>")` — `ref` accepts any git ref (HEAD, SHA, branch, tag)                        |
| `git push -u origin HEAD` (first push)                       | `worktree_push({ setUpstream: true })` — push as-is, no `remoteBranch` override needed; Jira links via PR title + commits   |
| `git branch -m <newName>` (sibling worktrees only)           | `worktree_rename_branch({ newName: "..." })` — **do not use in native-checkbox sessions** (breaks PR detection)             |
| `git add <file> && git commit -m "..."`                      | `worktree_commit({ files: ["<file>"], message: "..." })`                                                                    |
| `git diff HEAD`                                              | `worktree_diff({ base: "HEAD" })`                                                                                           |
| `git branch --show-current` / `git status`                   | `worktree_status()`                                                                                                         |
| `sleep N && gh run view <runId>` (poll loop)                 | `ci_wait_for_run({ runId: "<runId>" })`                                                                                     |
| `tail ~/.claude/.../tasks/<taskId>.output`                   | `TaskOutput(taskId: "<taskId>")`                                                                                            |

**Glob limitation on Windows worktrees**: `Glob` with `path=` set to an absolute Windows worktree path may silently return empty results due to symlink traversal issues. Fall back to `worktree_ls_tree({ ref: "HEAD", path: "<dir>" })` (Git-tracked files only) or `worktree_run(command: "dir <dir>")`.

## Nx Targets

Prefer the `nx_run` MCP tool over `pnpm exec nx run <project>:<target>`. For affected targets, prefer `nx_run_affected` over `pnpm exec nx affected -t <target>`. Fall back to shell commands only when the MCP server is unavailable.

## Make Targets

Prefer `make_run` MCP tool over running `make <target>` via Bash. The MCP tool enforces a target whitelist, sets appropriate timeouts, and provides structured output. For worktree creation use `make_worktree_create`; for worktree setup use `make_wt_setup` (supports symlink removal + independent `make install`).

## Git Operations in Worktrees

Use `worktree_commit` instead of `git add`/`git commit` via Bash — it handles staging and committing in one operation and refuses to stage likely credential/secret files (e.g., `.env`, `credentials.*`, `*.pem`, `*.key`). Use `worktree_checkout_file` instead of `git checkout [HEAD] -- <file>` to restore files to HEAD (discarding both staged and unstaged changes). Use `worktree_push` (supports `setUpstream`) instead of `git push`, `worktree_rebase` instead of `git fetch && twig rebase`, and `worktree_run` as the **catch-all for any git command not covered by a dedicated tool** (e.g., `git rm`, `git ls-files`, `git status --short`, `git stash`). These tools auto-resolve the worktree directory, refuse dangerous operations (pushing `main`, pushing during rebase), and require no manual `cd` or `-C` flags. Never use `git -C $wt <command>` via Bash when `worktree_run` can handle it.

**`worktree_run` shell on Windows**: uses Git Bash (`bash.exe` from Git for Windows) when available, falling back to `cmd.exe`. When Git Bash is used, common Unix shell idioms and utilities such as `&&`, `|`, `head`, and `grep` are available. When it falls back to `cmd.exe`, only cmd built-ins and operators like `&&` and `|` are supported — do not rely on Unix utilities (`head`, `grep`, etc.). Avoid PowerShell-specific syntax in `worktree_run` commands.

## File Size & Line Count

Use `worktree_file_info({ paths: [...] })` instead of `wc -l file1 file2 ...` via Bash to get byte sizes and, when available, line counts and approximate token counts for one or more files in a single round-trip. For files larger than 10MB, the tool returns only `bytes` (no `lines` or `approxTokens`); if `approxTokens` is omitted, fall back to `bytes` (dividing by 4 gives a rough token estimate) to decide whether `Read` will fit within its 10k-token limit or whether `offset`/`limit` chunking is needed. Accepts both relative paths (resolved against the worktree root) and absolute paths within the worktree root.

## GitHub PR Operations

Use the MCP tools below instead of `gh` CLI. These tools handle temp file body encoding, GraphQL thread IDs, and structured output. Fall back to `gh` CLI **only** when the MCP server is unavailable.

| `gh` CLI command                  | MCP tool (use this)                                |
| --------------------------------- | -------------------------------------------------- |
| `gh pr create`                    | `github_create_pr` (with `draft: true`)            |
| `gh pr ready`                     | `github_mark_pr_ready`                             |
| `gh pr edit --add-label`          | `github_manage_labels`                             |
| Remove all `ci-failure-*` labels  | `github_clear_ci_failure_labels`                   |
| `gh api graphql` (resolve thread) | `github_resolve_thread` / `github_resolve_threads` |
| `gh api` (review threads)         | `github_get_review_threads`                        |
| `gh api` (PR reviews)             | `github_list_reviews`                              |
| `gh pr view`                      | `github_view_pr`                                   |
| `gh pr list`                      | `github_list_prs` / `github_pr_dashboard`          |
| `gh run list`                     | `ci_list_runs`                                     |
| `gh run view`                     | `ci_view_run`                                      |
| `gh run rerun`                    | `ci_rerun`                                         |
| `gh pr edit --body-file`          | No MCP equivalent — `gh` CLI is correct here       |

**GitHub auth-aware routing**: call `github_auth_status` at the start of any GitHub workflow. If `configured: true`, use our custom GitHub MCP tools. If `configured: false`, **stop and prompt the user** — do not silently fall back. Tell them their GitHub credentials are missing or expired, and direct them to set `GH_TOKEN`/`GITHUB_TOKEN`, run `gh auth login`, or configure `AGENT_AUTHOR_APP_PRIVATE_KEY` (see `.agents/skills/cloud-agent-mode/SKILL.md`). Only fall back to `gh` CLI after the user confirms their `gh` auth is working or explicitly asks you to try the CLI fallback.

## Built-in GitHub Tools (Claude Code on the web)

On Claude Code on the web, Claude provides built-in `mcp__github__*` tools that authenticate via the platform's own token. **Prefer these for operations where authorship is visible** (replying to threads, requesting Copilot review) — the custom `legacy-sports-github` MCP server's token fallback chain can inadvertently use the user's personal OAuth token, causing agent actions to appear under the user's GitHub username.

| Custom MCP tool                        | Built-in equivalent (Claude Code on the web)                                                                                                                                                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github_create_pr`                     | `mcp__github__create_pull_request({ owner, repo, title, head, base, body, draft })`                                                                                                                                                                                                                        |
| `github_mark_pr_ready`                 | `mcp__github__update_pull_request({ owner, repo, pullNumber, draft: false })`                                                                                                                                                                                                                              |
| `github_view_pr`                       | `mcp__github__pull_request_read({ method: "get", owner, repo, pullNumber })`                                                                                                                                                                                                                               |
| `github_get_review_threads`            | `mcp__github__pull_request_read({ method: "get_review_comments", owner, repo, pullNumber })`                                                                                                                                                                                                               |
| `github_reply_to_thread`               | `mcp__github__add_reply_to_pull_request_comment({ owner, repo, pullNumber, commentId, body })`                                                                                                                                                                                                             |
| `github_resolve_thread`                | `mcp__github__resolve_review_thread({ threadId })`                                                                                                                                                                                                                                                         |
| `github_resolve_threads` (batch)       | Loop: `mcp__github__resolve_review_thread({ threadId })` per thread                                                                                                                                                                                                                                        |
| `github_request_review(copilot: true)` | `mcp__github__request_copilot_review({ owner, repo, pullNumber })`                                                                                                                                                                                                                                         |
| `github_list_prs`                      | `mcp__github__list_pull_requests({ owner, repo })`                                                                                                                                                                                                                                                         |
| `github_list_reviews`                  | `mcp__github__pull_request_read({ method: "get_reviews", owner, repo, pullNumber })`                                                                                                                                                                                                                       |
| N/A (polling)                          | `mcp__github__subscribe_pr_activity({ owner, repo, pullNumber })` — real-time events                                                                                                                                                                                                                       |
| N/A (polling loop)                     | `github_wait_for_pr_event({ number, waitFor?, timeoutMs? })` — **preferred for single-PR shepherding**: blocks until an agent-actionable event fires (CI fail/pass, new review thread, review decision, conflicts, merged, closed); covers both Check Runs (Actions) and Commit Statuses (bot/external CI) |

> **Note:** Built-in `mcp__github__*` tools are NOT available on Copilot Coding Agent — use the custom `legacy-sports-github` MCP server there. See [`cloud-agent-mode/SKILL.md`](../cloud-agent-mode/SKILL.md) for the full cloud review lifecycle workflow.

## CI Operations

Use `ci_list_runs`, `ci_view_run`, `ci_get_logs`, `ci_search_logs`, and `ci_rerun` instead of `gh run` commands via Bash. These tools parse and structure log output for agent consumption.

**Waiting for PR events (preferred)**: use `github_wait_for_pr_event({ number: <PR#> })` to block until something agent-actionable happens on the PR — CI failing/passing, new review thread (Copilot or human), review decision, conflicts, merged, or closed. Returns `{ event, pr, ... }` so the agent immediately knows what to do next. This replaces the pattern of orchestrating `ci_wait_for_run` + `github_view_pr` in a loop.

**Waiting for a specific CI run**: use `ci_wait_for_run({ runId: "<id>" })` when you have a specific run ID (e.g. after `ci_rerun`). After it resolves, return to the `github_wait_for_pr_event` loop for the next event.

| Shell/polling pattern (⛔ NEVER use)                                             | MCP tool (use this instead)                                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `sleep N && gh run view <runId> --json status,conclusion` (loop)                 | `ci_wait_for_run({ runId: "<id>" })`                                                                                |
| `sleep N && gh pr view <pr> --json statusCheckRollup` (loop)                     | `github_wait_for_pr_event({ number: <PR#> })` — blocks for any agent-actionable event including CI + review threads |
| `Start-Sleep -Seconds N; Write-Host "..."` (waiting for CI or Copilot re-review) | `github_wait_for_pr_event({ number: <PR#> })` — push-based; no sleep needed                                         |
| `Start-Sleep -Seconds N; ci_list_runs(...)` (polling for a run)                  | `ci_wait_for_run({ runId: "<id>" })` — blocks until the run completes                                               |
| `github_view_pr` in a loop waiting for merge/review/CI                           | `github_wait_for_pr_event({ number: <PR#> })` — single blocking call replaces the whole loop                        |

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
