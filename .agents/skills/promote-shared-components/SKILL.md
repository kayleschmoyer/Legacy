---
name: promote-shared-components
description: 'Promoting components from apps/web (or apps/app) to lib/shared-components. Load when: moving UI code to shared-components, refactoring for cross-platform reuse, or fixing CI failures on promotion PRs.'
---

# Skill: Promote to shared-components

Guide for moving components from `apps/web` or `apps/app` into `lib/shared-components` so they can be consumed by both platforms.

## Critical Rules

1. **Stricter lint rules** — `lib/shared-components` has stricter ESLint than `apps/web`. Rules that are `"off"` in apps/web are `"error"` in shared-components:
   - `@typescript-eslint/no-unsafe-assignment`
   - `@typescript-eslint/no-unsafe-call`
   - `@typescript-eslint/no-unsafe-member-access`

2. **Run `make pc` after every promotion** — this is the single most common failure point. `nx affected` must detect the promoted files in their _new_ project (`shared-components`), not just the old one. Always run full validation before pushing.

3. **Update all consuming tests** — when a promoted component gains new dependencies (e.g., `useAuth`, a new context provider), every test that renders it must mock or provide those dependencies.

## Tamagui `styled()` Convention

Tamagui's `styled()` function returns loosely typed values that trigger `no-unsafe-assignment` and `no-unsafe-call`. This is a known upstream typing gap — it cannot be fixed in this project.

**Approved pattern** (used across shared-components):

```typescript
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- Tamagui styled() returns loosely typed
const MyComponent = styled(YStack, {
  // ...
});
```

**Existing precedent** — these files already use this pattern:

- `lib/shared-components/src/IconButton.tsx`
- `lib/shared-components/src/components/PanelCard.tsx`
- `lib/shared-components/src/components/HolographicCard/HolographicCard.tsx`

> This is the one approved exception to the "no lint suppression" rule for shared-components. The comment must include the `-- Tamagui styled() returns loosely typed` description.

## Promotion Checklist

### Step 1: Move the file

- Move the component from `apps/web/src/` to the appropriate feature directory under `lib/shared-components/src/features/<feature>/`.
- Update all import paths in the moved file to use shared-components-relative paths.
- If the component uses platform-specific code, create `.native.ts` / `.web.ts` splits or use `__PLATFORM_COMPONENTS__`.

### Step 2: Create the web wrapper

- Leave a thin wrapper in `apps/web/` that imports from `@legacy-sports/shared-components` and provides web-specific concerns (react-router-dom navigation, environment config, etc.).
- Export the component from `lib/shared-components/src/index.ts`.

### Step 3: Move GraphQL operations

- Move any `.graphql` files to `lib/shared-components/src/api/db/`.
- Run `make codegen` to regenerate typed hooks in the new location.
- Update the component to import from the new `graphql.generated.ts`.

### Step 4: Handle lint differences

- Add `eslint-disable-next-line` comments for all `styled()` calls (see convention above).
- Fix any other `no-unsafe-*` errors by adding proper type annotations or assertions.
- Run `pnpm exec nx run shared-components:lint` to verify.

### Step 5: Update tests

- If the promoted component now calls hooks that require providers (e.g., `useAuth`, `useTheme`), update **all** test files that render the component.
- **Note:** `apps/web/src/test-setup.ts` already provides a global `useAuth` mock for all web tests — most tests inherit it automatically.
- If you need to override `useAuth` per test (for example, to simulate specific auth states), **copy the current `jest.mock('@legacy-sports/shared-components', ...)` block from `apps/web/src/app/app.spec.tsx`** so the mock stays in sync with the real `UseAuthResult` type and lint rules.
- Run affected tests: `pnpm exec nx run web:test --testPathPattern="ComponentName"`.

### Step 6: Validate

Run the full pre-commit check:

```bash
make pc
```

This must pass before pushing. It catches:

- Lint errors from stricter shared-components rules
- Type errors from changed import paths
- Test failures from missing mocks/providers
- Build errors from missing exports

### Step 7: Verify exports

Ensure the promoted component is exported from `lib/shared-components/src/index.ts`. If it uses sub-path exports, update `lib/shared-components/package.json` exports map.

## Common Failures and Fixes

| Failure                                                 | Cause                                            | Fix                                                 |
| ------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| `no-unsafe-assignment` on `styled()`                    | Tamagui typing gap                               | Add eslint-disable comment (see convention)         |
| `no-unsafe-call` on `styled()`                          | Same                                             | Same eslint-disable comment                         |
| `useAuth must be used within AuthProvider`              | Component calls `useAuth()` but test has no mock | Add `jest.mock` for useAuth (see Step 5)            |
| `Cannot find module '@legacy-sports/shared-components'` | Missing export                                   | Add to `index.ts` barrel export                     |
| `no-unsafe-member-access` on GraphQL data               | Untyped query result                             | Use generated typed hooks from `.graphql` + codegen |
