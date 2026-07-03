# Create a New Lambda

## Overview

Create a new AWS Lambda function under `lambdas/` with standardized configuration. Lambdas are `projectType: "application"` — they have `build`, `deploy`, and `serve` targets in addition to `typecheck`, `lint`, and `test`.

## When to Use

- Adding a new serverless API endpoint or background processor
- Creating a new Lambda for an AWS event source (SQS, EventBridge, API Gateway, etc.)

## Prerequisites

- Jira ticket assigned and branch created (`twig switch LS-#### -p=main`)
- Know the Lambda's purpose and AWS trigger type

## Steps

### 1. Create the directory structure

Replace `<name>` with the kebab-case lambda name (e.g. `player-sync`).

```
lambdas/<name>/
├── src/
│   ├── index.ts          # Lambda handler entry point
│   ├── index.spec.ts     # Unit tests (required — the test target fails with zero tests)
│   ├── dev.ts            # Local development server (optional)
│   └── setup-tests.ts    # Jest setup (if env vars needed)
├── .eslintrc.json
├── jest.config.ts
├── package.json
├── project.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.spec.json
└── vite.config.ts        # Build config for bundling
```

### 2. Create each file

#### `project.json`

```json
{
  "name": "<name>",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "lambdas/<name>/src",
  "projectType": "application",
  "tags": ["lambda", "platform:node", "scope:lambda", "type:api"],
  "targets": {
    "test": {
      "executor": "@nx/jest:jest",
      "outputs": ["{workspaceRoot}/coverage/{projectRoot}"],
      "cache": true,
      "options": {
        "jestConfig": "lambdas/<name>/jest.config.ts",
        "passWithNoTests": false
      }
    },
    "build": {
      "extends": "build:lambda",
      "options": {
        "command": "vite build",
        "cwd": "lambdas/<name>"
      },
      "configurations": {
        "development": { "command": "vite build --mode development" },
        "production": { "command": "vite build --mode production" }
      }
    },
    "package": {
      "executor": "nx:run-commands",
      "dependsOn": ["build"],
      "options": {
        "command": "echo 'Use nx deploy <name> instead.'",
        "cwd": "lambdas/<name>"
      }
    },
    "deploy": {
      "executor": "nx:run-commands",
      "dependsOn": ["build"],
      "options": {
        "command": "../../scripts/deploy-lambda.ps1 -FunctionName <name>",
        "cwd": "lambdas/<name>"
      }
    },
    "serve": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsx src/dev.ts",
        "cwd": "lambdas/<name>"
      }
    },
    "logs": {
      "executor": "nx:run-commands",
      "options": {
        "commands": [
          "aws logs tail /aws/lambda/legacy-sports-dev-<name> --follow --region us-east-1"
        ],
        "parallel": false,
        "cwd": "."
      }
    }
  }
}
```

