---
name: fix-types
description: 'Diagnose and fix TypeScript type errors in the Nx monorepo. Use when make typecheck reports errors (module-not-found, type mismatches, missing declarations, generated type issues) or CI fails on the typecheck step.'
---

# Skill: Fix TypeScript Errors

## Overview

Diagnose and fix TypeScript type errors in the Nx monorepo. This skill covers the most common error patterns and their specific solutions.

## When to Use

- `pnpm exec nx affected -t typecheck` reports errors
- CI fails on typecheck step
- Importing a changed/new library results in type mismatches

## Step 1: Run Type Check

```powershell
pnpm exec nx affected -t typecheck
```

If errors reference a specific project, check that project's dependencies are built:

```powershell
pnpm run build:libs
```

---

## Common Errors & Fixes

### ❌ Cannot find module `@legacy-sports/...`

**Cause**: Library dependencies not built yet.

```powershell
pnpm run build:libs
```

> Libraries in `lib/` have no build targets — they are compiled by consuming apps. If a new library was added, running `build:libs` ensures downstream type resolution works.

---

### ❌ Type `X` is not assignable to type `Y`

**Cause**: Missing or incorrect interface; `any` used as a shortcut.

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

**Rule**: Never use `any` — create a specific interface.

---

### ❌ Property `X` does not exist on type `Y`

**Cause**: Optional property not handled, or interface out of date.

```typescript
// ✅ Use optional chaining
const value = object?.property?.nestedProperty;

// ✅ Or guard explicitly
if (object.property) {
  const value = object.property.nested;
}
```

---

### ❌ Parameter implicitly has `any` type

**Cause**: Missing type annotation on function parameter.

```typescript
// ❌ Bad
function process(data) {}

// ✅ Good
interface InputData {
  id: number;
  name: string;
}
function process(data: InputData) {}
```

---

### ❌ Type definitions don't match schema (generated types)

**Cause**: GraphQL schema or API changed; generated types are stale.

```powershell
pnpm exec nx run <project>:codegen
```

Common projects needing codegen: `shared-components`, `api`, `db`

See: [codegen.md](../codegen/SKILL.md)

---

### ❌ Circular dependency detected

**Cause**: Two or more files import each other.

```powershell
# Visualize dependency graph
pnpm exec nx graph
```

**Fix**:

1. Identify the cycle in the graph
2. Extract shared types to a separate file
3. Restructure imports to be unidirectional

---

## Type Safety Standards

- **Never use `any`** without a documented justification comment
- **Create specific interfaces** for all data structures
- **Union types** for known values: `type Status = 'loading' | 'success' | 'error'`
- **Optional chaining** for nullable properties: `object?.property`
- **Build libraries first** before checking types: `pnpm run build:libs`

## Next Step

After fixing type errors, continue to linting:

```powershell
pnpm exec nx affected -t lint --fix
```

## Related Skills

- [typecheck.md](../typecheck/SKILL.md) — running the type checker
- [fix-lint.md](../fix-lint/SKILL.md) — fixing lint errors
- [codegen.md](../codegen/SKILL.md) — regenerating GraphQL types
