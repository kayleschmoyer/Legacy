# Task: Fix Linting Errors

## Run Linter

```powershell
pnpm exec nx affected -t lint --fix
```

The `--fix` flag auto-fixes most issues. Manual fixes only needed for complex cases.

## Auto-Fixable Issues

- Import ordering
- Unused imports
- Spacing and formatting
- Quote style
- Semicolons

## Manual Fixes Required

### 1. Floating Promises

```typescript
// ❌ Bad
someAsyncFunction();

// ✅ Good
void someAsyncFunction();
// or
await someAsyncFunction();
```

### 2. Unused Variables

```typescript
// ❌ Bad
const unused = fetchData();

// ✅ Good - Remove it or use it
const data = fetchData();
console.log(data);
```

### 3. Any Types

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

### 4. Console Statements

```typescript
// ❌ Bad (in production code)
console.log('debug info');

// ✅ Good
import { LOGGER } from '@legacy-sports/logging';
LOGGER.info('debug info');
```

## ESLint Disable Rules

**Only use when absolutely necessary** with clear justification:

```typescript
// ✅ Good - Documented reason
// Platform compatibility requires any type here
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).StyleSheet = StyleSheet;

// ❌ Bad - No justification
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = response;
```

## After Fixing

Continue to testing:

```powershell
pnpm exec nx affected -t test
```

See: `create-pr.md` for completing workflow.
