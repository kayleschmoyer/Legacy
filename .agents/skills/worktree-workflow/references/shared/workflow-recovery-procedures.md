# Recovery Procedures

## If You Committed to Main by Mistake

```powershell
# 1. Undo the commit (keep changes)
git reset HEAD~1

# 2. Create proper branch (ALWAYS specify -p=main)
twig switch LS-1234 -p=main

# 3. Commit on branch
git add .
git commit -m "feat(scope): description (LS-1234)"
git push origin HEAD

# 4. Create PR via MCP (preferred) — see create-pr skill for full template
github_create_pr(title: "LS-1234 feat(scope): description", body: <markdown>, draft: true)
# Shell fallback: gh pr create --draft --title "LS-1234 feat(scope): description" --body-file ".github/tmp-pr-body.md" --base main
```

## If You Pushed to Main by Mistake

> **⚠️ NEVER force-push main.** The `non_fast_forward` ruleset blocks it, and even
> if you have admin bypass, force-pushing rewrites public history and can strip
> other people's commits. Use `git revert` instead — it's safe regardless of
> protection state.

```powershell
# 1. Revert the accidental commit on main (creates a new commit that undoes it)
git checkout main
git revert HEAD --no-edit
git push origin main

# 2. Save the original commit hash before the revert
$originalCommit = git rev-parse HEAD~1   # the accidental commit (before revert)

# 3. Create a feature branch and cherry-pick the original work
git checkout -b LS-1234/fix main
git cherry-pick $originalCommit

# 4. Push and open a PR
git push origin HEAD
# Create PR via MCP (preferred):
github_create_pr(title: "LS-1234 fix(scope): description", body: <markdown>, draft: true)
# Shell fallback: gh pr create --draft --title "LS-1234 fix(scope): description" --body-file ".github/tmp-pr-body.md" --base main
```

> **Why revert instead of force-push?** `git revert` adds a new commit and never
> rewrites history. Force-pushing main can strip commits that others have already
> pulled or that CI has built against.

## If the Worktree `node_modules` Symlink Is Broken or Missing

When a worktree's `node_modules` symlink is missing, dangling, or pointing to the wrong location, **do not recreate the symlink manually**. Manual junctions to the main repo's `node_modules` cause `.modules.yaml` path mismatches and Nx graph failures.

### Recovery Steps

```powershell
# 1. Remove the broken symlink (safe — only removes the link, not the target)
# Skip this step if node_modules is already missing.
powershell -NoProfile -Command "Remove-Item -Path node_modules -Force"

# 2. Install independently in the worktree
make install
```

This gives the worktree its own independent `node_modules`. The worktree will no longer share with the main repo, which is safe and avoids cross-contamination.

### What NOT to Do

- **Never** create a Windows junction or symlink to the main repo's `node_modules` manually (e.g., `mklink /J`, `New-Item -ItemType Junction`, `New-Item -ItemType SymbolicLink`). Only `worktree_setup_node_modules()` (native flow) or `make_wt_setup` (sibling flow) should create the symlink — they handle `.modules.yaml` path consistency.
- **Never** run `pnpm install` directly — always use `make install`, which includes the correct flags and lockfile handling.
