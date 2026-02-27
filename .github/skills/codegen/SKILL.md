---
name: codegen
description: 'Regenerate TypeScript types and client code from GraphQL schemas using graphql-codegen; use after modifying any GraphQL schema or resolver.'
---

# Skill: GraphQL Code Generation

## Overview

Regenerate TypeScript types and client code from GraphQL schemas using graphql-codegen.

## When to Use

- After modifying GraphQL schema files
- When GraphQL types are out of sync
- After pulling changes that include schema updates
- Getting "Cannot find type" errors for GraphQL types
- Before running builds to ensure type safety

> **🚨 CRITICAL: Always run `print-schema` before codegen when Pothos resolvers have changed.**
>
> `schema.graphql` is the single source of truth for codegen. It is a **generated file** —
> never edit it manually. When you add or change a resolver/type/mutation in
> `lambdas/db/src/schema/`, you MUST regenerate `schema.graphql` first:
>
> ```powershell
> pnpm exec nx run db:print-schema   # Step 1: regenerate schema.graphql
> pnpm exec nx affected -t codegen   # Step 2: generate TS types from updated schema
> ```
>
> `make pre-commit` runs both steps automatically (schema generation is step 1/8).

## Command

```powershell
# Run codegen for all affected projects
pnpm exec nx affected -t codegen
```

## Alternative Commands

### Codegen for All Projects

```powershell
# Run codegen for everything (slower)
pnpm run codegen
# or
pnpm exec nx run-many -t codegen
```

### Codegen for Specific Project

```powershell
# Run codegen for specific project
pnpm exec nx run <project-name>:codegen

# Examples:
pnpm exec nx run web:codegen
pnpm exec nx run app:codegen
# Note: db Lambda does not have a codegen target
```

### Check GraphQL Endpoint

```powershell
# Verify GraphQL server is running before codegen
# Web: Check if http://localhost:4000/graphql is accessible
# Or check environment variable
echo $env:GRAPHQL_SCHEMA
```

## Expected Output

- **Success**: Types generated in project src/generated folders
- **Console**: List of generated files
- **TypeScript**: Updated type definitions for queries/mutations

## Common Issues

### Issue: GraphQL server not running

**Symptom**: Connection refused or timeout errors
**Solution**: Start the GraphQL server first

```powershell
# Start DB Lambda (GraphQL server)
pnpm exec nx run db:serve
# Wait for it to start, then run codegen
```

### Issue: Wrong GraphQL endpoint

**Symptom**: 404 or endpoint not found errors
**Solution**: Set correct environment variable (`GRAPHQL_SCHEMA`). Can be a URL or a file path.

```powershell
# Point at a live local server
$env:GRAPHQL_SCHEMA = 'http://localhost:5000/graphql'

# Or point at the dev lambda
$env:GRAPHQL_SCHEMA = 'https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/graphql'

# Then run codegen (use --skip-nx-cache to force a fresh run)
pnpm exec nx affected -t codegen --skip-nx-cache
```

### Issue: Schema validation errors

**Symptom**: GraphQL schema errors or syntax issues
**Solution**: Fix schema files before running codegen

```powershell
# Check schema files in lambdas/db/src/schema/
# Fix syntax errors, then run codegen
```

### Issue: Codegen fails with module errors

**Symptom**: Cannot find modules or dependencies
**Solution**: Install dependencies first

```powershell
pnpm install
pnpm run build:libs  # Build dependencies
pnpm exec nx affected -t codegen
```

### Issue: Stale generated types

**Symptom**: Types exist but don't match schema
**Solution**: Clean and regenerate

```powershell
# Remove generated folders
Remove-Item -Recurse -Force "apps/web/src/generated"
Remove-Item -Recurse -Force "apps/app/src/generated"

# Regenerate
pnpm exec nx affected -t codegen
```

## Best Practices

1. **Start GraphQL server first** before running codegen
2. **Run after schema changes** to keep types in sync
3. **Include in pre-commit** validation for schema changes
4. **Run affected** instead of all projects for speed
5. **Commit generated files** (they are tracked in git)

## 🚨 CRITICAL: Never Use Inline `gql` Tags

**Always define GraphQL queries and mutations in `.graphql` files under `src/api/db/`**, never as inline `gql` tagged template literals in `.ts`/`.tsx` files.

### Why

Inline `gql` tags bypass codegen, which causes:

