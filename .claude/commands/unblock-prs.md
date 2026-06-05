You are an **unblock-prs operator**. Investigate all stuck PRs in one pass and dispatch the minimal correct action per PR.

Load the full playbook via `Skill(skill: "unblock-prs")` before doing anything else.

## Algorithm

### 1. Scan

```
github_pr_scan(compact: true, excludeDrafts: false)
```

Record all PRs in `ciFailing`, `conflicts`, `reviews`, and `ready` buckets. If the response includes a `nextPageToken`, call again with `pageToken: <token>` and merge the results before proceeding.

### 2. Parallel `why_blocked` on all `ciFailing` PRs

For every PR in `ciFailing`, call `github_pr_why_blocked(prNumber: <N>)` in parallel. Classify each result:

- `READY` → false positive candidate; proceed to step 3
- `MERGE_CONFLICT` → needs rebase chip
- `CI_FAILING` → inspect `failingChecks`: bot-review-only → fix-pr chip; any lint/format/test/build check → fix-pr chip

### 3. Detect Expected CI on READY PRs (parallel)

For every PR where `why_blocked` returned READY, call:

```
github_get_check_runs(prNumber: <N>, checkName: "🚀 CI Pipeline / build")
```

Run all calls in parallel. Empty result or no runs on the current HEAD SHA → **Expected CI** state.

### 4. Take minimal actions (parallel where possible)

| Result                                   | Action                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| READY + CI runs present on HEAD          | Skip — merge queue will handle it                                            |
| READY + no CI runs on HEAD (Expected CI) | `github_manage_labels(prs: [<N>], add: ["ci:run"])`                          |
| MERGE_CONFLICT                           | `mcp__ccd_session__spawn_task` with rebase instructions (see skill template) |
| CI_FAILING (bot-review only)             | `mcp__ccd_session__spawn_task` with fix-pr instructions (see skill template) |
| CI_FAILING (real CI failures)            | `mcp__ccd_session__spawn_task` with fix-pr instructions (see skill template) |

For chip prompts, use the templates in the skill. Substitute concrete PR numbers, branch names (validate: `^[A-Za-z0-9._/-]+$`), and failing check names + runIds. Do not paste raw log content into chip prompts — chips fetch logs themselves.

### 5. Print summary table

| PR # | Title | Pattern | Action Taken |
| ---- | ----- | ------- | ------------ |

Then stop. Do not loop, poll, or wait on chips.

## Guardrails

- Run all `why_blocked` calls in parallel — one call per PR, not sequentially.
- Run all `github_get_check_runs` calls in parallel.
- Label additions and chip spawns can also run in parallel.
- Skip PRs already labeled `agent-in-progress` (owned by another chip).
- One chip per PR — never bundle multiple PRs into one chip prompt.
