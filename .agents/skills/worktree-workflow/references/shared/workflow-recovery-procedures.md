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

When a worktree's `node_modules` symlink is missing, dangling, pointing to the wrong location, or an NTFS junction, **do not recreate it manually**. Manual junctions cause `.modules.yaml` path mismatches and Nx graph failures.

### Recovery Steps

```powershell
# Re-run the pool resolver from the worktree root. It removes a broken/wrong link,
# then links node_modules to the content-addressable slot for this lockfile —
# re-linking instantly on a pool hit, or materialising a fresh slot on a miss.
node scripts/modules-pool/link.mjs
```

`make install` and `make wt-setup` do the same thing. Directory symlinks require Windows Developer Mode.

### What NOT to Do

- **Never** create a Windows junction or symlink for `node_modules` manually using `New-Item -ItemType Junction`, `New-Item -ItemType SymbolicLink`, or raw `mklink /J`. Use `node scripts/modules-pool/link.mjs` (native flow) or `make_wt_setup` (sibling flow) — they handle slot materialisation, `.modules.yaml` path consistency, and junction→symlink conversion.
- **Never** run `pnpm install` straight through the slot symlink — always use the resolver / `make install`, which build a fresh immutable slot instead of mutating the shared one.
