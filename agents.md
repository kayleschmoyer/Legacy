# AI Agent Quick Start

**Copilot users**: See `.github/copilot-instructions.md` (auto-loaded)

**Other agents**: Load `.github/skills/workflow-ticket-to-pr/SKILL.md` to start

## 🚨 CRITICAL

**NEVER commit to main** branch first: `twig worktree create LS-####/description`

## Workflow

1. Ticket: `acli jira workitem create --summary "..." --project LS --type Task --json | ConvertFrom-Json` → note `$key` (skip if ticket exists) 2. Worktree: `twig worktree create $key/description` → note path → `make install` + copy `.env` + junction `.twig` → `code $wt` 3. Jira "In Progress" 4. Code + commit + push 5. `make pc` (must pass before PR) 6. PR: `gh pr create --title "LS-#### type(scope): msg" --body-file .github/tmp-pr-body.md --base main` → Jira "In Review" (see `.github/skills/create-pr/SKILL.md`) 7. Cleanup: `twig worktree clean`

## Rules

Nx only (`pnpm exec nx affected -t <target>`) PowerShell (`;` chains) Fix root causes Update Jira

## Environment

Windows PowerShell Nx monorepo pnpm 9.12.1 Jira:LS twig

## Docs Index

| Need                            | File                                                                       |
| ------------------------------- | -------------------------------------------------------------------------- |
| **Add secret / env var**        | `.github/skills/add-secret-or-env-var/SKILL.md`                            |
| Architecture                    | `.github/skills/architecture/SKILL.md`                                     |
| **AWS orphan cleanup**          | `.github/skills/aws-orphan-cleanup/SKILL.md`                               |
| Branch creation (advanced)      | `.github/skills/branch-create/SKILL.md`                                    |
| **Config reference**            | `.github/skills/config-standards/SKILL.md`                                 |
| DB queries                      | `.github/skills/db-query/SKILL.md`                                         |
| DB schema reference             | `.github/skills/db-schema/SKILL.md`                                        |
| **Docker local stack**          | `.github/skills/docker-local/SKILL.md`                                     |
| **Dump RDS to S3**              | `.github/skills/db-dump/SKILL.md`                                          |
| Full workflow (start here)      | `.github/skills/workflow-ticket-to-pr/SKILL.md`                            |
| **Install packages**            | `.github/skills/install-packages/SKILL.md`                                 |
| Lint errors                     | `.github/skills/fix-lint/SKILL.md`                                         |
| **Never edit generated**        | `.github/skills/no-edit-generated/SKILL.md`                                |
| **Never edit schema.graphql**   | `.github/skills/no-edit-schema-graphql/SKILL.md`                           |
| **New app**                     | `.github/skills/create-app/SKILL.md`                                       |
| **New lambda**                  | `.github/skills/create-lambda/SKILL.md`                                    |
| **New library**                 | `.github/skills/create-lib/SKILL.md`                                       |
| **New skill**                   | `.github/skills/create-skill/SKILL.md`                                     |
| PR creation                     | `.github/skills/create-pr/SKILL.md`                                        |
| **Refresh dev seed**            | `.github/skills/db-dump-dev/SKILL.md`                                      |
| **Restore dev seed**            | `.github/skills/db-restore-dev/SKILL.md`                                   |
| **Restore from S3 dump**        | `.github/skills/db-restore/SKILL.md`                                       |
| **Scratch output files**        | `.github/skills/scratch-dir/SKILL.md`                                      |
| Troubleshooting                 | `.github/skills/troubleshoot/SKILL.md`                                     |
| Type errors                     | `.github/skills/fix-types/SKILL.md`                                        |
| **UI Brand Colors**             | `.github/skills/ui-brand-colors/SKILL.md`                                  |
| **UI Standards**                | `.github/skills/ui-standards/SKILL.md`                                     |
| **User testing**                | `.github/skills/user-testing/SKILL.md`                                     |
| **Rebase & conflicts**          | `.github/skills/rebase-conflicts/SKILL.md`                                 |
| **Worktree workflow (default)** | `.github/skills/worktree-workflow/SKILL.md`                                |
| All skills (57 guides)          | `.github/skills/`                                                          |
| CSV reference data              | `docs/agents/*.csv`                                                        |
| Tech stack                      | React Native · Next.js · Lambda · GraphQL · PostgreSQL/Drizzle · Terraform |
