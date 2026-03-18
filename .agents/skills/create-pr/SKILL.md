---
name: create-pr
description: 'Create a pull request with automatic Jira linkage and PR template population. Use after completing work on a feature branch and passing make pc validation.'
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
# See: .agents/skills/branch-create/SKILL.md
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

> **Epic-level work**: If the branch contains artifacts that belong to a parent epic
> (e.g., design docs spanning multiple child tickets), the branch should have been
> created with the **epic's** ticket key — not a child task key. If you discover
> epic-scoped work on a child-task branch, use the epic key in the PR title
> (e.g., `LS-640 docs: salary cap design`) and reference the epic in the body.
> Prefer avoiding this by creating a dedicated epic worktree upfront
> (see worktree-workflow skill, "Epic-Level Work").

### 3. Changed Files Must Be Formatted

CI runs Prettier on every changed file. If any file fails the formatting check, the entire Quality Gates job fails — even for docs-only PRs.

```powershell
# From the worktree root (requires node_modules via make wt-setup)
pnpm exec prettier --check .

# Fix any issues
pnpm exec prettier --write <files>
```

> **No `node_modules` in the worktree?** Use the main repo's Prettier directly:
>
> ```powershell
> node D:\code\legacy-sports\node_modules\prettier\bin\prettier.cjs --check .
> ```

> **Why this catches what `--no-verify` misses:** Pre-commit hooks run Prettier automatically, but `git commit --no-verify` skips them. If you used `--no-verify`, you must check formatting manually before pushing.

### 4. Pending Migrations Must Be Applied

If a migration file was added or modified as part of this work, apply it before creating the PR:

```powershell
# From the worktree root
pnpm run db:migrate
```

Verify the output includes `✅ Applied N new migrations` (or `No pending migrations` if none exist). A PR that adds a migration file without applying it will cause runtime failures on the next deploy.

> **When to run:** Any time a file exists under `lib/db-client/migrations/` that was created or modified in this branch.

### 5. Affected E2E Tests Must Pass

Before creating the PR, run all E2E tests affected by your changes:

```powershell
pnpm exec nx affected -t e2e --base=origin/main
```

If no e2e project is affected (pure back-end / library change), the command exits immediately — this is fine. If tests fail, fix them first before continuing.

> **Why this is required:** `make pc` (unit tests + lint + typecheck) does not run Playwright tests. E2E failures that land in CI block the entire PR queue and force reviewers back into your context.

## Command

```powershell
# Create PR using GitHub CLI with --body-file (preferred — works for both humans and agents)
gh pr create --title "LS-#### type(scope): description" --body-file ".github/tmp-pr-body.md" --base main

# Request Copilot review via the GitHub API
# IMPORTANT: --reviewer copilot and -f 'reviewers[]=copilot' do NOT work.
# You must pipe a JSON body with the full bot login:
$prNumber = gh pr view --json number --jq .number
'{"reviewers":["copilot-pull-request-reviewer[bot]"]}' | gh api "repos/{owner}/{repo}/pulls/$prNumber/requested_reviewers" --method POST --input -
```

> **Why request Copilot review?** Copilot reviews run instantly, surface issues before human reviewers look at the PR, and are required by team convention.
>
> **Note**: Neither `--reviewer copilot` on `gh pr create` nor `-f 'reviewers[]=copilot'` works — Copilot is a bot account (`copilot-pull-request-reviewer[bot]`), not a regular GitHub user. Always pipe JSON with the full bot login as shown above.

> **Alternative (human-only, opens browser):** `twig github pr create-pr`
> Twig auto-fills the PR from Jira — convenient for humans but not usable by agents.

## Requesting Copilot Review

Every PR must have a Copilot code review requested. Use the GitHub API **after** creating the PR:

```powershell
# Request Copilot review (run immediately after gh pr create)
$prNumber = gh pr view --json number --jq .number
'{"reviewers":["copilot-pull-request-reviewer[bot]"]}' | gh api "repos/{owner}/{repo}/pulls/$prNumber/requested_reviewers" --method POST --input -
```

> **Do NOT use `--reviewer copilot`** on `gh pr create` or `-f 'reviewers[]=copilot'` — neither works because Copilot is a bot account (`copilot-pull-request-reviewer[bot]`), not a regular GitHub user. You must pipe a JSON body with the full bot login as shown above.

**Manual fallback (web UI):** Open the PR in the browser → Reviewers sidebar → gear icon → select "Copilot".

Copilot reviews are non-blocking — they run asynchronously and do not gate the PR merge. However they must be **requested** on every PR so the feedback is available to human reviewers.

> 📎 **PowerShell --body-file pitfalls** (why --body-file is required, encoding issues, heredoc traps, fixing garbled descriptions, backtick escaping): see [references/pr-body-powershell-pitfalls.md](references/pr-body-powershell-pitfalls.md)

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

## Screenshots

<!-- Include screenshots for any UI changes. Delete this section if there are no UI changes. -->

<!-- For each changed screen, show Before and After side by side or stacked: -->

