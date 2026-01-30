# GitHub Copilot Instructions for Legacy Sports (Ultra-Optimized)

## 🚨 CRITICAL: Load This First

**[`quick-reference.md`](copilot/quick-reference.md)** - All essentials in 3.5 KB

Contains: Complete 5-step workflow, commands, troubleshooting, when to load detailed docs.

**Never commit to main** - Always create branch first: `twig switch LS-####`

## 📂 Load On-Demand

**Tasks** ([`tasks/`](copilot/tasks/)): Start ticket (1KB) | Fix types (1.4KB) | Fix lint (1.5KB) | Create PR (1.7KB) | Troubleshoot (1.9KB)

**Architecture**: [`architecture-summary.md`](copilot/architecture-summary.md) (2.8KB) → Full docs: `docs/architecture/*.md`

**Patterns**: [`quick-patterns.yml`](../docs/agents/quick-patterns.yml) (2KB) | [`type-fixes.yml`](../docs/agents/type-fixes.yml) (2KB) | [`lint-fixes.yml`](../docs/agents/lint-fixes.yml) (2KB)

**Detailed**: [`skills/`](copilot/skills/) (2-17KB each) | [`docs/guides/`](../docs/guides/) (8-37KB) - Load only if tasks insufficient

## ⚡ Efficiency Guidelines

### Context Loading Strategy

**Default**: Load only `quick-reference.md` + `commands.yml` (~15 KB total)

**For specific tasks**, add task-specific file (~2-3 KB each):

- Branch issues → `tasks/start-ticket.md`
- Type errors → `tasks/fix-types.md` + `agents/type-safety.csv`
- Linting → `tasks/fix-lint.md` + `agents/eslint-standards.csv`
- PR creation → `tasks/create-pr.md`

**For complex issues**: Load detailed guides selectively

- Architecture questions → `architecture-summary.md` first, then specific file if needed
- Advanced troubleshooting → `guides/troubleshooting.md`
- Branch tree issues → `guides/branch-tree-management.md`

### Key Principles

1. **Always use Nx commands**: `pnpm exec nx affected -t <target>`
2. **PowerShell syntax**: Use `;` for chaining, `$env:` for variables
3. **Validation order**: typecheck → lint → test → build
4. **Never suppress errors**: Fix root causes
5. **Update Jira**: Track status throughout workflow
6. **Load docs on-demand**: Start with quick-reference, load more only if needed

## Environment Context

- **Platform**: Windows PowerShell
- **Monorepo**: Nx workspace
- **Package Manager**: pnpm v9.12.1
- **Jira Project**: LS
- **Branch Tool**: Twig

---

**Token Optimization**: This configuration reduces context from ~450 KB to ~15 KB by default, loading additional docs only when needed.
Loading Strategy

**Default**: `quick-reference.md` only (3.5KB) | **Task**: + task file (1-2KB) | **Complex**: + detailed docs (selectively)

## Key Principles

Nx: `pnpm exec nx affected -t <target>` | PowerShell: `;` chains, `$env:` vars | Order: typecheck→lint→test→build | Fix root causes, never suppress | Update Jira at each step

**Environment**: Windows PowerShell | Nx workspace | pnpm 9.12.1 | Jira:LS | twig
