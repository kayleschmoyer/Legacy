# Skill: Configuration Standards

## Overview

Reference guide for all project configuration file conventions in the Legacy Sports Nx monorepo. Use this when reviewing configs, debugging build/lint/test issues, or creating new projects.

## How Nx Targets Work

### Auto-inferred targets (no project.json entry needed)

| Target | Inferred by         | Trigger file             |
| ------ | ------------------- | ------------------------ |
| `test` | `@nx/jest/plugin`   | `jest.config.ts` present |
| `lint` | `@nx/eslint/plugin` | `.eslintrc.json` present |

### Target defaults (from `nx.json`)

These provide executor, caching, and options for targets that **exist** on a project. They do NOT create targets.

| Target      | Default command                                         | Requires stub?                          |
| ----------- | ------------------------------------------------------- | --------------------------------------- |
| `typecheck` | `tsc --noEmit -p tsconfig.lib.json` (cwd = projectRoot) | Yes — `"typecheck": {}` in project.json |
| `test`      | Adds `passWithNoTests: true` + CI config                | No — auto-inferred                      |
| `lint`      | `eslint . --max-warnings=0`                             | No — auto-inferred                      |

### When to override defaults

- **Apps & lambdas**: Override `typecheck` command to use `tsconfig.app.json`:
  ```json
  "typecheck": {
    "options": { "command": "tsc --noEmit -p tsconfig.app.json" }
  }
  ```
- **Custom lint patterns**: Override with `lintFilePatterns` when needed
- **Custom test configs**: Use `overrides` parameter in `createNodeJestConfig()`

---

## ESLint Config (`.eslintrc.json`)

### Inheritance chain

```
.eslintrc.json (root, root: true)
  └── project .eslintrc.json (extends ../../.eslintrc.json)
        └── (optional) plugin:@nx/react for React/RN projects
```

### Canonical structure

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

### Required ignorePatterns

| Pattern                             | When                               | Why                                           |
| ----------------------------------- | ---------------------------------- | --------------------------------------------- |
| `"!**/*"`                           | Always                             | Overrides root's `"**/*"` ignore-all pattern  |
| `"jest.config.ts"`                  | Always (when file exists)          | Avoids lint errors from `require()` in config |
| `"dist"`                            | Lambdas and apps with build output | Don't lint compiled output                    |
| `".expo"`, `"web-build"`, `"cache"` | Expo/React Native apps             | Expo build artifacts                          |
| `".next"`                           | Next.js apps                       | Next build output                             |

### React/RN projects

Add `"plugin:@nx/react"` as the **first** extends entry:

```json
"extends": ["plugin:@nx/react", "../../.eslintrc.json"]
```

### Rules

- Keep `"rules": {}` in overrides — don't delete the empty object
- Add project-specific rules only when the root config is insufficient
- **Never** use `eslint-disable` comments — fix the root cause

### Anti-patterns (DO NOT)

- ❌ Use `.eslintrc.cjs` proxy files (removed during cleanup)
- ❌ Set `"root": true"` in project configs (blocks inheritance)
- ❌ Add redundant Expo patterns to non-Expo projects
- ❌ Add `node_modules` to ignorePatterns (handled by root)

---

## TypeScript Config (`tsconfig.*.json`)

### Inheritance chain

```
tsconfig.base.json (root — strict, skipLibCheck, paths, etc.)
  └── project tsconfig.json (module, jsx, references)
        ├── tsconfig.lib.json (libraries) or tsconfig.app.json (apps/lambdas)
        └── tsconfig.spec.json (test files)
```

### What goes where

| Setting                                      | Where                                     | Notes                             |
| -------------------------------------------- | ----------------------------------------- | --------------------------------- |
| `strict`, `skipLibCheck`, `moduleResolution` | `tsconfig.base.json` only                 | Inherited everywhere              |
| `module: "commonjs"`                         | Project `tsconfig.json`                   | Project-level override            |
| `jsx`                                        | Project `tsconfig.json`                   | `"react-native"` or `"react-jsx"` |
| `allowSyntheticDefaultImports`               | Project `tsconfig.json`                   | Apps/lambdas only                 |
| `resolveJsonModule`                          | Project `tsconfig.json`                   | Apps/lambdas only                 |
| `declaration: true`                          | `tsconfig.lib.json`                       | Libraries only                    |
| `types: ["node"]`                            | `tsconfig.lib.json` / `tsconfig.app.json` | Non-test code                     |
| `types: ["jest", "node"]`                    | `tsconfig.spec.json`                      | Test code                         |
| `outDir`                                     | `tsconfig.lib.json` / `tsconfig.app.json` | Always `"../../dist/out-tsc"`     |

