# Skill: GraphQL Code Generation

## Overview

Regenerate TypeScript types and client code from GraphQL schemas using graphql-codegen.

## When to Use

- After modifying GraphQL schema files
- When GraphQL types are out of sync
- After pulling changes that include schema updates
- Getting "Cannot find type" errors for GraphQL types
- Before running builds to ensure type safety

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
echo $env:VITE_GRAPHQL_HOST
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
**Solution**: Set correct environment variable

```powershell
# Set GraphQL host environment variable
$env:VITE_GRAPHQL_HOST = 'http://localhost:4000/graphql'

# Then run codegen
pnpm exec nx affected -t codegen
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

## Integration with Workflow

### After Schema Changes

```powershell
# 1. Modify GraphQL schema files
# Edit files in lambdas/db/src/schema/

# 2. Restart GraphQL server (if running)
# Ctrl+C in GraphQL terminal, then:
pnpm exec nx run db:serve

# 3. Run codegen
pnpm exec nx affected -t codegen

# 4. Verify types are correct
pnpm exec nx affected -t typecheck

# 5. Commit generated files
git add .
git commit -m "feat(graphql): update schema and regenerate types"
```

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
