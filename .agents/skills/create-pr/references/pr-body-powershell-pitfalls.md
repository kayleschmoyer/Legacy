# PowerShell PR Body Pitfalls

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
'{"reviewers":["copilot-pull-request-reviewer[bot]"]}' | gh api "repos/{owner}/{repo}/pulls/$prNumber/requested_reviewers" --method POST --input -

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
