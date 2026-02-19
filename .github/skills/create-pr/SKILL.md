---
name: create-pr
description: 'Create pull requests using twig GitHub integration with automatic PR template population; use after completing work on a feature branch.'
---

# Skill: Pull Request Creation

## Overview

Create pull requests using twig's GitHub integration or the GitHub CLI. **Always use a temp file for the PR body** to avoid PowerShell mangling markdown.

## When to Use

- After completing work on a feature branch
- All pre-commit validation passes
- Ready for code review
- Before updating Jira ticket to "In Review"

## Prerequisites

Before creating a PR, verify the following **in order**. Stop at the first failure and resolve it.

### 1. Must Be on a Non-Main Branch

```powershell
$branch = git branch --show-current
if ($branch -eq 'main') { Write-Error 'Cannot create a PR from main. Create a feature branch first.' }
```

If you are on `main`, **stop** and use the **branch-create** skill to create a
feature branch before proceeding:

```powershell
# See: .github/skills/branch-create/SKILL.md
.\scripts\branch-create.ps1 -TicketKey LS-####
# — or —
twig switch LS-#### -p=main
```

### 2. Must Have an Associated Jira Ticket

Extract the ticket key from the branch name and confirm it exists:

```powershell
$branch = git branch --show-current
if ($branch -match '(LS-\d+)') {
    $ticket = $Matches[1]
    acli jira workitem view $ticket          # Must succeed
} else {
    Write-Error "Branch '$branch' has no Jira ticket (expected LS-#### in the name). Create a branch with an associated ticket first."
}
```

If the branch does not contain a Jira ticket key:

1. Identify or create the relevant Jira ticket.
2. Rename/recreate the branch using the **branch-create** skill so the ticket
   key is embedded in the branch name.

> **Why?** Every PR must link back to a Jira ticket for traceability. The ticket
> key in the branch name is used to auto-populate the PR description and to
> transition the ticket to "In Review" after the PR is created.

## Command

```powershell
# Create PR with twig (opens in browser)
twig github pr create-pr
```

## Using GitHub CLI (Preferred for Agents)

### 🚨 CRITICAL: Always Use --body-file, Never --body

PowerShell corrupts inline markdown passed via `--body`:

- Backticks are stripped or escaped incorrectly
- Arrow characters (→) turn into `\`
- Code blocks render as broken text
- Special characters get double-escaped

**PowerShell heredoc (`@" "@`) also strips single backticks.** The only safe way
is to write the file directly using a tool (e.g., `create_file`) or `Set-Content`
with properly escaped content via a variable.

**Agent workflow — write a temp .md file, then pass it to `gh pr create`:**

```powershell
# 1. Use your file-writing tool to create a temp .md file with the PR body
#    (agents: use create_file to write the markdown — it preserves backticks)
#    File location: .github/tmp-pr-body.md (or $env:TEMP/pr-body.md)

# 2. Create PR using --body-file
gh pr create --title "fix(scope): description" --body-file ".github/tmp-pr-body.md" --base main

# 3. Clean up the temp file
Remove-Item ".github/tmp-pr-body.md" -ErrorAction SilentlyContinue
```

### ❌ NEVER Do These

```powershell
# BAD - PowerShell will mangle the markdown
gh pr create --title "fix: thing" --body "## Problem`nThe \`code\` was broken"

# BAD - Inline backticks and special chars get corrupted
gh pr create --title "fix: thing" --body "Change \`--old\` to \`--new\`"

# BAD - Heredoc also strips single backticks
@"
The `function` was broken
"@ | Set-Content -Path "$env:TEMP\pr-body.md"
# Result: "The  was broken" (backticks gone)
```

### Quick PR (No Description Needed)

```powershell
# Auto-fill from commit messages (safe, no markdown)
gh pr create --fill --base main
```

### Fixing a Mangled PR Description

If a PR was already created with broken formatting:

```powershell
# 1. Write corrected body to a temp file (use create_file tool)
# 2. Update the existing PR
gh pr edit <PR_NUMBER> --body-file ".github/tmp-pr-body.md"
# 3. Clean up
Remove-Item ".github/tmp-pr-body.md" -ErrorAction SilentlyContinue
```

## PR Body Template

When writing the temp PR body file, use this structure:

```markdown
## Summary

Brief overview of what this PR does.

## Jira Ticket

