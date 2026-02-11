# Agent Quick Start (Ultra-Compact)

## 🚨 CRITICAL

**Never commit to main** - Always: `twig switch LS-####` first

## 📋 5-Step Workflow

1. **Ticket**: `acli jira workitem transition --key LS-#### --status "In Progress"`
2. **Branch**: `twig switch LS-#### -p main` (independent) OR `-p current` (dependent)
3. **Code**: Use `pnpm exec nx affected -t <target>` for all commands
4. **Validate**: `make pre-commit` (typecheck→lint→test→build - ALL must pass)
5. **Ship**: Commit + `twig github pr create-pr` + Update Jira to "In Review"

## ⚡ Essential Commands

```powershell
# Validation (run in order)
pnpm exec nx affected -t typecheck
pnpm exec nx affected -t lint --fix
pnpm exec nx affected -t test
pnpm exec nx affected -t build

# Shortcuts
make quick-check  # typecheck + lint
make pre-commit   # all 4 steps

# PATH refresh (if acli not found)
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

## 📂 Load Based on Task

**Common Tasks** (load one):

- Branch issues → [`quick-reference.md`](quick-reference.md)
- Type errors → [`tasks/fix-types.md`](tasks/fix-types.md)
- Lint errors → [`tasks/fix-lint.md`](tasks/fix-lint.md)
- PR creation → [`tasks/create-pr.md`](tasks/create-pr.md)
- DB queries → [`../../docs/agents/database-query-guide.md`](../../docs/agents/database-query-guide.md)

**Complex Work** (load selectively):

- Architecture → [`architecture-summary.md`](architecture-summary.md)
- Full workflow → [`../../docs/guides/ai-agent-contribution-workflow.md`](../../docs/guides/ai-agent-contribution-workflow.md)
- Troubleshooting → [`../../docs/guides/troubleshooting.md`](../../docs/guides/troubleshooting.md)

## ⚙️ Environment

Windows PowerShell | Nx monorepo | pnpm 9.12.1 | Jira:LS | twig

## Key Rules

✅ Use `pnpm exec nx affected -t <target>` | PowerShell: `;` chains | Validate: typecheck→lint→test→build | Fix root causes | Update Jira each step

❌ Never: commit to main | skip validation | suppress errors | use `pnpm run` directly

---

**Token Savings**: ~1KB (vs 13KB agents.md) - Load additional docs only when needed
