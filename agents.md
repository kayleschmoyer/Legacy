# AI Agent Quick Start

**Copilot users**: See `.github/copilot-instructions.md` (auto-loaded)

**Other agents**: Load `.github/skills/workflow-ticket-to-pr/SKILL.md` to start

## ≡ƒÜ¿ CRITICAL

**NEVER commit to main** ΓÇö create a worktree first: `twig worktree create LS-####/description`

**ALWAYS drive to PR** ΓÇö your work is NOT complete until `gh pr create` is run and Jira is moved to "In Review". Passing `make pc` is a checkpoint, not the finish line. Stopping after code changes or after `make pc` without opening a PR is the single most common agent failure mode.

## Workflow

1. Ticket: use `jira_create_ticket` MCP tool, or `acli jira workitem create --summary "..." --project LS --type Task --json | ConvertFrom-Json` ΓåÆ note `$key` (skip if ticket exists) 2. **Jira "In Progress" immediately**: use `jira_transition` MCP tool, or `acli jira workitem transition --key LS-#### --status "In Progress"` ΓÇö do this before any other steps 2b. **Dependency check**: use `jira_check_blockers` MCP tool, or inspect "blocked-by" links ΓÇö if the blocker is **not** In Review or Done, **STOP** (do not proceed). If In Review, use its branch as parent. If Done or no blockers, base off `origin/main`. 3. Worktree: `twig worktree create $key/description` ΓåÆ note path ΓåÆ `make wt-setup WT=$wt` (or manually: `make install` + copy `.env` + junction `.twig`) 3b. **Agent multi-root access** (optional): `make sync-worktrees` ΓåÆ `code legacy-sports.code-workspace` ΓÇö gives agents search access across all worktrees 4. Code + commit 5. Rebase: `git fetch origin ; twig rebase` 5b. **Post-rebase stabilization (BEFORE push)**: `make install ; pnpm exec nx run db:print-schema ; pnpm exec nx affected -t codegen --base=origin/main` ΓÇö **do NOT push until `make pc` passes** 6. `make pc` (must pass before pushing) ΓåÆ `git push --force-with-lease origin HEAD` 7. PR: `gh pr create --title "LS-#### type(scope): msg" --body-file .github/tmp-pr-body.md --base main` ΓåÆ `.\scripts\cleanup-pr-body.ps1` ΓåÆ Jira "In Review" (see `.github/skills/create-pr/SKILL.md`) 8. Cleanup: `twig worktree clean`

## Rules

**Drive to PR** ΓÇö code ΓåÆ rebase ΓåÆ stabilize (`make install` + codegen) ΓåÆ `make pc` ΓåÆ push ΓåÆ `gh pr create` ΓåÆ Jira "In Review". **Do NOT push until `make pc` passes** ΓÇö pushing before validating is the #1 cause of post-rebase CI failures.
**Shared node_modules ΓÇö do not mutate** ΓÇö Worktrees share `node_modules` via junctions to the main repo. Never run `make clean`, `make install`, or `pnpm install` in `D:\code\legacy-sports` while worktrees are active. Only install/clean inside your own worktree with independent `node_modules`.
**Never raw `pnpm install`** ΓÇö always use `make install` (or `make install-force`). The Makefile targets acquire a file lock (`.pnpm-install.lock`) that prevents concurrent installs from corrupting the shared `node_modules`. `make wt-setup` also shares this lock.
Nx only (`pnpm exec nx affected -t <target>`) PowerShell (`;` chains) Fix root causes Update Jira No `console.*` ΓÇö use `LOGGER` from `@legacy-sports/logging` (exceptions: `lib/logging/`, `apps/cli/`, migrations, build scripts)
**E2E tests are hermetic** — never use `route.continue()` in E2E tests (no backend in CI). Use `route.fallback()` to cascade through the 3-layer mock architecture (test → auth → baseline); only the final baseline handler should `route.fulfill()`. When changing login/landing page UI, update E2E selectors in the same PR (see `.github/skills/e2e-testing/SKILL.md`).
**Prefer MCP tools** ΓÇö for Jira and DB operations, prefer the MCP tools (`jira_*`, `db_*`) over CLI commands when available ΓÇö they return structured data and have built-in guardrails. See `.github/skills/mcp-jira/SKILL.md` and `.github/skills/mcp-db/SKILL.md`.
**Resolve PR review threads** ΓÇö when addressing PR review comments (from Copilot or any reviewer), **always resolve each thread** after pushing the fix. Use the GraphQL `resolveReviewThread` mutation: `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=$threadId`. Fetch thread IDs via GraphQL `reviewThreads` query, filtering for `isResolved: false`. Leaving threads unresolved after fixing them is incomplete work.

