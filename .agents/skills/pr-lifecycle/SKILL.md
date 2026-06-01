---
name: pr-lifecycle
description: 'PR lifecycle: create PRs with Jira linkage, self-review code before push, fix Copilot review comments, and orchestrate PR maintenance sweeps. Load when creating PRs, reviewing changes, fixing review comments, or managing open PRs.'
---

# Skill: PR Lifecycle

Covers the complete pull request lifecycle from self-review through creation, review fixing, and maintenance.

## Checking PR Status Without Bash

Prefer MCP tools; use `gh pr view --json` only when MCP is unavailable or the user explicitly confirms a CLI fallback:

| Instead of                           | Use                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `gh pr view N --json state,mergedAt` | `github_view_pr({ number: N })` — returns `state` + `mergedAt`                                  |
| `gh pr view N --json mergeable`      | `github_pr_batch_status({ numbers: [N] })` — returns `mergeable`, `ciSummary`, `reviewDecision` |

**`mergeable: UNKNOWN` does not mean blocked** — it can mean GitHub is still computing mergeability, and it can also appear for PRs that are already merged or closed. Do not treat `UNKNOWN` as a merge-queue signal by itself. To confirm the actual PR outcome, call `github_view_pr({ number: N })` and check `state` plus `mergedAt`/`closedAt`: `state: "MERGED"` or a populated `mergedAt` means it merged successfully; a closed PR with `closedAt` and no `mergedAt` means it was closed without merging.

## Phases

Work through these phases sequentially. Each phase links to a detailed reference doc.

### Phase 1: Self-Review Before Push (MANDATORY GATE)

Run a structured review of all branch changes before pushing. This is a **Tier 2 workflow rule** — do NOT push without completing it. Catches project-rule violations, common Copilot review patterns, and code quality issues that `make pc` does not check (semantic issues, dead code, reuse opportunities).

You must produce a **structured Self-Review Summary** (see the template in the reference doc) listing files reviewed, patterns checked, and issues fixed. This summary is your proof of thoroughness — without it, self-review did not happen.

> Self-review is a verification step, not a planning step. If you find yourself making significant design changes during self-review, you may have skipped the [planning phase](../planning/SKILL.md) — consider stopping and re-planning.

> Details: [references/self-review.md](references/self-review.md)

### Phase 2: Create PR with Jira Linkage

> **Precondition for opening a PR**: call `github_create_pr` (MCP tool) with `head: <branch-name>` (from `worktree_status().headRefName`). The tool runs on a remote Lambda and cannot resolve client-side paths — pass the branch name directly. `gh pr create` silently uses the shell's working directory and targets the wrong branch in multi-worktree sessions. **Precondition for `gh pr create` fallback**: `github_auth_status()` returns `configured: false` and the user has explicitly authorized the CLI fallback.

Before creating a PR, verify GitHub auth is working:

```
github_auth_status()
```

If `configured: false`, **stop and prompt the user** — do not silently fall back to `gh` CLI. Tell them their GitHub credentials are missing or expired and direct them to set `GH_TOKEN` or `GITHUB_TOKEN`, run `gh auth login`, or configure `AGENT_AUTHOR_APP_PRIVATE_KEY`. Only fall back to `gh` CLI after the user confirms their auth is working or explicitly asks you to try the CLI fallback.

**Cloud (Claude Code on the web)**: Use built-in `mcp__github__create_pull_request({ owner, repo, ... })` and `mcp__github__update_pull_request({ owner, repo, pullNumber, draft: false })` — these authenticate via the platform's token and avoid the username-leak issue. See [`cloud-agent-mode/SKILL.md`](../cloud-agent-mode/SKILL.md) for the full tool mapping.

Verify prerequisites (`make pc`, migrations, branch pushed), create the PR **as a draft** using `github_create_pr` MCP tool, mark it ready for review, then transition Jira to "In Review". The draft→ready flow prevents sweep/review agents from racing with the creating agent.

When a planning phase was run (see [planning skill](../planning/SKILL.md)), include its output in the PR body: the **Context** (why) and **Risk Assessment** sections help reviewers focus on the right areas.

> **A rich PR description is required for Copilot to fix review comments correctly.** When reviewers use "Fix with Copilot" or `@copilot` to address a review thread, Copilot's only context is the PR title, description, and diff. A thin description (e.g., 1-2 summary bullets with no context) causes Copilot to make repeated, incomplete, or misaligned fixes — leading to 3-4 redundant agent runs per review round. Always include a `## Context` section with the Jira link and a clear problem statement. Write the description as a prompt to a capable engineer who has never seen the ticket.

> **Batch review comments before "Fix with Copilot".** Submitting individual review comments (one at a time) and clicking "Fix with Copilot" on each one spawns a separate Copilot agent session per comment. These sessions race each other and frequently produce conflicting patches. Always use "Start a review" to batch all comments, then submit the review in a single action before requesting Copilot fixes.

> Details: [references/create-pr.md](references/create-pr.md)

### Phase 2b: Watch PR to Merge

After creating the PR and transitioning Jira, shepherd the PR through CI and reviews — do **not** treat PR creation as the end of the task.

Claude Code surfaces CI results and review events **as push notifications**. After marking the PR ready, Claude Code will automatically receive and surface CI failures, new review threads, and other agent-actionable events. Handle each event as it arrives (fixing code, resolving threads, re-running CI) and continue until merged or closed.

