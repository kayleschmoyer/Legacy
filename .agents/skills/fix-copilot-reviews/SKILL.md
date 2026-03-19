---
name: fix-copilot-reviews
description: 'Batch-process all open PRs that have been reviewed by Copilot: for each PR with review comments, check out the branch in a worktree and fix every comment; for PRs with no review comments, add the merge-when-ready label. Use when asked to address Copilot review feedback across all PRs, batch-fix PR reviews, or auto-label clean PRs.'
---

# Skill: Fix Copilot Reviews (Batch)

## Overview

Iterate over every open PR that has been reviewed by GitHub Copilot.
For each PR, either **fix all review comments** or **label it for merge**.

## When to Use

- "Fix all Copilot review comments"
- "Address Copilot feedback on open PRs"
- "Label clean PRs as merge-when-ready"
- "Request Copilot reviews on PRs that don't have them"
- Periodic review-sweep before a release

## Workflow

### Step 0 — Discover PRs Reviewed by Copilot

```powershell
# List open PRs reviewed by Copilot (JSON array)
$prs = gh pr list --state open --json number,title,headRefName --limit 100 |
  ConvertFrom-Json

# For each PR, check if Copilot left a review
$reviewed = @()
foreach ($pr in $prs) {
  $reviews = gh api "repos/{owner}/{repo}/pulls/$($pr.number)/reviews?per_page=100" --paginate |
    ConvertFrom-Json
  $copilotReview = $reviews | Where-Object { $_.user.login -match 'copilot' }
  if ($copilotReview) {
    $reviewed += $pr
  }
}
Write-Host "Found $($reviewed.Count) PRs reviewed by Copilot"
```

### Step 1 — Classify: Comments vs Clean

For each Copilot-reviewed PR, fetch the review threads to determine if there
are **unresolved, non-outdated** review comments.

```powershell
# Resolve owner/repo once from the current repo
$repoInfo = gh repo view --json owner,name | ConvertFrom-Json
$owner = $repoInfo.owner.login
$repo = $repoInfo.name

$toFix = @()   # collect { pr, threads } objects for Step 2

foreach ($pr in $reviewed) {
  # Use GraphQL to get review threads (same query the merge-queue uses)
  $query = @'
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 50) {
            nodes {
              author { login }
              body
              path
              line
            }
          }
        }
      }
    }
  }
}
'@

  $result = gh api graphql -f query="$query" `
    -f owner=$owner -f repo=$repo -F number=$($pr.number) |
    ConvertFrom-Json

  $threads = $result.data.repository.pullRequest.reviewThreads.nodes
  # Filter to unresolved, non-outdated threads authored by Copilot
  $unresolved = $threads | Where-Object {
    -not $_.isResolved -and -not $_.isOutdated -and
    ($_.comments.nodes | Where-Object { $_.author.login -match 'copilot' })
  }

  if ($unresolved.Count -eq 0) {
    # --- CLEAN PR → label for merge ---
    Write-Host "PR #$($pr.number) ($($pr.title)) — no comments, adding merge-when-ready"
    gh pr edit $pr.number --add-label "merge-when-ready"
  } else {
    # --- HAS COMMENTS → collect them for fixing ---
    Write-Host "PR #$($pr.number) ($($pr.title)) — $($unresolved.Count) unresolved comment(s)"
    $toFix += @{ pr = $pr; threads = $unresolved }
  }
}
```

### Step 2 — Fix Review Comments (per PR)

For each entry in `$toFix`, create a worktree (or use the existing one)
and address every comment:

```powershell
foreach ($entry in $toFix) {
  $pr = $entry.pr
  $unresolved = $entry.threads
```

1. **Check out the branch in a worktree**

   ```powershell
   $branch = $pr.headRefName          # e.g. "LS-1134/upgrade-tamagui"

   # Get or create the worktree (idempotent):
   Set-Location D:\code\legacy-sports
   $wtPath = .\scripts\pr-enter-worktree.ps1 -Branch $branch
   Set-Location $wtPath
   ```

2. **Read each unresolved comment** — the comment includes `path`, `line`,
   and `body` (the review feedback). Open the file at that line and apply
   the requested fix.

3. **Validate after all fixes**

   ```powershell
   make pc
   ```

4. **Commit & push**

   ```powershell
   git add -A
   git commit -m "fix: address Copilot review comments"
   git push origin HEAD
   ```

5. **Resolve the review threads** — after pushing, resolve each thread
   so the PR shows all feedback as addressed:

   ```powershell
   Set-Location D:\code\legacy-sports
   .\scripts\resolve-review-threads.ps1 -PRNumber $pr.number
   ```

6. **End of loop** — the `foreach ($entry in $toFix)` block repeats
   steps 1–5 for every PR with unresolved comments.

   ```powershell
   }  # end foreach ($entry in $toFix)
   ```

### Step 2b — Re-resolve threads after push

Copilot often **re-reviews** after you push, creating new threads on the same
or nearby lines. After Step 2's commit & push (step 5 in the loop), re-run the
resolve script inside the per-PR loop so each PR is cleaned up before moving on:

```powershell
# Inside the foreach ($entry in $toFix) loop, after push:
Set-Location D:\code\legacy-sports
.\scripts\resolve-review-threads.ps1 -PRNumber $entry.pr.number
```

### Step 2c — Batch-scale considerations

When fixing >10 PRs in a single session:

- **Skip `make pc` per PR** — `git commit --no-verify` bypasses git hooks
  (e.g., Prettier), but does **not** replace `make pc`. At batch scale,
  skip `make pc` on each individual PR and rely on CI to catch issues.
  Optionally run `make pc` once at the end on a spot-check PR.
- **Loop sequentially in the main conversation** — process each PR one at a
  time in the main conversation context (which has the required tool
  permissions). Do **not** use sub-agents for parallel execution — sub-agents
  do not inherit the parent conversation's tool permissions (command
  execution, file read/write, etc.) and will fail with permission-denied
  errors.
- **Re-resolve after all pushes** — Copilot re-reviews trigger new threads.
  Do a final sweep of all PR numbers after all fixes are pushed.

### Step 3 — Summary

After processing every PR, print a summary table:

| PR   | Title              | Action           | Result                   |
| ---- | ------------------ | ---------------- | ------------------------ |
| #123 | feat(scoring): ... | Fixed 3 comments | pushed                   |
| #124 | fix(ui): ...       | No comments      | labeled merge-when-ready |

## Requesting Copilot Reviews on PRs That Don't Have Them

If the user asks to "add Copilot reviews" to PRs, find PRs **without** a
Copilot review and request one via the GitHub API.

> **IMPORTANT:** `gh pr edit --add-reviewer copilot` and `-f 'reviewers[]=copilot'`
> do **NOT** work. Copilot's actual bot login is `copilot-pull-request-reviewer[bot]`.
> You must pipe a JSON body with the full bot login.

```powershell
# Find PRs without a Copilot review
$prs = gh pr list --state open --json number,title,headRefName --limit 100 | ConvertFrom-Json
$noReview = @()
foreach ($pr in $prs) {
  $reviews = gh api --paginate "repos/{owner}/{repo}/pulls/$($pr.number)/reviews?per_page=100" 2>$null | ConvertFrom-Json
  $copilotReview = $reviews | Where-Object { $_.user.login -eq 'copilot-pull-request-reviewer[bot]' }
  if (-not $copilotReview) { $noReview += $pr }
}

