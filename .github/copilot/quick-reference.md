# Quick Reference Guide

## 🚨 Critical Rules

1. **NEVER commit to main** - Always create feature branch: `twig switch LS-####`
2. **Always use `pnpm exec nx`** - Never use direct npm/pnpm commands
3. **Validation order** - typecheck → lint → test → build
4. **PowerShell syntax** - Use `;` for chaining, `$env:` for variables

## Essential Commands

### Validation (Run in Order)

```powershell
pnpm exec nx affected -t typecheck   # 1. Type checking
pnpm exec nx affected -t lint --fix  # 2. Linting with auto-fix
pnpm exec nx affected -t test        # 3. Testing
pnpm exec nx affected -t build       # 4. Building

# Shortcuts
make quick-check  # typecheck + lint only
make pre-commit   # All 4 validation steps
```

### Branch & Workflow

```powershell
# Create branch (NEW ticket from main)
git checkout main; git pull
twig switch LS-1234

# Create branch (follow-up from current)
twig switch LS-1234 -p current

# View branch tree
twig tree

# Rebase tree
make rebase-tree
```

### Jira Integration

```powershell
# View ticket
acli jira workitem view LS-1234

# Update status
acli jira workitem transition --key LS-1234 --status "In Progress"
acli jira workitem transition --key LS-1234 --status "In Review"
acli jira workitem transition --key LS-1234 --status "Done"

# If acli not found
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

### Git Operations

```powershell
# Commit
git add .
git commit -m "feat(scope): description"
git push origin HEAD

# Create PR
twig github pr create-pr
```

## Common Issues & Fixes

| Problem             | Solution                                      |
| ------------------- | --------------------------------------------- |
| `acli not found`    | Refresh PATH (see Jira section above)         |
| Module not found    | `pnpm run build:libs`                         |
| Type errors         | `pnpm exec nx affected -t typecheck` then fix |
| DB connection fails | `pnpm run sync-env`                           |
| Port in use         | `pnpm dlx kill-port 3000`                     |
| Nx cache issues     | `pnpm exec nx reset`                          |

## Complete Workflow (5 Steps)

```powershell
# 1. Create branch & update Jira
git checkout main; git pull
twig switch LS-1234
acli jira workitem transition --key LS-1234 --status "In Progress"

# 2. Make changes (edit files)

# 3. Validate
pnpm exec nx affected -t typecheck
pnpm exec nx affected -t lint --fix
pnpm exec nx affected -t test
pnpm exec nx affected -t build

# 4. Commit & push
git add .
git commit -m "feat(scope): description"
git push origin HEAD

# 5. Create PR & update Jira
twig github pr create-pr
acli jira workitem transition --key LS-1234 --status "In Review"
```

## Nx Patterns

```powershell
# Run on affected projects only (recommended)
pnpm exec nx affected -t <target>

# Run on specific project
pnpm exec nx run <project>:<target>

# Run on project groups
pnpm exec nx run-many -t <target> --projects=tag:scope:lib

# View dependency graph
pnpm exec nx graph
```

## Environment

- **Platform**: Windows PowerShell
- **Monorepo**: Nx workspace
- **Package Manager**: pnpm (v9.12.1)
- **Jira Project**: LS
- **Branch Tool**: Twig

## When You Need More Detail

Load these files on-demand based on your task:

| Task                   | Load File                                         |
| ---------------------- | ------------------------------------------------- |
| Common patterns        | `docs/agents/quick-patterns.yml`                  |
| Type errors            | `docs/agents/type-fixes.yml`                      |
| Linting issues         | `docs/agents/lint-fixes.yml`                      |
| Full workflow          | `.github/copilot/skills/workflow-ticket-to-pr.md` |
| Branch management      | `docs/guides/branch-tree-management.md`           |
| Database work          | `docs/architecture/database-schema.md` (excerpt)  |
| Architecture questions | `docs/architecture/` (specific file)              |
| Troubleshooting        | `docs/guides/troubleshooting.md`                  |
