# Skill: Pull Request Creation

## Overview
Create pull requests using twig's GitHub integration with automatic PR template population.

## When to Use
- After completing work on a feature branch
- All pre-commit validation passes
- Ready for code review
- Before updating Jira ticket to "In Review"

## Command

```powershell
# Create PR with twig (opens in browser)
twig github pr create-pr
```

## Alternative Commands

### Using GitHub CLI

```powershell
# Create PR with gh CLI
gh pr create --title "LS-1234: Brief description" \
  --body "Description of changes"

# Create PR with auto-filled details
gh pr create --fill
```

### Manual PR Creation

```powershell
# Push branch and open GitHub in browser
git push origin HEAD
# Then manually create PR at github.com
```

## Expected Output
- **Success**: Browser opens to GitHub PR creation page
- **Pre-filled**: Title, description, and Jira link automatically populated
- **Branch**: Current branch set as source, main as target

## Common Issues

### Issue: Branch not pushed
**Solution**: Push branch before creating PR
```powershell
git push origin HEAD
# or
git push -u origin HEAD  # First push
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
# Follow prompts to add GitHub personal access token
```

### Issue: PR template not populated
**Solution**: Manually fill PR template with required information
- Title: `LS-1234: Brief description`
- Jira link: `https://your-jira.atlassian.net/browse/LS-1234`
- Description of changes
- Screenshots (if UI changes)
- Test results

## Best Practices
1. **Run pre-commit validation** before creating PR (make pre-commit)
2. **Use conventional commit format** in title
3. **Link Jira ticket** in PR description
4. **Add screenshots** for UI changes
5. **Update Jira status** to "In Review" after PR creation
6. **Fill PR checklist** completely
7. **Keep PRs focused** - split large changes into multiple PRs

## PR Title Format

```
LS-1234: Brief description of changes
```

**Examples**:
- `LS-1234: Add career statistics resolver`
- `LS-1234: Fix OAuth token refresh issue`
- `LS-1234: Update GraphQL schema documentation`

## PR Description Template

```markdown
## Summary
Brief overview of what this PR does.

## Jira Ticket
[LS-1234](https://your-jira.atlassian.net/browse/LS-1234)

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing Done
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] E2E tests pass (if applicable)

## Screenshots
(If applicable)

## Breaking Changes
None / List any breaking changes

## Additional Notes
Any additional context or notes for reviewers.
```

## Integration with Workflow

### Complete PR Workflow
```powershell
# 1. Ensure all validation passes
make pre-commit

# 2. Commit changes
git add .
git commit -m "feat(scope): description"

# 3. Push branch
git push origin HEAD

# 4. Create PR
twig github pr create-pr

# 5. Update Jira ticket
acli jira workitem transition --key LS-1234 --status "In Review"

# 6. Request reviews (in GitHub UI)
```

### Before Creating PR Checklist
- [ ] All commits follow conventional commit format
- [ ] Type checking passes (`pnpm exec nx affected -t typecheck`)
- [ ] Linting passes (`pnpm exec nx affected -t lint --fix`)
- [ ] Tests pass (`pnpm exec nx affected -t test`)
- [ ] Build succeeds (`pnpm exec nx affected -t build`)
- [ ] Pre-commit hooks pass
- [ ] Jira ticket status is "In Progress"

### After Creating PR Checklist
- [ ] PR title references Jira ticket
- [ ] PR description complete
- [ ] Jira ticket updated to "In Review"
- [ ] Reviewers assigned
- [ ] Labels added (if needed)
- [ ] CI checks passing

## De-scoping Work

If PR becomes too large, consider splitting:

```powershell
# 1. Create follow-up ticket
acli jira workitem create --project LS --type "Story" \
  --summary "Follow-up: UI components" \
  --description "Work de-scoped from LS-ORIG"

# 2. Document in PR description
# "UI components de-scoped to LS-NEW (link)"

# 3. Update original ticket
acli jira workitem comment create --key LS-ORIG \
  --body "UI work de-scoped to LS-NEW to keep PR focused"
```

## Checking PR Status

```powershell
# List PRs for current branch
gh pr list --head $(git branch --show-current)

# View PR details
gh pr view

# Check CI status
gh pr checks
```

## Exit Codes
- **0**: PR created successfully (browser opened)
- **Non-zero**: Error occurred (check error message)

## Related Skills
- [Jira Ticket Management](jira-ticket.md) - Updating ticket status
- [Branch Creation](branch-create.md) - Creating branches
- [Pre-commit Validation](../../../docs/guides/ai-agent-contribution-workflow.md#step-4-pre-commit-validation)

## Related Documentation
- [AI Agent Contribution Workflow](../../../docs/guides/ai-agent-contribution-workflow.md#step-6-create-pull-request)
- [Development Workflow CSV](../../../docs/agents/development-workflow.csv)
