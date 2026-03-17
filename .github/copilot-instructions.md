# Legacy Sports Copilot Instructions

> **NEVER commit to main** — locally: create a worktree first (`make worktree TICKET=#### DESC=description`). Cloud agents already have an isolated branch checkout.

## Workflow

1. Ticket: create if needed using the `jira_create_ticket` MCP tool (or `acli jira workitem create --summary "..." --project LS --type Task`) — note `$key`
2. **Dependency check**: inspect the Jira ticket for "blocked-by" linked issues. Query their status before any status transition:
   - **Blocker is not In Review or Done — STOP.** Do not proceed with the ticket. Inform the user that the blocking ticket must reach at least "In Review" before work can begin.
   - **Blocker is In Review — use its branch as the parent.** The worktree must branch from that ticket's branch, not from `main` (see `skills/worktree-workflow/SKILL.md` Step 1).
   - **Blocker is Done (or no blockers) — base off `origin/main`.**
3. **Jira "In Progress" after blocker check passes**: use the `jira_transition` MCP tool with status "In Progress" (or `acli jira workitem transition --key LS-#### --status "In Progress"`) only after confirming blockers are In Review/Done (or absent).
4. Worktree: `make worktree TICKET=#### DESC=description` (or `PARENT=LS-XXXX/branch` for dependent tickets) — this creates the branch, worktree, **and registers the parent dependency** in one step. Run `twig worktree list` to note the path. **Do NOT use `twig worktree create` directly** — it skips parent registration and creates orphaned branches.
5. Setup worktree: `make wt-setup WT=$wt` (or manually: `cd $wt` then `make install`, copy `.env`, junction `.twig`)
   - 5b. **Agent multi-root access** (optional): `make sync-worktrees` then `code legacy-sports.code-workspace` — gives agents search access across all worktrees in one window.
6. **All remaining work happens at the worktree path (`$wt`), NOT `D:\code\legacy-sports`.** Every file edit, terminal command, and git operation must target `$wt`.
7. Code: `make <target>` (e.g. `make test`, `make build`, `make typecheck`, `make lint-fix`). For project-specific targets: `pnpm exec nx run <project>:<target>`. Never use `pnpm run` directly (exception: `lib/db-client` migration scripts — see step 10).
8. Commit: `git commit -m "type(scope): msg"` then `git push origin HEAD`
9. Rebase onto parent: `git fetch origin ; twig rebase` — keeps branch current with its parent (main or a stacked branch)
   - 9b. **Post-rebase stabilization (BEFORE push)**: `make install ; pnpm exec nx run db:print-schema ; pnpm exec nx affected -t codegen --base=origin/main` — main may have changed deps, schema, or formatting. **Do NOT push until `make pc` passes** (see `skills/rebase-conflicts/SKILL.md` Step 7).
10. **Migrations (BEFORE make pc)**: `cd lib/db-client` then run `pnpm run db:status` and `pnpm run db:up` — **always do this even if you think no migrations were added.** Confirm `Applied N new migrations` or `No new migrations to apply`. (See `skills/db-migration-write/SKILL.md`.) _Note: `pnpm run` is allowed here because these are `lib/db-client` package scripts with no Nx target equivalent._
11. Validate: `make pc` — must pass before pushing or opening PR. If `nx format:write` rewrites any files, `make pc` **fails** with a list of the changed files; commit them and re-run `make pc`.
    - 11b. **Push only after `make pc` passes**: `git push --force-with-lease origin HEAD` — pushing before validating is the #1 cause of post-rebase CI failures.
12. **Ship (REQUIRED — do NOT stop before this step)**: `gh pr create --title "LS-#### type(scope): msg" --body-file .github/tmp-pr-body.md --base main` then `.\scripts\cleanup-pr-body.ps1` then Jira "In Review" (see `skills/create-pr/SKILL.md`)
13. Cleanup: `twig worktree clean` then `git branch -d LS-####/description` then Jira "Done" — **NEVER use `git worktree remove` directly** (see Rules)

