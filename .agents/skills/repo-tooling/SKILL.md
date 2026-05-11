---
name: repo-tooling
description: 'Monorepo development tooling: linting, type checking, building, Make targets, GraphQL codegen, database migrations/queries, and package installation. Use for pre-commit validation, diagnosing CI failures, running builds, managing dependencies, or database operations.'
---

# Skill: Repo Tooling

## Overview

Consolidated skill for running and fixing ESLint, TypeScript type checking, builds, codegen, database operations, and package management in the Nx monorepo. Covers the full cycle: run analysis, fix errors, build, commit.

## When to Use

- Before committing changes (`make pc`)
- When CI fails on lint, format, typecheck, or build steps
- After modifying TypeScript files or adding new code
- Building projects for deployment or validation
- Running or writing database migrations
- Running GraphQL codegen after schema changes
- Installing, removing, or updating npm packages
- Resolving code quality or type safety issues

## Quick Commands

| Task                | Command                               | Notes                                                                                                    |
| ------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Lint (auto-fix)     | `make lint-fix`                       | Fixes ~80% of issues automatically                                                                       |
| Lint (dry run)      | `make lint`                           | Report only, no changes                                                                                  |
| Test (affected)     | `make test`                           | Affected projects only                                                                                   |
| Type check          | `make typecheck`                      | Affected projects only                                                                                   |
| Format              | `make format`                         | Prettier across all files                                                                                |
| Build (affected)    | `make build`                          | Build changed projects                                                                                   |
| Codegen             | `make codegen`                        | GraphQL type generation                                                                                  |
| DB migration status | `db_migration_status` (MCP)           | Check for pending migrations                                                                             |
| DB migrate (MCP)    | `db_migrate` (MCP)                    | Apply pending migrations                                                                                 |
| DB migrate (shell)  | `make db-migrate`                     | Shell fallback / non-MCP envs                                                                            |
| Full pre-commit     | `make pc`                             | typecheck + lint + test + build                                                                          |
| Test all            | `make test-all`                       | All projects, not just affected                                                                          |
| Dev servers         | `make dev`                            | Start all dev services                                                                                   |
| Storybook           | `make dev-storybook`                  | Component dev                                                                                            |
| GraphQL explorer    | `make graphiql`                       | GraphQL playground                                                                                       |
| DB Studio           | `make db-studio`                      | Drizzle Studio UI                                                                                        |
| Create worktree     | `make worktree TICKET=#### DESC=desc` | Sibling worktree (parallel only)                                                                         |
| Setup worktree      | `make wt-setup WT=$wt`                | Install deps + configure worktree                                                                        |
| Kill stale procs    | `make kill-stale`                     | Find stale node processes                                                                                |
| Project target      | `pnpm exec nx run <proj>:<target>`    | Nx project-specific                                                                                      |
| Affected targets    | `pnpm exec nx affected -t <target>`   | Changed projects only                                                                                    |
| Validate skills     | `make lint-skills`                    | Validates all `.agents/skills/` via `agentskills`                                                        |
| Generate diagrams   | `make diagrams`                       | Mermaid `.mmd` → `.svg` under `.agents/skills/**/diagrams/`; requires `mmdc` (`@mermaid-js/mermaid-cli`) |

> **MCP first**: prefer `nx_run` / `nx_run_affected` MCP tools over shell commands when available.

> **Always use `make` targets** -- they set `NODE_OPTIONS` for the Windows windowsHide patch.

## PreToolUse Bash MCP-First Hook

`.claude/hooks/guard-bash-mcp-first.sh` is a `PreToolUse` hook that intercepts `Bash` tool calls and **blocks** commands starting with `ls`, `find`, `cat` (plain file reads), `head`, `tail`, `grep`, or `rg`. Each block message points at the correct built-in replacement (`Glob`, `Grep`, `Read`) per the AGENTS.md "Concrete substitutions" table. Blocking is the backstop because doc-only reminders have repeatedly failed in long agent sessions.

**Bypassing** for genuine fallback cases:

- `cat` is allowed when used as a heredoc (`cat <<EOF`), as a true pipeline source (`cat file | ...`, single `|` not `||`), with no file arguments (stdin passthrough), or with redirect operators (`cat > file`, `cat >> file`, `cat file > out`). Otherwise, `cat` with file arguments is blocked, including plain reads like `cat file` or `cat file1 file2`.
- For other true fallback cases (e.g. `find ... -exec ...` with no built-in equivalent), set `ALLOW_BASH_FALLBACK=1` in the shell environment for the session — the hook honors it and exits 0.
- If the hook itself is broken (e.g. a regex bug), edit `.claude/hooks/guard-bash-mcp-first.sh` and verify locally before reverting; do not silently disable it in `settings.json`.

The hook is registered under `hooks.PreToolUse` in `.claude/settings.json` next to the existing `guard-main-repo.sh`.

## Decision Tree

| Situation                                | Reference                                                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Running the linter, formatting, commands | [references/lint.md](references/lint.md)                                                                 |
| Fixing lint errors that auto-fix missed  | [references/fix-lint.md](references/fix-lint.md)                                                         |
| Running the type checker                 | [references/typecheck.md](references/typecheck.md)                                                       |
| Fixing TypeScript type errors            | [references/fix-types.md](references/fix-types.md)                                                       |
| Build projects                           | [references/build.md](references/build.md)                                                               |
| Make targets reference                   | [references/makefile.md](references/makefile.md)                                                         |
| GraphQL codegen                          | [references/codegen.md](references/codegen.md)                                                           |
| Database migrations / queries            | [references/database.md](references/database.md)                                                         |
| Database schema reference                | [references/db-schema-reference.md](references/db-schema-reference.md)                                   |
| Migration patterns and code examples     | [references/db-migration-patterns-and-operations.md](references/db-migration-patterns-and-operations.md) |
| Database dump and restore                | [references/db-dump-and-restore.md](references/db-dump-and-restore.md)                                   |
| Install / manage packages                | [references/install-packages.md](references/install-packages.md)                                         |

## Common Workflow

```
1. make typecheck          # Fix type errors first (they cause false lint errors)
2. make lint-fix           # Auto-fix what it can
3. Review remaining errors # See fix-lint.md / fix-types.md for manual fixes
4. make build              # Validate build output
5. make pc                 # Full validation before commit
6. Commit & push
```

## Key Rules

- **Never use `@ts-ignore`** -- fix the root cause instead
- **Never use `eslint-disable`** without documented justification (see `skills/no-lint-disable/SKILL.md`)
- **No `console.*`** -- use `LOGGER` from `@legacy-sports/logging`
- **Run typecheck before lint** -- type errors can cause false lint positives
- **If `make pc` reformats files**, commit them and re-run `make pc`
- **Always use `make` targets** over raw `pnpm exec nx` commands
- **Always use `-w` flag** when installing packages (`pnpm add -w`)
- **Avoid `node -e` on Windows for multi-line scripts** — complex quoting (backslashes, embedded quotes, `$`-expansion) is fragile in PowerShell. For any Node script longer than a trivial expression, write it to `scratch/<name>.js` and run `node scratch/<name>.js` instead
- **Run `print-schema` before codegen** when Pothos resolvers have changed
- **Check migration status before `make pc`** -- pending migrations cause failures

## Pre-commit Validation Order

```
typecheck --> lint --> test --> build
```

Run the full suite with `make pc`. See [references/makefile.md](references/makefile.md) for all targets.

## Related Skills

- [Testing](../test/SKILL.md)
- [No Lint Disable](../no-lint-disable/SKILL.md)
