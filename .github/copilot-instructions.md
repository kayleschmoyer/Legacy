# Legacy Sports — Copilot Instructions

🚨 **NEVER commit to main** — branch first: `twig switch LS-####`

## Workflow

1. Jira "In Progress": `acli jira workitem transition --key LS-#### --status "In Progress"`
2. Branch: `twig switch LS-#### -p=main` (new) | `-p=current` (dependent)
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

| Task                       | File                                    |
| -------------------------- | --------------------------------------- |
| Full workflow (start here) | `skills/workflow-ticket-to-pr/SKILL.md` |
| Branch/ticket workflow     | `skills/branch-create/SKILL.md`         |
| Type errors                | `skills/fix-types/SKILL.md`             |
| Lint errors                | `skills/fix-lint/SKILL.md`              |
| PR creation                | `skills/create-pr/SKILL.md`             |
| Troubleshooting            | `skills/troubleshoot/SKILL.md`          |
| DB queries                 | `skills/db-query/SKILL.md`              |
| DB schema reference        | `skills/db-schema/SKILL.md`             |
| Architecture               | `skills/architecture/SKILL.md`          |
| **New library**            | `skills/create-lib/SKILL.md`            |
| **New lambda**             | `skills/create-lambda/SKILL.md`         |
| **New app**                | `skills/create-app/SKILL.md`            |
| **New skill**              | `skills/create-skill/SKILL.md`          |
| **Install packages**       | `skills/install-packages/SKILL.md`      |
| **Config reference**       | `skills/config-standards/SKILL.md`      |
| All skills (40 guides)     | `skills/`                               |
| CSV reference data         | `docs/agents/*.csv`                     |