[LS-1234](https://legacysports.atlassian.net/browse/LS-1234)

## Problem

Description of the issue being fixed, with error messages in fenced code blocks.

## Root Cause

Technical explanation of why the issue occurred.

## Changes Made

- Change 1
- Change 2
- Change 3

## Testing Done

- [ ] Unit tests pass
- [ ] Manual testing completed
- [ ] Pre-commit validation passes
```

## Expected Output

- **Success**: PR URL printed to console
- **Pre-filled**: Title and body from provided content
- **Branch**: Current branch set as source, main as target

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

### Issue: PR body has broken formatting

**Solution**: You used `--body` inline. Re-create using `--body-file`:

```powershell
# Close the broken PR
gh pr close <PR_NUMBER>

# Recreate with --body-file
@"
Your markdown content here
"@ | Set-Content -Path "$env:TEMP\pr-body.md" -Encoding utf8
gh pr create --title "your title" --body-file "$env:TEMP\pr-body.md" --base main
```

## Best Practices

1. **Always use `--body-file`** for PR descriptions — never inline `--body` in PowerShell
2. **Use `create_file` tool** to write the temp .md file — it preserves backticks and special chars
3. **Never use PowerShell heredoc** (`@" "@`) for markdown with backticks — it strips them
4. **Run pre-commit validation** before creating PR (`make pre-commit`)
5. **Use conventional commit format** in the PR title: `type(scope): description`
6. **Link Jira ticket** in PR description
7. **Add screenshots** for UI changes
8. **Keep PRs focused** — split large changes into multiple PRs

## PR Title Format

```
type(scope): Brief description
```

**Examples**:

- `feat(db): add career statistics resolver`
- `fix(auth): fix OAuth token refresh issue`
- `docs(graphql): update GraphQL schema documentation`
- `fix(ci): fix invalid Playwright CLI options in E2E action`

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

# 4. Write PR body to a temp .md file (use create_file tool — NOT heredoc)
#    File: .github/tmp-pr-body.md

# 5. Create PR
gh pr create --title "feat(scope): description" --body-file ".github/tmp-pr-body.md" --base main

# 6. Clean up temp file
Remove-Item ".github/tmp-pr-body.md" -ErrorAction SilentlyContinue

# 7. Update Jira ticket
acli jira workitem transition --key LS-1234 --status "In Review"
```

### Before Creating PR Checklist

- [ ] **On a feature branch** (not `main`) — see [branch-create skill](../branch-create/SKILL.md)
- [ ] **Branch name contains a Jira ticket key** (e.g. `feature/LS-1234-…`)
- [ ] **Jira ticket exists and is accessible** (`acli jira workitem view LS-####`)
- [ ] All commits follow conventional commit format
- [ ] Type checking passes (`pnpm exec nx affected -t typecheck`)
- [ ] Linting passes (`pnpm exec nx affected -t lint --fix`)
- [ ] Tests pass (`pnpm exec nx affected -t test`)
- [ ] Build succeeds (`pnpm exec nx affected -t build`)
- [ ] Pre-commit hooks pass
- [ ] Jira ticket status is "In Progress"

### After Creating PR Checklist

- [ ] PR title references Jira ticket or uses conventional commit format
- [ ] PR description renders correctly (check in browser)
- [ ] Jira ticket updated to "In Review"
- [ ] Reviewers assigned
- [ ] Labels added (if needed)
- [ ] CI checks passing

## De-scoping Work

If PR becomes too large, consider splitting:

```powershell
# 1. Create follow-up ticket
acli jira workitem create --project LS --type "Story" `
  --summary "Follow-up: UI components" `
  --description "Work de-scoped from LS-ORIG"

# 2. Document in PR description
# "UI components de-scoped to LS-NEW (link)"

# 3. Update original ticket
acli jira workitem comment create --key LS-ORIG `
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

- **0**: PR created successfully
- **Non-zero**: Error occurred (check error message)

## Related Skills

- [Jira Ticket Management](jira-ticket.md) - Updating ticket status
- [Branch Creation](branch-create.md) - Creating branches
- [Pre-commit Validation](../../../docs/guides/ai-agent-contribution-workflow.md#step-4-pre-commit-validation)

## Related Documentation

- [AI Agent Contribution Workflow](../../../docs/guides/ai-agent-contribution-workflow.md#step-6-create-pull-request)
- [Development Workflow CSV](../../../docs/agents/development-workflow.csv)
