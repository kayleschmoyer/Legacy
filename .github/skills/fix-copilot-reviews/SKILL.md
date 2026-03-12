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

   # Ensure we're in the main repo for twig/make commands
   Set-Location D:\code\legacy-sports

   # Derive worktree path from twig (never hard-code)
   $escapedBranch = [regex]::Escape($branch)
   $wtPath = twig worktree list `
     | Where-Object { $_ -match $escapedBranch } `
     | ForEach-Object { ($_ -split '\s+')[0] } `
     | Select-Object -First 1

   if (-not $wtPath) {
     twig worktree create $branch
     $wtPath = twig worktree list `
       | Where-Object { $_ -match $escapedBranch } `
       | ForEach-Object { ($_ -split '\s+')[0] } `
       | Select-Object -First 1
     make wt-setup WT=$wtPath
   }
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
   so the PR shows all feedback as addressed. Uses the `$entry.threads`
   collected in Step 1 (each thread object has an `id` field).

   ```powershell
   # $entry.threads was collected in Step 1 — each object has an `id` field
   foreach ($thread in $entry.threads) {
     $mutation = @'
   mutation($threadId: ID!) {
     resolveReviewThread(input: { threadId: $threadId }) {
       thread { isResolved }
     }
   }
   '@
     gh api graphql -f query="$mutation" -f threadId=$($thread.id) | Out-Null
     Write-Host "  Resolved thread $($thread.id)"
   }
   ```

6. **End of loop** — the `foreach ($entry in $toFix)` block repeats
   steps 1–5 for every PR with unresolved comments.

   ```powershell
   }  # end foreach ($entry in $toFix)
   ```

### Step 3 — Summary

After processing every PR, print a summary table:

| PR   | Title              | Action           | Result                   |
| ---- | ------------------ | ---------------- | ------------------------ |
| #123 | feat(scoring): ... | Fixed 3 comments | pushed                   |
| #124 | fix(ui): ...       | No comments      | labeled merge-when-ready |

## Important Notes

- **Never force-push someone else's branch** without checking that the
  worktree matches the PR's head SHA. Pull first if the remote is ahead.
- **Run `make pc` before pushing** — the standard validation rule still
  applies for every fix commit.
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
