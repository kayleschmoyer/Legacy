---
mode: 'agent'
description: "Fix all unresolved review comments on the current branch's PR — fetches threads, applies fixes, validates, commits, pushes, and resolves threads in one pass."
---

# Fix PR Review Comments

You are a **review fixer**. Your job is to address every unresolved review comment on the PR for the current branch, validate the fixes, commit and push **once**, and resolve all threads. Be methodical and batch everything — do not push after each individual fix.

## Step 0 — Identify the PR

Determine the current branch and find its open PR:

```powershell
# Get current branch
git --no-pager branch --show-current
```

Then look up the PR number. Prefer MCP:

- `github_list_prs({ state: "open", branch: "<current-branch>" })` — find the open PR for the current branch and get its PR number
- If you need additional PR details after that, call `github_view_pr({ number: <PR#> })` — returns the PR title, state, and draft status
- Shell fallback: `gh pr view --json number,title,state,isDraft`

If no open PR exists for the current branch, stop and tell the user.
If the PR is still a draft, note that but continue — the user has explicitly asked to fix reviews.

## Step 1 — Fetch ALL Unresolved Review Threads

Fetch **every** unresolved, non-outdated thread — from Copilot AND human reviewers:

**MCP (preferred):**

```
github_get_review_threads(number: <PR#>, unresolvedOnly: true)
```

This returns structured thread data plus a `truncated` flag. The thread data includes `id`, `isResolved`, `isOutdated`, and a `comments` array. Each comment includes `databaseId`, `author` (string), `body`, `path`, and `line`. Do not expect `author.login` or `side` from the MCP response. When you need to reply to a specific review comment, use `comments[].databaseId`.

**Important:** `github_get_review_threads` is capped (up to 100 threads, 50 comments per thread). You **must** check the `truncated` flag in the response:

- If `truncated: false` — the MCP result is complete; continue with it.
- If `truncated: true` — do **not** proceed with the partial MCP results. Immediately switch to the paginated `gh api graphql` fallback below and page until `hasNextPage` is `false`, then use that complete result set for the rest of the workflow.

**Shell fallback (if MCP unavailable, or if the MCP response has `truncated: true`):**

```powershell
$repoInfo = gh repo view --json owner,name | ConvertFrom-Json
$owner = $repoInfo.owner.login
$repo = $repoInfo.name

$query = @'
query($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 50) {
            nodes {
              databaseId
              author {
                login
              }
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

# Paginate through all threads
$allThreads = @()
$cursor = $null
do {
  $vars = @("-f", "owner=$owner", "-f", "repo=$repo", "-F", "number=<PR#>")
  if ($cursor) { $vars += @("-f", "cursor=$cursor") }
  $result = gh api graphql -f query="$query" @vars | ConvertFrom-Json
  $page = $result.data.repository.pullRequest.reviewThreads
  $allThreads += $page.nodes
  $cursor = $page.pageInfo.hasNextPage ? $page.pageInfo.endCursor : $null
} while ($cursor)
```

Filter to threads where `isResolved: false` AND `isOutdated: false`.

If there are **zero** unresolved threads, check if a human review is still pending (REQUEST_CHANGES or COMMENTED state with no thread). If truly nothing to fix, say so and stop.

## Step 2 — Read and Understand ALL Comments Before Touching Code

Before editing a single file, read through every unresolved thread in full:

- Note the `path` (file), `line` (location), and `body` (the feedback)
- Classify each comment:
  - **Fix**: code change required
  - **Clarify / reply only**: the reviewer is asking a question or noting something out of scope — reply with an explanation, no code change
  - **Outdated / stale**: the code already handles this — reply explaining why and resolve
  - **Disagree**: the suggestion would introduce a regression or violates project standards — reply with rationale, resolve as acknowledged