## Environment

Windows PowerShell Nx monorepo pnpm 9.12.1 Jira:LS twig

## Docs Index

| Need                            | File                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------- | --- | ------------------- | ----------------------------------------- | --- | ----------- | ------------------------------------ |
| **Add secret / env var**        | `.github/skills/add-secret-or-env-var/SKILL.md`                                 |
| Architecture                    | `.github/skills/architecture/SKILL.md`                                          |
| **AWS orphan cleanup**          | `.github/skills/aws-orphan-cleanup/SKILL.md`                                    |
| Branch creation (advanced)      | `.github/skills/branch-create/SKILL.md`                                         |
| **Config reference**            | `.github/skills/config-standards/SKILL.md`                                      |
| DB queries                      | `.github/skills/db-query/SKILL.md`                                              |
| DB schema reference             | `.github/skills/db-schema/SKILL.md`                                             |
| **Debug distributed processes** | `.github/skills/debug-distributed/SKILL.md`                                     |
| **Docker local stack**          | `.github/skills/docker-local/SKILL.md`                                          |
| **Dump RDS to S3**              | `.github/skills/db-dump/SKILL.md`                                               |
| **E2E testing (Playwright)**    | `.github/skills/e2e-testing/SKILL.md`                                           |
| **Integration testing**         | `.github/skills/integration-testing/SKILL.md`                                   |
| Full workflow (start here)      | `.github/skills/workflow-ticket-to-pr/SKILL.md`                                 |
| **Install packages**            | `.github/skills/install-packages/SKILL.md`                                      |
| Lint errors                     | `.github/skills/fix-lint/SKILL.md`                                              |
| **Never edit generated**        | `.github/skills/no-edit-generated/SKILL.md`                                     |
| **Never edit schema.graphql**   | `.github/skills/no-edit-schema-graphql/SKILL.md`                                |     | **No lint disable** | `.github/skills/no-lint-disable/SKILL.md` |     | **New app** | `.github/skills/create-app/SKILL.md` |
| **New lambda**                  | `.github/skills/create-lambda/SKILL.md`                                         |
| **New library**                 | `.github/skills/create-lib/SKILL.md`                                            |
| **New MCP server**              | `.github/skills/create-mcp-server/SKILL.md`                                     |
| **New skill**                   | `.github/skills/create-skill/SKILL.md`                                          |
| PR creation                     | `.github/skills/create-pr/SKILL.md`                                             |
| **Refresh dev seed**            | `.github/skills/db-dump-dev/SKILL.md`                                           |
| **Restore dev seed**            | `.github/skills/db-restore-dev/SKILL.md`                                        |
| **Restore from S3 dump**        | `.github/skills/db-restore/SKILL.md`                                            |
| **Scratch output files**        | `.github/skills/scratch-dir/SKILL.md`                                           |
| Troubleshooting                 | `.github/skills/troubleshoot/SKILL.md`                                          |
| Type errors                     | `.github/skills/fix-types/SKILL.md`                                             |
| **Storybook**                   | `.github/skills/storybook/SKILL.md`                                             |
| **UI Brand Colors**             | `.github/skills/ui-brand-colors/SKILL.md`                                       |
| **UI Standards**                | `.github/skills/ui-standards/SKILL.md`                                          |
| **User testing**                | `.github/skills/user-testing/SKILL.md`                                          |
| **WebSocket refetch UX**        | `.github/skills/websocket-refetch-ux/SKILL.md`                                  |
| **Rebase & conflicts**          | `.github/skills/rebase-conflicts/SKILL.md`                                      |
| **Resolve merge conflicts**     | `.github/skills/resolve-merge-conflicts/SKILL.md`                               |
| **MCP DB operations**           | `.github/skills/mcp-db/SKILL.md`                                                |
| **MCP Jira server**             | `.github/skills/mcp-jira/SKILL.md`                                              |
| **Makefile reference**          | `.github/skills/makefile/SKILL.md`                                              |
| **Worktree workflow (default)** | `.github/skills/worktree-workflow/SKILL.md`                                     |
| All skills (60 guides)          | `.github/skills/`                                                               |
| CSV reference data              | `docs/agents/*.csv`                                                             |
| Tech stack                      | React Native ┬╖ Next.js ┬╖ Lambda ┬╖ GraphQL ┬╖ PostgreSQL/Drizzle ┬╖ Terraform |
