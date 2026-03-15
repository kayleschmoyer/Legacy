---
applyTo: '**/*.ts,**/*.tsx'
---

# No Lint Disable

**Never add `eslint-disable`, `eslint-disable-next-line`, `@ts-ignore`, or `@ts-expect-error` comments without exhausting all alternatives first.**

## Rules

1. **Fix the root cause** — don't suppress lint errors. Common fixes:
   - `no-unused-vars` → prefix with `_` or remove
   - `no-explicit-any` → add a proper type annotation
   - `no-floating-promises` → add `await`, `void`, or `.catch()`
   - `no-console` → use `LOGGER` from `@legacy-sports/logging`
   - `react-hooks/exhaustive-deps` → add the missing dep or restructure the hook
   - `import/order` → let auto-fix handle it: `make lint-fix`

2. **Blanket file-level disables are forbidden** — never use `/* eslint-disable */` without specifying which rule(s).

3. **Every disable MUST have a `--` description** explaining **why** (not repeating the rule name):

   ```ts
   // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle or() typing limitation with variadic args
   ```

4. **Prefer line-level over file-level disables** — target only the specific line.

5. **Never use `@ts-ignore`** — use `@ts-expect-error` instead (it fails when the error is fixed).

## Approved Exceptions

- `PgDatabase<any>` in migration files (covered by ESLint config override)
- `codegen.ts` files with `@nx/enforce-module-boundaries` (cross-boundary import)
- `require()` in Node.js polyfill shims
- `content: '/* eslint-disable */'` in codegen configs (string injected into generated files, not an actual suppress)
