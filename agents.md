# AI Agent Quick Start

**Copilot users**: See `.github/copilot-instructions.md` (auto-loaded)

**Other agents**: Load `.agents/skills/workflow-ticket-to-pr/SKILL.md` to start

## ≡ƒÜ¿ CRITICAL

**NEVER commit to main** ΓÇö create a worktree first: `twig worktree create LS-####/description`

**ALWAYS drive to PR** ΓÇö your work is NOT complete until `gh pr create` is run and Jira is moved to "In Review". Passing `make pc` is a checkpoint, not the finish line. Stopping after code changes or after `make pc` without opening a PR is the single most common agent failure mode.

## Workflow

1. Ticket: use `jira_create_ticket` MCP tool, or `acli jira workitem create --summary "..." --project LS --type Task --json | ConvertFrom-Json` ΓåÆ note `$key` (skip if ticket exists) 2. **Jira "In Progress" immediately**: use `jira_transition` MCP tool, or `acli jira workitem transition --key LS-#### --status "In Progress"` ΓÇö do this before any other steps 2b. **Dependency check**: use `jira_check_blockers` MCP tool, or inspect "blocked-by" links ΓÇö if the blocker is **not** In Review or Done, **STOP** (do not proceed). If In Review, use its branch as parent. If Done or no blockers, base off `origin/main`. 3. Worktree: `twig worktree create $key/description` ΓåÆ note path ΓåÆ `make wt-setup WT=$wt` (or manually: `make install` + copy `.env` + junction `.twig`) 3b. **Agent multi-root access** (optional): `make sync-worktrees` ΓåÆ `code legacy-sports.code-workspace` ΓÇö gives agents search access across all worktrees 4. Code + commit 5. Rebase: `git fetch origin ; twig rebase` 5b. **Post-rebase stabilization (BEFORE push)**: `make install ; pnpm exec nx run db:print-schema ; pnpm exec nx affected -t codegen --base=origin/main` ΓÇö **do NOT push until `make pc` passes** 6. `make pc` (must pass before pushing) ΓåÆ `git push --force-with-lease origin HEAD` 7. PR: `gh pr create --title "LS-#### type(scope): msg" --body-file .github/tmp-pr-body.md --base main` ΓåÆ `.\scripts\cleanup-pr-body.ps1` ΓåÆ Jira "In Review" (see `.agents/skills/create-pr/SKILL.md`) 8. Cleanup: `twig worktree clean`

## Rules

**One ticket = one worktree = one PR** — never add unrelated changes to an existing branch or worktree. If a new task arises mid-flight, create a separate Jira ticket and worktree. Do not stash changes into another worktree or tack extra commits onto an in-flight branch.
**Drive to PR** ΓÇö code ΓåÆ rebase ΓåÆ stabilize (`make install` + codegen) ΓåÆ `make pc` ΓåÆ push ΓåÆ `gh pr create` ΓåÆ Jira "In Review". **Do NOT push until `make pc` passes** ΓÇö pushing before validating is the #1 cause of post-rebase CI failures.
**Shared node_modules ΓÇö do not mutate** ΓÇö Worktrees share `node_modules` via junctions to the main repo. Never run `make clean`, `make install`, or `pnpm install` in `D:\code\legacy-sports` while worktrees are active. Only install/clean inside your own worktree with independent `node_modules`. Runtime guards in `make install` and `make clean` will block you from mutating a junctioned `node_modules` automatically.
**If node_modules looks broken in a junctioned worktree** (missing `.bin/`, missing packages, module-not-found errors): **DO NOT run `make install` or `make clean`**. The junction means your worktree's `node_modules` IS the main repo's `node_modules`. Instead: (1) Verify the junction is intact: `(Get-Item node_modules -Force).Attributes -band [IO.FileAttributes]::ReparsePoint`. (2) If intact, the shared `node_modules` is genuinely broken ΓÇö **ask the user** to run `make install` in the main repo (`D:\code\legacy-sports`). An agent must never do this autonomously. (3) If the junction is missing, re-run `make wt-setup WT=<path>` to recreate it.
**Never raw `pnpm install`** ΓÇö always use `make install` (or `make install-force`). The Makefile targets acquire a file lock (`.pnpm-install.lock`) that prevents concurrent installs from corrupting the shared `node_modules`. `make wt-setup` also shares this lock.
Nx only (`pnpm exec nx affected -t <target>`) PowerShell (`;` chains) Fix root causes Update Jira No `console.*` ΓÇö use `LOGGER` from `@legacy-sports/logging` (exceptions: `lib/logging/`, `apps/cli/`, migrations, build scripts)
**E2E tests are hermetic** — never use `route.continue()` in E2E tests (no backend in CI). Use `route.fallback()` to cascade through the 3-layer mock architecture (test → auth → baseline); only the final baseline handler should `route.fulfill()`. When changing login/landing page UI, update E2E selectors in the same PR (see `.agents/skills/e2e-testing/SKILL.md`).
**Prefer MCP tools** ΓÇö for Jira and DB operations, prefer the MCP tools (`jira_*`, `db_*`) over CLI commands when available ΓÇö they return structured data and have built-in guardrails. See `.agents/skills/mcp-jira/SKILL.md` and `.agents/skills/mcp-db/SKILL.md`.
**Resolve PR review threads** ΓÇö when addressing PR review comments (from Copilot or any reviewer), **always resolve each thread** after pushing the fix. Use the GraphQL `resolveReviewThread` mutation: `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=$threadId`. Fetch thread IDs via GraphQL `reviewThreads` query, filtering for `isResolved: false`. Leaving threads unresolved after fixing them is incomplete work.

