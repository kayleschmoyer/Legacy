---
name: install-packages
description: 'Install, remove, or update npm packages in the pnpm monorepo; covers workspace-root vs project-level dependencies, dev dependencies, peer dependencies, post-install validation, and preventing version duplication across workspace packages (pnpm.overrides, pinned specifiers, nested node_modules detection).'
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

## Preventing Version Duplication in Workspace Packages

### The Problem

Most dependencies live only in the root `package.json`. However, a few workspace packages under `lib/` declare their own `dependencies` or `peerDependencies` (e.g., `lib/tamagui-config`, `lib/ui-abstractions`). When these use wildcard specifiers (`"*"`, `">=1.0.0"`), pnpm may resolve them to **different versions** than the root, creating nested `node_modules` with duplicate copies.

This causes **silent runtime crashes** when a library initialises global state in one copy and another copy tries to read it. Example: Tamagui's `createTamagui()` sets `globalThis.__tamaguiConfig` in v1.132, but `getSetting()` from v1.144 reads it and finds `null` → crash.

### Prevention Rules

1. **Pin versions in workspace package.json files** — never use `"*"` or overly-broad ranges like `">=1.0.0"`. Use exact versions (`"1.144.4"`) or narrow ranges (`">=1.144.0"`).

2. **Use `pnpm.overrides` in root `package.json`** — the `"$packageName"` syntax pins all resolutions to match the root version. This is the primary defense against duplication:

   ```json
   "pnpm": {
     "overrides": {
       "tamagui": "$tamagui",
       "@tamagui/core": "$@tamagui/core"
     }
   }
   ```

   Use `"$pkgName"` for packages that exist in root `dependencies`; use an exact version string for transitive-only packages.

3. **After upgrading a root dependency, always check `lib/` packages** — if any workspace package also declares that dependency, update its specifier to match.

4. **Verify no nested duplicates after lockfile changes**:

   ```powershell
   # Check for nested node_modules in workspace packages
   Get-ChildItem lib/*/node_modules -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
   ```

   If any appear, investigate whether the lockfile resolved a different version for that workspace package.

5. **Add Vite resolve aliases as defense-in-depth** — for packages that use global state (Tamagui, React context providers), add explicit resolve aliases in `vite.config.mts` to force the bundler to use one copy:
   ```typescript
   resolve: {
     alias: {
       '@tamagui/web': resolve(__dirname, '../../node_modules/@tamagui/web'),
     }
   }
   ```

### When Upgrading a Shared Package (Checklist)

```powershell
# 1. Update root version
pnpm add -w <package>@<new-version>

# 2. Check/update lib package.json files
Select-String -Path lib/*/package.json -Pattern '"<package>"'

# 3. Regenerate lockfile
pnpm install

# 4. Verify no nested copies
Get-ChildItem lib/*/node_modules -ErrorAction SilentlyContinue

# 5. Typecheck + build
pnpm exec nx affected -t typecheck
pnpm exec nx affected -t build
```
