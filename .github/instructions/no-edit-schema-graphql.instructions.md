---
applyTo: '**/schema.graphql'
---

# Never Edit schema.graphql

**STOP — this file is generated. Do not edit it manually.**

`lambdas/db/schema.graphql` is the canonical SDL output generated from the Pothos schema implementation in `lambdas/db/src/schema/`. Manual edits will be overwritten and will cause the `check-schema-and-codegen` CI job to fail.

## What to Do Instead

1. **Edit the Pothos source** — modify types, queries, or mutations in `lambdas/db/src/schema/`.

2. **Regenerate schema.graphql**:

   ```powershell
   pnpm exec nx run db:print-schema
   ```

3. **Regenerate downstream TypeScript types**:

   ```powershell
   pnpm exec nx affected -t codegen
   ```

4. **Commit together**:
   ```powershell
   git add lambdas/db/schema.graphql
   git add **/*.generated.ts
   git commit -m "chore(codegen): regenerate schema and types"
   ```

## Resolving Merge Conflicts

Never use the merge editor to resolve conflicts in schema.graphql. Accept either side, then regenerate:

In agent workflows, prefer `worktree_rebase_continue` after staging the regenerated files so Git stays non-interactive.

```powershell
git checkout --theirs -- lambdas/db/schema.graphql
pnpm exec nx run db:print-schema
git add lambdas/db/schema.graphql
git rebase --continue
```
