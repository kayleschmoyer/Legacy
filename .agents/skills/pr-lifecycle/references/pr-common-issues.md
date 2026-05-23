# Common PR Issues

## Common Issues

### Issue: Branch not pushed

**Solution**: Push branch before creating PR

```powershell
git push -u origin HEAD
```

### Issue: No changes to commit

**Solution**: Ensure you have committed changes

```powershell
git status
git add .
git commit -m "feat(scope): your message"
git push origin HEAD
```

### Issue: Twig GitHub integration not configured

**Solution**: Configure twig with GitHub token

```powershell
twig github setup
```

### Issue: Reviewer W1 is SKIPPED and bot LGTM was dismissed

**Cause:** A commit was pushed to the PR branch. The branch ruleset's `dismiss_stale_reviews_on_push` policy auto-dismissed the bot's APPROVE review, and W1 did not re-run because `bot:ready-for-review` was absent (e.g. it was manually removed, or the PR was opened before the label was applied).

**Symptom:** `Reviewer (W1)` check shows SKIPPED; the bot's LGTM review shows DISMISSED; `bot:ready-for-review` label is absent.

**Fix:** Apply `bot:ready-for-review` to trigger a new review cycle:

```
github_manage_labels(prs: [PR#], add: ["bot:ready-for-review"])
```

W1 fires on `synchronize` when `bot:ready-for-review` is present, so the label only needs to be added once — all future pushes will automatically re-trigger a new cycle. W1 will run, post a new review, and — if LGTM — re-add `merge-when-ready` automatically.

---

### Issue: PR body has broken formatting

**Solution**: Use the `create_file` tool to write a correct `.github/tmp-pr-body.md`, then update the existing PR body with `gh pr edit` (no MCP equivalent exists for editing PR body) — **do not close and recreate**:

```powershell
# 1. Use create_file tool to write the correct markdown to .github/tmp-pr-body.md
#    (never use @" "@ heredoc or shell redirection — both corrupt backticks/encoding)

# 2. Update the existing PR body in-place
gh pr edit <PR_NUMBER> --body-file ".github/tmp-pr-body.md"

# 3. Clean up
Remove-Item ".github/tmp-pr-body.md" -ErrorAction SilentlyContinue
```

### Issue: PR body contains `^@` null bytes / garbled UTF-16 output

**Cause**: The file was written using PowerShell's `>` redirect operator (which outputs UTF-16LE), or the command that wrote the file printed an error instead of content (e.g., `twig pr` is not a valid command).

**Solution**: Check what was written to the file before using it:

```powershell
Get-Content .github/tmp-pr-body.md | Select-Object -First 5
```

If it looks garbled or contains an error message, delete it and recreate correctly:

```powershell
Remove-Item .github/tmp-pr-body.md -ErrorAction SilentlyContinue
# Use create_file tool to write the correct PR body markdown
gh pr edit <PR_NUMBER> --body-file ".github/tmp-pr-body.md"
```

**Prevention**: Always use the `create_file` tool (not shell redirection) to write `.github/tmp-pr-body.md`.
