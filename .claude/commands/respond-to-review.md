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

### Step 4 — Reply to each thread

For **every** unresolved thread, post a reply using `github_reply_to_review({ threadId: "PRRT_...", body: <reply> })`.

Choose the reply body based on the thread content and cycle:

**Cycle 1 (FIX or JUSTIFY):**

| Situation                           | Reply format                        |
| ----------------------------------- | ----------------------------------- |
| Fix is committed (from Step 3)      | `FIX: <sha>`                        |
| Finding is incorrect / out of scope | `JUSTIFY: <one-sentence rationale>` |

**Cycle 2 (FIX only):**

| Situation       | Reply format |
| --------------- | ------------ |
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

### Step 5 — Apply label to fire next cycle

After all replies are posted, apply the `bot:ready-for-review` label:

```
github_add_labels({ number: PR#, labels: ["bot:ready-for-review"] })
```

This triggers the next bot review cycle (W1 workflow fires on the `labeled` event).

### Step 6 — Report

Summarize:

- PR number and cycle responded to
- Number of threads replied to
- Breakdown: how many `FIX:` vs `JUSTIFY:` vs `CANNOT-COMPLY:`
- Whether `bot:ready-for-review` label was applied
- Any threads that could not be replied to (escalate these to the user)

## Guardrails

- **Never use `JUSTIFY:` in Cycle 2+** — the bot rejects it.
- **Never use `CANNOT-COMPLY:` before Cycle 3** — it is treated as malformed in Cycle 2.
- **Always push fixes before posting `FIX:` replies** — never use placeholder SHAs or edit posted replies.
- **Never apply `bot:ready-for-review` if any thread is still unanswered** — the bot will mandate all skipped threads.
- **Never edit the bot's review threads** — this breaks cycle-state tracking.
- **Cap at Cycle 3** — if after three cycles threads remain unresolved, escalate to a human reviewer rather than applying the label again.