> **Precondition for any CI status read**: a push event has arrived (CI failure/pass, review, merge). Treat `ci_view_run`, `github_view_pr`, and `gh pr view --json statusCheckRollup` as one-shot lookups triggered by an event — not as poll targets. Repeated calls in a `sleep` loop have been observed burning 1–2M tokens per session for zero earlier signal than the native push notification.

See [drive-pr](../drive-pr/SKILL.md) Step 6 for the full event-handling table.

### Phase 3: Fix Copilot Review Comments

Fetch unresolved threads, apply fixes, validate, commit, push, and resolve threads. Cap at 2 fix-review rounds -- after round 2, resolve remaining threads as "acknowledged" and proceed. After re-requesting review, use `mcp__github__subscribe_pr_activity` to receive the next review event — do **not** use `sleep N && gh api .../reviews` polling (see Critical Rule 13).

**Cloud (Claude Code on the web)**: Use built-in tools for operations where authorship is visible (replying to threads, requesting Copilot review). This prevents agent comments from appearing under the user's personal GitHub username. See the cloud review workflow in [`cloud-agent-mode/SKILL.md`](../cloud-agent-mode/SKILL.md) and the cloud section in [references/fix-reviews.md](references/fix-reviews.md).

> Details: [references/fix-reviews.md](references/fix-reviews.md)

### Phase 4: PR Maintenance and Sweep

Orchestrate maintenance across all open PRs: scan, rebase conflicts, fix reviews, fix CI failures. Supports both local (full sweep) and cloud (API-only) modes.

> Details: [references/pr-maintenance.md](references/pr-maintenance.md)

## Who's Who in the PR Flow

Several distinct actors operate on every PR. Most docs in this repo predate the current bot lineup and refer generically to "the bot" or "agents" — those terms are ambiguous, so use this table as the canonical reference.

**You are the Author Agent.** You are not the Reviewer Bot, not Copilot, not the Merge Queue, and not the maintainer. Your responsibilities end where the Reviewer Bot's begin.

| Actor               | Identity                                                                                         | What it does                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Author Agent**    | Your Claude session. Commits authored by `claude[bot]` (or human collaborators).                 | Writes code, opens the PR, replies to review threads, pushes fixes, applies `bot:ready-for-review` after every fix-push.                      |
| **Reviewer Bot**    | `legacy-sports-review-bot` running `.github/workflows/review.yml` → `.github/scripts/reviewer/`. | Posts reviews on `ready_for_review` / `synchronize` (when `bot:ready-for-review` is present). Applies `merge-when-ready` on APPROVED verdict. |
| **Copilot**         | GitHub's `copilot-pull-request-reviewer`.                                                        | Posts line-level review comments. Lower-priority signal than the Reviewer Bot.                                                                |
| **Merge Queue**     | `.github/workflows/merge-queue.yml` + `.github/scripts/merge-queue-processor.js`.                | Watches for `merge-when-ready` and auto-merges PRs whose required checks are green.                                                           |
| **CI Orchestrator** | `.github/workflows/ci-orchestrator.yml`.                                                         | Runs the CI test suite. Adds `CI: *` failure labels.                                                                                          |
| **Maintainer**      | Human user (`bkrupa`).                                                                           | Applies escape-hatch labels (`review-bot-override`, `security-review-override`, `merge-to-parent`). Author Agent never touches these.         |

### Label Ownership

Single source of truth for which actor applies which label. If guidance elsewhere in this repo contradicts this table, **this table wins** — open a ticket to reconcile the stale doc.

