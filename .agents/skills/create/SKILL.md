---
name: create
description: 'Create a new project in the monorepo: shared library (lib/), AWS Lambda (lambdas/), application (apps/), MCP server (tools/mcp/), or agent skill (.agents/skills/). Load before scaffolding any new project or skill.'
---

# Skill: Create a New Project

## Overview

Scaffold a new project in the monorepo with standardized configuration. Pick the type that matches your use case, then follow the detailed reference.

## Type Selector

| Type               | Directory                | When to use                                                     | Reference                                                          |
| ------------------ | ------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Shared library** | `lib/<name>/`            | Reusable code consumed by apps and lambdas at build time        | [references/create-lib.md](references/create-lib.md)               |
| **AWS Lambda**     | `lambdas/<name>/`        | Serverless API endpoint, background processor, or event handler | [references/create-lambda.md](references/create-lambda.md)         |
| **Application**    | `apps/<name>/`           | CLI tool, Next.js web app, or React Native mobile app           | [references/create-app.md](references/create-app.md)               |
| **MCP server**     | `tools/mcp/<name>/`      | AI agent tooling via Model Context Protocol                     | [references/create-mcp-server.md](references/create-mcp-server.md) |
| **Agent skill**    | `.agents/skills/<name>/` | AI agent skill following agentskills.io format                  | [references/create-skill.md](references/create-skill.md)           |

## Shared Checklist (all project types)

1. **`project.json`** — register with Nx. Include `$schema`, `sourceRoot`, `projectType`, and `tags`. Libraries need `"typecheck": {}`; apps/lambdas override the typecheck command to use `tsconfig.app.json`.
2. **`tsconfig.json`** — extend `../../tsconfig.base.json` (or `../../../tsconfig.base.json` for MCP servers). Use project references to split lib/app and spec configs.
3. **`.eslintrc.json`** — extend root config. Always add `jest.config.ts` to `ignorePatterns`. Add `dist` for apps/lambdas.
4. **`jest.config.ts`** — use `createNodeJestConfig` from `../../jest.helpers.ts`.
5. **`package.json`** — `@legacy-sports/<name>`, `"private": true`. Libraries point `main`/`types` at `./src/index.ts`; lambdas point `main` at `dist/index.js`.
6. **Path alias** (libraries only) — add `@legacy-sports/<name>` to `tsconfig.base.json` paths (alphabetical order).
7. **Validate** — all of these must pass before committing:
   ```
   pnpm exec nx run <name>:typecheck
   pnpm exec nx run <name>:lint
   pnpm exec nx run <name>:test
   ```
   Lambdas also need: `pnpm exec nx run <name>:build`

## Key Differences by Type

| Aspect                | Library             | Lambda              | App                 | MCP Server                                    |
| --------------------- | ------------------- | ------------------- | ------------------- | --------------------------------------------- |
| `projectType`         | `library`           | `application`       | `application`       | `application` (Pattern B) or none (Pattern A) |
| tsconfig reference    | `tsconfig.lib.json` | `tsconfig.app.json` | `tsconfig.app.json` | `tsconfig.lib.json`                           |
| Has `build` target    | No                  | Yes                 | Depends             | No                                            |
| Path alias needed     | Yes                 | No                  | No                  | No                                            |
| ESLint ignores `dist` | No                  | Yes                 | Yes                 | Yes                                           |

## Common Mistakes

| Mistake                                                | Impact                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| Missing `"typecheck": {}` in library project.json      | `nx affected -t typecheck` silently skips the project       |
| Using default typecheck for apps/lambdas               | They use `tsconfig.app.json`, not `tsconfig.lib.json`       |
| Adding `"type": "module"` to package.json              | Breaks `require()` in jest configs; only `lib/api` uses ESM |
| Forgetting `jest.config.ts` in eslintrc ignorePatterns | Lint errors on the config file itself                       |
| Not running `pnpm install` after adding package.json   | Missing workspace link                                      |

## Related Skills

- [Standards](../standards/SKILL.md) — Coding standards and config conventions
- [Typecheck](../typecheck/SKILL.md) — Validate types
- [Lint](../lint/SKILL.md) — Run ESLint
- [Test](../test/SKILL.md) — Run Jest tests
