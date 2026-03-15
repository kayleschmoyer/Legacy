---
name: fix-lint
description: 'Diagnose and fix ESLint errors that remain after auto-fix, including floating promises, unsafe any types, console statements, and import order issues.'
---

# Skill: Fix Linting Errors# Skill: Fix Linting Errors

- [fix-types.md](fix-types.md) — fixing TypeScript errors- [lint.md](lint.md) — running the linter## Related Skills`pnpm exec nx affected -t test`powershellAfter fixing lint errors, continue to testing:## Next Step---**Never use file-level disables** — target only the specific line.`const data: any = response;// eslint-disable-next-line @typescript-eslint/no-explicit-any// ❌ Bad — no justification(window as any).StyleSheet = StyleSheet;// eslint-disable-next-line @typescript-eslint/no-explicit-any// Platform compatibility requires any type here// ✅ Good — documented reason`typescriptOnly disable a rule when **absolutely necessary**, and always include a justification comment:## Using `eslint-disable` (Last Resort)---`const value = 123;// ✅ Goodlet value = 123;// ❌ Bad`typescript**Cause**: Variable declared with `let` but never reassigned.### ❌ `prefer-const`---`LOGGER.error('error occurred', { error });LOGGER.info('debug info', { data });import { LOGGER } from '@legacy-sports/logging';// ✅ Goodconsole.error('error occurred', error);console.log('debug info', data);// ❌ Bad`typescript**Cause**: `console.log` used in production code.### ❌ `no-console`---`function process(data: DataType) {}}  name: string;  id: number;interface DataType {// ✅ Goodfunction process(data: any) {}// ❌ Bad`typescript**Cause**: `any` type reduces type safety.### ❌ `@typescript-eslint/no-explicit-any`---`const _unused = fetchData();// ✅ Prefix with _ if intentionally unusedprocessData(data);const data = fetchData();// ✅ Use it or remove itconst unused = fetchData();// ❌ Bad`typescript**Cause**: Variable declared but never used.### ❌ `@typescript-eslint/no-unused-vars`---`someAsyncFunction().catch(err => LOGGER.error(err));// ✅ Handledawait someAsyncFunction();// ✅ Awaitedvoid someAsyncFunction();// ✅ Explicitly voidsomeAsyncFunction();// ❌ Bad`typescript**Cause**: Async function called without `await` or `void`.### ❌ `@typescript-eslint/no-floating-promises`## Manual Fixes Required---- Unused imports- Trailing commas- Semicolons- Quote style- Spacing and formatting- Import orderingThe `--fix` flag handles ~80% of issues automatically:`pnpm exec nx affected -t lint --fix`powershell## Step 1: Run Auto-Fix- Writing new code that needs to follow project ESLint rules- CI fails on lint step- `pnpm exec nx affected -t lint` reports errors## When to UseDiagnose and fix ESLint errors in the Nx monorepo. Most issues are auto-fixable; this skill covers the common manual fixes required after auto-fix runs.## Overview

## Overview

Diagnose and fix ESLint errors in the Nx monorepo. Most issues are auto-fixed; this skill covers the patterns that require manual intervention.

## When to Use

- `pnpm exec nx affected -t lint` reports errors after `--fix`
- CI fails on the lint step
- Adding new code patterns that trigger ESLint rules

## Step 1: Run Auto-Fix

```powershell
pnpm exec nx affected -t lint --fix
```

The `--fix` flag resolves ~80% of issues automatically:

- Import ordering
- Spacing and formatting
- Quote style
- Semicolons
- Trailing commas
- Unused imports

---

## Manual Fixes Required

### ❌ `@typescript-eslint/no-floating-promises`

**Cause**: Async function called without `await` or `void` — unhandled promise.

```typescript
// ❌ Bad
someAsyncFunction();

// ✅ Good — explicitly void
void someAsyncFunction();

// ✅ Good — awaited
await someAsyncFunction();

// ✅ Good — handled
someAsyncFunction().catch((err) => LOGGER.error(err));
```

---

### ❌ `@typescript-eslint/no-unused-vars`

**Cause**: Variable declared but never used.

```typescript
// ❌ Bad
const unused = fetchData();

// ✅ Good — use it
const data = fetchData();
processData(data);

// ✅ Good — prefix with underscore if intentionally unused
const _unused = fetchData();
```

---

### ❌ `@typescript-eslint/no-explicit-any`

**Cause**: `any` type used, reducing type safety.

```typescript
// ❌ Bad
function process(data: any) {}

// ✅ Good
interface DataType {
  id: number;
  name: string;
}
function process(data: DataType) {}
```

---

### ❌ `no-console`

**Cause**: `console.log` / `console.error` used instead of structured logging.

```typescript
// ❌ Bad
console.log('debug info', data);
console.error('error occurred', error);

// ✅ Good
import { LOGGER } from '@legacy-sports/logging';
LOGGER.info('debug info', { data });
LOGGER.error('error occurred', error);
```

> ⚠️ **Pass Error objects directly** — see the [LOGGER.error() Error Wrapping](#loggererror--error-objects-must-be-direct-arguments) section below.

---

### ❌ `prefer-const`

**Cause**: Variable declared with `let` but never reassigned.

```typescript
// ❌ Bad
let value = 123;

// ✅ Good
const value = 123;
```

---

<a id="loggererror--error-objects-must-be-direct-arguments"></a>

### ❌ `LOGGER.error()` — Error Objects Must Be Direct Arguments

**Cause**: Error wrapped in an object `{ error }` instead of passed directly. This is the **most common mistake** found in batch Copilot review sessions.

**Why it matters**: `RollbarOutputDestination` scans `LOGGER.error()` args for `arg instanceof Error` to extract stack traces. When the Error is nested inside a plain object wrapper like `{ error }`, `instanceof Error` returns false and Rollbar synthesizes a generic `new Error(message)` — **losing the original stack trace entirely**.

```typescript
// ❌ Bad — Rollbar can't find the Error instance (it's nested inside { error })
LOGGER.error('Failed to load player stats', { error });
LOGGER.error('Validation failed', { error, userId });

// ✅ Good — Error is a direct arg, Rollbar extracts the stack trace
LOGGER.error('Failed to load player stats', error);

// ✅ Good — Error as direct arg + separate context object
LOGGER.error('Validation failed', error, { userId });
```

**Reference**: See `lib/rollbar/src/lib/RollbarOutputDestination.ts` lines 33–34 for the `instanceof Error` scan.

---

## ESLint Disable Rules

**Only use when absolutely necessary**, always with a justification comment:

```typescript
// ✅ Good — documented reason
// Platform compatibility requires any type here
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).StyleSheet = StyleSheet;

// ❌ Bad — no justification
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = response;
```

## Next Step

After fixing lint errors, continue to testing:

```powershell
pnpm exec nx affected -t test
```

## Related Skills

- [lint.md](lint.md) — running the linter
- [fix-types.md](fix-types.md) — fixing TypeScript errors