# Request Copilot review on each
$body = '{"reviewers":["copilot-pull-request-reviewer[bot]"]}'
foreach ($pr in $noReview) {
  $response = echo $body | gh api "repos/{owner}/{repo}/pulls/$($pr.number)/requested_reviewers" --method POST --input - 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Requested Copilot review on PR #$($pr.number)"
  } else {
    Write-Warning "Failed to request Copilot review on PR #$($pr.number) (exit code $LASTEXITCODE). Response:`n$response"
  }
}
```

## Common Copilot Review Patterns (Top 10)

The most frequent Copilot review issues — knowing these speeds up fixes significantly.

> Full pattern table + code examples: [references/common-review-patterns.md](references/common-review-patterns.md)

| #   | Pattern                          | Quick Fix                                                |
| --- | -------------------------------- | -------------------------------------------------------- |
| 1   | Wrong `jest.doMock` module path  | Use `@legacy-sports/utils/node` + `requireActual` spread |
| 2   | Broad `postData.includes()`      | Use quoted `'"op"'` or `extractOperationName()` helper   |
| 3   | Header overclaims coverage       | Audit test names, trim header                            |
| 4   | Missing UNAUTHENTICATED test     | Add `user: null` test                                    |
| 5   | `route.fallback()` leaks         | Use `route.fulfill()`                                    |
| 6   | `LOGGER.error({ error })`        | Pass Error as direct arg                                 |
| 7–8 | Wrong mock structure/field names | Wrap in `{ data: { ... } }`, check `.graphql` files      |
| 9   | Test name ≠ assertion            | Rename test                                              |
| 10  | Process/scope comments           | Resolve thread directly — no code change                 |

## Important Notes

- **Never force-push someone else's branch** without checking that the
  worktree matches the PR's head SHA. Pull first if the remote is ahead.
- **Run `make pc` before pushing** — the standard validation rule still
  applies for every fix commit. At batch scale (>10 PRs), you can skip
  `make pc` on individual PRs and rely on CI validation. Note that
  `git commit --no-verify` only bypasses git hooks (e.g., Prettier) —
  it does not replace `make pc` or any CI checks.
- If a review comment is unclear or requires a design decision, **skip it**
  and leave a reply on the thread explaining why: `gh api ... --method POST`.
- Only add `merge-when-ready`. Do **not** add or remove `merge-to-parent` —
  that label is managed by users, and we prefer to only auto-merge into main.

## Related Skills

- [Create PR](../create-pr/SKILL.md)
- [Worktree Workflow](../worktree-workflow/SKILL.md)
- [Rebase & Conflicts](../rebase-conflicts/SKILL.md)
- [Fix Lint](../fix-lint/SKILL.md)
- [Fix Types](../fix-types/SKILL.md)
