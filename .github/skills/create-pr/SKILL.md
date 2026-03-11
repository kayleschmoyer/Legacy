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

> **Epic-level work**: If the branch contains artifacts that belong to a parent epic
> (e.g., design docs spanning multiple child tickets), the branch should have been
> created with the **epic's** ticket key — not a child task key. If you discover
> epic-scoped work on a child-task branch, use the epic key in the PR title
> (e.g., `LS-640 docs: salary cap design`) and reference the epic in the body.
> Prefer avoiding this by creating a dedicated epic worktree upfront
> (see worktree-workflow skill, "Epic-Level Work").

### 3. Pending Migrations Must Be Applied

If a migration file was added or modified as part of this work, apply it before creating the PR:

```powershell
# From the worktree root
pnpm run db:migrate
```

Verify the output includes `✅ Applied N new migrations` (or `No pending migrations` if none exist). A PR that adds a migration file without applying it will cause runtime failures on the next deploy.

> **When to run:** Any time a file exists under `lib/db-client/migrations/` that was created or modified in this branch.

### 4. Affected E2E Tests Must Pass

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

# Request Copilot review via the GitHub API (--reviewer copilot does NOT work)
$prNumber = gh pr view --json number --jq .number
gh api "repos/{owner}/{repo}/pulls/$prNumber/requested_reviewers" --method POST -f 'reviewers[]=copilot'
```

> **Why request Copilot review?** Copilot reviews run instantly, surface issues before human reviewers look at the PR, and are required by team convention.
>
> **Note**: `--reviewer copilot` on `gh pr create` does **not** work — Copilot is not a regular GitHub user. Always use the `gh api` call shown above after creating the PR.

> **Alternative (human-only, opens browser):** `twig github pr create-pr`
> Twig auto-fills the PR from Jira — convenient for humans but not usable by agents.

## Requesting Copilot Review

Every PR must have a Copilot code review requested. Use the GitHub API **after** creating the PR:

```powershell
# Request Copilot review (run immediately after gh pr create)
$prNumber = gh pr view --json number --jq .number
gh api "repos/{owner}/{repo}/pulls/$prNumber/requested_reviewers" --method POST -f 'reviewers[]=copilot'
```

> **Do NOT use `--reviewer copilot`** on `gh pr create` — it fails because Copilot is not a regular GitHub user account. The API call above is the only reliable method.

**Manual fallback (web UI):** Open the PR in the browser → Reviewers sidebar → gear icon → select "Copilot".

Copilot reviews are non-blocking — they run asynchronously and do not gate the PR merge. However they must be **requested** on every PR so the feedback is available to human reviewers.

## 🚨 CRITICAL: Always Use --body-file, Never --body

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
gh pr create --title "LS-#### fix(scope): description" --body-file ".github/tmp-pr-body.md" --base main

# 3. Request Copilot review via API
$prNumber = gh pr view --json number --jq .number
gh api "repos/{owner}/{repo}/pulls/$prNumber/requested_reviewers" --method POST -f 'reviewers[]=copilot'

# 4. Clean up the temp file
.\scripts\cleanup-pr-body.ps1
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

# BAD - `twig pr` is NOT a valid twig command; it produces an error, not a PR body
twig pr > .github/tmp-pr-body.md
# Result: the file contains the twig error message, not a PR description

# BAD - PowerShell's `>` operator writes UTF-16LE (null byte after every char)
# Even if the command succeeded, the file would be unreadable by gh pr create
some-command > .github/tmp-pr-body.md
# ALWAYS use Out-File -Encoding utf8 or, better, the create_file tool
```

> **Root cause of PR #878's garbled description**: `twig pr > .github/tmp-pr-body.md` was run.
> `twig` has no `pr` subcommand, so it wrote an error message to the file. PowerShell's `>`
> operator encoded that error in UTF-16LE (a null byte after every character), producing the
> `^@F^@i^@x^@e^@s^@...` output visible in the PR body. **Always use `create_file` to write
> the PR body — never shell-redirect into the file.**

### 🚨 Do NOT Escape Backticks in PR Body Content

When writing the PR body markdown (via `create_file` or any method), use **plain backtick characters** for inline code — never write `\`` (backslash + backtick).

| ❌ Wrong               | ✅ Correct               |
| ---------------------- | ------------------------ |
| `\`git worktree add\`` | `` `git worktree add` `` |
| `\`make install\``     | `` `make install` ``     |
| `\.env\``              | `` `.env` ``             |