Cross-reference comments against the actual current file content (the thread's line may have shifted). Use `grep` or view the file to confirm the current state.

## Step 3 — Apply ALL Fixes in a Single Pass

Apply every **Fix**-classified change before committing anything. Work through the threads systematically:

### Project-specific rules to follow when fixing

- **No `console.*`** — use `LOGGER` from `@legacy-sports/logging`
- **No `@ts-ignore` or `eslint-disable`** — fix the root cause instead
- **No `route.continue()` in E2E tests** — use `route.fulfill()` with a diagnostic error
- **GraphQL**: edit `.graphql` source files + run `pnpm exec nx run db:print-schema` and `pnpm exec nx affected -t codegen` — never hand-edit `schema.graphql` or `*.generated.ts`
- **Error handling**: every `catch` must re-throw, log, or return error context — never swallow silently
- **Logging errors**: pass the `Error` object as a direct argument: `LOGGER.error(err, 'message')` not `LOGGER.error({ error: err })`

### Common review patterns (quick reference)

| Pattern                                      | Fix                                                                |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `route.continue()` / `route.fallback()` leak | Replace with `route.fulfill()` returning a diagnostic error object |
| `LOGGER.error({ error })`                    | Change to `LOGGER.error(err, 'description')`                       |
| Missing UNAUTHENTICATED test                 | Add a `user: null` test case                                       |
| Wrong mock structure                         | Wrap in `{ data: { ... } }`, check `.graphql` schema files         |
| Test name ≠ assertion                        | Rename the test to match what it actually asserts                  |
| Silent error swallowing                      | Every `catch` must re-throw, log, or return error context          |
| Argument injection risk (`-` prefix)         | Reject inputs starting with `-`; use `--` separator                |
| Missing API pagination                       | Paginate Jira (50 limit) and GitHub GraphQL (100 limit)            |
| `shell: true` + user input                   | Switch to `shell: false` + args array                              |
| Manual edit to generated file                | Fix the source, run codegen                                        |
| Success on partial failure                   | Set `isError: true`, report `{ total, succeeded, failed }`         |
| Dev/prod ternary missing staging             | Use `{ dev, staging, prod }` object map                            |

## Step 4 — Validate

After applying all fixes, validate before committing. **Do not skip this.**

```powershell
make pc
```

If `make pc` fails, fix the errors before proceeding. The minimum acceptable alternative (time-constrained):

```powershell
make format && make lint-fix && make typecheck
```

If you added or modified GraphQL schema/queries:

```powershell
pnpm exec nx run db:print-schema
pnpm exec nx affected -t codegen
```

## Step 5 — Commit and Push ONCE

One commit covering all fixes from this round. Use a conventional commit message:

```powershell
git add -A
git commit -m "fix: address PR review comments"
git push origin HEAD
```

**MCP preferred:**

```
worktree_commit(message: "fix: address PR review comments")
worktree_push()
```

Do **not** push after fixing each individual comment — every push triggers a full Copilot re-review cycle.

## Step 6 — Reply to Non-Fix Threads

For threads you classified as **Clarify**, **Outdated/stale**, or **Disagree**, reply with a clear explanation before resolving:

**MCP:**

```
# Preferred — reply by numeric comment id:
github_reply_to_review({ commentId: <numeric>, number: <PR#>, body: "explanation" })

# Alternative — reply by thread id:
github_reply_to_review({ threadId: "<thread-id>", body: "explanation" })
```

**Shell fallback:**

```powershell
gh api "repos/{owner}/{repo}/pulls/{pull_number}/comments" \
  --method POST \
  --field in_reply_to="<comment-id>" \
  --field body="explanation"
```

## Step 7 — Resolve ALL Threads (MANDATORY)

Resolve every thread you addressed — whether you fixed the code or replied to acknowledge it. GitHub does **not** auto-resolve threads when code changes.

**MCP (preferred — batch):**

```
github_resolve_threads(threadIds: ["<id1>", "<id2>", ...], prNumber: <PR#>)
```

**Shell fallback (one at a time):**

```powershell
# Thread IDs are GraphQL node IDs, e.g. "PRRT_kwDOA..."
gh api graphql -f query='mutation($id:ID!) { resolveReviewThread(input:{threadId:$id}) { thread { isResolved } } }' -f id="<thread-id>"
```

**Cloud (Claude Code on the web):** Use the custom `legacy-sports-github` MCP server for `github_resolve_threads` — it is the only source of GraphQL thread node IDs. Use built-in `mcp__github__*` tools for replies and requesting Copilot review to ensure bot identity.

**Never leave addressed threads unresolved** — this blocks the merge queue and triggers unnecessary re-review.

## Step 8 — Apply `bot:ready-for-review` Label (if all threads resolved)

After resolving all threads and pushing fixes, apply the label to trigger the next review cycle:

```
github_manage_labels(prs: [<PR#>], add: ["bot:ready-for-review"])
```

Shell: `gh pr edit <PR#> --add-label "bot:ready-for-review"`

**Do not push without applying the label** — pushes alone do not trigger a re-review. See [AGENTS.md](../AGENTS.md) for the full author-agent contract (FIX:/JUSTIFY:/CANNOT-COMPLY: protocol and cycle rules).

## Step 9 — Handle Re-Review

After you push and apply the `bot:ready-for-review` label, the bot will automatically re-review the PR. New threads from the re-review are a **separate cycle**. To pick them up:

- Wait for the re-review to complete: call `github_list_reviews({ number: <PR#> })` and watch for a new bot review entry, or call `github_get_review_threads({ number: <PR#> })` to detect newly created unresolved threads. Alternatively, check the PR manually on GitHub.
- Re-run this prompt to address the new cycle after that re-review completes.

**Two-round cap:** After 2 fix-review rounds, resolve remaining threads as "acknowledged — out of scope for this PR" with a reply, then merge. Do not enter a fix-review loop beyond 2 rounds.

## Guardrails

- **Never** suppress a lint or type error to satisfy a review comment — fix the root cause
- **Never** resolve a thread without either fixing the code or replying to explain why no change is needed
- **`worktree_push()` uses `--force-with-lease`** — this is safe (it rejects if the remote has commits you haven't fetched), but always pull first if the remote may be ahead to avoid losing work
- **Never** use `@ts-ignore` or `eslint-disable` — fix the root cause
- **Never** edit `schema.graphql` or `*.generated.ts` files directly
- **Never** enter more than 2 fix-review rounds on the same PR

## Output

When complete, provide a summary table:

| Thread | File                   | Comment                                   | Action Taken                                |
| ------ | ---------------------- | ----------------------------------------- | ------------------------------------------- |
| #1     | `src/foo.ts:42`        | "Use LOGGER instead of console.log"       | Fixed — replaced with `LOGGER.info`         |
| #2     | `src/bar.ts:88`        | "Missing error handling in catch block"   | Fixed — added re-throw with logging         |
| #3     | `tests/baz.test.ts:15` | "Consider adding an unauthenticated test" | Replied — added to follow-up ticket LS-#### |

Then state: push SHA, threads resolved, label status, and whether a re-review is expected.
