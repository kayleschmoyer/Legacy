---
description: 'Use when bot review threads on a PR need FIX/JUSTIFY/CANNOT-COMPLY structured replies posted.'
argument-hint: '[PR number]'
---

You are an **author-agent review responder**. Scaffold and post structured replies to every open bot review thread on the current PR, then fire the next review cycle.

## Usage

```
/respond-to-review [PR_NUMBER]
```

If `PR_NUMBER` is omitted, resolve it from the current branch via `github_pr_dashboard`.

## Workflow

### Step 1 — Identify PR and cycle

1. If no PR number is supplied, call `github_pr_dashboard(state: "open", limit: 50)` and match the current branch name to find the PR number.
2. Call `github_view_pr({ number: PR# })` — record `headRefName` and `headRefOid` (the current HEAD SHA).
3. **Determine the cycle** from the PR's bot review history — count the number of formal bot reviews already posted (each `COMMENTED` or `CHANGES_REQUESTED` review from the Code Reviewer Bot is one cycle). The label `bot:ready-for-review` is a re-review _trigger_, not a reliable cycle counter, because W1 also fires on `synchronize` and `ready_for_review` events:
   - **0 prior bot reviews** → Responding to **Cycle 1** (allow `FIX:` and `JUSTIFY:`)
   - **1 prior bot review** → Responding to **Cycle 2** (allow `FIX:` only)
   - **2+ prior bot reviews** → Responding to **Cycle 3+** (allow `FIX:` and `CANNOT-COMPLY:`)

### Step 2 — Fetch open threads

Call `github_get_review_threads({ number: PR#, unresolvedOnly: true })`.

If there are no unresolved threads, stop and report that the PR is clean — nothing to respond to.

### Step 3 — Apply all code fixes first, then push

Before posting any replies:

1. For each thread that requires a code change, apply the fix now.
2. Validate: `make pc`
3. Commit and push once:
   ```
   worktree_commit({ message: "fix: address bot review cycle N (LS-####)" })
   worktree_push()
   ```
4. Record the commit SHA from `worktree_commit` — this is the `<sha>` used in all `FIX:` replies.

Push **before** posting replies so every `FIX: <sha>` contains the real, already-pushed SHA. Do not post placeholder SHAs and edit later — editing replies conflicts with the "never edit threads" protocol.

### Step 4 — Reply, resolve, and label in one call

Prefer the semantic one-shot `github_finish_fix_round` over hand-rolling three separate tools. It validates every reply BEFORE any side effect (FIX requires `sha`, JUSTIFY/CANNOT-COMPLY require `body`), emits `FIX:` bodies in the exact `FIX: <sha>` format the bot requires, resolves only the FIX threads, and applies `bot:ready-for-review` — replacing Steps 4-6 in a single tool call:

```
github_finish_fix_round({
  prNumber: PR#,
  replies: [
    { threadId: "PRRT_abc", kind: "FIX", sha: "<sha>" },
    { threadId: "PRRT_def", kind: "JUSTIFY", body: "one-sentence rationale" },
    // ...one entry per unresolved thread
  ]
})
```

Returns `{ replied, resolved, labelApplied, errors[] }`. Failed replies do not block successful ones — failed threads appear in `errors[]` and are NOT resolved. If `errors[]` is non-empty, surface it and retry just the affected threads. Then skip to Step 7.

The legacy three-step path below remains valid if you have already started replying out-of-band.

For **every** unresolved thread, post a reply using `github_reply_to_review({ threadId: "PRRT_...", body: <reply> })`.

Choose the reply body based on the thread content and cycle:

**Cycle 1 (FIX or JUSTIFY):**

| Situation                           | Reply format                        |
| ----------------------------------- | ----------------------------------- |
| Fix is committed (from Step 3)      | `FIX: <sha>`                        |
| Finding is incorrect / out of scope | `JUSTIFY: <one-sentence rationale>` |

**Cycle 2 (FIX only):**

| Situation        | Reply format |
| ---------------- | ------------ |
| Fix is committed | `FIX: <sha>` |

> `JUSTIFY:` is rejected in Cycle 2 — that window closed at Cycle 1.

**Cycle 3+ (FIX or CANNOT-COMPLY):**

| Situation                       | Reply format                                                        |
| ------------------------------- | ------------------------------------------------------------------- |
| Fix is committed                | `FIX: <sha>`                                                        |
| Mandate is genuinely impossible | `CANNOT-COMPLY: <issue-id>` followed by the reason on the next line |

`CANNOT-COMPLY` format (the reason **must** be on the next line):

```
CANNOT-COMPLY: LS-1234
This change requires modifying a generated file that must not be edited manually.
```

> **Never** skip a thread. Every open thread must receive a reply before applying the label — the bot treats unanswered threads as unresolved mandates in the next cycle.

> **Never** edit the bot's own comments or threads — the bot reads its thread state to track cycle progression.

### Step 5 — Resolve threads answered with `FIX:`

Collect the `threadId` of every thread you replied to with `FIX:` in Step 4, then resolve them in a single batched call:

```
github_resolve_threads({ threadIds: ["PRRT_...", "PRRT_..."], prNumber: PR# })
```

> Only resolve `FIX:` threads. Threads answered with `JUSTIFY:` (Cycle 1) or `CANNOT-COMPLY:` (Cycle 3+) must remain open — the bot or a human reviewer adjudicates them in the next cycle.

### Step 6 — Apply label to fire next cycle

After replies are posted and `FIX:` threads are resolved, apply the `bot:ready-for-review` label:

```
github_manage_labels({ prs: [PR#], add: ["bot:ready-for-review"] })
```

This triggers the next bot review cycle (W1 workflow fires on the `labeled` event).

### Step 7 — Report

Summarize:

- PR number and cycle responded to
- Number of threads replied to
- Breakdown: how many `FIX:` vs `JUSTIFY:` vs `CANNOT-COMPLY:`
- Number of `FIX:` threads resolved via `github_resolve_threads`
- Whether `bot:ready-for-review` label was applied
- Any threads that could not be replied to (escalate these to the user)

## Guardrails

- **Never use `JUSTIFY:` in Cycle 2+** — the bot rejects it.
- **Never use `CANNOT-COMPLY:` before Cycle 3** — it is treated as malformed in Cycle 2.
- **Always push fixes before posting `FIX:` replies** — never use placeholder SHAs or edit posted replies.
- **Never apply `bot:ready-for-review` if any thread is still unanswered** — the bot will mandate all skipped threads.
- **Never edit the bot's review threads** — this breaks cycle-state tracking.
- **Cap at Cycle 3** — if after three cycles threads remain unresolved, escalate to a human reviewer rather than applying the label again.
