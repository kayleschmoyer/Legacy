# MCP Nx Server

Nx build system intelligence for AI agents — project discovery, affected analysis, target execution, and dependency graph queries.

## Tools

- **nx_show_projects** — List Nx projects with optional filters (affected, target, tag)
- **nx_show_project** — Inspect a single project's configuration (targets, tags, deps)
- **nx_affected** — Show which projects are affected by current changes
- **nx_run** — Run an Nx target on a specific project
- **nx_run_affected** — Run a target on all affected projects
- **nx_dep_graph** — Query dependency relationships between projects

## How It Works

Wraps Nx CLI commands (`nx show projects`, `nx show project`, `nx affected`, `nx run`, `nx graph`) with structured JSON output and safety guardrails. Target execution is limited to an allowlist of safe targets (build, test, lint, typecheck, codegen, serve, dev, print-schema, deploy:plan, e2e, storybook) to prevent unintended side effects.
