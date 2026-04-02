---
name: mcp-first
description: Per-server MCP-first operation mapping — which MCP tools to prefer over shell commands for Nx, Make, Git, GitHub PR, CI, DB, AWS, browser, and Claude built-in integrations. Load when you need to know which MCP tool replaces a specific gh/pnpm/aws/nx CLI command.
---

# Skill: MCP-First

> **MCP-first principle**: the shell commands shown in AGENTS.md (Workflow, Commands sections) are **fallbacks** for when MCP servers are unavailable. When MCP tools are available, always prefer them.

## Nx Targets

Prefer the `nx_run` MCP tool over `pnpm exec nx run <project>:<target>`. For affected targets, prefer `nx_run_affected` over `pnpm exec nx affected -t <target>`. Fall back to shell commands only when the MCP server is unavailable.

## Make Targets

Prefer `make_run` MCP tool over running `make <target>` via Bash. The MCP tool enforces a target whitelist, sets appropriate timeouts, and provides structured output. For worktree creation use `make_worktree_create`; for worktree setup use `make_wt_setup` (supports junction removal + independent `make install`).

## Git Operations in Worktrees

Use `worktree_commit` instead of `git add`/`git commit` via Bash — it handles staging and committing in one operation and refuses to stage likely credential/secret files (e.g., `.env`, `credentials.*`, `*.pem`, `*.key`). Use `worktree_push` (supports `setUpstream`) instead of `git push`, `worktree_rebase` instead of `git fetch && twig rebase`, and `worktree_run` as the **catch-all for any git command not covered by a dedicated tool** (e.g., `git rm`, `git ls-files`, `git status --short`, `git stash`). These tools auto-resolve the worktree directory, refuse dangerous operations (pushing `main`, pushing during rebase), and require no manual `cd` or `-C` flags. Never use `git -C $wt <command>` via Bash when `worktree_run` can handle it.

**`worktree_run` shell on Windows**: uses Git Bash (`bash.exe` from Git for Windows) when available, falling back to `cmd.exe`. When Git Bash is used, common Unix shell idioms and utilities such as `&&`, `|`, `head`, and `grep` are available. When it falls back to `cmd.exe`, only cmd built-ins and operators like `&&` and `|` are supported — do not rely on Unix utilities (`head`, `grep`, etc.). Avoid PowerShell-specific syntax in `worktree_run` commands.

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

## CI Operations

Use `ci_list_runs`, `ci_view_run`, `ci_get_logs`, `ci_search_logs`, and `ci_rerun` instead of `gh run` commands via Bash. These tools parse and structure log output for agent consumption.

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