## Environment

Windows PowerShell Nx monorepo pnpm 9.12.1 Jira:LS twig

## Docs Index

| Need                            | File                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------- | --- | ------------------- | ----------------------------------------- | --- | ----------- | ------------------------------------ |
| **Add secret / env var**        | `.agents/skills/add-secret-or-env-var/SKILL.md`                                 |
| Architecture                    | `.agents/skills/architecture/SKILL.md`                                          |
| **AWS orphan cleanup**          | `.agents/skills/aws-orphan-cleanup/SKILL.md`                                    |
| Branch creation (advanced)      | `.agents/skills/branch-create/SKILL.md`                                         |
| **Config reference**            | `.agents/skills/config-standards/SKILL.md`                                      |
| DB queries                      | `.agents/skills/db-query/SKILL.md`                                              |
| DB schema reference             | `.agents/skills/db-schema/SKILL.md`                                             |
| **Debug distributed processes** | `.agents/skills/debug-distributed/SKILL.md`                                     |
| **Docker local stack**          | `.agents/skills/docker-local/SKILL.md`                                          |
| **Dump RDS to S3**              | `.agents/skills/db-dump/SKILL.md`                                               |
| **E2E testing (Playwright)**    | `.agents/skills/e2e-testing/SKILL.md`                                           |
| **Integration testing**         | `.agents/skills/integration-testing/SKILL.md`                                   |
| Full workflow (start here)      | `.agents/skills/workflow-ticket-to-pr/SKILL.md`                                 |
| **Install packages**            | `.agents/skills/install-packages/SKILL.md`                                      |
| Lint errors                     | `.agents/skills/fix-lint/SKILL.md`                                              |
| **Never edit generated**        | `.agents/skills/no-edit-generated/SKILL.md`                                     |
| **Never edit schema.graphql**   | `.agents/skills/no-edit-schema-graphql/SKILL.md`                                |     | **No lint disable** | `.agents/skills/no-lint-disable/SKILL.md` |     | **New app** | `.agents/skills/create-app/SKILL.md` |
| **New lambda**                  | `.agents/skills/create-lambda/SKILL.md`                                         |
| **New library**                 | `.agents/skills/create-lib/SKILL.md`                                            |
| **New MCP server**              | `.agents/skills/create-mcp-server/SKILL.md`                                     |
| **New skill**                   | `.agents/skills/create-skill/SKILL.md`                                          |
| PR creation                     | `.agents/skills/create-pr/SKILL.md`                                             |
| **Refresh dev seed**            | `.agents/skills/db-dump-dev/SKILL.md`                                           |
| **Restore dev seed**            | `.agents/skills/db-restore-dev/SKILL.md`                                        |
| **Restore from S3 dump**        | `.agents/skills/db-restore/SKILL.md`                                            |
| **Scratch output files**        | `.agents/skills/scratch-dir/SKILL.md`                                           |
| Troubleshooting                 | `.agents/skills/troubleshoot/SKILL.md`                                          |
| Type errors                     | `.agents/skills/fix-types/SKILL.md`                                             |
| **Storybook**                   | `.agents/skills/storybook/SKILL.md`                                             |
| **UI Brand Colors**             | `.agents/skills/ui-brand-colors/SKILL.md`                                       |
| **UI Standards**                | `.agents/skills/ui-standards/SKILL.md`                                          |
| **User testing**                | `.agents/skills/user-testing/SKILL.md`                                          |
| **WebSocket refetch UX**        | `.agents/skills/websocket-refetch-ux/SKILL.md`                                  |
| **Rebase & conflicts**          | `.agents/skills/rebase-conflicts/SKILL.md`                                      |
| **Resolve merge conflicts**     | `.agents/skills/resolve-merge-conflicts/SKILL.md`                               |
| **MCP DB operations**           | `.agents/skills/mcp-db/SKILL.md`                                                |
| **MCP Jira server**             | `.agents/skills/mcp-jira/SKILL.md`                                              |
| **Makefile reference**          | `.agents/skills/makefile/SKILL.md`                                              |
| **Worktree workflow (default)** | `.agents/skills/worktree-workflow/SKILL.md`                                     |
| All skills (60 guides)          | `.agents/skills/`                                                               |
| CSV reference data              | `docs/agents/*.csv`                                                             |
| Tech stack                      | React Native ┬╖ Next.js ┬╖ Lambda ┬╖ GraphQL ┬╖ PostgreSQL/Drizzle ┬╖ Terraform |
