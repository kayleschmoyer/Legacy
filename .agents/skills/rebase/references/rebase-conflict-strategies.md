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
GIT_EDITOR='node -e "process.exit(0)"' git rebase --continue

# After rebase completes, regenerate the lockfile
pnpm install --no-frozen-lockfile
git add pnpm-lock.yaml
git commit --amend --no-edit
```

### Schema Files (`lib/db-client/src/drizzle/**`)

Accept theirs (the incoming main version) since schema changes should be sequential:

```powershell
git checkout --theirs lib/db-client/src/drizzle/public/schema.ts
git add lib/db-client/src/drizzle/public/schema.ts
```

Then verify the schema includes your branch's changes. If your branch also modified the schema, you'll need to reapply those changes on top.
