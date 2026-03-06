# Legacy Sports — Copilot Instructions

🚨 **NEVER commit to main** — create a worktree first: `twig worktree create LS-####/description`

## Workflow

1. Ticket: create if needed: `acli jira workitem create --summary "..." --project LS --type Task --json | ConvertFrom-Json` → note `$key`
2. **Jira "In Progress" immediately**: `acli jira workitem transition --key LS-#### --status "In Progress"` — do this as soon as you begin working, before any other steps.
3. **Dependency check**: inspect the Jira ticket for linked issues or descriptions referencing another in-progress ticket. If a dependency exists, the worktree must branch from that parent — not from `main` (see `skills/worktree-workflow/SKILL.md` Step 1).
4. Worktree: `twig worktree create $key/description` → `twig worktree list` (note path)
5. Setup worktree: `make wt-setup WT=$wt` (or manually: `cd $wt` → `make install` → copy `.env` → junction `.twig`) → `code $wt`
   5b. **Agent multi-root access** (optional): `make sync-worktrees` → `code legacy-sports.code-workspace` — gives agents search access across all worktrees in one window.
6. **⚠️ All remaining work happens at the worktree path (`$wt`), NOT `D:\code\legacy-sports`.** Every file edit, terminal command, and git operation must target `$wt`.
7. Code: `pnpm exec nx affected -t <target>` (never `pnpm run`)
8. Commit: `git commit -m "type(scope): msg"` → `git push origin HEAD`
9. Rebase onto parent: `git fetch origin ; twig rebase` — keeps branch current with its parent (main or a stacked branch)
10. Validate: `make pc` — must pass before opening PR. If `nx format:write` rewrites any files, `make pc` **fails** with a list of the changed files; commit them and re-run `make pc`.
11. Ship: `gh pr create --title "LS-#### type(scope): msg" --body-file .github/tmp-pr-body.md --base main` → Jira "In Review" (see `skills/create-pr/SKILL.md`)
12. Cleanup: `twig worktree clean` → `git branch -d LS-####/description` → Jira "Done"

## Rules

- **Worktree-first**: always create a worktree for ticket work — never edit code in the main repo (`D:\code\legacy-sports`). After creating the worktree, all file edits and terminal commands must use the worktree path.
- **Nx only**: `pnpm exec nx affected -t <target>` — never direct `pnpm run`
- **PowerShell**: `;` to chain, `$env:` for vars
- **No suppression**: fix root causes, no `@ts-ignore` / `eslint-disable`
- **No console.\***: use `LOGGER` from `@legacy-sports/logging` instead of `console.log/warn/error/debug`. Exceptions: `lib/logging/` (the logger itself), `apps/cli/`, migration files, and build-time scripts (`codegen.ts`, Vite plugins).
- **Jira**: update status at each step

## Environment

Windows PowerShell · Nx monorepo · pnpm 9.12.1 · Jira project LS · twig branches

## Load When Needed

| Task                            | File                                      |
| ------------------------------- | ----------------------------------------- |
| **Add secret / env var**        | `skills/add-secret-or-env-var/SKILL.md`   |
| Architecture                    | `skills/architecture/SKILL.md`            |
| **AWS orphan cleanup**          | `skills/aws-orphan-cleanup/SKILL.md`      |
| Branch creation (advanced)      | `skills/branch-create/SKILL.md`           |
| **Config reference**            | `skills/config-standards/SKILL.md`        |
| DB queries                      | `skills/db-query/SKILL.md`                |
| DB schema reference             | `skills/db-schema/SKILL.md`               |
| **Debug distributed processes** | `skills/debug-distributed/SKILL.md`       |
| **Docker local stack**          | `skills/docker-local/SKILL.md`            |
| **Dump RDS to S3**              | `skills/db-dump/SKILL.md`                 |
| Full workflow (start here)      | `skills/workflow-ticket-to-pr/SKILL.md`   |
| **Install packages**            | `skills/install-packages/SKILL.md`        |
| Lint errors                     | `skills/fix-lint/SKILL.md`                |
| **Never edit generated**        | `skills/no-edit-generated/SKILL.md`       |
| **Never edit schema.graphql**   | `skills/no-edit-schema-graphql/SKILL.md`  |
| **New app**                     | `skills/create-app/SKILL.md`              |
| **New lambda**                  | `skills/create-lambda/SKILL.md`           |
| **New library**                 | `skills/create-lib/SKILL.md`              |
| **New skill**                   | `skills/create-skill/SKILL.md`            |
| PR creation                     | `skills/create-pr/SKILL.md`               |
| **Refresh dev seed**            | `skills/db-dump-dev/SKILL.md`             |
| **Restore dev seed**            | `skills/db-restore-dev/SKILL.md`          |
| **Restore from S3 dump**        | `skills/db-restore/SKILL.md`              |
| **Scratch output files**        | `skills/scratch-dir/SKILL.md`             |
| Troubleshooting                 | `skills/troubleshoot/SKILL.md`            |
| Type errors                     | `skills/fix-types/SKILL.md`               |
| **Storybook**                   | `skills/storybook/SKILL.md`               |
| **UI Brand Colors**             | `skills/ui-brand-colors/SKILL.md`         |
| **UI Standards**                | `skills/ui-standards/SKILL.md`            |
| **User testing**                | `skills/user-testing/SKILL.md`            |
| **WebSocket refetch UX**        | `skills/websocket-refetch-ux/SKILL.md`    |
| **Rebase & conflicts**          | `skills/rebase-conflicts/SKILL.md`        |
| **Resolve merge conflicts**     | `skills/resolve-merge-conflicts/SKILL.md` |
| **Worktree workflow (default)** | `skills/worktree-workflow/SKILL.md`       |
| All skills (59 guides)          | `skills/`                                 |
| CSV reference data              | `docs/agents/*.csv`                       |