Escaped backticks (`\``) render as a literal backslash followed by an invisible code delimiter, producing output like `\git worktree add\` instead of the intended inline code.

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
.\scripts\cleanup-pr-body.ps1
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

**Solution**: Use the `create_file` tool to write a correct `.github/tmp-pr-body.md`, then update the existing PR body with `gh pr edit` — **do not close and recreate**:

```powershell
# 1. Use create_file tool to write the correct markdown to .github/tmp-pr-body.md
#    (never use @" "@ heredoc or shell redirection — both corrupt backticks/encoding)

# 2. Update the existing PR body in-place
gh pr edit <PR_NUMBER> --body-file ".github/tmp-pr-body.md"

# 3. Clean up
.\scripts\cleanup-pr-body.ps1
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

## Best Practices

1. **Always use `--body-file`** for PR descriptions — never inline `--body` in PowerShell
2. **Always request Copilot review** via `gh api` after `gh pr create` — `--reviewer copilot` does not work (see [Requesting Copilot Review](#requesting-copilot-review))
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

## UI Screenshots

Any PR that changes a visible UI element **must include screenshots** in the PR description. This applies to:

- New pages, screens, or components
- Layout or spacing changes
- Color, font, or styling updates
- Loading states, empty states, or error states
- Mobile vs desktop layout differences
- Conditional UI (e.g. different views for commissioner vs player, logged-in vs guest)

### What to Capture

For each changed screen or component, show **Before** and **After** states. If the feature is entirely new (no "before"), show the new design with a clear label. Include:

- The full screen/page when the context matters
- Zoomed-in crops when the change is small or hard to see at full size
- Both mobile and desktop views if the layout differs across breakpoints
- Any interactive states that were changed (hover, active, disabled, error)

### How to Take Screenshots

**Web (Next.js app):**

```powershell
# Start the local dev server
npm run dev:web
# Open http://localhost:3000 in a browser and use the browser's built-in
# screenshot tool (F12 → ... → Capture screenshot) or OS snipping tool
```

**Browser DevTools responsive mode** — use to capture mobile breakpoints:

1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select a device preset (e.g. iPhone 14, Pixel 7)
4. Take a screenshot from the DevTools camera icon

**Playwright (automated screenshot for regression reference):**

```powershell
pnpm exec nx run web-e2e:e2e --headed
# Screenshots saved to test-results/
```

### How to Embed Screenshots in the PR Body

GitHub renders images pasted directly into the markdown editor, or referenced via URL:

```markdown
## Screenshots

### League Overview Page

**Before:**

![Before](https://github.com/user-attachments/assets/...)

**After:**

![After](https://github.com/user-attachments/assets/...)
```

When writing the PR body via an **agent** (using `create_file`):

1. Take screenshots locally and upload them to the PR draft (via browser) to get GitHub asset URLs, **or**
2. Use the Playwright MCP browser tool to navigate to the running dev server and capture a screenshot, then embed it:

```markdown
<!-- Agent workflow: use the Playwright browser tool to open the dev server,
     navigate to the changed page, and call browser_take_screenshot to capture
     the current state. Then embed the resulting file path or GitHub URL here. -->
```

### Screenshot Checklist

Before creating the PR, confirm:

- [ ] Identified all files touching JSX/TSX/styles in the diff
- [ ] Captured before/after screenshots for each changed screen
- [ ] Screenshots are embedded in the `## Screenshots` section of the PR body
- [ ] Mobile and desktop views included when layout differs

### When Screenshots Are Not Required

Skip the Screenshots section only when **all** of the following are true:

- The PR contains zero changes to `.tsx`, `.jsx`, `.css`, `.module.css`, Tamagui, or style-related files
- No new routes, pages, or components are added
- No changes to loading/empty/error states

If uncertain, include screenshots — reviewers always benefit from visual context.

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
gh api "repos/{owner}/{repo}/pulls/$prNumber/requested_reviewers" --method POST -f 'reviewers[]=copilot'

# 6. Clean up temp file
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

- [Jira Ticket Management](jira-ticket.md) - Updating ticket status
- [Branch Creation](branch-create.md) - Creating branches
- [Pre-commit Validation](../../../docs/guides/ai-agent-contribution-workflow.md#step-4-pre-commit-validation)

## Related Documentation

- [AI Agent Contribution Workflow](../../../docs/guides/ai-agent-contribution-workflow.md#step-6-create-pull-request)
- [Development Workflow CSV](../../../docs/agents/development-workflow.csv)