| Label                         | Applied by       | When                                                            | Author Agent should…                                                                                                                                                                                                                               |
| ----------------------------- | ---------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-in-progress`           | Author Agent     | While the PR is in draft / still iterating                      | Apply on draft. The Reviewer Bot does not need it; it's a coordination signal for sweep agents.                                                                                                                                                    |
| `bot:ready-for-review`        | **Author Agent** | After `github_mark_pr_ready` AND after every fix-push           | **Apply / re-apply.** This is the trigger that fires the Reviewer Bot. Without it, no new review cycle runs. See Critical Rule #14 in this skill's Critical Rules.                                                                                 |
| `merge-when-ready`            | **Reviewer Bot** | On APPROVED verdict (`.github/scripts/reviewer/index.mjs:914`)  | **Never apply manually.** Manual application bypasses the gate that holds back PRs the Reviewer Bot has rejected. If a clean PR is missing it, fix the upstream cause (Reviewer Bot didn't run, didn't approve) — don't paper over with the label. |
| `merge-to-parent`             | Maintainer       | For stacked PRs targeting a non-`main` branch                   | Never touch.                                                                                                                                                                                                                                       |
| `review-bot-override`         | Maintainer       | Formal escape hatch when Reviewer Bot is wrong                  | Never touch. See §5 of the Author Agent Contract.                                                                                                                                                                                                  |
| `security-review-override`    | Maintainer       | After human security review on `needs-human-security-review` PR | Never touch. See §6 of the Author Agent Contract.                                                                                                                                                                                                  |
| `needs-human-security-review` | Reviewer Bot     | Critical security finding                                       | Never touch.                                                                                                                                                                                                                                       |
| `needs-human-arbitration`     | Reviewer Bot     | Cycle exceeds MAX_CYCLE or `CANNOT-COMPLY` filed                | Push new commits to address outstanding findings — the bot auto-removes this label and resets the cycle counter on the next push. Never apply or remove manually. See §4a of the Author Agent Contract.                                            |
| `review-bot-degraded`         | Reviewer Bot     | Cycle was rate-limited                                          | Re-apply `bot:ready-for-review` to retry. See `references/fix-reviews.md` step 8.                                                                                                                                                                  |
| `CI: *` failure labels        | CI Orchestrator  | Auto, when a check fails                                        | Never touch — they clear automatically when the failing check passes.                                                                                                                                                                              |

> Historical note: some docs still credit `copilot-auto-approve` with adding `merge-when-ready`. That attribution is stale — the current code path is Reviewer (W1) in `.github/scripts/reviewer/index.mjs:914`.

## Author Agent Contract (Bot-PR Flow)

When a PR is authored by the Author Agent and reviewed by the Reviewer Bot, the Author Agent must follow this protocol exactly. Deviations cause the Reviewer Bot to flag format errors or escalate to a human.

### 1. PR Creation

- Open the PR as a **draft**. Work locally; push freely — pushes do NOT fire bot reviews while in draft.
- When initial code is complete: mark the PR **ready_for_review**. This fires **Cycle 1**.
- Immediately after marking ready, apply the **`bot:ready-for-review`** label via `github_manage_labels(prs: [<PR#>], add: ["bot:ready-for-review"])`. **This must be the last label applied** — `Reviewer (W1)` uses `concurrency.cancel-in-progress: true`, so any label applied after this cancels the reviewer run before it posts a review, then skips itself because the new label is not a qualifying trigger. Ensure `agent-in-progress` is already on the PR (applied while still a draft, step 2 of [create-pr.md](references/create-pr.md)) before applying `bot:ready-for-review`. The `ready_for_review` event alone fires Cycle 1, but `Reviewer (W1)` only honors subsequent `synchronize` events while this label is present — without it, any push made before the bot finishes reviewing (or any later fix-push) starts no reviewer run. The reviewer **preserves the label through merge** (including on APPROVED, per LS-4678) so post-approval pushes still fire a fresh cycle and don't silently stall behind the `bot-review` ruleset gate on the new HEAD SHA. You generally do not need to re-apply between cycles; the only cases requiring re-application are (a) a prior cycle was rate-limited (`review-bot-degraded` label applied with no review) — see [fix-reviews.md](references/fix-reviews.md) step 8, or (b) a non-rate-limit terminal infra failure stripped the label (Review Label Guard (W7) will auto-reapply on the next push if a prior bot APPROVED exists, but for the first push after such a failure you may need to re-apply manually).

### 2. Response to Cycle 1 Review

After the bot posts its Cycle 1 review, the agent must:

1. Reply to **every open thread** with exactly one of — post each reply via `github_reply_to_review_thread({ threadId: "PRRT_...", body: "..." })` (local/headless; ToolSearch: `"reply_to_review_thread"`) or `mcp__github__add_reply_to_pull_request_comment` (preferred on Claude Code on the web to avoid OAuth attribution to user's personal token):
   - `FIX: <sha>` — the fix is already committed at `<sha>`
   - `JUSTIFY: <rationale>` — the finding is incorrect or the suggestion is out of scope; explain why. **When the finding is a false positive** (the pattern is intentional, not just out of scope), also add an inline code comment at the flagged line(s) or a note in the nearest relevant doc (e.g. a `SKILL.md` or `references/` entry) explaining the intent — so future contributors and reviewers don't raise the same flag again.
2. Push any fix commits (including inline comments or doc notes added for JUSTIFY false positives).
3. **Resolve every thread answered with `FIX:`** in a single batched `github_resolve_threads({ threadIds: [...], prNumber: PR# })` call. Do **not** resolve threads answered with `JUSTIFY:` — those need bot adjudication in the next cycle.
4. Apply the **`bot:ready-for-review`** label via `github_manage_labels(prs: [<PR#>], add: ["bot:ready-for-review"])`. This fires **Cycle 2**. If the label is already present (e.g., a prior cycle was rate-limited), remove then re-add it — `github_manage_labels(prs: [<PR#>], remove: ["bot:ready-for-review"])` followed by `github_manage_labels(prs: [<PR#>], add: ["bot:ready-for-review"])` — so GitHub emits a fresh `labeled` event.

> Skipping a thread is not allowed — unaddressed threads become mandates in Cycle 2.

### 3. Response to Cycle 2 Mandates

> **If the Cycle 2 review is LGTM/APPROVED with no new findings, stop — no action is needed.** JUSTIFY threads that were not escalated into mandates are considered accepted by the bot. Do **not** post any further replies (not `FIX:`, not `CANNOT-COMPLY:`, nothing). The PR is ready to merge pending CI.

If the Cycle 2 review contains mandates (CHANGES_REQUESTED), the agent must:

1. Reply to **every open thread** with (use `github_reply_to_review_thread({ threadId: "PRRT_...", body: "FIX: <sha>" })`):
   - `FIX: <sha>` — the fix is committed at `<sha>` (the only accepted reply in Cycle 2)
2. Push any fix commits.
3. **Resolve every thread answered with `FIX:`** in a single batched `github_resolve_threads({ threadIds: [...], prNumber: PR# })` call.
4. Apply **`bot:ready-for-review`** again via `github_manage_labels(prs: [<PR#>], add: ["bot:ready-for-review"])`. This fires **Cycle 3**. If the label is already present, remove then re-add it as above.

> Neither `JUSTIFY:` nor `CANNOT-COMPLY:` is accepted in Cycle 2. `JUSTIFY:` closed at Cycle 1; `CANNOT-COMPLY:` is only valid in Cycle 3+.

### 4. Response to Cycle 3+ (Escalation)

If a mandate persists into Cycle 3, the agent may reply with:

1. `FIX: <sha>` — fix committed at `<sha>`
2. `CANNOT-COMPLY: <issue-id>` with the reason on the **next line** — the mandate is genuinely impossible; this escalates to a human reviewer

After replying, **resolve every thread answered with `FIX:`** in a single batched `github_resolve_threads({ threadIds: [...], prNumber: PR# })` call. Do **not** resolve `CANNOT-COMPLY:` threads — they must remain open for the human reviewer.

Example:

```
CANNOT-COMPLY: LS-1234
This change requires modifying a generated file that must not be edited manually.
```

> `CANNOT-COMPLY:` is a Cycle 3+ token. Using it in Cycle 2 will be treated as malformed.

### 4a. If the bot escalates to `needs-human-arbitration` (cycle limit hit)

When the cycle limit (MAX_CYCLE = 3) is reached, the bot posts an arbitration comment listing the outstanding findings, applies `needs-human-arbitration`, and sets `bot-review` to failure.

> Prior `APPROVED` bot reviews do **not** count toward `MAX_CYCLE` (LS-4904) — only unresolved `CHANGES_REQUESTED` cycles consume slots, so post-approval pushes start fresh.

**Author agent response:**

1. Push new commits addressing each outstanding finding listed in the arbitration comment.
2. The bot **automatically resets the cycle counter** on the next push (`synchronize` event with `needs-human-arbitration` present): it dismisses prior reviews, removes the `needs-human-arbitration` label, and posts a fresh Cycle 1 review. No `bot:reset-cycle-counter` or maintainer action is needed.
3. Ensure `bot:ready-for-review` is present (it is preserved by the bot through merge — re-apply only if it was stripped).

> **Do NOT** ask the maintainer to apply `bot:reset-cycle-counter` just because the cycle limit was hit and you have new code to push. The auto-reset handles this. `bot:reset-cycle-counter` is only needed if you cannot push new commits (e.g. the bot finding is wrong and you are using `review-bot-override`, or a maintainer wants to reset without requiring a push).

### 5. If bot-review remains blocked after CANNOT-COMPLY

When `CANNOT-COMPLY` is filed but the `bot-review` check remains `failure` (blocking merge), a maintainer must apply the `review-bot-override` label:

```
github_manage_labels(prs: [PR#], add: ["review-bot-override"])
```

This triggers W5 (`.github/workflows/review-bot-override.yml`), which sets `bot-review` to `success` and posts an audit comment. It is the **formal escape hatch** for persistent bot disagreement — prefer it over GitHub's admin "Merge without waiting for requirements" button, which leaves no audit trail. See [ci-checks-reference.md](references/ci-checks-reference.md#bot-review-commit-status) for details.

### 6. If `needs-human-security-review` is applied and the author can't satisfy CODEOWNER review

When the reviewer flags a critical security finding it applies the `needs-human-security-review` label. The label itself is informational — the actual gate is the **CODEOWNER review requirement**, which the PR author cannot satisfy on their own PR. After a human security reviewer has examined the finding and confirmed it inapplicable, mitigated, or accepted, a maintainer applies the `security-review-override` label:

```
github_manage_labels(prs: [PR#], add: ["security-review-override"])
```

This triggers W6 (`.github/workflows/security-review-override.yml`), which submits an `APPROVE` review as the Code Reviewer Bot App (satisfying the CODEOWNER requirement with a non-author identity), removes `needs-human-security-review`, and posts an audit comment. Removing the label dismisses the override approval and re-applies the security label. See [ci-checks-reference.md](references/ci-checks-reference.md#needs-human-security-review-label-codeowner-gate) for details.

### Format Rules

- **Format errors get corrective replies** — the bot will reply in-thread when a response is malformed; re-post correctly.
- **Never edit the bot's review comments or threads** — the bot reads its own thread state to determine cycle progression; mutation breaks this.
- **No free-form text outside structured replies** — the bot ignores unstructured content and will not count it as a thread response.

### Shortcut

Use `/respond-to-review` to scaffold structured replies for all open threads on the current PR.

## Review Thread Workflow (bot-review failures)

When `bot-review` CI check fails or Copilot posts review comments, use this MCP-first workflow:

> **Classification rule**: `bot-review`, `Copilot review blocked`, and `Copilot review has unresolved comments` are review blockers, not generic CI-debugging tasks. Fetch unresolved review threads first; do not start by reading Actions logs unless another non-review check is also failing.

1. **Get unresolved threads**: `github_get_review_threads({ number: PR# })`
   - Default (no `includeResolved`) returns only unresolved threads — exactly the ones blocking merge.
   - Returns thread-level fields: `id` (PRRT\_ node ID), `isResolved`, `isOutdated`, `isCollapsed`, `path`, `line`, `startLine` — plus a `comments` array with `databaseId`, `author`, `body`, `path`, `line` per comment.
2. **Inspect the returned comments and fix the code** in the flagged files/lines
3. **Reply to threads** (when a comment needs acknowledgment or explanation rather than a code fix):
   - Use `github_reply_to_review` — available for **both local and cloud** sessions via the custom `legacy-sports-github` MCP server.
   - Pass either `threadId` (GraphQL node ID from `github_get_review_threads`) or `commentId` + `number` (REST databaseId + PR number): `github_reply_to_review({ threadId: "PRRT_...", body: "explanation" })`
   - **ToolSearch query**: search `"reply review"`, `"reply to review comment"`, or `"github_reply_to_review"` — not `"reply to PR comment"` (which may not surface it).
   - Do **not** reach for `gh api repos/.../pulls/.../comments` or a Python scratch script — the MCP tool handles both auth paths.
4. **Commit and push** the fix
5. **Resolve threads**: `github_resolve_threads({ threadIds: [<thread-id>, ...], prNumber: PR# })`
   - Thread node IDs come from the `id` field of each thread in `github_get_review_threads` output (PRRT\_... format).
   - **Alternative**: if you only have numeric comment `databaseId` values (e.g. from `mcp__github__*` `get_review_comments`), pass them as `commentDatabaseIds` instead — the tool maps them to thread IDs internally: `github_resolve_threads({ commentDatabaseIds: [<databaseId>, ...], prNumber: PR# })`.
   - **If bot-review still fails after resolution**: `github_resolve_threads` with `prNumber` attempts to re-dispatch the Copilot Auto-Approve workflow, but may be silently skipped if the app token lacks `actions: write`. If `bot-review` still shows failure after thread resolution, re-dispatch manually: `ci_dispatch_workflow({ workflow: "Copilot Auto-Approve", ref: "<branch>", inputs: { pr_number: "<PR#>" } })`. Wait ~20 seconds for the recheck job and verify `bot-review` flips to success before attempting merge.
6. **Re-request review**: `github_request_review({ prs: [PR#] })`
   - **After re-requesting, subscribe — do not poll**: use `mcp__github__subscribe_pr_activity({ owner, repo, pullNumber: PR# })` (Claude Code built-in, local sessions only) to receive the review event as it arrives. Do **not** use `sleep N && gh api repos/{owner}/{repo}/pulls/{pr}/reviews` polling — this wastes 4–5 min per review cycle and may miss the event if the sleep is too short. If `subscribe_pr_activity` is unavailable (cloud/headless sessions or MCP not loaded), fall back to a **capped** retry: poll at most 5 times with 30-second gaps, and note the degraded mode in session output.

> **`bot-review` still stuck after resolving threads?** Manually re-dispatch the recheck using the `ci_dispatch_workflow` MCP tool — **never** `gh workflow run copilot-auto-approve.yml` via Bash:
>
> ```
> ci_dispatch_workflow(workflow: "copilot-auto-approve.yml", inputs: { pr_number: "<PR#>" })
> ```
>
> In cloud sessions, this may return 403 (app lacks `actions:write`) — see [cloud-agent-mode/SKILL.md](../cloud-agent-mode/SKILL.md#quirk-3-ci_dispatch_workflow-returns-403-in-cloud--agent_author_app-lacks-actionswrite).

Before the next push, also check whether any other blockers are already known on the PR (conflicts, non-review failing checks). Batch all currently known fixes into one validation + push round whenever possible. Do **not** push a CI-only change while known review threads remain unresolved, or vice versa, unless one blocker must be cleared first to reveal the next.

> **Avoid `gh api graphql` to enumerate review threads** — prefer `github_get_review_threads`, which returns structured data including GraphQL thread node IDs (required for resolution). Use `gh api graphql` only as a last resort when MCP or another documented tool is unavailable or does not return the needed thread IDs.

> **Mapping comment IDs to thread IDs**: `github_resolve_threads` now handles this automatically. If you have a comment's `databaseId` (numeric) but not its thread's PRRT\_ node ID, pass the `databaseId` values via `commentDatabaseIds` with `prNumber` — no raw GraphQL fallback needed.

## Enabling Auto-Merge from Worktrees

> **Precondition for enabling auto-merge**: use `github_pr_enable_auto_merge` (GraphQL — no local git ops). `gh pr merge --auto` shells out to `git` to check out the base branch locally, which fails in worktree sessions because the parent repo already has `main` checked out:
>
> ```
> fatal: 'main' is already used by worktree at 'D:/code/legacy-sports'
> ```

Use `github_pr_enable_auto_merge` instead — it calls the `enablePullRequestAutoMerge` GraphQL mutation directly with no local git operations:

```
github_pr_enable_auto_merge(number: <PR#>)                          # default: SQUASH
github_pr_enable_auto_merge(number: <PR#>, mergeMethod: "REBASE")  # or MERGE
```

The PR will auto-merge once all required checks pass. This works from any worktree, cloud session, or headless environment.

> `github_merge_pr(strategy: "queue")` also uses GraphQL under the hood and is equivalent for the default SQUASH case. Use `github_pr_enable_auto_merge` when you want explicit control over `mergeMethod` or want to make the auto-merge intent clear without triggering a full merge attempt.

## Merge Queue Blocked: "A conversation must be resolved"

When the merge queue rejects a PR with **"Repository rule violations found: A conversation must be resolved before this pull request can be merged"**, follow this workflow:

> **Critical non-obvious rule**: `isOutdated: true` does NOT mean the thread is resolved. "Outdated" means the code changed after the comment was posted (the diff hunk no longer exists). Outdated threads that are **not** resolved still block the merge queue. Never assume outdated = safe to ignore.

1. **List threads blocking merge**:

   ```
   github_get_review_threads({ number: PR# })
   ```

   Default returns only unresolved threads (including outdated-but-unresolved). Inspect `isOutdated` on each — these are the ones that may have been overlooked.

2. **Collect thread IDs** from the `id` field (PRRT\_ prefix) of all returned threads.

3. **Resolve all blocking threads**:

   ```
   github_resolve_threads({ threadIds: ["PRRT_...", "PRRT_..."], prNumber: PR# })
   ```

   The `prNumber` parameter triggers a bot-review recheck after resolution.

4. **Wait for the next merge queue cycle** — the PR will be re-evaluated automatically after the commit status updates. No manual re-enqueue is needed unless the PR was removed from the queue.

## Critical Rules

1.  **Always self-review before pushing (Tier 2 gate)** -- Phase 1 is mandatory. Read every changed file in full, check all 20 common review patterns, and produce a Self-Review Summary before calling `worktree_push()`. Skipping this is the #1 cause of avoidable Copilot review cycles.
2.  **2-round cap on Copilot fix iterations** -- Round 1: security/bugs/type safety. Round 2: remaining actionable comments. After round 2: resolve and move on.
3.  **Resolve threads after fixing** -- use `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })` after pushing fixes. Thread IDs come from `github_get_review_threads({ number: <PR#> })` (returns unresolved threads by default; pass `includeResolved: true` for all). If you only have numeric comment `databaseId` values, use `github_resolve_threads({ commentDatabaseIds: [...], prNumber: <PR#> })` — the tool maps them to thread IDs internally (no raw GraphQL needed). The `prNumber` parameter triggers a bot-review recheck attempt when all thread resolutions succeed; if the app token lacks `actions: write` the dispatch is skipped/non-fatal and the tool returns a `recheckNote` instead of erroring — **if bot-review still shows failure after thread resolution, re-dispatch manually (see Review Thread Workflow)**. Add `merge-when-ready` label after all threads are resolved. **Do NOT use `gh api graphql`** to resolve — `github_resolve_threads` works with both user and GitHub App tokens and handles batching. Fall back to `gh api graphql` only if the custom server is confirmed unavailable after retry.
4.  **Never skip `make pc`** -- each CI failure costs 40-60 min. Minimum alternative: `make format && make lint-fix && make typecheck`.
5.  **Always use `--body-file` or MCP tool for PR body** -- never inline `--body` in any shell (PowerShell is especially problematic).
6.  **Never create a PR from `main`** -- branch name must contain a Jira ticket key.
7.  **Always create PRs as drafts, then mark ready before handoff** -- use `draft: true` in `github_create_pr` MCP tool. Apply the `agent-in-progress` label while still a draft, then call `github_mark_pr_ready(number: <PR#>)`. **Draft is a working state, not an ending state.** It is fine to keep a PR in draft while you are still actively pushing commits, iterating on CI, or waiting on a user question. It is NOT fine to end a turn or hand off with a PR still in draft. **Stopping at `draft: true` is a Tier 2 failure** — draft PRs are skipped by `Reviewer (W1)` (which checks `draft == false`), skipped by the bot-review-gated CI orchestration path, and skipped by sweep agents. A forgotten draft sits forever and nobody picks it up. Before ending a turn, handing off, or requesting review, verify `github_view_pr({ number: N })` returns `isDraft: false`. If you genuinely cannot mark it ready (real blocker), surface that blocker explicitly to the user — do not silently leave the PR in draft. See [create-pr.md](references/create-pr.md) for the canonical step order.
8.  **Check Runs ≠ Commit Statuses** -- `github_retrigger_check` only works on **Check Runs** (Checks API). `bot-review` and other bot-set statuses use the **Statuses API** and will NOT be found by `github_retrigger_check`. If you get "No check run named 'X' found", use `github_list_commit_statuses({ number: <PR#> })` to see commit statuses instead. To clear a stale commit status: push a new commit (re-triggers the workflow) or dispatch via `ci_dispatch_workflow`. Note: `github_merge_pr(strategy: "direct")` does NOT bypass required commit statuses — it uses the standard merge API which still enforces branch protection rules.
9.  **Precondition for PR event handling**: react to each push notification as it arrives. After marking a PR ready, Claude Code surfaces CI results, review threads, and other agent-actionable events automatically — no wait tool is needed.
    - **Precondition for any status-read call**: a push event has arrived. `sleep N && gh run view`, `sleep N && gh pr view --json statusCheckRollup`, `sleep N && gh pr checks <pr>`, and `ci_view_run every ~60s` loops never deliver earlier signal than the native notification. Native event streaming works regardless of which MCP servers are connected, so the "CI server not loaded" rationalization does not justify polling.
10. **Batch known PR fixes into one push** -- when a PR simultaneously has unresolved review threads and failing checks, gather both the thread set and CI evidence before editing. The default remediation unit is one review/CI round -> one validation -> one push. Multiple pushes for already-known issues create avoidable Copilot re-reviews and CI cycles.
11. **`ci_list_runs`, `ci_view_run`, `github_view_pr`, `github_list_prs` are instant snapshots — use for targeted lookups only.** Calling them in a loop burns 1–2M tokens per session (each call re-reads the full conversation context). Use them exactly once for a targeted lookup.
12. **Re-dispatch `bot-review` via MCP — never `gh workflow run`** -- if `bot-review` remains stuck after resolving threads, use `ci_dispatch_workflow(workflow: "copilot-auto-approve.yml", inputs: { pr_number: "<PR#>" })`. Never use `gh workflow run copilot-auto-approve.yml` via Bash — always use the `ci_dispatch_workflow` MCP tool. See [cloud-agent-mode/SKILL.md](../cloud-agent-mode/SKILL.md#quirk-3-ci_dispatch_workflow-returns-403-in-cloud--agent_author_app-lacks-actionswrite) for the 403 fallback in cloud sessions.
13. **Precondition for waiting on a Copilot review**: after `github_request_review({ prs: [PR#] })`, subscribe to the review event via `mcp__github__subscribe_pr_activity({ owner, repo, pullNumber: PR# })` (Claude Code built-in, local sessions only). The subscription delivers the review event as a push notification — no polling needed. **Fallback precondition** (cloud/headless or MCP not loaded): cap retries at 5 with 30-second gaps and note the degraded mode in session output. `sleep N && gh api repos/{owner}/{repo}/pulls/{pr}/reviews` loops waste 4–5 minutes per cycle and miss the event when the sleep window misaligns — the same anti-pattern as CI polling (see Rule 9).
14. **Precondition after every fix-push: apply `bot:ready-for-review`.** `Reviewer (W1)` fires on `opened`, `ready_for_review`, `labeled` (with `bot:ready-for-review`/`review-bot-degraded`/`bot:reset-cycle-counter`), and `synchronize` **only when `bot:ready-for-review` is already present**. A plain push without the label starts no reviewer cycle and no orchestrated CI. After resolving threads and pushing, call `github_manage_labels({ prs: [<PR#>], add: ["bot:ready-for-review"] })` — this is the most common workflow stall. Not needed at PR creation (`github_mark_pr_ready` fires `ready_for_review` for Cycle 1). The reviewer workflow auto-removes the label; if still present (rate-limited prior cycle), remove and re-add it. Shell fallback: `gh pr edit <PR#> --add-label "bot:ready-for-review"`.

**CI tool reference — instant snapshots:**

| Tool              | Correct usage                                                       |
| ----------------- | ------------------------------------------------------------------- |
| `ci_list_runs`    | ONE-SHOT: get the runId for a failing CI run — do not loop          |
| `ci_get_logs`     | ONE-SHOT: read failed-step output after getting runId — do not loop |
| `ci_view_run`     | ONE-SHOT: inspect a specific run — do not loop                      |
| `github_view_pr`  | ONE-SHOT: verify merge state or read PR metadata — do not loop      |
| `github_list_prs` | ONE-SHOT: find an existing PR — do not loop                         |

## Quick Commands

```
# MCP (preferred) — full post-creation sequence
github_create_pr(title: "LS-#### type(scope): msg", body: <markdown>, draft: true, head: <branch-name>)
github_manage_labels(prs: [<PR#>], add: ["agent-in-progress"])   # while still draft — MUST come before bot:ready-for-review
github_mark_pr_ready(number: <PR#>)
github_manage_labels(prs: [<PR#>], add: ["bot:ready-for-review"])  # MUST be last label op — see note below
mcp__github__subscribe_pr_activity(pullRequestNumber: <PR#>)  # Claude Code built-in ONLY — NOT in legacy-sports-github; unavailable in cloud/headless; fallback: poll via github_view_pr + ci_list_runs with ScheduleWakeup
github_request_review(prs: [<PR#>])
jira_transition(key: "LS-####", status: "In Review")

# After EACH fix-and-push round (resolve threads → push → re-trigger review + CI)
github_resolve_threads(threadIds: [...], prNumber: <PR#>)
github_manage_labels(prs: [<PR#>], add: ["bot:ready-for-review"])  # MANDATORY and MUST be last label op — fires Reviewer (W1) → bot review → CI Orchestrator. Plain pushes do NOT trigger CI.

# ⛔ Why bot:ready-for-review must be last: Reviewer (W1) uses concurrency.cancel-in-progress: true.
# Any label applied after bot:ready-for-review queues a new W1 run that cancels the reviewer before
# it posts, then skips itself (non-qualifying label). The PR silently stalls with no review posted.
# If agent-in-progress is missing when you reach this step, apply it first, then bot:ready-for-review.

# Enable auto-merge (worktree-safe — use instead of `gh pr merge --auto`)
github_pr_enable_auto_merge(number: <PR#>)                         # SQUASH (default)
github_pr_enable_auto_merge(number: <PR#>, mergeMethod: "REBASE")  # or MERGE
```

<details>
<summary>Script (single command — when MCP tools are unavailable)</summary>

`make ship-pr` runs the full 5-step pipeline in one shot: create draft PR → label → mark ready → request Copilot review → transition Jira to "In Review". Requires `JIRA_API_TOKEN` + `JIRA_EMAIL` env vars for the Jira step. Use `NO_JIRA=1`, `BODY_FILE=`, `BASE=`, and `ARGS=` Make variables to pass additional options; or invoke `node scripts/ship-pr.js` directly for full flag control.

```bash
# Minimal Make target — auto-detects body from .github/tmp-pr-body.md if it exists
make ship-pr TITLE="LS-#### type(scope): description"

# Make target with options
make ship-pr TITLE="LS-#### type(scope): desc" NO_JIRA=1
make ship-pr TITLE="LS-#### type(scope): desc" BODY_FILE=.github/tmp-pr-body.md BASE=my-branch

# Direct script — use for full flag control (--dry-run, --json, --no-jira, --body-file, etc.)
node scripts/ship-pr.js --title="LS-#### type(scope): desc" --body-file=.github/tmp-pr-body.md
node scripts/ship-pr.js --title="LS-#### type(scope): desc" --no-jira
node scripts/ship-pr.js --title="LS-#### type(scope): desc" --dry-run
```

</details>

<details>
<summary>CLI fallback (only when both MCP and ship-pr script are unavailable)</summary>

```bash
gh pr create --draft --title "LS-#### type(scope): msg" --body-file ".github/tmp-pr-body.md" --base main
bash scripts/cleanup-pr-body.sh
gh pr ready <PR#>
```

</details>

## Reference Documents

| Document                                                                                       | Content                                                                     |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [references/self-review.md](references/self-review.md)                                         | Self-review checklist and steps                                             |
| [references/create-pr.md](references/create-pr.md)                                             | PR creation prerequisites, template, and post-creation steps                |
| [references/fix-reviews.md](references/fix-reviews.md)                                         | Fix Copilot review comments (single PR and batch)                           |
| [references/pr-maintenance.md](references/pr-maintenance.md)                                   | Full PR lifecycle management doc                                            |
| [references/common-review-patterns.md](references/common-review-patterns.md)                   | Top 20 Copilot review patterns and fixes                                    |
| [references/fix-copilot-reviews-workflow.md](references/fix-copilot-reviews-workflow.md)       | Batch workflow for fixing reviews across all open PRs                       |
| [references/pr-body-powershell-pitfalls.md](references/pr-body-powershell-pitfalls.md)         | PowerShell encoding issues with PR bodies                                   |
| [references/pr-common-issues.md](references/pr-common-issues.md)                               | Common PR creation issues and fixes                                         |
| [references/pr-maintenance-workflow.md](references/pr-maintenance-workflow.md)                 | Detailed sweep workflow (local and cloud modes)                             |
| [references/pr-ui-screenshots.md](references/pr-ui-screenshots.md)                             | When and how to include UI screenshots                                      |
| [references/sweep-and-parallelization.md](references/sweep-and-parallelization.md)             | Sweep loop algorithm and parallel validation                                |
| [references/agent-screenshots.md](references/agent-screenshots.md)                             | Capture before/after screenshots for UI PRs using browser MCP               |
| [references/bug-verification-templates.md](references/bug-verification-templates.md)           | PR body templates for proving bug fixes (screenshots, tests, queries, logs) |
| [references/ci-checks-reference.md](references/ci-checks-reference.md)                         | Every PR check: what it validates, why it fails, and how to fix it locally  |
| [references/copilot-auto-approve-flow.md](references/copilot-auto-approve-flow.md)             | Full flow & invariants for the `bot-review` workflow — read before editing  |
| [workflow-overview (PR Preview section)](../workflow-overview/SKILL.md#pr-preview-deployments) | PR preview URL pattern and how to verify deployment (do not list branches)  |

## Parent-Agent PR Recovery

When a subagent fails to push or create a PR, the parent agent should **prefer MCP tools** to recover — use `gh` only when MCP is unavailable. The subagent's commits already exist in its ephemeral worktree; the parent just needs to push and ship.

**Recovery sequence (MCP-first):**

```
# 1. Push the subagent's commits (include worktree path and setUpstream for new branches)
worktree_push(worktree: "<absolute path to subagent worktree>", setUpstream: true)
# OR if worktree_set is active for the subagent's worktree:
worktree_run(command: "git push --set-upstream origin <branch>")

# 2. Create the PR as a draft, using the subagent's branch name (from worktree_status().headRefName)
github_create_pr(
  head: "<branch-name>",    # from worktree_status().headRefName
  title: "LS-#### type(scope): msg",
  body: <markdown>,
  draft: true
)

# 3. Apply the agent-in-progress label
github_manage_labels(prs: [<PR#>], add: ["agent-in-progress"])

# 4. Mark ready for review
github_mark_pr_ready(number: <PR#>)

# 5. Request Copilot review
github_request_review(prs: [<PR#>])
```

**Prefer MCP; use `gh` only when MCP is unavailable.** The `legacy-sports-github` MCP server exposes all required operations as first-class tools (`github_create_pr`, `github_mark_pr_ready`, `github_manage_labels`, `github_request_review`) and should always be preferred. `gh pr create` / `gh pr ready` / `gh pr edit --add-label` are shell-level fallbacks for when MCP servers are unavailable. Using `gh` CLI in a recovery context can also silently use the wrong working directory, bypasses the `head` parameter that routes the PR to the correct branch, and produces shell-history noise that MCP gap audits flag.

**Shell fallback (only if MCP server is unavailable):**

```bash
gh pr create --draft --title "LS-#### type(scope): msg" --body-file ".github/tmp-pr-body.md" --base main
bash scripts/cleanup-pr-body.sh
gh pr edit <PR#> --add-label "agent-in-progress"
gh pr ready <PR#>
```

## Related Skills

- [planning](../planning/SKILL.md) -- Structured planning phase (referenced by self-review and PR body guidance)
- [rebase](../rebase/SKILL.md) -- Rebase branches and resolve merge conflicts
- [debugging](../debugging/SKILL.md) -- Debug CI failures and code defects
- [worktree-workflow](../worktree-workflow/SKILL.md) -- Working in isolated worktrees