### tsconfig.lib.json vs tsconfig.app.json

| Aspect            | `tsconfig.lib.json`                           | `tsconfig.app.json`                  |
| ----------------- | --------------------------------------------- | ------------------------------------ |
| Used by           | Libraries (`lib/`)                            | Apps & lambdas (`apps/`, `lambdas/`) |
| `extends`         | `./tsconfig.json`                             | `./tsconfig.json`                    |
| `declaration`     | `true`                                        | Usually omitted                      |
| Typecheck command | `tsc --noEmit -p tsconfig.lib.json` (default) | Must override in project.json        |

### Critical rule

**Always extend `./tsconfig.json`** from lib/app configs — never extend `../../tsconfig.base.json` directly. This ensures project-level `compilerOptions` (module, jsx, etc.) are inherited.

---

## Jest Config (`jest.config.ts`)

### Factory pattern

All Node/server jest configs use the shared factory at `jest.helpers.ts`:

```typescript
const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: '<project-name>',
  projectPath: '<category>/<project-name>', // e.g. 'lib/utils'
});
```

### What the factory provides

```typescript
{
  displayName,
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: `../../coverage/${projectPath}`,
}
```

### Common overrides

| Override                                       | When                                         |
| ---------------------------------------------- | -------------------------------------------- |
| `setupFiles: ['<rootDir>/src/setup-tests.ts']` | Lambda needs env vars                        |
| `testEnvironment: 'jsdom'`                     | React component testing (don't use factory)  |
| `transform` with custom tsconfig               | Project needs a different tsconfig for tests |

### ESM projects (`"type": "module"` in package.json)

Use `createRequire` instead of `require`:

```typescript
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createNodeJestConfig } = require('../../jest.helpers.ts');

export default createNodeJestConfig({
  displayName: '<name>',
  projectPath: '<category>/<name>',
});
```

Currently only `lib/api` uses this pattern.

### React/jsdom configs

Do **not** use the factory. Write a custom config:

```typescript
export default {
  displayName: '<name>',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'html'],
  coverageDirectory: '../../coverage/<category>/<name>',
};
```

---

## project.json

### Minimal library

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

### Tag conventions

| Dimension  | Options                                                                |
| ---------- | ---------------------------------------------------------------------- |
| `platform` | `shared` · `node` · `web` · `mobile`                                   |
| `scope`    | `lib` · `app` · `lambda`                                               |
| `type`     | `util` · `data-access` · `feature` · `ui` · `frontend` · `api` · `cli` |

### Targets to include

| Project type | Explicit targets                                         | Auto-inferred  |
| ------------ | -------------------------------------------------------- | -------------- |
| Library      | `typecheck: {}`                                          | `test`, `lint` |
| Lambda       | `typecheck` (override), `build`, `deploy`, `serve`, etc. | `test`, `lint` |
| App          | `typecheck` (override), `start`, etc.                    | `test`, `lint` |

---

## package.json

### Library

```json
{
  "name": "@legacy-sports/<name>",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

### Lambda

```json
{
  "name": "@legacy-sports/<name>-lambda",
  "version": "0.0.1",
  "main": "dist/index.js",
  "private": true,
  "scripts": { "dev": "...", "build": "...", "test": "..." }
}
```

### App

```json
{
  "name": "@legacy-sports/<name>",
  "version": "0.0.1",
  "private": true
}
```

### Rules

- **Always** `"private": true`
- **Never** `"type": "module"` unless specifically needed (breaks jest require)
- Use `"workspace:*"` for internal dependencies
- Use `"*"` for external dependencies (pnpm deduplicates from root)

---

## Checklist for New Projects

- [ ] `project.json` has correct `projectType`, `sourceRoot`, `tags`
- [ ] `project.json` has `"typecheck": {}` stub (or override for apps/lambdas)
- [ ] `tsconfig.json` extends `../../tsconfig.base.json` — no redundant options
- [ ] `tsconfig.lib.json` / `tsconfig.app.json` extends `./tsconfig.json`
- [ ] `tsconfig.spec.json` includes `"jest"` in types
- [ ] `.eslintrc.json` ignorePatterns includes `"jest.config.ts"`
- [ ] `jest.config.ts` uses `createNodeJestConfig()` factory (for node projects)
- [ ] `package.json` has correct `name`, `main`, `private: true`
- [ ] Path alias registered in `tsconfig.base.json` (libraries only)
- [ ] Run `typecheck`, `lint`, `test` — all pass

## Related Skills

- [Create Lib](create-lib.md) — Step-by-step library creation
- [Create Lambda](create-lambda.md) — Step-by-step lambda creation
- [Create App](create-app.md) — Step-by-step app creation
