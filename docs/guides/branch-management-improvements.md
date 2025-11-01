# Branch Management Improvements

This document outlines the new branch management automation tools added to streamline your workflow.

## 🎯 Quick Start

### New Makefile Commands

```powershell
make branch-tree          # View current branch tree
make rebase-tree          # Interactive rebase with auto-conflict resolution
make rebase-tree-auto     # Auto-rebase (no prompts - use with caution)
make resolve-conflicts    # Manually resolve generated file conflicts
make pre-commit           # Full validation (typecheck → lint → test → build)
make quick-check          # Fast validation (typecheck → lint only)
```

### Smart Branch Creation

```powershell
# Instead of manual steps, use the automated script:
.\scripts\branch-create.ps1 -TicketKey LS-1234

# This automatically:
# 1. Fetches ticket details
# 2. Prompts to add to current sprint
# 3. Creates branch (from main or current)
# 4. Updates Jira to "In Progress"
# 5. Shows branch tree
```

---

## 📋 New Tools & Scripts

### 1. **resolve-generated-conflicts.ps1**

**Location**: `scripts/resolve-generated-conflicts.ps1`

**Purpose**: Automatically resolves conflicts in generated files during rebase.

**Features**:

- Detects GraphQL generated file conflicts
- **Regenerates** GraphQL types instead of accepting old code
- Accepts incoming changes for schema files (source of truth)
- Accepts incoming changes for documentation
- Reports any remaining conflicts that need manual resolution

**Usage**:

```powershell
# During a rebase with conflicts:
.\scripts\resolve-generated-conflicts.ps1
git rebase --continue
```

**Or via Makefile**:

```powershell
make resolve-conflicts
```

---

### 2. **rebase-branch-tree.ps1**

**Location**: `scripts/rebase-branch-tree.ps1`

**Purpose**: Rebases entire branch tree with automatic conflict resolution.

**Features**:

- Systematically rebases current branch
- Auto-detects and resolves generated file conflicts
- Runs codegen to regenerate types
- Runs validation checks after rebase
- Interactive mode with manual fallback
- Auto-continue mode for fully automated rebasing

**Usage**:

```powershell
# Interactive (prompts on unresolved conflicts):
.\scripts\rebase-branch-tree.ps1

# Start from specific branch:
.\scripts\rebase-branch-tree.ps1 -StartBranch LS-24

# Fully automated (dangerous - use only if confident):
.\scripts\rebase-branch-tree.ps1 -AutoContinue
```

**Or via Makefile**:

```powershell
make rebase-tree           # Interactive
make rebase-tree-auto      # Fully automated
```

**What it does**:

1. Checks out the target branch
2. Initiates twig rebase
3. Detects conflicts
4. Runs `resolve-generated-conflicts.ps1` automatically
5. Continues rebase
6. Repeats until complete
7. Runs typecheck + lint validation
8. Reports results

---

### 3. **branch-create.ps1**

**Location**: `scripts/branch-create.ps1`

**Purpose**: Smart branch creation with Jira integration.

**Features**:

- Fetches and displays ticket details
- Prompts to add to current sprint
- Creates branch from main or current branch
- Updates Jira ticket to "In Progress"
- Shows branch tree
- Provides next-step guidance

**Usage**:

```powershell
# Create from main:
.\scripts\branch-create.ps1 -TicketKey LS-1234

# Create from current branch:
.\scripts\branch-create.ps1 -TicketKey LS-1234 -FromCurrent
```

**Replaces manual workflow**:

```powershell
# OLD WAY (many manual steps):
acli jira workitem view LS-1234
# Add to sprint manually in Jira
git checkout main
git pull
twig switch LS-1234
acli jira workitem transition --key LS-1234 --status "In Progress"
twig tree

# NEW WAY (one command):
.\scripts\branch-create.ps1 -TicketKey LS-1234
```

---

### 4. **pre-push.ps1** (Git Hook)

**Location**: `scripts/git-hooks/pre-push.ps1`

**Purpose**: Automatic validation before pushing to remote.

**Features**:

- Runs typecheck on affected files
- Runs lint on affected files
- Only checks changes between local and remote
- Skips during rebase/merge operations
- Can be bypassed with `--no-verify` flag

**Installation** (Optional):

```powershell
# Copy to .git/hooks/
Copy-Item scripts\git-hooks\pre-push.ps1 .git\hooks\pre-push
```

**Benefits**:

- Catches errors before push
- Prevents CI failures
- Faster feedback loop

**Bypass if needed**:

```powershell
git push --no-verify
```

---

## 🔄 Updated Workflows

### Before: Manual Rebase Workflow

```powershell
git checkout LS-24
twig rebase
# Conflicts!
git checkout --theirs apps/app/src/api/db/graphql.generated.ts
git checkout --theirs apps/web/src/api/db/graphql.generated.ts
git add apps/app/src/api/db/graphql.generated.ts apps/web/src/api/db/graphql.generated.ts
git rebase --continue
# More conflicts!
git checkout --theirs docs/api/graphql-schema.md
git add docs/api/graphql-schema.md
git rebase --continue
# Even more conflicts!
# ... repeat 10+ times ...
make codegen
pnpm exec nx affected -t typecheck
pnpm exec nx affected -t lint --fix
```

### After: Automated Rebase Workflow

```powershell
# One command does it all:
make rebase-tree

# Or if fully confident:
make rebase-tree-auto
```

---

### Before: Manual Branch Creation

