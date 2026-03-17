# MCP GitHub Server

Pull request and review lifecycle management via the GitHub CLI and GraphQL API.

## Server ID

`legacy-sports-github`

## Tools

- **github_list_prs** — List PRs with filters (state, branch, author, label, search)
- **github_view_pr** — View detailed PR info (title, body, state, checks, reviews, diff stats)
- **github_create_pr** — Create a PR (writes body to temp file to avoid encoding issues)
- **github_request_review** — Request reviewers including Copilot bot (`copilot-pull-request-reviewer[bot]`)
- **github_get_review_threads** — Fetch review threads via GraphQL (unresolved/resolved, comments with path+line)
- **github_resolve_thread** — Resolve a review thread via GraphQL mutation
- **github_manage_labels** — Add or remove labels on a PR (e.g. `merge-when-ready`)
- **github_get_repo_info** — Get repo owner, name, default branch, and URL

## How It Works

All operations use the `gh` CLI, which must be authenticated (`gh auth status`). PR listing, viewing, creation, and label management use `gh pr` subcommands. Review thread operations use `gh api graphql` for the GitHub GraphQL API.

The server spawns `gh` as a child process (not via shell) for safety and reliability. On Windows, it uses `gh.exe` directly.

## Prerequisites

- `gh` CLI installed and authenticated (`gh auth login`)
- Repository must be a GitHub repo with push access
