# Lint Discipline

## Overview

This project enforces strict lint discipline. ESLint disable comments (`eslint-disable`, `eslint-disable-next-line`) and TypeScript suppression directives (`@ts-ignore`, `@ts-expect-error`) are **banned by default**. The `@eslint-community/eslint-plugin-eslint-comments` plugin enforces this at build time.

## Rules

### 1. Never add `eslint-disable` or `@ts-ignore` as a first resort

Always fix the root cause. Common fixes:

| Lint error                                | Fix                                                           |
| ----------------------------------------- | ------------------------------------------------------------- |
| `@typescript-eslint/no-unused-vars`       | Prefix with `_` (e.g., `_context`) or remove                  |
| `@typescript-eslint/no-explicit-any`      | Add a proper type annotation                                  |
| `@typescript-eslint/no-unsafe-*`          | Add type assertions or generic parameters                     |
| `@typescript-eslint/no-floating-promises` | Add `await`, `void`, or `.catch()`                            |
| `no-console`                              | Use `LOGGER` from `@legacy-sports/logging`                    |
| `react-hooks/exhaustive-deps`             | Add the missing dep or restructure the hook                   |
| `import/order`                            | Let auto-fix handle it: `pnpm exec nx affected -t lint --fix` |

### 2. Blanket file-level disables are forbidden

Never use `/* eslint-disable */` without specifying which rule(s). The `no-unlimited-disable` ESLint rule enforces this as an error.

```typescript
// FORBIDDEN -- blanket disable
/* eslint-disable */

// If truly necessary, specify rules AND add a description
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Apollo MockedResponse lacks generic inference */
```

### 3. Every disable MUST have a `--` description

The `require-description` ESLint rule requires a justification comment on every disable. Descriptions must explain **why** the disable is needed, not repeat the rule name.

```typescript
// No description
// eslint-disable-next-line @typescript-eslint/no-explicit-any

// Repeats the rule name
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- no-explicit-any

// Explains the reason
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle or() typing limitation with variadic args
```

### 4. Prefer line-level over file-level disables

Target only the specific line that needs suppression:

```typescript
// Minimal scope
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- third-party SDK returns untyped response
const result = sdk.call();

// File-level suppress affects entire file -- avoid
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
```

### 5. Never use `@ts-ignore`

Use `@ts-expect-error` instead (it fails when the error is fixed, preventing stale suppressions). But even `@ts-expect-error` should only be used after exhausting type-level fixes.

## Approved Exceptions

These patterns have legitimate reasons for inline disables:

| Pattern                                                 | Reason                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PgDatabase<any>` in migration files                    | Drizzle migration runner types; covered by ESLint config override in `lib/db-client/.eslintrc.json` -- **no inline disable needed for new migrations** (existing ones retain legacy disables due to migration immutability)                                                                              |
| `codegen.ts` files with `@nx/enforce-module-boundaries` | Codegen config must import shared base cross-boundary                                                                                                                                                                                                                                                    |
| `require()` in Node.js polyfill shims                   | Dynamic CJS imports in environments that need them                                                                                                                                                                                                                                                       |
| `react-hooks/exhaustive-deps` with stable refs          | When the dependency is intentionally omitted (e.g., WebSocket connection ref)                                                                                                                                                                                                                            |
| Test files mocking with `jest.fn()`                     | Mock return types sometimes can't be fully typed                                                                                                                                                                                                                                                         |
| `content: '/* eslint-disable */'` in codegen configs    | This is a string that gets injected into _generated_ files, not an actual suppress                                                                                                                                                                                                                       |
| Tamagui `styled()` in `lib/shared-components`           | `styled()` returns loosely typed values -- upstream typing gap. Use: `// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- Tamagui styled() returns loosely typed`. See [promote-shared-components skill](../../promote-shared-components/SKILL.md) |

## ESLint Config Reference

The root `.eslintrc.json` includes:

```json
{
  "plugins": ["@eslint-community/eslint-comments"],
  "rules": {
    "@eslint-community/eslint-comments/no-unlimited-disable": "error",
    "@eslint-community/eslint-comments/require-description": [
      "warn",
      { "ignore": [] }
    ]
  }
}
```

Additionally, `"reportUnusedDisableDirectives": true` is set at the root level. This means any `eslint-disable` comment that suppresses a rule that wouldn't have fired anyway will be flagged as an error.

## Before Adding a Disable

1. **Try auto-fix first**: `pnpm exec nx affected -t lint --fix`
2. **Try a type-level fix**: Add narrowing, generics, or assertions
3. **Check if an ESLint config override exists**: Many projects already turn off rules for specific file patterns (e.g., `migrations/**`, `*.spec.ts`)
4. **If you must disable**: Use `eslint-disable-next-line` (not file-level), specify the exact rule, and add a `-- description`

## Troubleshooting

### "Unexpected eslint-disable directive" after removing code

Run lint with `--fix` to auto-remove stale disable comments:

```powershell
pnpm exec nx affected -t lint --fix
```

### Migration files don't need inline disables

The `lib/db-client/.eslintrc.json` already turns off `no-explicit-any`, `no-unsafe-assignment`, and `no-unsafe-member-access` for `migrations/**/*.ts`. Don't add inline disables in migration files.
