# Epic: Migrate Legacy Sports Monorepo to pnpm Workspaces

**Jira Epic:** [LS-40](https://bkrupa.atlassian.net/browse/LS-40)

## Summary

- **Objective:** Replace npm CLI workflows with pnpm to shrink dependency install times and unlock reproducible workspace installs.
- **Owner:** Platform & Tooling (DevEx) team
- **Target Completion:** 4 weeks after kickoff (T+28 days)
- **Success Metrics:**
  - Cold CI install (linux-medium) ≤ 6 minutes
  - Warm CI install ≤ 2 minutes
  - Developer bootstrap (`pnpm install`) ≤ 4 minutes on baseline laptop
  - Zero regressions in Nx task execution across supported platforms (Web, Mobile, Lambdas)

### Current Status (2025-10-26)

- ✅ LS-41 complete: workspace metadata scaffolded (`pnpm-workspace.yaml`, `.npmrc`, `packageManager`, pnpm overrides)
- ✅ LS-42 complete: composite setup action conditionally installs pnpm, caches pnpm store, and supports npm fallback
- 🔄 LS-43 in flight: root Makefile, package.json scripts, primary setup docs, lambda guides, and security workflows now default to pnpm (`pnpm exec`/`pnpm run`); remaining Nx metadata refresh and workspace dependency alignment queued for follow-up
- ⚠️ `pnpm import` blocked by internal packages published as workspace-only (`@legacy-sports/*`); requires `workspace:` version alignment before generating `pnpm-lock.yaml`

## Context & Problem Statement

Our current CI warmup job relies on cached `node_modules` tarballs plus `npm ci`. Cache misses or lockfile churn pull install time beyond 45 minutes, blocking fast PR validation. pnpm provides a content-addressable store and deterministic symlinks that can reduce install time to ≤2 minutes on cache hits while still supporting Nx affected workflows.

## Scope

- pnpm adoption at the workspace level (root + all packages)
- CI/CD pipeline updates for orchestrator, reusable workflows, and composite actions
- Developer tooling: scripts, docs, and environment bootstrap
- Compatibility fixes for Metro, Jest, React Native, and lambda packaging with pnpm's hoisted node linker
- Removal of npm-specific overrides and cache automation

Out of scope: Yarn 4/Turbo adoption, dependency pruning beyond existing backlog, alternate package cloud solutions.

## Deliverables

1. **Workspace foundations**
   - `pnpm-workspace.yaml` checked in with all package globs
   - Root `package.json` updated with `packageManager` metadata and pnpm-compatible overrides
   - `.npmrc` / `.pnpmfile.cjs` configured for hoisted linker and strict lockfile usage
2. **CI integration**
   - `.github/actions/setup` updated to install pnpm via `pnpm/setup-action` and leverage `pnpm store path` caching
   - Orchestrator warmup job switched to `pnpm fetch` + `pnpm install --offline`
   - Validation that Nx composite actions use `pnpm exec`
3. **Developer tooling & docs**
   - Guides (`docs/guides/development-setup.md`, `docs/agents/**/*.csv`) refreshed to point to pnpm commands
   - New troubleshooting section for pnpm store and hoist issues
4. **Validation & rollout**
   - CI trial run on feature branches with timing artifacts
   - Retrofits for any Metro/Jest path issues
   - Final toggle to enforce pnpm (pre-commit hook + CI guard)

## Work Breakdown (Stories)

1. **[LS-41](https://bkrupa.atlassian.net/browse/LS-41) – Bootstrap pnpm workspace metadata**
   - Add `pnpm-workspace.yaml`
   - Update `package.json` with `packageManager` and convert overrides to pnpm format
   - Check in `.npmrc` enabling `node-linker=hoisted`
2. **[LS-42](https://bkrupa.atlassian.net/browse/LS-42) – Update custom setup action for pnpm**
   - Install pnpm with fixed version
   - Swap `npm ci` logic for `pnpm fetch/install`
   - Cache pnpm store (`PNPM_HOME`) instead of `node_modules`
3. **[LS-43](https://bkrupa.atlassian.net/browse/LS-43) – Migrate CI scripts and actions to pnpm exec**
   - Replace `npx nx` usage inside `.github/actions`
   - Ensure Nx detection honors pnpm binaries
4. **[LS-44](https://bkrupa.atlassian.net/browse/LS-44) – Developer environment migration**
   - Update local scripts/docs
   - Provide conversion guide (`npm` → `pnpm`) and update automation scripts that shell out to npm
5. **[LS-45](https://bkrupa.atlassian.net/browse/LS-45) – Validation sweep & enforcement**
   - Run parallel CI comparisons (npm vs pnpm)
   - Fix any module resolution regressions (Metro, Jest)
   - Enforce pnpm via CI guard and adoption announcement

## Risks & Mitigations

| Risk                                                           | Mitigation                                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Metro/React-Native tooling fails with symlinked `node_modules` | Force hoisted linker (`node-linker=hoisted`) and add integration run on mobile build jobs |
| pnpm lockfile drift due to developers running npm              | Add Husky pre-commit + CI guard that blocks PRs touching `package-lock.json`              |
| Composite GitHub actions cannot access pnpm binaries           | Export `PNPM_HOME/bin` to `PATH` within setup action                                      |
| Store cache grows beyond GitHub cache quota                    | Scope cache key by lockfile hash and prune store using `pnpm store prune` during warmup   |

## Timeline

| Week | Milestone                                                                |
| ---- | ------------------------------------------------------------------------ |
| 1    | LS-3700 complete, pnpm workspace files merged (without enforcement)      |
| 2    | CI setup action migrated (LS-3701) and smoke-tested                      |
| 3    | Developer tooling/docs updated (LS-3703); CI scripts converted (LS-3702) |
| 4    | Validation sweep (LS-3704) and enforcement toggle                        |

## Communication Plan

- Kickoff post in #dev-tooling with migration timeline
- Weekly status updates referencing LS-370x tickets
- Publish troubleshooting section in `docs/guides/development-setup.md`
- Final announcement once pnpm is enforced

## Acceptance Criteria

- All CI jobs use pnpm commands and pass on PR + main
- `npm install` no longer required/documented for workspace setup
- Measured install times meet success metrics
- No regressions reported in the first week post-enforcement