```powershell
acli jira workitem view LS-1234
# Manually add to sprint in Jira UI
git checkout main
git pull
twig switch LS-1234
acli jira workitem transition --key LS-1234 --status "In Progress"
twig tree
```

### After: Automated Branch Creation

```powershell
.\scripts\branch-create.ps1 -TicketKey LS-1234
```

---

### Before: Manual Pre-Commit Validation

```powershell
pnpm exec nx affected -t typecheck
pnpm exec nx affected -t lint --fix
pnpm exec nx affected -t test
pnpm exec nx affected -t build
```

### After: One Command Validation

```powershell
make pre-commit      # Full validation
# OR
make quick-check     # Just typecheck + lint
```

---

## 💡 Best Practices

### When to Use Each Tool

| Tool                     | Use When                                   | Caution Level           |
| ------------------------ | ------------------------------------------ | ----------------------- |
| `make branch-tree`       | Always - check branch structure            | ✅ Safe                 |
| `make quick-check`       | Before commit - fast validation            | ✅ Safe                 |
| `make pre-commit`        | Before push - full validation              | ✅ Safe                 |
| `make resolve-conflicts` | During rebase - manual conflict resolution | ⚠️ Review changes       |
| `make rebase-tree`       | Rebasing with supervision                  | ⚠️ Interactive prompts  |
| `make rebase-tree-auto`  | Rebasing with confidence                   | ⚠️⚠️ No prompts - risky |

### Recommended Daily Workflow

```powershell
# 1. Start new work
.\scripts\branch-create.ps1 -TicketKey LS-1234

# 2. Code changes
# ... make your changes ...

# 3. Quick validation during development
make quick-check

# 4. Full validation before commit
make pre-commit

# 5. Commit and push
git add .
git commit -m "feat(scope): description"
git push origin HEAD

# 6. Create PR
twig github pr create-pr
```

### Rebase Workflow

```powershell
# Check branch tree first
make branch-tree

# Rebase with auto-conflict resolution
make rebase-tree

# Or if you're confident (batch rebasing):
make rebase-tree-auto

# Validation runs automatically, but you can re-run:
make pre-commit
```

---

## 🚨 Conflict Resolution Strategy

The tools use this strategy for different file types:

### GraphQL Generated Files

**Files**: `apps/*/src/api/db/graphql.generated.ts`, `*.graphql.schema.json`
**Strategy**: **Regenerate from schema**

- Accept incoming changes to clear conflict
- Run `make codegen` to regenerate from current schema
- This ensures types match current GraphQL API

### Schema Files

**Files**: `lambdas/db/src/schema/index.ts`, `lib/db-client/src/drizzle/public/schema.ts`
**Strategy**: **Accept incoming changes (--theirs)**

- These are source files, not generated
- Incoming version is the current state
- Conflicts usually from schema additions across branches

### Documentation

**Files**: `docs/api/graphql-schema.md`
**Strategy**: **Accept incoming changes (--theirs)**

- Documentation reflects current API state
- Can be manually updated if needed

### Application Code

**Files**: Everything else
**Strategy**: **Manual resolution required**

- Tools will stop and prompt for manual resolution
- Review carefully and resolve conflicts appropriately

---

## 📊 Time Savings

Based on your recent rebase of 11 branches:

| Task                           | Before           | After            | Savings                  |
| ------------------------------ | ---------------- | ---------------- | ------------------------ |
| Resolve 1 conflict             | 30 seconds       | 0 seconds (auto) | 30 sec                   |
| Rebase 1 branch (~5 conflicts) | 3 minutes        | 30 seconds       | 2.5 min                  |
| Rebase 11 branches             | 30+ minutes      | 5 minutes        | 25+ min                  |
| Run pre-commit checks          | 5 minutes typing | 5 seconds typing | Minimal time, less error |

**Total time saved per rebase session**: ~25-30 minutes

---

## 🔧 Troubleshooting

### Script won't run

```powershell
# If you get execution policy error:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or run with bypass:
powershell -ExecutionPolicy Bypass -File .\scripts\rebase-branch-tree.ps1
```

### Codegen fails during conflict resolution

The script will fall back to accepting incoming changes. After rebase completes:

```powershell
make codegen
make quick-check
```

### Auto-rebase gets stuck

The script has a 50-attempt limit per branch. If it reaches this:

```powershell
git rebase --abort
# Then do manual rebase with interactive mode:
make rebase-tree
```

### Want to see what would happen

You can dry-run by checking the scripts:

```powershell
# View the script logic:
code .\scripts\rebase-branch-tree.ps1
code .\scripts\resolve-generated-conflicts.ps1
```

---

## 🎓 Learning Resources

- **Twig Documentation**: Check twig docs for advanced branch tree features
- **Conventional Commits**: https://www.conventionalcommits.org/
- **Nx Affected Commands**: https://nx.dev/concepts/affected

---

## 📝 Future Improvements

Potential enhancements to consider:

1. **Multi-branch rebase**: Automatically detect and rebase all branches in tree
2. **PR auto-update**: Update PR descriptions with validation results
3. **Jira automation**: Auto-comment on Jira with rebase/PR status
4. **Conflict prediction**: Analyze branches to predict conflicts before rebasing
5. **Rebase scheduling**: Nightly rebase jobs for branch trees
6. **Metrics dashboard**: Track time saved, conflicts resolved, etc.

---

## 🤝 Contributing

Found an improvement? Update these files:

- Scripts: `scripts/*.ps1`
- Makefile: Add new targets to `Makefile`
- Documentation: Update `agents.md` and this file

Happy branching! 🌿
