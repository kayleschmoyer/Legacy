---
name: install-packages
description: 'Install, remove, or update npm packages in the pnpm monorepo; covers workspace-root vs project-level dependencies, dev dependencies, peer dependencies, and post-install validation.'
---

# Skill: Installing Packages

## Overview

How to correctly install npm packages in the Legacy Sports pnpm monorepo. All dependencies are hoisted to the workspace root — individual project `package.json` files do **not** declare their own dependencies.

## When to Use

- Adding a new npm package
- Removing an unused package
- Moving a dependency between `dependencies` and `devDependencies`
- Updating a package to a specific version
- Troubleshooting "module not found" errors after install

## Prerequisites

- pnpm 9.12.1+ (`corepack enable && corepack prepare pnpm@9.12.1 --activate`)
- Run from the workspace root (`d:\code\legacy-sports`)

## Commands

### Install a Production Dependency

```powershell
# Add to workspace root (the standard approach in this monorepo)
pnpm add -w <package-name>

# Example
pnpm add -w qrcode.react
```

### Install a Dev Dependency

```powershell
pnpm add -w -D <package-name>

# Example
pnpm add -w -D @types/node
```

### Install Multiple Packages

```powershell
pnpm add -w package-a package-b package-c
```

### Remove a Package

```powershell
pnpm remove -w <package-name>
```

### Install a Specific Version

```powershell
pnpm add -w <package-name>@<version>

# Example
pnpm add -w react@18.3.1
```

## Important Rules

### Always Use `-w` (Workspace Root)

This monorepo hoists all dependencies to the root `package.json`. **Never** install into a sub-project directory:

```powershell
# ✅ CORRECT — from workspace root
pnpm add -w some-package

# ❌ WRONG — from a sub-project directory
cd apps/web
pnpm add some-package
```

Running `pnpm add` without `-w` from a sub-project will fail or create a misaligned lockfile.

### Check if Types Are Bundled

Before installing a separate `@types/` package, check if the library bundles its own types:

```powershell
pnpm info <package-name> types typings
```

If it prints a `.d.ts` path, types are bundled and you do **not** need `@types/<package-name>`.

### Post-Install Validation

After installing, always verify the workspace is healthy:

```powershell
# Quick check — ensure lockfile is in sync
pnpm install

# Full validation
pnpm exec nx affected -t typecheck
```

## Dependency Categories

| Category          | Flag | When to use                                       |
| ----------------- | ---- | ------------------------------------------------- |
| `dependencies`    | none | Runtime packages (React, Apollo, Drizzle, etc.)   |
| `devDependencies` | `-D` | Build/test tools (TypeScript, ESLint, Jest, etc.) |

## Troubleshooting

### `ERR_PNPM_ADDING_TO_ROOT`

You forgot the `-w` flag:

```powershell
# Fix
pnpm add -w <package-name>
```

### Lockfile Out of Sync

```powershell
pnpm install
```

### Module Not Found After Install

```powershell
# Reset Nx cache and rebuild
pnpm exec nx reset
pnpm install
pnpm exec nx affected -t typecheck
```

### Peer Dependency Warnings

Peer dependency warnings are common and usually safe to ignore. If a peer dep is truly required, install the specified version:

```powershell
pnpm add -w <peer-package>@<required-version>
```

## CI / GitHub Actions

### Never Use `npm` in Workflows

This is a **pnpm workspace**. Never use `npm install`, `npm ci`, or bare `npm` in GitHub Actions workflows. npm resolves the entire root `package.json` dependency tree with strict peer-dep checks (npm 7+), which will fail on mismatches that pnpm handles via its lockfile.

```yaml
# ✅ CORRECT — use pnpm for dependencies
- run: pnpm install --frozen-lockfile

# ✅ CORRECT — use npx for standalone CLI tools (doesn't touch node_modules)
- run: npx playwright@1.55.0 merge-reports --reporter html ./all-blob-reports

# ❌ WRONG — triggers full dependency resolution, fails on peer dep mismatches
- run: npm install --no-save playwright@1.55.0
```

If a CI step only needs a CLI binary (e.g. Playwright for report merging), use `npx <tool>@<version>` which downloads to a temp cache without touching the project's dependency tree.
