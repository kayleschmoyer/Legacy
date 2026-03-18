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
- **Shared node_modules — do not mutate**: never `make clean`/`make install`/`pnpm install` in the main repo while worktrees exist. Broken node_modules in a junction? Check if it's a junction first, then ask the user — never fix autonomously. Always use `make install` (never raw `pnpm install`). See `skills/worktree-workflow/SKILL.md`.
- **Make first**: prefer `make <target>` over raw `pnpm exec nx` — it sets `NODE_OPTIONS` for the Windows windowsHide patch and is cross-platform safe. For project-specific targets use `pnpm exec nx run <project>:<target>`. Never use `pnpm run` directly (exception: `lib/db-client` migration scripts that have no Nx target equivalent). See `skills/makefile/SKILL.md` for the full target list.
- **PowerShell**: `;` to chain, `$env:` for vars
- **No suppression**: fix root causes, no `@ts-ignore` / `eslint-disable` (see `skills/no-lint-disable/SKILL.md`)
- **No console.\***: use `LOGGER` from `@legacy-sports/logging` instead of `console.log/warn/error/debug`. Exceptions: `lib/logging/` (the logger itself), `apps/cli/`, migration files, and build-time scripts (`codegen.ts`, Vite plugins).
- **E2E tests are hermetic**: never use `route.continue()` in E2E tests — there is no backend in CI. Use `route.fulfill()` for unmatched operations (return a diagnostic error so missing mocks surface immediately). When changing login/landing page UI, update E2E selectors in the same PR (see `skills/e2e-testing/SKILL.md`).
- **Never manually remove worktrees**: always `twig worktree clean` — never `git worktree remove` or manual deletion (destroys junctions).
- **Kill background servers when done**: stop all `isBackground=true` processes before workflow ends. Run `make kill-stale` to find stale node processes holding addon locks.
- **Jira — MCP tools first**: use `jira_view`, `jira_create_ticket`, `jira_transition`, `jira_check_blockers`, `jira_set_parent` for all Jira operations. Fall back to `acli` CLI — never direct HTTP.
- **Resolve PR review threads**: after fixing review comments, resolve each thread via GraphQL `resolveReviewThread` mutation. See `skills/create-pr/SKILL.md`.

## Cloud Agent Mode (Copilot Coding Agent)

When running as a **cloud coding agent** (Codespace-like environment, set up by `.github/copilot-setup-steps.yml`):

- **No worktrees/twig/acli** — work directly in the repo root. Use `git` for branches, MCP tools for Jira.
- **No AWS access** — DB MCP server uses local Docker PostgreSQL seeded from `resources/dev-seed.dump`.
- **Linux** — `bash` shell, `/` paths. No junctions or file locks.

**Cloud workflow:** Jira (`jira_create_ticket` → `jira_check_blockers` → `jira_transition` "In Progress") → code → `make <target>` → `cd lib/db-client && pnpm run db:status && pnpm run db:migrate` → `make pc` → commit + push → `gh pr create` → Jira "In Review"

**Available MCP servers in cloud:**

- `legacy-sports-ci` — CI log queries, workflow reruns
- `legacy-sports-db` — local Docker Postgres queries, migrations, schema generation
- `legacy-sports-jira` — ticket CRUD, transitions, blocker checks (requires `JIRA_EMAIL` and `JIRA_API_TOKEN` secrets)
- `legacy-sports-github` — PR and review lifecycle management (uses `gh` CLI, authenticated via GitHub token)
- `legacy-sports-nx` — Nx project discovery, affected analysis, and target execution

**Unavailable in cloud (by design):**

- `worktree` — no worktree management needed
- `legacy-sports-aws` — no AWS credentials

## Environment

**Local:** Windows PowerShell · Nx monorepo · pnpm 9.12.1 · Jira project LS · twig branches
**Cloud:** Ubuntu Linux · Nx monorepo · pnpm 9.12.1 · Jira project LS · Docker PostgreSQL

## Load When Needed

Skills are auto-matched by the VS Code skills system. For manual lookup:

| Task                     | Skill                                                            |
| ------------------------ | ---------------------------------------------------------------- |
| Add secret / env var     | `add-secret-or-env-var`                                          |
| Architecture             | `architecture`                                                   |
| AWS orphan cleanup       | `aws-orphan-cleanup`                                             |
| Config reference         | `config-standards`                                               |
| DB queries / schema      | `db-query`, `db-schema`                                          |
| Debug distributed        | `debug-distributed`                                              |
| Docker local stack       | `docker-local`                                                   |
| DB dump / restore        | `db-dump`, `db-restore`                                          |
| E2E / Integration tests  | `e2e-testing`, `integration-testing`                             |
| Install packages         | `install-packages`                                               |
| Bug fixes / lint / types | `fix-bugs`, `fix-lint`, `fix-types`                              |
| Fix Copilot reviews      | `fix-copilot-reviews`                                            |
| Never edit generated     | `no-edit-generated`                                              |
| New app/lambda/lib/MCP   | `create-app`, `create-lambda`, `create-lib`, `create-mcp-server` |
| New skill                | `create-skill`                                                   |
| Platform files           | `platform-file-convention`                                       |
| PR creation/operations   | `create-pr`, `pr-operations`                                     |
| Scratch output           | `scratch-dir`                                                    |
| Troubleshooting          | `troubleshoot`                                                   |
| Storybook                | `storybook`                                                      |
| UI (brand/standards)     | `ui-brand-colors`, `ui-standards`                                |
| User testing             | `user-testing`                                                   |
| WebSocket refetch UX     | `websocket-refetch-ux`                                           |
| Rebase / merge conflicts | `rebase-conflicts`, `resolve-merge-conflicts`                    |
| Makefile / MCP           | `makefile`, `mcp-db`, `mcp-jira`                                 |
| Worktree workflow        | `worktree-workflow`                                              |
| All skills               | `skills/`                                                        |
| CSV reference data       | `docs/agents/*.csv`                                              |
