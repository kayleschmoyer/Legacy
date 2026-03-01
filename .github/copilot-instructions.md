# Legacy Sports — Copilot Instructions

🚨 **NEVER commit to main** — create a worktree first: `twig worktree create LS-####/description`

## Workflow

1. Ticket: create if needed: `acli jira workitem create --summary "..." --project LS --type Task --json | ConvertFrom-Json` → note `$key`
2. Worktree: `twig worktree create $key/description` → `twig worktree list` (note path) → `make install` + copy `.env` + junction `.twig` → `code $wt`
3. Jira "In Progress": `acli jira workitem transition --key LS-#### --status "In Progress"`
4. Code: `pnpm exec nx affected -t <target>` (never `pnpm run`)
5. Code: commit changes with `git commit -m "type(scope): msg"` → `git push origin HEAD`
6. Rebase onto parent: `git fetch origin ; twig rebase` — keeps branch current with its parent (main or a stacked branch)
7. Validate: `make pc` — must pass before opening PR. `make pc` runs `nx format:write` which silently rewrites files; **always check `git status` after and commit any reformatted files** before continuing
8. Ship: `gh pr create --title "LS-#### type(scope): msg" --body-file .github/tmp-pr-body.md --base main` → Jira "In Review" (see `skills/create-pr/SKILL.md`)
9. Cleanup: `twig worktree clean` → `git branch -d LS-####/description` → Jira "Done"

## Rules

- **Nx only**: `pnpm exec nx affected -t <target>` — never direct `pnpm run`
- **PowerShell**: `;` to chain, `$env:` for vars
- **No suppression**: fix root causes, no `@ts-ignore` / `eslint-disable`
- **Jira**: update status at each step

## Environment

Windows PowerShell · Nx monorepo · pnpm 9.12.1 · Jira project LS · twig branches

## Load When Needed

| Task                          | File                                     |
| ----------------------------- | ---------------------------------------- |
| Architecture                  | `skills/architecture/SKILL.md`           |
| Branch/ticket workflow        | `skills/branch-create/SKILL.md`          |
| **Config reference**          | `skills/config-standards/SKILL.md`       |
| DB queries                    | `skills/db-query/SKILL.md`               |
| DB schema reference           | `skills/db-schema/SKILL.md`              |
| **Docker local stack**        | `skills/docker-local/SKILL.md`           |
| **Dump RDS to S3**            | `skills/db-dump/SKILL.md`                |
| Full workflow (start here)    | `skills/workflow-ticket-to-pr/SKILL.md`  |
| **Install packages**          | `skills/install-packages/SKILL.md`       |
| Lint errors                   | `skills/fix-lint/SKILL.md`               |
| **Never edit generated**      | `skills/no-edit-generated/SKILL.md`      |
| **Never edit schema.graphql** | `skills/no-edit-schema-graphql/SKILL.md` |
| **New app**                   | `skills/create-app/SKILL.md`             |
| **New lambda**                | `skills/create-lambda/SKILL.md`          |
| **New library**               | `skills/create-lib/SKILL.md`             |
| **New skill**                 | `skills/create-skill/SKILL.md`           |
| PR creation                   | `skills/create-pr/SKILL.md`              |
| **Refresh dev seed**          | `skills/db-dump-dev/SKILL.md`            |
| **Restore dev seed**          | `skills/db-restore-dev/SKILL.md`         |
| **Restore from S3 dump**      | `skills/db-restore/SKILL.md`             |
| **Scratch output files**      | `skills/scratch-dir/SKILL.md`            |
| Troubleshooting               | `skills/troubleshoot/SKILL.md`           |
| Type errors                   | `skills/fix-types/SKILL.md`              |
| **UI Brand Colors**           | `skills/ui-brand-colors/SKILL.md`        |
| **UI Standards**              | `skills/ui-standards/SKILL.md`           |
| **User testing**              | `skills/user-testing/SKILL.md`           |
| **Rebase & conflicts**        | `skills/rebase-conflicts/SKILL.md`       |
| Worktree workflow             | `skills/worktree-workflow/SKILL.md`      |
| All skills (56 guides)        | `skills/`                                |
| CSV reference data            | `docs/agents/*.csv`                      |
