# 0001. Use pnpm workspaces + Nx for monorepo orchestration

Date: 2024-08-22

## Status

Accepted

## Context

The project began as a single React Native app and grew organically to include a Vite/React web app,
a GraphQL API layer (several Lambda functions), a CLI, and an expanding set of shared libraries
(logging, DB client, code generation, API clients, etc.). Running everything in separate repositories
would have required publishing packages on every change and coordinating cross-repo version bumps —
overhead that slows down a small team moving fast.

A monorepo was the natural answer. The decision point was which toolchain to use:

- **Yarn workspaces** — the incumbent standard at the time, but offers no task runner, no remote
  caching, and slower installs due to lack of content-addressable storage.
- **Turborepo** — simpler pipeline config, but fewer first-party plugins and shallower TypeScript /
  React Native integration compared to Nx's ecosystem.
- **Nx** — comprehensive plugin set (`@nx/react`, `@nx/react-native`, `@nx/jest`, `@nx/esbuild`,
  etc.), built-in affected analysis, caching, and an active plugin ecosystem.
- **Separate repos** — eliminated early; the coordination cost grows super-linearly with the number
  of packages.

pnpm was evaluated alongside npm and Yarn. Its content-addressable store avoids duplicate package
installations across projects, and its strict hoisting rules surface peer-dependency issues early
rather than silently depending on hoisted transitive packages.

## Decision

We will use **pnpm workspaces** as the package manager and **Nx** as the task runner and build
orchestrator for the monorepo.

- pnpm manages dependency installation, workspace linking, and enforced hoisting via its strict
  `node_modules` layout.
- Nx provides per-target caching, `affected` graph analysis (run only what changed), and parallelism
  (`parallel: 5` in `nx.json`).
- First-party Nx plugins (`@nx/react`, `@nx/jest`, `@nx/playwright`, `@nx/esbuild`, etc.) own the
  build, test, lint, and typecheck targets — avoiding bespoke per-package config drift.
- The `pnpm-workspace.yaml` declares four package roots: `apps/*`, `lib/*`, `lambdas/*`,
  `tools/*`.

## Consequences

### Easier

- Running `nx affected -t test` instead of `pnpm -r test` reduces CI time by skipping untouched
  packages — the single biggest CI speed lever.
- Adding a new shared library is one `nx g @nx/js:library` step; it is immediately available
  as a workspace reference without publishing to a registry.
- Nx's task graph catches dependency ordering bugs (e.g., building a lib before its consumer) at
  config time rather than at runtime.

### Harder

- Worktree sessions require careful `node_modules` setup: the content-addressable store lives in the
  main repo, so native ephemeral worktrees must symlink or independently install `node_modules`
  before any Nx command runs (see `scripts/modules-pool/link.mjs`).
- Upgrading Nx is a coordinated effort across all plugin packages (`nx migrate` must be applied and
  tested end-to-end).
- Developers unfamiliar with Nx must learn its project graph and target conventions before
  contributing build config changes.

### Now constrained

- **pnpm is the only supported package manager.** `npm install` and `yarn install` are rejected
  by the `preinstall` lifecycle script (`scripts/preinstall-guard.js`) before any packages are
  touched. The pre-commit hook's `@legacy-sports` package validator separately enforces correct
  workspace protocol usage (`"workspace:*"`) in committed `package.json` changes.
- **Task orchestration goes through Nx.** Scripts that need to run across packages must be Nx
  targets; ad-hoc `pnpm -r exec` loops bypass caching and affected analysis and are strongly
  discouraged.
- **Packages must declare their workspace references via `pnpm` workspace protocol** (`"@legacy-sports/logging": "workspace:*"`), not via local file paths, to keep the dependency graph visible to Nx.
