---
name: create-lib
description: 'Create a new shared TypeScript library under lib/ with standardized Nx configuration; libraries are source-only packages consumed by apps and lambdas at build time.'
---

# Skill: Create a New Library

## Overview

Create a new shared library under `lib/` with standardized configuration files. Libraries are TypeScript-source-only packages consumed by apps and lambdas at build time — they do NOT have their own build targets.

## When to Use

- Adding a new shared utility, service, or data-access library
- Extracting shared code from an app or lambda into a reusable package

## Prerequisites

- Jira ticket assigned and branch created (`twig switch LS-#### -p=main`)

## Steps

### 1. Create the directory structure

Replace `<name>` with the kebab-case library name (e.g. `my-feature`).

```
lib/<name>/
├── src/
│   └── index.ts          # Public barrel export
├── .eslintrc.json
├── jest.config.ts
├── package.json
├── project.json
├── tsconfig.json
├── tsconfig.lib.json
└── tsconfig.spec.json
```

### 2. Create each file

#### `project.json`

```json
{
  "name": "<name>",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "lib/<name>/src",
  "projectType": "library",
  "tags": ["platform:shared", "scope:lib", "type:util"],
  "targets": {
    "typecheck": {}
  }
}
```

**Tag conventions** — adjust to match the library's purpose:

| Tag        | Values                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------- |
| `platform` | `shared` (cross-platform) · `node` (server-only) · `mobile` (RN-only) · `web` (browser-only) |
| `scope`    | `lib` (always for libraries)                                                                 |
| `type`     | `util` · `data-access` · `feature` · `ui`                                                    |

**Why `"typecheck": {}`?** — This empty stub is required so the `typecheck` target default in `nx.json` applies. Without it, `nx affected -t typecheck` skips this project. The `test` and `lint` targets are auto-inferred by `@nx/jest/plugin` and `@nx/eslint/plugin` from the presence of `jest.config.ts` and `.eslintrc.json`.

#### `package.json`

```json
{
  "name": "@legacy-sports/<name>",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

> If the library needs cross-platform mobile entry points, add `"react-native": "./src/mobile.ts"`.

#### `tsconfig.json`

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
  },
  "files": [],
  "include": [],
  "references": [
    { "path": "./tsconfig.lib.json" },
    { "path": "./tsconfig.spec.json" },
  ],
}
```

#### `tsconfig.lib.json`

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "outDir": "../../dist/out-tsc",
    "declaration": true,
    "types": ["node"],
  },
  "exclude": ["jest.config.ts", "src/**/*.spec.ts", "src/**/*.test.ts"],
  "include": ["src/**/*.ts"],
}
```

#### `tsconfig.spec.json`

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/out-tsc",
    "module": "commonjs",
    "types": ["jest", "node"],
  },
  "include": [
    "jest.config.ts",
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.d.ts",
  ],
}
```

#### `.eslintrc.json`

```json
{
  "extends": ["../../.eslintrc.json"],
  "ignorePatterns": ["!**/*", "jest.config.ts"],
  "overrides": [
    {
      "files": ["*.ts", "*.tsx"],
      "parserOptions": {
        "project": ["tsconfig.*?.json"]
      },
      "rules": {}
    }
  ]
}
```

#### `jest.config.ts`

```typescript
const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: '<name>',
  projectPath: 'lib/<name>',
});
```

#### `src/index.ts`

```typescript
// Public API for @legacy-sports/<name>
```

### 3. Register the path alias

Add to `tsconfig.base.json` under `compilerOptions.paths` (keep alphabetical order):

```jsonc
"@legacy-sports/<name>": ["lib/<name>/src/index.ts"]
```

### 4. Validate

```powershell
pnpm exec nx run <name>:typecheck
pnpm exec nx run <name>:lint
pnpm exec nx run <name>:test
```

All three must pass before committing.

## Common Mistakes

| Mistake                                                                       | Why it fails                                                |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Missing `"typecheck": {}` in project.json                                     | `nx affected -t typecheck` silently skips the project       |
| Forgetting path alias in `tsconfig.base.json`                                 | Other projects can't import `@legacy-sports/<name>`         |
| Using `"type": "module"` in package.json                                      | Breaks `require()` in jest configs; only `lib/api` uses ESM |
| Adding `"test"` or `"lint"` targets to project.json                           | Redundant — these are auto-inferred by Nx plugins           |
| tsconfig.lib.json extending `tsconfig.base.json` instead of `./tsconfig.json` | Bypasses project-level compiler options                     |
| Missing `jest.config.ts` in `.eslintrc.json` ignorePatterns                   | Lint errors on the config file itself                       |

## Related Skills

- [Typecheck](../typecheck/SKILL.md) — Validate types
- [Lint](../lint/SKILL.md) — Run ESLint
- [Test](../test/SKILL.md) — Run Jest tests
- [Config Standards](../config-standards/SKILL.md) — Full reference for config conventions
