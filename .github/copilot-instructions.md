# Legacy Sports — Copilot Instructions

🚨 **NEVER commit to main** — create a worktree first: `twig worktree create LS-####/description`

## Workflow

1. Ticket: create if needed: `acli jira workitem create --summary "..." --project LS --type Task --json | ConvertFrom-Json` → note `$key`
2. Worktree: `twig worktree create $key/description` → `twig worktree list` (note path) → `make install` + copy `.env` + junction `.twig` → `code $wt`
3. Jira "In Progress": `acli jira workitem transition --key LS-#### --status "In Progress"`
4. Code: `pnpm exec nx affected -t <target>` (never `pnpm run`)
5. Code: commit changes with `git commit -m "type(scope): msg"` → `git push origin HEAD`
6. Validate: `make pc` — must pass before opening PR
7. Ship: `twig github pr create-pr` → Jira "In Review"
8. Cleanup: `twig worktree clean` → `git branch -d LS-####/description` → Jira "Done"

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
| Worktree workflow          | `skills/worktree-workflow/SKILL.md`     |
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
| **Never edit generated**   | `skills/no-edit-generated/SKILL.md`     |
| **UI Standards**           | `skills/ui-standards/SKILL.md`          |
| **UI Brand Colors**        | `skills/ui-brand-colors/SKILL.md`       |
| **User testing**           | `skills/user-testing/SKILL.md`          |
| All skills (40 guides)     | `skills/`                               |
| CSV reference data         | `docs/agents/*.csv`                     |
