# AI Agent Quick Start

**Copilot users**: See `.github/copilot-instructions.md` (auto-loaded)

**Other agents**: Load `.github/skills/workflow-ticket-to-pr/SKILL.md` to start

## 🚨 CRITICAL

**NEVER commit to main** branch first: `twig switch LS-####`

## Workflow

1. Jira "In Progress" 2. `twig switch LS-#### -p=main` 3. Code with `pnpm exec nx affected` 4. `make pre-commit` 5. PR + Jira "In Review"

## Rules

Nx only (`pnpm exec nx affected -t <target>`) PowerShell (`;` chains) Fix root causes Update Jira

## Environment

Windows PowerShell Nx monorepo pnpm 9.12.1 Jira:LS twig

## Docs Index

| Need                 | File                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| Full workflow        | `.github/skills/workflow-ticket-to-pr/SKILL.md`                            |
| Type errors          | `.github/skills/fix-types/SKILL.md`                                        |
| Lint errors          | `.github/skills/fix-lint/SKILL.md`                                         |
| Troubleshooting      | `.github/skills/troubleshoot/SKILL.md`                                     |
| DB queries           | `.github/skills/db-query/SKILL.md`                                         |
| DB schema reference  | `.github/skills/db-schema/SKILL.md`                                        |
| Architecture         | `.github/skills/architecture/SKILL.md`                                     |
| **New library**      | `.github/skills/create-lib/SKILL.md`                                       |
| **New lambda**       | `.github/skills/create-lambda/SKILL.md`                                    |
| **New app**          | `.github/skills/create-app/SKILL.md`                                       |
| **New skill**        | `.github/skills/create-skill/SKILL.md`                                     |
| **Install packages** | `.github/skills/install-packages/SKILL.md`                                 |
| **Config ref**       | `.github/skills/config-standards/SKILL.md`                                 |
| **UI Standards**     | `.github/skills/ui-standards/SKILL.md`                                     |
| All skills (40)      | `.github/skills/`                                                          |
| CSV reference data   | `docs/agents/*.csv`                                                        |
| Tech stack           | React Native · Next.js · Lambda · GraphQL · PostgreSQL/Drizzle · Terraform |
