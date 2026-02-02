# Resolver Update Instructions

## Summary

Need to update ~43 resolver instances across 2 files to use `context.db` instead of `runWithPublicClient(getDbOptions(), async (db) => {...})`.

##Files to Update

1. `lambdas/db/src/schema/matchups.ts` - 21 instances
2. `lambdas/db/src/schema/leagues.ts` - 14+ instances

## Pattern to Replace

### Before:

```typescript
resolve: async (parent) => {
  return await runWithPublicClient(getDbOptions(), async (db) => {
    const results = await db.select()...
    return results[0] || null;
  });
},
```

### After:

```typescript
resolve: async (parent, _args, context) => {
  const results = await context.db.select()...
  return results[0] || null;
},
```

## Key Changes:

1. **Add `context` parameter** to resolve function (3rd parameter)
2. **Remove** `runWithPublicClient(getDbOptions(), async (db) => {` wrapper
3. **Replace** `db` references with `context.db`
4. **Remove** closing `});` from runWithPublicClient wrapper
5. **Update imports**: Remove `runWithPublicClient` and `getDbOptions` imports

## Affected Resolver Types:

- Nested field resolvers (team1, team2, seasonBatting, etc.)
- Mutation resolvers
- Query resolvers with complex logic

## Testing After Updates:

```powershell
# 1. Typecheck
pnpm exec nx run db:typecheck

# 2. Lint
pnpm exec nx run db:lint --fix

# 3. Restart server
pnpm dlx kill-port 5000
pnpm exec nx run db:serve

# 4. Test with complex query (10+ matchup players with nested fields)
```

## Expected Impact:

- **Before**: 41 connections for query with 10 matchup players × 4 nested fields
- **After**: 1 connection shared across all resolvers
- **Reduction**: 97.5% fewer connections

## Manual Steps Required:

Due to file size (matchups.ts: 1358 lines, leagues.ts: 1743 lines), manual editing or careful scripted replacement is recommended.

### Recommended Approach:

1. Search for `runWithPublicClient` in each file
2. For each occurrence, apply the pattern replacement above
3. Test after each file is updated
4. Verify no connection pool errors

## Completed:

✅ `dataloaders.ts` - Updated to accept `db` parameter
✅ `dev.ts` - Pass `db` to `createLoaders(db)`
✅ `index.ts` - Pass `db` to `createLoaders(db)`
✅ Type exports and imports

## Remaining:

🔲 Update ~21 resolvers in `matchups.ts`
🔲 Update ~14 resolvers in `leagues.ts`
