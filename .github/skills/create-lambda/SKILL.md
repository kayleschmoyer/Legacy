---
name: create-lambda
description: 'Create a new AWS Lambda function under lambdas/ with standardized Nx configuration including build, deploy, serve, typecheck, lint, and test targets.'
---

# Skill: Create a New Lambda

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
      "dependsOn": ["package"],
      "options": {
        "commands": [
          "cd terraform",
          "terraform apply -target=aws_lambda_function.<name_underscore> -auto-approve",
          "terraform apply -target=aws_api_gateway_deployment.main -auto-approve"
        ],
        "parallel": false,
        "cwd": "."
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

> Replace `<name_underscore>` with the snake_case version for Terraform resource names (e.g. `player_sync`).

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
    "test": "jest --onlyChanged",
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

Define the Lambda's AWS infrastructure in `terraform/`. See [Terraform Apply](terraform-apply.md) and [Deploy Lambda](deploy-lambda.md) for guidance.

## Differences from Library

| Aspect                      | Library (`lib/`)    | Lambda (`lambdas/`)          |
| --------------------------- | ------------------- | ---------------------------- |
| `projectType`               | `"library"`         | `"application"`              |
| tsconfig reference          | `tsconfig.lib.json` | `tsconfig.app.json`          |
| Has `build` target          | No                  | Yes (`build:lambda` extends) |
| Has `deploy` target         | No                  | Yes                          |
| ESLint ignorePatterns       | No `dist`           | Includes `dist`              |
| package.json `main`         | `./src/index.ts`    | `dist/index.js`              |
| package.json `scripts`      | None                | `dev`, `build`, `test`       |
| Path alias in tsconfig.base | Required            | Not needed                   |

## Common Mistakes

| Mistake                                              | Why it fails                      |
| ---------------------------------------------------- | --------------------------------- |
| Missing `vite.config.ts`                             | `build` target fails              |
| Using `tsconfig.lib.json` in typecheck command       | Lambda uses `tsconfig.app.json`   |
| Forgetting `"dist"` in eslintrc ignorePatterns       | Lint tries to check build output  |
| Not running `pnpm install` after adding package.json | Missing workspace link            |
| Adding `"type": "module"` to package.json            | Breaks `require()` in jest config |

## Related Skills

- [Deploy Lambda](deploy-lambda.md) — Deploy to AWS
- [Create Lib](create-lib.md) — Create a shared library instead
- [Config Standards](config-standards.md) — Full config reference