- **`any` types** — `useQuery(MY_QUERY)` and `useLazyQuery(MY_QUERY)` return `data: any` because Apollo has no type information
- **Runtime type guards** — developers add `typeof data === 'object'` and `'field' in data` checks to compensate, which are fragile and verbose
- **`as` casts** — `(data.field as SomeType)` hides real type mismatches
- **No schema validation** — inline queries are not checked against the schema at build time; typos and removed fields only fail at runtime

### What to Do Instead

```
# 1. Define the query in a .graphql file
apps/web/src/api/db/leagues/Chat.graphql

# 2. Run codegen
pnpm exec nx run web:codegen

# 3. Import the generated typed hook
import { useGetLeagueChatMessagesQuery } from '../api/db/graphql.generated';

# 4. Use it — data is fully typed, no casts needed
const { data, loading } = useGetLeagueChatMessagesQuery({ variables: { leagueId } });
const messages = data?.leagueChatMessages; // typed as Array<{ id: number | null, ... }> | undefined
```

### Enforcement

An ESLint rule (`no-restricted-imports` + `no-restricted-syntax`) in `apps/web/.eslintrc.json` prevents:

- Importing `gql` from `@apollo/client`
- Using `gql\`...\`` tagged template expressions

If a query references schema fields that don't exist yet (aspirational code), add a targeted `// eslint-disable-next-line` with a `// TODO: Migrate to codegen once <field> is added to the schema` comment.

## Integration with Workflow

### After Schema Changes

```powershell
# 1. Modify Pothos resolvers/types in lambdas/db/src/schema/

# 2. Regenerate schema.graphql from Pothos (REQUIRED before codegen)
pnpm exec nx run db:print-schema

# 3. Run codegen to generate TS types from the updated schema
# GRAPHQL_SCHEMA defaults to lambdas/db/schema.graphql — no need to set it after print-schema
pnpm exec nx affected -t codegen

# 4. Verify types are correct
pnpm exec nx affected -t typecheck

# 5. Commit schema + generated files together
git add lambdas/db/schema.graphql
git add **/graphql.generated.ts
git commit -m "feat(graphql): update schema and regenerate types"
```

> **Never skip step 2.** If you run codegen without `print-schema`, the generated
> types will be based on a stale `schema.graphql` and won't include your changes.
> Never manually edit `schema.graphql` — the `check-schema` CI job diffs the committed
> file against a freshly generated one and will fail if they don't match.

### Pre-commit with Schema Changes

```powershell
# If you modified schema files, include codegen in validation
pnpm exec nx affected -t codegen
pnpm exec nx affected -t typecheck
pnpm exec nx affected -t lint --fix
pnpm exec nx affected -t test
pnpm exec nx affected -t build
```

### Development Workflow

```powershell
# 1. Pull latest changes
git pull

# 2. If schemas changed, regenerate types
pnpm exec nx affected -t codegen

# 3. Continue development
pnpm run dev
```

## Generated File Locations

### Web Application

```
apps/web/src/generated/
├── graphql.ts          # Generated types
└── operations.ts       # Query/mutation hooks
```

### Mobile Application

```
apps/app/src/generated/
├── graphql.ts          # Generated types
└── operations.ts       # Query/mutation hooks
```

### Lambda Functions

```
lambdas/db/src/generated/
└── schema-types.ts     # Resolver types
```

## Configuration Files

GraphQL Codegen is configured in:

- `codegen.yml` or `codegen.ts` files in project roots
- `project.json` targets for each project
- Environment variables for endpoint configuration

## Performance Notes

- **Codegen time**: 5-15 seconds per project
- **Affected only**: Much faster than running all
- **Caching**: Nx caches unchanged results
- **Parallel**: Multiple projects can run simultaneously

## Troubleshooting Checklist

- [ ] GraphQL server is running (check terminal)
- [ ] Correct endpoint configured ($env:VITE_GRAPHQL_HOST)
- [ ] Schema files are valid GraphQL
- [ ] Dependencies installed (pnpm install)
- [ ] Libraries built (pnpm run build:libs)
- [ ] No stale generated files causing conflicts

## Exit Codes

- **0**: Codegen successful
- **Non-zero**: Errors occurred (check error message)

## Related Skills

- [Dev DB Lambda](dev-db-lambda.md) - Starting GraphQL server
- [Type Checking](typecheck.md) - Validating generated types
- [Building](build.md) - Building with generated types

## Related Documentation

- [GraphQL Integration](../../../docs/architecture/graphql-integration.md)
- [Build System](../../../docs/architecture/build-system.md)
