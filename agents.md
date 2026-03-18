# AI Agent Quick Start

**Copilot users**: See `.github/copilot-instructions.md` (auto-loaded)

**Other agents**: Load `.agents/skills/worktree-workflow/SKILL.md` to start

## CRITICAL

- **NEVER commit to main** — create a worktree first: `make worktree TICKET=#### DESC=description`
- **ALWAYS drive to PR** — work is NOT complete until `gh pr create` runs and Jira moves to "In Review"
- **One ticket = one worktree = one PR** — never mix unrelated changes
- **Shared node_modules** — never `make clean`/`make install` in the main repo while worktrees exist
- **No `console.*`** — use `LOGGER` from `@legacy-sports/logging`
- **E2E tests are hermetic** — never `route.continue()`, use `route.fallback()`
- **Kill background servers when done** — `make kill-stale`

## Workflow (summary)

1. Jira: `jira_create_ticket` → `jira_check_blockers` → `jira_transition` "In Progress"
2. Worktree: `make worktree TICKET=#### DESC=description` → `make wt-setup WT=$wt`
3. Code + commit from `$wt`
4. Rebase: `git fetch origin ; twig rebase` → stabilize → `make pc` → push
5. PR: `gh pr create --title "LS-#### type(scope): msg" --body-file .github/tmp-pr-body.md --base main`
6. Jira: "In Review" → Cleanup: `twig worktree clean`

## Environment

Windows PowerShell · Nx monorepo · pnpm 9.12.1 · Jira:LS · twig

## Docs Index

All skills live under `.agents/skills/<name>/SKILL.md`. Key skills:

| Need                     | Skill name(s)                                                    |
| ------------------------ | ---------------------------------------------------------------- |
| Full workflow            | `worktree-workflow`                                              |
| Architecture             | `architecture`                                                   |
| DB (query/schema/dump)   | `db-query`, `db-schema`, `db-dump`, `db-restore`                 |
| E2E / Integration tests  | `e2e-testing`, `integration-testing`                             |
| Bug fixes / lint / types | `fix-bugs`, `fix-lint`, `fix-types`                              |
| New app/lambda/lib/MCP   | `create-app`, `create-lambda`, `create-lib`, `create-mcp-server` |
| PR creation/operations   | `create-pr`, `pr-operations`                                     |
| Rebase / merge conflicts | `rebase-conflicts`, `resolve-merge-conflicts`                    |
| MCP (DB/Jira/worktree)   | `mcp-db`, `mcp-jira`, `mcp-worktree`                             |
| All skills               | `.agents/skills/`                                                |

Tech stack: React Native · Next.js · Lambda · GraphQL · PostgreSQL/Drizzle · Terraform