## Rules

- **Drive to PR**: your work is **NOT complete** until a PR is created and Jira is moved to "In Review". Passing `make pc` is a checkpoint, not the finish line. After validation passes, you **must** continue to: commit, push, `gh pr create`, Jira "In Review". Stopping after code changes or after `make pc` without opening a PR is the single most common agent failure mode.
- **One ticket = one worktree = one PR**: never add unrelated changes to an existing branch or worktree. If a new task arises while working on a ticket (e.g., the user asks you to fix something unrelated), create a **separate Jira ticket and worktree** for it. Do not `git stash` changes into another worktree or tack extra commits onto an in-flight branch — each PR must map to exactly one Jira ticket.
- **Worktree-first**: always create a worktree for ticket work — never edit code in the main repo (`D:\code\legacy-sports`). After creating the worktree, all file edits and terminal commands must use the worktree path.
- **Shared node_modules — do not mutate**: Worktrees share `node_modules` via Windows junctions to the main repo. **Never run `make clean`, `make install`, `make install-force`, or `pnpm install` in the main repo** (`D:\code\legacy-sports`) while worktrees are active — doing so destroys or mutates the shared `node_modules` and breaks every junctioned worktree mid-flight. Only run install/clean commands **inside your own worktree**, and only when it has independent (non-junctioned) `node_modules`. Runtime guards in `make install` and `make clean` will block you from mutating a junctioned `node_modules` automatically.
- **If node_modules looks broken in a junctioned worktree** (missing .bin/, missing packages, module-not-found errors): **DO NOT run make install or make clean**. The junction means your worktree's node_modules IS the main repo's node_modules. Instead: (1) Verify the junction is intact: `(Get-Item node_modules -Force).Attributes -band [IO.FileAttributes]::ReparsePoint`. (2) If intact, the shared node_modules is genuinely broken — **ask the user** to run make install in the main repo (D:\code\legacy-sports). An agent must never do this autonomously. (3) If the junction is missing, re-run `make wt-setup WT=<path>` to recreate it.
- **Never raw `pnpm install`**: always use `make install` (or `make install-force`) instead of running `pnpm install` directly. The Makefile targets acquire a file lock (`.pnpm-install.lock`) that prevents concurrent installs from corrupting the shared `node_modules`. `make wt-setup` also shares this lock.
- **Make first**: prefer `make <target>` over raw `pnpm exec nx` — it sets `NODE_OPTIONS` for the Windows windowsHide patch and is cross-platform safe. For project-specific targets use `pnpm exec nx run <project>:<target>`. Never use `pnpm run` directly (exception: `lib/db-client` migration scripts that have no Nx target equivalent). See `skills/makefile/SKILL.md` for the full target list.
- **PowerShell**: `;` to chain, `$env:` for vars
- **No suppression**: fix root causes, no `@ts-ignore` / `eslint-disable` (see `skills/no-lint-disable/SKILL.md`)
- **No console.\***: use `LOGGER` from `@legacy-sports/logging` instead of `console.log/warn/error/debug`. Exceptions: `lib/logging/` (the logger itself), `apps/cli/`, migration files, and build-time scripts (`codegen.ts`, Vite plugins).
- **E2E tests are hermetic**: never use `route.continue()` in E2E tests — there is no backend in CI. Use `route.fulfill()` for unmatched operations (return a diagnostic error so missing mocks surface immediately). When changing login/landing page UI, update E2E selectors in the same PR (see `skills/e2e-testing/SKILL.md`).
- **Never manually remove worktrees**: always use `twig worktree clean` to remove worktrees — **never** run `git worktree remove` or delete worktree directories manually. Manual removal destroys `node_modules` junctions, which are symlinks to the main repo's shared `node_modules`. Deleting the junction target breaks every other junctioned worktree simultaneously. `twig worktree clean` safely unlinks junctions before removing the worktree directory.
- **Stop Playwright servers after use**: if you manually run Playwright server processes (for example `playwright test-server` or custom `serve` commands), stop them when done. On Windows these processes can hold native addon binaries (for example `node_modules/bufferutil/*.node`) and cause `ERR_PNPM_EPERM` during `make install`/`pnpm install`.
- **Jira — MCP tools first**: use the MCP Jira tools (`jira_view`, `jira_create_ticket`, `jira_transition`, `jira_check_blockers`, `jira_set_parent`) for **all** Jira operations. These are provided by the `legacy-sports-jira` MCP server (see `skills/mcp-jira/SKILL.md`). **Never** use `fetch_webpage`, raw HTTP requests, or web fetch to access Jira URLs directly. If MCP tools are unavailable, fall back to `acli` CLI commands — never to direct HTTP. Update Jira status at each workflow step.
- **Resolve PR review threads**: when addressing PR review comments (from Copilot or any reviewer), **always resolve each thread** after pushing the fix. Use the GraphQL `resolveReviewThread` mutation: `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=$threadId`. Fetch thread IDs via GraphQL `reviewThreads` query, filtering for `isResolved: false`. Leaving threads unresolved after fixing them is incomplete work.