> The explicit `test` target with `"passWithNoTests": false` is mandatory. A package.json `"test": "jest --onlyChanged"` script with no `project.json` test target becomes the merged Nx target, runs **zero tests** on CI's clean tree, and passes via `nx.json`'s `passWithNoTests: true` — the suite never gates merge (LS-8247). See [testing → What Gates Merge](../../testing/SKILL.md#what-gates-merge).
>
> The `deploy` target uses the house deploy script (`scripts/deploy-lambda.ps1`, the majority pattern — `stats-lambda`/`db` use the `deploy-lambda.sh` variant). Full deployment sequence and prerequisites: [Deploy Lambda](../../infrastructure/references/deploy-lambda.md). Terraform resource names use the snake_case version of `<name>` (e.g. `player_sync`) — see Step 5.

**Note**: `typecheck` is NOT listed in targets — the `nx.json` target default applies automatically and defaults to `tsc --noEmit -p tsconfig.lib.json`. Since lambdas use `tsconfig.app.json`, you must add a typecheck override:

```json
"typecheck": {
  "options": {
    "command": "tsc --noEmit -p tsconfig.app.json"
  }
}
```

Or rely on the existing `build:lambda` extends pattern if the default `tsconfig.lib.json` path doesn't exist.

#### `package.json`

```json
{
  "name": "@legacy-sports/<name>-lambda",
  "version": "0.0.1",
  "main": "dist/index.js",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/dev.ts",
    "dev:no-watch": "tsx src/dev.ts",
    "build": "vite build",
    "test:watch": "jest --watch --onlyChanged",
    "test:all-files": "jest"
  },
  "dependencies": {
    "@legacy-sports/db-client": "workspace:*",
    "@legacy-sports/env-utilities": "workspace:*",
    "@legacy-sports/logging": "workspace:*",
    "@legacy-sports/sentry": "workspace:*",
    "aws-lambda": "*"
  },
  "devDependencies": {
    "@types/aws-lambda": "*",
    "@types/node": "*",
    "jest": "*",
    "tsx": "*",
    "typescript": "*",
    "vite": "*"
  }
}
```

> Trim dependencies to only what the lambda actually needs.

#### `tsconfig.json`

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

#### `tsconfig.app.json`

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/out-tsc",
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

> Always include `"dist"` in ignorePatterns for lambdas (they have build output).

#### `jest.config.ts`

```typescript
const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: '<name>',
  projectPath: 'lambdas/<name>',
});
```

If the lambda needs environment variables during tests, add a `setupFiles` override:

```typescript
const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: '<name>',
  projectPath: 'lambdas/<name>',
  overrides: {
    setupFiles: ['<rootDir>/src/setup-tests.ts'],
  },
});
```

#### `src/index.ts` (handler entry)

```typescript
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'OK' }),
  };
};
```

#### `src/index.spec.ts` (starter test)

The `test` target has `"passWithNoTests": false`, so `nx run <name>:test` **fails until the first spec exists**. Ship at least this starter and grow it with the handler:

```typescript
import { handler } from './index';

describe('<name> handler', () => {
  it('returns 200', async () => {
    const result = await handler({} as never);
    expect(result.statusCode).toBe(200);
  });
});
```

#### `vite.config.ts`

Copy from an existing lambda (e.g. `lambdas/game-selection/vite.config.ts`) and adjust the entry point.

### 3. (No path alias needed)

Lambdas are **not** imported by other projects, so they do NOT need a `tsconfig.base.json` path alias.

### 4. Validate

```powershell
pnpm install
pnpm exec nx run <name>:typecheck
pnpm exec nx run <name>:lint
pnpm exec nx run <name>:test
pnpm exec nx run <name>:build
```

### 5. Add Terraform resource

Define the Lambda's AWS infrastructure in `terraform/`. See [terraform](../../terraform/SKILL.md) and [Deploy Lambda](../../infrastructure/references/deploy-lambda.md) for guidance.

## Differences from Library

| Aspect                      | Library (`lib/`)    | Lambda (`lambdas/`)                                                                                 |
| --------------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| `projectType`               | `"library"`         | `"application"`                                                                                     |
| tsconfig reference          | `tsconfig.lib.json` | `tsconfig.app.json`                                                                                 |
| Has `build` target          | No                  | Yes (`build:lambda` extends)                                                                        |
| Has `deploy` target         | No                  | Yes                                                                                                 |
| ESLint ignorePatterns       | No `dist`           | Includes `dist`                                                                                     |
| package.json `main`         | `./src/index.ts`    | `dist/index.js`                                                                                     |
| package.json `scripts`      | None                | `dev`, `build`, `test:watch`, `test:all-files` (no bare `test` — the `project.json` target owns it) |
| Path alias in tsconfig.base | Required            | Not needed                                                                                          |

## Common Mistakes

| Mistake                                                                        | Why it fails                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing `vite.config.ts`                                                       | `build` target fails                                                                                                                                                                                                                                                                                                                                                    |
| Using `tsconfig.lib.json` in typecheck command                                 | Lambda uses `tsconfig.app.json`                                                                                                                                                                                                                                                                                                                                         |
| Forgetting `"dist"` in eslintrc ignorePatterns                                 | Lint tries to check build output                                                                                                                                                                                                                                                                                                                                        |
| Not running `pnpm install` after adding package.json                           | Missing workspace link                                                                                                                                                                                                                                                                                                                                                  |
| Adding `"type": "module"` to package.json                                      | Breaks `require()` in jest config                                                                                                                                                                                                                                                                                                                                       |
| package.json `"test": "jest --onlyChanged"` with no `project.json` test target | The package.json script becomes the merged Nx target; on CI's clean tree `--onlyChanged` runs **zero tests** and passes via `passWithNoTests: true` — the unit suite never gates merge (LS-8247). Use the explicit `@nx/jest:jest` target with `"passWithNoTests": false` from the template. See [testing → What Gates Merge](../../testing/SKILL.md#what-gates-merge). |
| Fire-and-forget notification calls (no `await`)                                | Lambda freezes execution context after returning; unawaited `postToConnection` calls are silently killed, causing intermittent notification loss. See [WebSocket Notifications](../../../../docs/guides/websocket-notifications.md#critical-rules).                                                                                                                     |

## Related Skills

- [Deploy Lambda](../../infrastructure/references/deploy-lambda.md) — Deploy to AWS
- [Standards](../../standards/SKILL.md) — Coding standards and config conventions
