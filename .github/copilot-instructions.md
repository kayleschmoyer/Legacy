# Legacy Sports — Copilot Instructions

🚨 **NEVER commit to main** — branch first: `twig switch LS-####`

## Workflow

1. Jira "In Progress": `acli jira workitem transition --key LS-#### --status "In Progress"`
2. Branch: `twig switch LS-#### -p main` (new) | `-p current` (dependent)
3. Code: `pnpm exec nx affected -t <target>` (never `pnpm run`)
4. Validate: `make pre-commit` — typecheck→lint→test→build, all must pass
5. Ship: `git commit -m "type(scope): msg"` → `git push origin HEAD` → `twig github pr create-pr` → Jira "In Review"

## Rules

- **Nx only**: `pnpm exec nx affected -t <target>` — never direct `pnpm run`
- **PowerShell**: `;` to chain, `$env:` for vars
- **No suppression**: fix root causes, no `@ts-ignore` / `eslint-disable`
- **Jira**: update status at each step

## Environment

Windows PowerShell · Nx monorepo · pnpm 9.12.1 · Jira project LS · twig branches

## Load When Needed

| Task                       | File                                            |
| -------------------------- | ----------------------------------------------- |
| Commands & troubleshooting | `copilot/quick-reference.md`                    |
| Branch/ticket workflow     | `copilot/tasks/start-ticket.md`                 |
| Type errors                | `copilot/tasks/fix-types.md`                    |
| Lint errors                | `copilot/tasks/fix-lint.md`                     |
| PR creation                | `copilot/tasks/create-pr.md`                    |
| DB queries                 | `docs/agents/database-query-guide.md`           |
| Architecture               | `copilot/architecture-summary.md`               |
| Full workflow              | `docs/guides/ai-agent-contribution-workflow.md` |
| **New library**            | `copilot/skills/create-lib.md`                  |
| **New lambda**             | `copilot/skills/create-lambda.md`               |
| **New app**                | `copilot/skills/create-app.md`                  |
| **Config reference**       | `copilot/skills/config-standards.md`            |
| Skills (21 guides)         | `copilot/skills/`                               |
| CSV patterns               | `docs/agents/*.csv`                             |
