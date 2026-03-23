# Create a New App

## Overview

Create a new application under `apps/` with standardized configuration. This skill covers **Node/CLI apps**. For React Native or Next.js apps, see the variant sections below.

## When to Use

- Adding a new CLI tool, admin script runner, or standalone application
- Creating a new web or mobile frontend

## Prerequisites

- Jira ticket assigned and branch created (`twig switch LS-#### -p=main`)

## Node / CLI App

### Directory structure

```
apps/<name>/
├── src/
│   ├── main.ts           # Entry point
│   └── main.test.ts      # Entry point test
├── .eslintrc.json
├── jest.config.ts
├── package.json
├── project.json
├── tsconfig.json
├── tsconfig.app.json
└── tsconfig.spec.json
```

### `project.json`

```json
{
  "name": "<name>",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/<name>/src",
  "projectType": "application",
  "tags": ["platform:node", "scope:app", "type:cli"],
  "targets": {
    "typecheck": {
      "options": {
        "command": "tsc --noEmit -p tsconfig.app.json"
      }
    },
    "start": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsx --tsconfig ../../tsconfig.base.json src/main.ts",
        "cwd": "apps/<name>"
      }
    }
  }
}
```

> Apps use `tsconfig.app.json` (not `tsconfig.lib.json`), so the `typecheck` target must override the default command.

### `package.json`

```json
{
  "name": "@legacy-sports/<name>",
  "version": "0.0.1",
  "private": true
}
```

### `tsconfig.json`

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowSyntheticDefaultImports": true,
    "lib": ["dom", "esnext"],
    "resolveJsonModule": true,
    "module": "CommonJS",
  },
  "files": [],
  "include": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.spec.json" },
  ],
}
```

### `tsconfig.app.json`

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/out-tsc",
    "types": ["node"],
  },
  "exclude": ["jest.config.ts", "**/*.test.ts", "**/*.spec.ts"],
  "include": ["**/*.ts"],
}
```

### `tsconfig.spec.json`

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

### `.eslintrc.json`

```json
{
  "extends": ["../../.eslintrc.json"],
  "ignorePatterns": ["!**/*", "jest.config.ts", "dist"],
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

### `jest.config.ts`

```typescript
const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: '<name>',
  projectPath: 'apps/<name>',
});
```

### Validate

```powershell
pnpm exec nx run <name>:typecheck
pnpm exec nx run <name>:lint
pnpm exec nx run <name>:test
```

---

## React / Next.js Web App

Use the same structure above but with these differences:

### `.eslintrc.json` — extend React plugin

```json
{
  "extends": ["plugin:@nx/react", "../../.eslintrc.json"],
  "ignorePatterns": ["!**/*", "jest.config.ts", "dist", ".next"],
  "overrides": [
    {
      "files": ["*.ts", "*.tsx", "*.js", "*.jsx"],
      "rules": {}
    },
    {
      "files": ["*.ts", "*.tsx"],
      "parserOptions": {
        "project": ["tsconfig.*?.json"]
      },
      "rules": {}
    },
    {
      "files": ["*.js", "*.jsx"],
      "rules": {}
    }
  ]
}
```

### `tsconfig.json` — add JSX support

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "allowSyntheticDefaultImports": true,
    "lib": ["dom", "esnext"],
    "resolveJsonModule": true,
  },
  "files": [],
  "include": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.spec.json" },
  ],
}
```

### `project.json` tags

```json
"tags": ["platform:web", "scope:app", "type:frontend"]
```

---

## React Native / Expo App

Use the same React web pattern, plus:

### `tsconfig.json` — use `react-native` JSX

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowSyntheticDefaultImports": true,
    "jsx": "react-native",
    "lib": ["dom", "esnext"],
    "resolveJsonModule": true,
    "declaration": true,
  },
  "files": [],
  "include": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.spec.json" },
  ],
}
```

### `.eslintrc.json` — add Expo ignore patterns

```json
{
  "extends": ["plugin:@nx/react", "../../.eslintrc.json"],
  "ignorePatterns": [
    "!**/*",
    "jest.config.ts",
    ".expo",
    "web-build",
    "cache",
    "dist"
  ],
  "overrides": [
    {
      "files": ["*.ts", "*.tsx", "*.js", "*.jsx"],
      "rules": {}
    },
    {
      "files": ["*.ts", "*.tsx"],
      "parserOptions": {
        "project": ["tsconfig.*?.json"]
      },
      "rules": {}
    },
    {
      "files": ["*.js", "*.jsx"],
      "rules": {}
    }
  ]
}
```

### `project.json` tags

```json
"tags": ["platform:mobile", "scope:app", "type:frontend"]
```

---

## Tag Reference

| Tag        | Values                               |
| ---------- | ------------------------------------ |
| `platform` | `node` · `web` · `mobile` · `shared` |
| `scope`    | `app` (always for apps)              |
| `type`     | `cli` · `frontend` · `api`           |

## Common Mistakes

| Mistake                                                        | Why it fails                                          |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| Using default `typecheck` command                              | Apps use `tsconfig.app.json`, not `tsconfig.lib.json` |
| Forgetting `jest.config.ts` in `.eslintrc.json` ignorePatterns | Lint errors on the config file                        |
| Not adding `"dist"` or `".next"` to ignorePatterns             | Lint checks build output                              |
| Adding lib path alias for an app                               | Apps are not imported by other projects               |

## Related Skills

- [Standards](../../standards/SKILL.md) — Coding standards and config conventions