## Cloud Agent Mode (Copilot Coding Agent)

When running as a **cloud coding agent** (GitHub Copilot coding agent in a Codespace-like environment), the following overrides apply. The environment is set up by `.github/copilot-setup-steps.yml`.

**What's different:**

- **No worktrees** — you already have an isolated branch checkout. Skip `twig worktree create`, `make wt-setup`, and `twig worktree clean`. Work directly in the repo root.
- **No `twig` CLI** — not installed. Use `git` directly for branch operations.
- **No `acli` CLI** — not installed. Use the `jira_create_ticket`, `jira_transition`, `jira_view`, and `jira_check_blockers` MCP tools exclusively for all Jira operations.
- **No AWS access** — no SSO, no OIDC role. The DB MCP server uses a local Docker PostgreSQL seeded from `resources/dev-seed.dump`. Do not attempt `sync-env`, `aws` CLI commands, or CloudWatch log queries.
- **Linux environment** — use `bash` shell, `/` paths. The Makefile handles Linux automatically (the `ifeq ($(OS),Windows_NT)` guards are skipped). No PowerShell-specific scripts or Windows junctions.
- **No shared `node_modules`** — dependencies are installed directly via `pnpm install`. The junction and file-lock rules do not apply.

**Cloud workflow (simplified):**

1. Jira: use `jira_create_ticket` MCP tool if needed, then `jira_check_blockers` to verify no blocking tickets are outstanding, then `jira_transition` to "In Progress"
2. Code directly in the repo (no worktree setup needed)
3. `make <target>` for build/test/lint/typecheck
4. Migrations: `cd lib/db-client && pnpm run db:status && pnpm run db:migrate`
5. Validate: `make pc`
6. Commit + push: `git commit -m "type(scope): msg" && git push origin HEAD`
7. PR: `gh pr create --title "LS-#### type(scope): msg" --body-file .github/tmp-pr-body.md --base main`
8. Jira: use `jira_transition` MCP tool to move to "In Review"

**Available MCP servers in cloud:**

- `legacy-sports-ci` — CI log queries, workflow reruns
- `legacy-sports-db` — local Docker Postgres queries, migrations, schema generation
- `legacy-sports-jira` — ticket CRUD, transitions, blocker checks (requires `JIRA_EMAIL` and `JIRA_API_TOKEN` secrets)

**Unavailable in cloud (by design):**

- `worktree` — no worktree management needed
- `legacy-sports-aws` — no AWS credentials

## Environment

**Local:** Windows PowerShell · Nx monorepo · pnpm 9.12.1 · Jira project LS · twig branches
**Cloud:** Ubuntu Linux · Nx monorepo · pnpm 9.12.1 · Jira project LS · Docker PostgreSQL

