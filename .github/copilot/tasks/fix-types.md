# Task: Fix TypeScript Errors

## Run Type Check

```powershell
pnpm exec nx affected -t typecheck
```

## Common Type Errors & Fixes

### 1. Module Not Found

```
Cannot find module '@legacy-sports/...'
```

**Fix**: Build dependencies first

```powershell
pnpm run build:libs
```

### 2. Type Mismatch

```
Type 'X' is not assignable to type 'Y'
```

**Fix**: Create proper interfaces (never use `any`)

```typescript
// ❌ Bad
const data: any = response;

// ✅ Good
interface ApiResponse {
  users: User[];
  pagination: PaginationInfo;
}
const data: ApiResponse = response;
```

### 3. Missing Properties

```
Property 'X' does not exist on type 'Y'
```

**Fix**: Update interface or check for optional properties

```typescript
// Use optional chaining
const value = object?.property?.nestedProperty;
```

### 4. Generated Types Out of Sync

```
Type definitions don't match schema
```

**Fix**: Regenerate types

```powershell
pnpm exec nx run <project>:codegen
```

## Type Safety Standards

- **Never use `any`** without documented justification
- **Create specific interfaces** for data structures
- **Use union types** for known values: `type Status = 'loading' | 'success' | 'error'`
- **Optional chaining** for nullable properties: `object?.property`

## After Fixing

Continue to linting:

```powershell
pnpm exec nx affected -t lint --fix
```

See: `fix-lint.md` for next step.
