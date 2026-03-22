# Fix Copilot Reviews — Batch Workflow

Detailed batch workflow for fixing Copilot review comments across all open PRs.

## Step 0 — Discover PRs Reviewed by Copilot

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

## Step 1 — Find PRs With Unresolved Comments

For each Copilot-reviewed PR, fetch the review threads and collect those with
unresolved, non-outdated comments. PRs with no comments are skipped — the
`copilot-auto-approve` workflow handles approval and labeling automatically.

```powershell
$toFix = @()   # collect { pr, threads } objects for Step 2

foreach ($pr in $reviewed) {
  # Use MCP tool (preferred): github_get_review_threads(number: $pr.number, unresolvedOnly: true)
  # Or GraphQL fallback:
  $repoInfo = gh repo view --json owner,name | ConvertFrom-Json
  $owner = $repoInfo.owner.login
  $repo = $repoInfo.name

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
  $unresolved = $threads | Where-Object {
    -not $_.isResolved -and -not $_.isOutdated -and
    ($_.comments.nodes | Where-Object { $_.author.login -match 'copilot' })
  }

  if ($unresolved.Count -gt 0) {
    Write-Host "PR #$($pr.number) ($($pr.title)) — $($unresolved.Count) unresolved comment(s)"
    $toFix += @{ pr = $pr; threads = $unresolved }
  } else {
    Write-Host "PR #$($pr.number) ($($pr.title)) — clean (bot handles approval)"
  }
}
```

## Step 2 — Fix Review Comments (per PR)

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

### Re-resolve threads after push

Copilot often **re-reviews** after you push, creating new threads on the same
or nearby lines. After the commit & push, re-run the resolve script inside the
per-PR loop so each PR is cleaned up before moving on:

```powershell
# Inside the foreach ($entry in $toFix) loop, after push:
Set-Location D:\code\legacy-sports
.\scripts\resolve-review-threads.ps1 -PRNumber $entry.pr.number
```

### Batch-scale considerations

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

## Step 3 — Summary

After processing every PR, print a summary table:

| PR   | Title              | Action           | Result                      |
| ---- | ------------------ | ---------------- | --------------------------- |
| #123 | feat(scoring): ... | Fixed 3 comments | pushed (bot will re-review) |
| #124 | fix(ui): ...       | No comments      | skipped (bot handles it)    |

## Common Copilot Review Patterns (Top 10)

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

> Full pattern details + code examples: [common-review-patterns.md](common-review-patterns.md)

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
- **Do not manually add `merge-when-ready`** — the `copilot-auto-approve` bot adds it
  automatically when Copilot's review is clean after your fixes are pushed.
