---
name: no-edit-schema-graphql
description: 'Never manually edit schema.graphql; it is generated from the Pothos schema implementation and must be regenerated via `pnpm exec nx run db:print-schema`. Use when you are about to edit schema.graphql, see schema.graphql in a diff or conflict, or need to add/modify a GraphQL type, query, or mutation.'
---

# Skill: Never Edit schema.graphql Directly

## Overview

`lambdas/db/schema.graphql` is the **canonical SDL output** generated from the Pothos schema implementation in `lambdas/db/src/schema/`. It is **never edited by hand**.

Manual edits will be overwritten the next time `print-schema` runs, will cause merge conflicts, and will cause the `check-schema` CI job to fail.

## Why It Is Generated

The source of truth is the Pothos type/resolver definitions in TypeScript:

```
lambdas/db/src/schema/
├── types/          ← Pothos object types
├── queries/        ← Query resolvers
├── mutations/      ← Mutation resolvers
└── builder.ts      ← Pothos schema builder
```

`schema.graphql` is produced by running the schema builder and printing the resulting SDL. Codegen downstream reads this file to generate TypeScript client types for every app and library.

## When to Use This Skill

- You are about to edit `lambdas/db/schema.graphql` directly
- `schema.graphql` appears in a conflict during a merge or rebase
- You have added/changed a Pothos type, query, or mutation and need to propagate the change
- CI `check-schema` job is failing

## How to Regenerate schema.graphql

### Step 1 — Make your changes in the Pothos source

Edit files under `lambdas/db/src/schema/`. Do **not** touch `schema.graphql`.

### Step 2 — Regenerate schema.graphql

```powershell
pnpm exec nx run db:print-schema
```

This rewrites `lambdas/db/schema.graphql` from the live Pothos schema. Always commit this file alongside the source change.

### Step 3 — Regenerate downstream TypeScript types

`schema.graphql` is the input for graphql-codegen. After regenerating it, run codegen for all affected projects:

```powershell
# Fastest — only regenerates for projects affected by your changes
pnpm exec nx affected -t codegen

# All projects (use after a rebase or when unsure)
$env:GRAPHQL_HOST = "lambdas/db/schema.graphql"
pnpm exec nx run-many -t codegen --projects=app,web,cli,shared-components,data-loaders,bref-client
```

### Step 4 — Commit regenerated files together

```powershell
git add lambdas/db/schema.graphql
git add **/*.generated.ts
git commit -m "chore(codegen): regenerate schema and types"
```

### Shortcut: make pre-commit does all of this

```powershell
make pc
```

`make pre-commit` runs `print-schema` as its first step, then codegen, typecheck, lint, and tests. It is the authoritative validation before opening a PR.

## Resolving a schema.graphql Merge Conflict

**Never use the merge editor to resolve conflicts in `schema.graphql`.** Instead:

1. Accept either side (or abort the merge/rebase)
2. Regenerate from the Pothos source: `pnpm exec nx run db:print-schema`
3. Stage the regenerated file: `git add lambdas/db/schema.graphql`
4. Continue the merge/rebase

## Related Skills

- [codegen](../codegen/SKILL.md) — regenerate TypeScript types from schema.graphql
- [no-edit-generated](../no-edit-generated/SKILL.md) — never edit `*.generated.ts` files
