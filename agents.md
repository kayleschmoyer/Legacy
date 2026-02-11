# AI Agent Quick Start

**Copilot users**: See `.github/copilot-instructions.md` (auto-loaded)

**Other agents**: Load `.github/copilot/start-here.md` (2KB essentials)

## 🚨 CRITICAL

**NEVER commit to main** branch first: `twig switch LS-####`

## Workflow

1. Jira "In Progress" 2. `twig switch LS-#### -p main` 3. Code with `pnpm exec nx affected` 4. `make pre-commit` 5. PR + Jira "In Review"

## Rules

Nx only (`pnpm exec nx affected -t <target>`) PowerShell (`;` chains) Fix root causes Update Jira

## Environment

Windows PowerShell Nx monorepo pnpm 9.12.1 Jira:LS twig

## Docs Index

| Need            | File                                                             |
| --------------- | ---------------------------------------------------------------- |
| Commands        | `.github/copilot/quick-reference.md`                             |
| Workflow        | `docs/guides/ai-agent-contribution-workflow.md`                  |
| DB queries      | `docs/agents/database-query-guide.md`                            |
| Architecture    | `.github/copilot/architecture-summary.md`                        |
| Type/lint fixes | `.github/copilot/tasks/`                                         |
| Skills (17)     | `.github/copilot/skills/`                                        |
| CSV patterns    | `docs/agents/`                                                   |
| Tech stack      | React Native Next.js Lambda GraphQL PostgreSQL/Drizzle Terraform |
