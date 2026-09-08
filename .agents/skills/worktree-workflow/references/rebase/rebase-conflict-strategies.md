# Large Rebases & Special Conflict Types

## Handling Large Rebases (Many Conflicts)

When a branch is far behind `main` and dozens of files conflict across multiple commits, use this systematic approach.

### Strategy 1: Automated Tree Rebase

The repo has scripts that auto-resolve common conflicts (generated files, migrations, docs):

```powershell
# Interactive — prompts you when manual resolution is needed
make rebase-tree

# Fully automated — aborts branches it can't resolve
make rebase-tree-auto
```

These scripts:

1. Run `twig rebase` for the current branch
2. Auto-resolve generated file conflicts via `.\scripts\resolve-generated-conflicts.ps1`
3. Auto-skip duplicate migration commits
4. Run validation (typecheck + lint) after completion

### Strategy 2: Agent-Assisted Conflict Resolution

When the automated scripts can't fully resolve conflicts, an agent can help. Here's the workflow:

#### 2a. Start the Rebase

**Preferred (MCP):** Use `worktree_rebase` — it fetches, rebases, and injects a cross-platform no-op Git editor automatically.

**Shell fallback:**

```bash
git fetch origin
GIT_EDITOR='node -e "process.exit(0)"' git rebase origin/main
```

#### 2b. Check What Conflicted

```powershell
git diff --name-only --diff-filter=U
```

#### 2c. Categorize the Conflicts

Classify each conflicted file and apply the correct strategy:

| File Pattern              | Strategy                 | Command                                         |
| ------------------------- | ------------------------ | ----------------------------------------------- |
| `*.generated.ts`          | Regenerate               | `.\scripts\resolve-generated-conflicts.ps1`     |
| `**/migrations/*.ts`      | Usually skip (duplicate) | `.\scripts\skip-migration-conflict.ps1`         |
| `docs/api/*.md`           | Accept theirs            | `git checkout --theirs <file> ; git add <file>` |
| `pnpm-lock.yaml`          | Regenerate               | See lockfile section below                      |
| `*.ts` / `*.tsx` (source) | Read both sides, merge   | Manual or agent-assisted                        |
| `*.json` (config)         | Read both sides, merge   | Manual or agent-assisted                        |

#### 2d. Resolve Source File Conflicts with Agent Assistance

For each conflicted source file, the agent should:

1. **Read the full file** (not just the conflict block) to understand surrounding context
2. **Understand both sides**: what `main` changed vs what the feature branch changed — and **why**
3. **Check the merge base** if intent is unclear: `git show $(git merge-base HEAD REBASE_HEAD):<file>`
4. **Determine intent**: Do both changes need to coexist? Does one supersede the other?
5. **Synthesize the resolution**: Remove conflict markers and produce code that preserves **both** sides' intent
6. **Verify references**: If main renamed something, update ALL occurrences in the file
7. **Stage the file**: `git add <file>`

**Key principles for source conflict resolution:**

- **NEVER** blindly run `git checkout --ours` or `--theirs` on source files — always read and reason first
- If main added new imports and the branch added different imports → keep both
- If main renamed/refactored and the branch modified → use main's structure with the branch's behavioral changes
- If main deleted code the branch modified → the deletion usually wins (check with the developer if unsure)
- If both sides modified the same logic differently → combine the intent of both changes
- When in doubt, **ask the developer** rather than guessing

#### 2e. Continue Through All Commits

**MCP (preferred):** `worktree_rebase_continue()` — suppresses the editor prompt internally; no `GIT_EDITOR` override needed.

**Shell fallback:**

```bash
# Set a cross-platform no-op GIT_EDITOR to avoid blocking on commit-message prompts
GIT_EDITOR='node -e "process.exit(0)"' git rebase --continue
```

Repeat 2b–2d for each commit that conflicts.

#### 2f. Validate After Completion

```powershell
# Type check
pnpm exec nx affected -t typecheck

# Lint (with auto-fix)
pnpm exec nx affected -t lint --fix

# Tests
pnpm exec nx affected -t test
```

Fix any errors introduced by the merge resolution, then amend the last commit if needed:

```powershell
git add .
git commit --amend --no-edit
```

---

## Special Conflict Types

### Generated Files (`*.generated.ts`)

**NEVER manually edit generated files.** Always regenerate them.

```powershell
# Automated resolution
.\scripts\resolve-generated-conflicts.ps1

# Manual fallback: accept theirs, then regenerate
git checkout --theirs <generated-file>
git add <generated-file>
make codegen
git add <generated-file>
```

The script handles:

- `apps/app/src/api/db/graphql.generated.ts`
- `apps/web/src/api/db/graphql.generated.ts`
- `apps/cli/src/api/db/graphql.generated.ts`

### Migration Files

Migration conflicts usually mean the same migration was applied on both branches (duplicate). Skip the duplicate commit:

```powershell
# If only migration files conflict:
.\scripts\skip-migration-conflict.ps1

# Or manually:
git rebase --skip
```