### <Screen or Feature Name>

**Before:**

<!-- Paste screenshot here -->

**After:**

<!-- Paste screenshot here -->

## Testing Done

- [ ] GraphQL schema regenerated (`pnpm exec nx run db:print-schema`)
- [ ] Codegen types regenerated (`pnpm exec nx affected -t codegen`)
- [ ] Unit tests pass
- [ ] Affected E2E tests pass (`pnpm exec nx affected -t e2e --base=origin/main`)
- [ ] Manual testing completed
- [ ] Pre-commit validation passes (`make pre-commit`)
- [ ] Pending migrations applied (`pnpm run db:migrate`) — required if any migration files were added or changed
- [ ] Screenshots included for all UI changes (if applicable)
```

## Expected Output

- **Success**: PR URL printed to console
- **Pre-filled**: Title and body from provided content
- **Branch**: Current branch set as source, main as target

> 📎 **Common PR issues** (branch not pushed, no commits, twig not configured, broken formatting, null byte encoding): see [references/pr-common-issues.md](references/pr-common-issues.md)

## Best Practices

1. **Always use `--body-file`** for PR descriptions — never inline `--body` in PowerShell
2. **Always request Copilot review** via `gh api` with piped JSON body after `gh pr create` — neither `--reviewer copilot` nor `-f 'reviewers[]=copilot'` works (see [Requesting Copilot Review](#requesting-copilot-review))
3. **Use `create_file` tool** to write the temp .md file — it preserves backticks and special chars
4. **Never use PowerShell heredoc** (`@" "@`) for markdown with backticks — it strips them
5. **Never escape backticks** in the PR body content — write `` `code` `` not `\`code\`` (escaped backticks render as backslashes)
6. **Never use shell redirection (`>`)** to create the PR body file — PowerShell writes UTF-16LE; use `create_file` instead
7. **`twig pr` is not a valid command** — do not attempt to generate the PR body via twig; write it directly with `create_file`
8. **Verify the file before using it** — `Get-Content .github/tmp-pr-body.md | Select-Object -First 5` to confirm it looks like markdown, not an error
9. **Run pre-commit validation** before creating PR (`make pre-commit`)
10. **Run affected E2E tests** before creating PR (`pnpm exec nx affected -t e2e --base=origin/main`)
11. **Prefix PR title with Jira ticket key**: `LS-#### type(scope): description`
12. **Link Jira ticket** in PR description
13. **Add screenshots for every UI change** — see [UI Screenshots](#ui-screenshots) section below
14. **Keep PRs focused** — split large changes into multiple PRs

> 📎 **UI screenshot guidelines** (what to capture, how to take/embed screenshots, checklist, when to skip): see [references/pr-ui-screenshots.md](references/pr-ui-screenshots.md)

## PR Title Format

```
LS-#### type(scope): Brief description
```

Always prefix the title with the Jira ticket key so GitHub, Jira, and reviewers
can immediately trace the PR back to its ticket.

**Examples**:

- `LS-1234 feat(db): add career statistics resolver`
- `LS-1235 fix(auth): fix OAuth token refresh issue`
- `LS-1236 docs(graphql): update GraphQL schema documentation`
- `LS-1237 fix(ci): fix invalid Playwright CLI options in E2E action`

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
gh pr create --title "LS-1234 feat(scope): description" --body-file ".github/tmp-pr-body.md" --base main

# 6. Request Copilot review via API
$prNumber = gh pr view --json number --jq .number
'{"reviewers":["copilot-pull-request-reviewer[bot]"]}' | gh api "repos/{owner}/{repo}/pulls/$prNumber/requested_reviewers" --method POST --input -

# 7. Clean up temp file
.\scripts\cleanup-pr-body.ps1

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
- [ ] **Screenshots included** for all UI changes (see [UI Screenshots](#ui-screenshots))

### After Creating PR Checklist

- [ ] PR title includes Jira ticket key prefix (e.g. `LS-1234 feat(scope): description`)
- [ ] PR description renders correctly (check in browser)
- [ ] Jira ticket updated to "In Review"
- [ ] Copilot review requested (via `gh api` call after PR creation)
- [ ] Human reviewers assigned (if required)
- [ ] Labels added (if needed)
- [ ] `make pc` passes locally (do not wait on GitHub CI — verify locally)

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

# Verify checks locally (preferred over waiting on GitHub CI)
make pc
```

## Exit Codes

- **0**: PR created successfully
- **Non-zero**: Error occurred (check error message)

## Related Skills

- [Jira Ticket Management](../jira-ticket/SKILL.md) - Updating ticket status
- [Branch Creation](../branch-create/SKILL.md) - Creating branches
- [Pre-commit Validation](../../../docs/guides/ai-agent-contribution-workflow.md#step-4-pre-commit-validation)

## Related Documentation

- [AI Agent Contribution Workflow](../../../docs/guides/ai-agent-contribution-workflow.md#step-6-create-pull-request)
- [Development Workflow CSV](../../../docs/agents/development-workflow.csv)
