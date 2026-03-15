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

### Step 2b — Re-resolve threads after push

Copilot often **re-reviews** after you push, creating new threads on the same
or nearby lines. After Step 2's commit & push (step 5 in the loop), re-fetch
thread IDs and resolve any new unresolved threads. Call this **inside** the
per-PR loop so each PR is cleaned up before moving on:

```powershell
# Define once, before the loop
$repoInfo = gh repo view --json owner,name | ConvertFrom-Json
$owner = $repoInfo.owner.login
$repo = $repoInfo.name

function Resolve-PRThreads($prNum) {
  $q = @"
query(\`$owner:String!,\`$repo:String!,\`$number:Int!) {
  repository(owner:\`$owner,name:\`$repo) {
    pullRequest(number:\`$number) {
      reviewThreads(first:100) { nodes { id isResolved } }
    }
  }
}
"@
  $result = gh api graphql -f query=$q -f owner=$owner -f repo=$repo -F number=$prNum 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Warning "Failed to fetch threads for PR #$prNum"; return }
  $ids = ($result | ConvertFrom-Json).data.repository.pullRequest.reviewThreads.nodes |
    Where-Object { -not $_.isResolved } | Select-Object -ExpandProperty id
  if ($ids) {
    $ids | ForEach-Object {
      gh api graphql -f query='mutation($t:ID!){resolveReviewThread(input:{threadId:$t}){thread{isResolved}}}' -f t=$_ | Out-Null
    }
    Write-Host "Resolved $($ids.Count) threads on PR #$prNum"
  }
}

# Inside the foreach ($entry in $toFix) loop, after push:
Resolve-PRThreads $entry.pr.number
```

> **GraphQL variable syntax matters**: Use `-f t=$threadId` with `mutation($t:ID!)`,
> NOT string interpolation inside the query. Interpolating raw IDs is error-prone
> due to quoting/escaping issues — variables avoid this entirely.

### Step 2c — Batch-scale considerations

When fixing >10 PRs in a single session:

- **Skip `make pc` per PR** — `git commit --no-verify` bypasses git hooks
  (e.g., Prettier), but does **not** replace `make pc`. At batch scale,
  skip `make pc` on each individual PR and rely on CI to catch issues.
  Optionally run `make pc` once at the end on a spot-check PR.
- **Use subagents** — delegate each PR fix to a subagent for parallel
  execution. Each subagent: checkout → read → fix → commit → push.
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

These issues appear in 80%+ of Copilot reviews. Knowing them speeds up fixes:

| #   | Pattern                                                        | Fix                                                                         |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | `jest.doMock('@legacy-sports/utils', ...)` for `getDbOptions`  | Change to `@legacy-sports/utils/node` + `...jest.requireActual(...)` spread |
| 2   | `postData.includes('getleague')` matches `getLeagueTeams` etc. | Use quoted `'"getleague"'` or reorder specific-first                        |
| 3   | Header comment overclaims test coverage                        | Audit actual test names and trim header to match                            |
| 4   | Missing UNAUTHENTICATED guard test                             | Add test calling resolver with `user: null`, assert `UNAUTHENTICATED`       |
| 5   | `route.fallback()` leaks to real network                       | Replace with `route.fulfill({ json: { data: {} } })`                        |
| 6   | `LOGGER.error({ error })` — Rollbar ignores wrapped object     | Use `LOGGER.error('message', error)` with Error as direct arg               |
| 7   | `data: null` mock response                                     | Use `{ data: { queryName: null } }` or `{ data: { queryName: [] } }`        |
| 8   | Wrong GraphQL field names in mocks                             | Check actual `.graphql` query files for correct field names                 |
| 9   | Test name doesn't match assertion                              | Rename test to describe what it actually asserts                            |
| 10  | Process/scope comments (PR title, splitting)                   | Resolve thread directly — no code change needed                             |

### Pattern Details with Citations

**#1 — jest.doMock wrong module path**

`getDbOptions` lives in `@legacy-sports/utils/node`, not `@legacy-sports/utils` (the browser-compatible root). Mocking only `getDbOptions` without spreading other exports also breaks sibling imports.

```typescript
// ❌ Wrong — browser-compatible root, no spread
jest.doMock('@legacy-sports/utils', () => ({ getDbOptions: jest.fn() }));

// ✅ Correct — Node-specific path with requireActual spread
jest.doMock('@legacy-sports/utils/node', () => ({
  ...jest.requireActual('@legacy-sports/utils/node'),
  getDbOptions: jest.fn(),
}));
```

Reference: `lambdas/db/src/schema/playoff.resolver.spec.ts` for correct pattern.

**#2 — Broad postData.includes() matching**

A check like `postData.includes('getleague')` matches `getleagueteams`, `getleaguemembers`, etc. Use `extractOperationName()` from `apps/web-e2e/src/fixtures/shared-mocks.ts` or quote the operation name.

```typescript
// ❌ Matches getleague, getleagueteams, getleaguemembers...
if (postData.includes('getleague')) { ... }

// ✅ Exact match via quoted JSON field
if (postData.includes('"getleague"')) { ... }

// ✅ Best — use the helper
const op = extractOperationName(route);
if (op === 'GetLeague') { ... }
```

**#5 — route.fallback() in the wrong layer**

Within the 3-layer mock architecture (test → auth.ts → baseline), test handlers should use `route.fallback()` to cascade to the next layer — this is correct. But `route.continue()` is **always forbidden** in E2E tests. See `skills/e2e-testing/SKILL.md` for the full layer architecture.

**#6 — LOGGER.error() error wrapping**

`RollbarOutputDestination` scans args for `arg instanceof Error` to extract stack traces. Wrapping in `{ error }` hides the Error instance.

```typescript
// ❌ Rollbar synthesizes generic Error, loses stack trace
LOGGER.error('Failed to load', { error });

// ✅ Rollbar extracts original stack trace
LOGGER.error('Failed to load', error);
LOGGER.error('Failed to load', error, { userId });
```

Reference: `lib/rollbar/src/lib/RollbarOutputDestination.ts` lines 33–34. See also `skills/fix-lint/SKILL.md` and `skills/fix-bugs/SKILL.md`.

**#7 — Mock response data structure**

Apollo client expects `response.data.operationName`, not `response.operationName`. Always wrap in `{ data: { ... } }`. Check `apps/web-e2e/src/fixtures/shared-mocks.ts` for correct baseline patterns.

```typescript
// ❌ Missing data wrapper
route.fulfill({ json: { getLeagueById: null } });

// ✅ Correct structure
route.fulfill({ json: { data: { league: null } } });
```

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