If a migration file has a **real** conflict (two different migrations editing the same table), resolve manually by keeping both migrations in chronological order.

### `pnpm-lock.yaml`

The lockfile should never be manually merged. Regenerate it:

```bash
# Accept either side first to clear the conflict
git checkout --theirs pnpm-lock.yaml
git add pnpm-lock.yaml
# Preferred: worktree_rebase_continue() via MCP
GIT_EDITOR='node -e "process.exit(0)"' git rebase --continue  # shell fallback

# After rebase completes, regenerate the lockfile
pnpm install --no-frozen-lockfile
git add pnpm-lock.yaml
git commit --amend --no-edit
```

#### ⚠️ Not safe in a native-flow worktree: `pnpm install --no-frozen-lockfile` / `--lockfile-only` (LS-4889)

The regeneration command above assumes `node_modules` is a real, local install. In a native-flow worktree (`.claude/worktrees/<name>/`), it isn't — `node_modules` is a symlink into a shared, immutable content-addressable pool slot keyed by the lockfile's hash (see [concurrent-agent-safety.md](../shared/concurrent-agent-safety.md)). Running `pnpm install --no-frozen-lockfile` or `pnpm install --lockfile-only` **through that symlink** makes pnpm see a modules directory it doesn't recognize as its own store link, and it prompts to remove and reinstall the whole tree in place — which destroys the pool slot every other worktree on the same lockfile hash is still pointing to, not just this one. Do not run either command directly in a worktree, even non-interactively (`--no-frozen-lockfile` doesn't skip the removal prompt, it just changes what happens after you answer it).

**When you actually hit this**: not every lockfile conflict needs a full regeneration. The common case after a rebase is narrower — `package.json` gained a dependency (from either side) but `pnpm-lock.yaml`'s `importers.<path>` block for that workspace never picked it up, so `pnpm install --frozen-lockfile` (what `make pc`/CI runs) fails with a frozen-lockfile mismatch naming that one package. If `git diff` on the conflicted `pnpm-lock.yaml` shows only that kind of gap — one importer missing one entry that's already resolved elsewhere in the file — a full regeneration is overkill and the in-place-install risk above isn't worth it. Use the manual edit below instead.

**Safe manual edit for a missing importer entry:**

1. Diff the workspace's `package.json` against the corresponding `importers.<path>` block in `pnpm-lock.yaml` to find the missing package name(s) — e.g. `apps/app/package.json` has `expo-secure-store` under `dependencies`, but `importers['apps/app'].dependencies` has no `expo-secure-store` key.
2. Search the lockfile's top-level `packages:` (or `snapshots:`, depending on lockfile version) section for `<package-name>@<version>` matching the range in `package.json`. It's almost always already there — the package is already used by some other workspace in the monorepo, which is why the version is resolvable at all without a real install.
   - **If it is not already there** (genuinely new to the whole monorepo, not just this workspace), stop — this manual pattern doesn't apply. That case needs a real `pnpm install` to resolve a brand-new dependency graph, which must not run through a worktree's symlinked `node_modules`; ask the user to run it from their own primary checkout, or fix it up in a later non-worktree session.
3. Add the minimal entry under the workspace's importer block, matching the exact key (`dependencies` vs `devDependencies`) and indentation of the sibling entries already there:
   ```yaml
   importers:
     apps/app:
       dependencies:
         expo-secure-store:
           specifier: ~56.0.4 # from package.json
           version: 56.0.4(expo@56.0.16) # from the existing packages: entry
   ```
   Copy the `version` value verbatim from the `packages:`/`snapshots:` entry found in step 2 — don't hand-derive it.
4. Do not touch the `packages:`/`snapshots:` metadata block itself; only the `importers.<path>` entry changes.
5. Verify and materialize without touching any other worktree's slot: re-run `node scripts/modules-pool/link.mjs` (or `worktree_install_recover()`, MCP-first). Because the edit changed the lockfile's content hash, this resolves to a **new** pool slot and materializes it via an isolated `pnpm install --frozen-lockfile` — it never writes through the old slot other worktrees still use. If it fails, the manual edit was wrong (bad version/specifier, wrong importer path) — re-check step 3, don't fall back to `--no-frozen-lockfile`/`--lockfile-only` in the worktree.

This is the doc-first response to LS-4889: a `worktree_sync_lockfile` MCP tool was considered but the safe path here doesn't need new tooling — the existing pool-slot resolver (`link.mjs`/`worktree_install_recover`) already does the only safe "regenerate" step once the importer entry itself is fixed by hand.

### Schema Files (`lib/db-client/src/drizzle/**`)

Accept theirs (the incoming main version) since schema changes should be sequential:

```powershell
git checkout --theirs lib/db-client/src/drizzle/public/schema.ts
git add lib/db-client/src/drizzle/public/schema.ts
```

Then verify the schema includes your branch's changes. If your branch also modified the schema, you'll need to reapply those changes on top.