## Load When Needed

| Task                            | File                                       |
| ------------------------------- | ------------------------------------------ |
| **Add secret / env var**        | `skills/add-secret-or-env-var/SKILL.md`    |
| Architecture                    | `skills/architecture/SKILL.md`             |
| **AWS orphan cleanup**          | `skills/aws-orphan-cleanup/SKILL.md`       |
| Branch creation (advanced)      | `skills/branch-create/SKILL.md`            |
| **Config reference**            | `skills/config-standards/SKILL.md`         |
| DB queries                      | `skills/db-query/SKILL.md`                 |
| DB schema reference             | `skills/db-schema/SKILL.md`                |
| **Debug distributed processes** | `skills/debug-distributed/SKILL.md`        |
| **Docker local stack**          | `skills/docker-local/SKILL.md`             |
| **Dump RDS to S3**              | `skills/db-dump/SKILL.md`                  |
| **E2E testing (Playwright)**    | `skills/e2e-testing/SKILL.md`              |
| **Integration testing**         | `skills/integration-testing/SKILL.md`      |
| Full workflow (start here)      | `skills/workflow-ticket-to-pr/SKILL.md`    |
| **Install packages**            | `skills/install-packages/SKILL.md`         |
| **Bug fixes (root cause)**      | `skills/fix-bugs/SKILL.md`                 |
| **Fix Copilot reviews (batch)** | `skills/fix-copilot-reviews/SKILL.md`      |
| Lint errors                     | `skills/fix-lint/SKILL.md`                 |
| **Never edit generated**        | `skills/no-edit-generated/SKILL.md`        |
| **Never edit schema.graphql**   | `skills/no-edit-schema-graphql/SKILL.md`   |
| **New app**                     | `skills/create-app/SKILL.md`               |
| **New lambda**                  | `skills/create-lambda/SKILL.md`            |
| **New library**                 | `skills/create-lib/SKILL.md`               |
| **New MCP server**              | `skills/create-mcp-server/SKILL.md`        |
| **New skill**                   | `skills/create-skill/SKILL.md`             |
| **Platform file convention**    | `skills/platform-file-convention/SKILL.md` |
| PR creation                     | `skills/create-pr/SKILL.md`                |
| **PR operations (sweep/label)** | `skills/pr-operations/SKILL.md`            |
| **Refresh dev seed**            | `skills/db-dump-dev/SKILL.md`              |
| **Restore dev seed**            | `skills/db-restore-dev/SKILL.md`           |
| **Restore from S3 dump**        | `skills/db-restore/SKILL.md`               |
| **Scratch output files**        | `skills/scratch-dir/SKILL.md`              |
| Troubleshooting                 | `skills/troubleshoot/SKILL.md`             |
| Type errors                     | `skills/fix-types/SKILL.md`                |
| **Storybook**                   | `skills/storybook/SKILL.md`                |
| **UI Brand Colors**             | `skills/ui-brand-colors/SKILL.md`          |
| **UI Standards**                | `skills/ui-standards/SKILL.md`             |
| **User testing**                | `skills/user-testing/SKILL.md`             |
| **WebSocket refetch UX**        | `skills/websocket-refetch-ux/SKILL.md`     |
| **Rebase & conflicts**          | `skills/rebase-conflicts/SKILL.md`         |
| **Resolve merge conflicts**     | `skills/resolve-merge-conflicts/SKILL.md`  |
| **Makefile reference**          | `skills/makefile/SKILL.md`                 |
| **MCP DB operations**           | `skills/mcp-db/SKILL.md`                   |
| **MCP Jira server**             | `skills/mcp-jira/SKILL.md`                 |
| **Worktree workflow (default)** | `skills/worktree-workflow/SKILL.md`        |
| All skills                      | `skills/`                                  |
| CSV reference data              | `docs/agents/*.csv`                        |
