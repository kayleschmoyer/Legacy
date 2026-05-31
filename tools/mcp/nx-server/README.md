# MCP Nx Server

Nx build system intelligence for AI agents — project discovery, affected analysis, target execution, dependency graph queries, and safe package installation.

## Tools

- **nx_show_projects** — List Nx projects with optional filters (affected, target, tag)
- **nx_show_project** — Inspect a single project's configuration (targets, tags, deps)
- **nx_affected** — Show which projects are affected by current changes
- **nx_run** — Run an Nx target on a specific project
- **nx_run_affected** — Run a target on all affected projects
- **nx_dep_graph** — Query dependency relationships between projects
- **nx_install_package** — Symlink-aware package installation with lock file, duplicate detection, and @types/ companion check
- **nx_check_package_health** — Scan workspace for nested node_modules, wildcard ranges, missing overrides, and missing @types/ companions

## How It Works

Wraps Nx CLI commands (`nx show projects`, `nx show project`, `nx affected`, `nx run`, `nx graph`) with structured JSON output and safety guardrails. Target execution is limited to an allowlist of safe targets (build, test, lint, typecheck, codegen, serve, dev, print-schema, deploy:plan, e2e, storybook) to prevent unintended side effects.

### Package Installation Safety

`nx_install_package` enforces the monorepo's package installation rules:

1. **Symlink detection** — refuses to install if `node_modules` is a symlink into a shared pool slot (it would mutate a slot other worktrees may be running)
2. **Immutable pool slots** — the content-addressable `node_modules` pool (`scripts/modules-pool/link.mjs`) makes concurrent installs safe by construction: a new lockfile builds a separate immutable slot, so installs never corrupt another worktree's `node_modules`
3. **Workspace root** — always installs with `-w` flag (all deps are hoisted to the root)
4. **Post-install scanning** — checks for nested `node_modules` in `lib/` that signal version duplication
5. **Types detection** — reports whether the package bundles types or needs an `@types/` companion
