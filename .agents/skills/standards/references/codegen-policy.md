# Codegen Policy: Never Edit Generated Files Directly

## Overview

Files ending in `.generated.ts` are **auto-generated** by
`graphql-codegen`. Editing them by hand will be overwritten the next time codegen
runs, will cause merge conflicts, and will cause the `check-codegen` CI job to fail.

Always regenerate them from source instead.

## Files This Applies To

| Pattern          | Example paths                                           |
| ---------------- | ------------------------------------------------------- |
| `schema.graphql` | `lambdas/db/schema.graphql`                             |
| `*.generated.ts` | `apps/app/src/api/db/graphql.generated.ts`              |
| `*.generated.ts` | `lib/shared-components/src/api/db/graphql.generated.ts` |

If you see one of these paths in a diff, a task, or a conflict -- **stop and regenerate** instead of editing.

## schema.graphql: Source of Truth

The schema source of truth is the Pothos type/resolver definitions in TypeScript:

```
lambdas/db/src/schema/
├── types/          <- Pothos object types
├── queries/        <- Query resolvers
├── mutations/      <- Mutation resolvers
└── builder.ts      <- Pothos schema builder
```

`schema.graphql` is produced by running the schema builder and printing the resulting SDL. Codegen downstream reads this file to generate TypeScript client types for every app and library.

> **`schema.graphql` is NEVER manually edited.**
> It is the canonical SDL output generated from the Pothos schema implementation.
> Always run `pnpm exec nx run db:print-schema` (or `make pre-commit`, which runs it as step 1) to regenerate it.
> Manual edits will be overwritten and will cause the `check-schema` CI job to fail.

## When to Regenerate

- After changing anything in `lambdas/db/src/schema/` (Pothos type/query/mutation definitions)
- After adding or modifying a `.graphql` operation file in any project
- After resolving merge conflicts that touch these files
- Before opening a PR that includes schema changes

> **Important**: When you modify Pothos resolvers/types in `lambdas/db/src/schema/`,
> `schema.graphql` must be regenerated via `print-schema` **before** running codegen.
> The codegen step reads `schema.graphql` as its source of truth -- if schema.graphql is
> stale or manually edited, all downstream generated types will be wrong.

## How to Regenerate

### Step 1 -- Update `schema.graphql` from the Pothos implementation

```powershell
pnpm exec nx run db:print-schema
```

This writes `lambdas/db/schema.graphql` from the live Pothos schema object.
Always commit this file alongside any schema source changes.

### Step 2 -- Run codegen for all affected projects

```powershell
# Affected projects only (fastest -- use this normally)
pnpm exec nx affected -t codegen

# All projects (use when unsure, or after a rebase)
pnpm exec nx run-many -t codegen \
  --projects=app,web,cli,api,shared-components,data-loaders,bref-client
```

Codegen reads `GRAPHQL_HOST` to locate the schema. In CI it points at the
generated SDL file. Locally it falls back to `http://localhost:5000/graphql`.

To run codegen locally without starting the dev server:

```powershell
$env:GRAPHQL_HOST = "lambdas/db/schema.graphql"
pnpm exec nx affected -t codegen
```

### Step 3 -- Commit the regenerated files

```powershell
git add lambdas/db/schema.graphql
git add **/graphql.generated.ts
git commit -m "chore(codegen): regenerate types from updated schema"
```

## CI Checks That Enforce This

| Check           | What it does                                                                                |
| --------------- | ------------------------------------------------------------------------------------------- |
| `check-schema`  | Diffs committed `schema.graphql` against a freshly generated SDL -- fails if they differ    |
| `check-codegen` | Runs all 7 `codegen` targets against the generated SDL -- fails if any operation is invalid |

Both jobs run on every PR via `.github/workflows/check-schema.yml`.

## Resolving Conflicts in Generated Files

If a rebase or merge leaves conflicts inside generated files:

```powershell
# Accept one side to clear the conflict markers, then regenerate
git checkout --theirs -- apps/app/src/api/db/graphql.generated.ts
# (repeat for each conflicted generated file)

pnpm exec nx run db:print-schema
pnpm exec nx run-many -t codegen \
  --projects=app,web,cli,api,shared-components,data-loaders,bref-client

git add lambdas/db/schema.graphql **/graphql.generated.ts
```

See also: `../../codegen/SKILL.md`

## Resolving a schema.graphql Merge Conflict

**Never use the merge editor to resolve conflicts in `schema.graphql`.** Instead:

1. Accept either side (or abort the merge/rebase)
2. Regenerate from the Pothos source: `pnpm exec nx run db:print-schema`
3. Stage the regenerated file: `git add lambdas/db/schema.graphql`
4. Continue the merge/rebase
