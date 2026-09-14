# Author Agent Contract (Bot-PR Flow)

When a PR is authored by the Author Agent and reviewed by the Reviewer Bot, the Author Agent must follow this protocol exactly. Deviations cause the Reviewer Bot to flag format errors or escalate to a human.

> **Known gap — Lambda-hosted `legacy-sports-github` server can have no usable identity (LS-4743).** Every `github_reply_to_review_thread` / `github_reply_to_review` call below routes through the hosted `legacy-sports-github` MCP server. When that server runs on Lambda and its GitHub App credentials aren't resolving (missing/misconfigured `GITHUB_TOKEN_SECRET_NAME` secret, or a revoked App installation), every call fails with `GitHub MCP server (Lambda): could not provision a GitHub token ... Interactive sources (.netrc, gh CLI, device flow) are not available in Lambda.` This is a server-side credential/config problem, not something fixable from inside a session — diagnosing and fixing it requires AWS access (see [`mcp-github-lambda-ops.md`](../../../../docs/dev-process/mcp-github-lambda-ops.md)), which most agent sessions, including CCR, do not have. **Do not** fall back to `gh api graphql` (or any call) with a personal/OAuth token — that authors the reply as a human identity instead of the bot, breaking the Author Agent Contract this section exists to enforce. Instead fall back to `mcp__github__add_reply_to_pull_request_comment({ owner, repo, pullNumber, commentId, body })` — the platform-authenticated built-in GitHub connector, unaffected by this Lambda's credential state — passing the numeric REST `commentId` (`databaseId` from `github_get_review_threads`), not the GraphQL `threadId`. Report the failure once (a PR or Jira comment) so a human can run the ops runbook; do not retry the same call in a loop.

## 1. PR Creation

- Open the PR as a **draft**. Work locally; push freely — pushes do NOT fire bot reviews while in draft.
- When initial code is complete: mark the PR **ready_for_review**. This fires **Cycle 1**.
- Immediately after marking ready, apply the **`bot:ready-for-review`** label via `github_manage_labels(prs: [<PR#>], add: ["bot:ready-for-review"])`. **This must be the last label applied** — `Reviewer (W1)` uses `concurrency.cancel-in-progress: true`, so any label applied after this cancels the reviewer run before it posts a review, then skips itself because the new label is not a qualifying trigger. Ensure `agent-in-progress` is already on the PR (applied while still a draft, step 2 of [create-pr.md](create-pr.md)) before applying `bot:ready-for-review`. The `ready_for_review` event alone fires Cycle 1, but `Reviewer (W1)` only honors subsequent `synchronize` events while this label is present — without it, any push made before the bot finishes reviewing (or any later fix-push) starts no reviewer run. The reviewer **preserves the label through merge** (including on APPROVED, per LS-4678) so post-approval pushes still fire a fresh cycle and don't silently stall behind the `bot-review` ruleset gate on the new HEAD SHA. You generally do not need to re-apply between cycles; the only cases requiring re-application are (a) a prior cycle was rate-limited (`review-bot-degraded` label applied with no review) — see [fix-reviews.md](fix-reviews.md) step 8, or (b) a non-rate-limit terminal infra failure stripped the label (Review Label Guard (W7) will auto-reapply on the next push if a prior bot APPROVED exists, but for the first push after such a failure you may need to re-apply manually).

## 2. Response to Cycle 1 Review

After the bot posts its Cycle 1 review, the agent must:

> **Prefer the one-shot.** `github_finish_fix_round({ prNumber, replies: [{ threadId, kind: "FIX"|"JUSTIFY", sha?, body? }, ...] })` performs steps 1, 3, and 4 below in a single tool call: it validates every reply before any side effect, emits FIX bodies as exactly `FIX: <sha>` (strict bot format), resolves only the FIX threads (JUSTIFY remains open for Cycle 2 adjudication), and applies `bot:ready-for-review`. Partial reply failures surface in `errors[]` and do not block successful replies. The explicit steps below remain valid when you are mid-stream or only need part of the sequence. `replies` may be omitted or `[]` — the label-only re-trigger shape for a threadless push (conflict resolution, base merge, rebase onto main) on a Ready PR with zero unresolved threads: it skips straight to the `bot:ready-for-review` remove-then-add cycle instead of the raw two-call `github_manage_labels` fallback (LS-10121).

1. Reply to **every open thread** with exactly one of — post each reply via `github_reply_to_review_thread({ threadId: "PRRT_...", body: "..." })` (local/headless; ToolSearch: `"reply_to_review_thread"`) or `mcp__github__add_reply_to_pull_request_comment` (preferred on Claude Code on the web to avoid OAuth attribution to user's personal token):
   - `FIX: <sha>` — the fix is already committed at `<sha>`
   - `JUSTIFY: <rationale>` — the finding is incorrect or the suggestion is out of scope; explain why. **When the finding is a false positive** (the pattern is intentional, not just out of scope), also add an inline code comment at the flagged line(s) or a note in the nearest relevant doc (e.g. a `SKILL.md` or `references/` entry) explaining the intent — so future contributors and reviewers don't raise the same flag again.
2. Push any fix commits (including inline comments or doc notes added for JUSTIFY false positives).
3. **Resolve every thread answered with `FIX:`** in a single batched `github_resolve_threads({ threadIds: [...], prNumber: PR# })` call. Do **not** resolve threads answered with `JUSTIFY:` — those need bot adjudication in the next cycle.
4. Apply the **`bot:ready-for-review`** label via `github_manage_labels(prs: [<PR#>], add: ["bot:ready-for-review"])`. This fires **Cycle 2**. If the label is already present (e.g., a prior cycle was rate-limited), remove then re-add it — `github_manage_labels(prs: [<PR#>], remove: ["bot:ready-for-review"])` followed by `github_manage_labels(prs: [<PR#>], add: ["bot:ready-for-review"])` — so GitHub emits a fresh `labeled` event.

> Skipping a thread is not allowed — unaddressed threads become mandates in Cycle 2.

## 3. Response to Cycle 2 Mandates

> **If the Cycle 2 review is LGTM/APPROVED with no new findings, stop — no action is needed.** JUSTIFY threads that were not escalated into mandates are considered accepted by the bot. Do **not** post any further replies (not `FIX:`, not `CANNOT-COMPLY:`, nothing). The PR is ready to merge pending CI.

If the Cycle 2 review contains mandates (CHANGES_REQUESTED), the agent must:

1. Reply to **every open thread** with (use `github_reply_to_review_thread({ threadId: "PRRT_...", body: "FIX: <sha>" })`):
   - `FIX: <sha>` — the fix is committed at `<sha>` (the only accepted reply in Cycle 2)
2. Push any fix commits.
3. **Resolve every thread answered with `FIX:`** in a single batched `github_resolve_threads({ threadIds: [...], prNumber: PR# })` call.
4. Apply **`bot:ready-for-review`** again via `github_manage_labels(prs: [<PR#>], add: ["bot:ready-for-review"])`. This fires **Cycle 3**. If the label is already present, remove then re-add it as above.

> Neither `JUSTIFY:` nor `CANNOT-COMPLY:` is accepted in Cycle 2. `JUSTIFY:` closed at Cycle 1; `CANNOT-COMPLY:` is only valid in Cycle 3+.

## 4. Response to Cycle 3+ (Escalation)

If a mandate persists into Cycle 3, the agent may reply with:

1. `FIX: <sha>` — fix committed at `<sha>`
2. `CANNOT-COMPLY: <issue-id>` with the reason on the **next line** — the mandate is claimed impossible

`CANNOT-COMPLY` no longer escalates to a human unconditionally. The bot evaluates the claim on its merits (same accept-or-refute-with-reason treatment as `JUSTIFY`, LS-8337): if it **accepts** the claim, the finding is dropped from output with no further action needed; if it **refutes** the claim, the finding survives as a normal mandate (its body will directly address why the claim doesn't hold — do not expect the identical original finding text). Escalation to `needs-human-arbitration` now only happens if the claim is **still unresolved** after the bot's Cycle 3 verification pass — a genuine standoff with no more review cycles left to negotiate.

After replying, **resolve every thread answered with `FIX:`** in a single batched `github_resolve_threads({ threadIds: [...], prNumber: PR# })` call. Do **not** resolve `CANNOT-COMPLY:` threads — leave them open until you see whether the bot accepted, refuted, or (rarely) escalated the claim.

Example:

```
CANNOT-COMPLY: LS-1234
This change requires modifying a generated file that must not be edited manually.
```

> `CANNOT-COMPLY:` is a Cycle 3+ token. Using it in Cycle 2 will be treated as malformed.

## 4a. If the bot escalates to `needs-human-arbitration` (cycle limit hit)

When the cycle limit (MAX_CYCLE = 3) is reached, the bot posts an arbitration comment listing the outstanding findings, applies `needs-human-arbitration`, and sets `bot-review` to failure.

> Prior `APPROVED` bot reviews do **not** count toward `MAX_CYCLE` (LS-4904) — only unresolved `CHANGES_REQUESTED` cycles consume slots, so post-approval pushes start fresh.

**Author agent response:**

1. Push new commits addressing each outstanding finding listed in the arbitration comment.
2. The bot **automatically resets the cycle counter** on the next push (`synchronize` event with `needs-human-arbitration` present): it dismisses prior reviews, removes the `needs-human-arbitration` label, and posts a fresh Cycle 1 review. No `bot:reset-cycle-counter` or maintainer action is needed.
3. Ensure `bot:ready-for-review` is present (it is preserved by the bot through merge — re-apply only if it was stripped).

> **Do NOT** ask the maintainer to apply `bot:reset-cycle-counter` just because the cycle limit was hit and you have new code to push. The auto-reset handles this. `bot:reset-cycle-counter` is only needed if you cannot push new commits (e.g. the bot finding is wrong and you are using `review-bot-override`, or a maintainer wants to reset without requiring a push).

## 5. If bot-review remains blocked after CANNOT-COMPLY

`CANNOT-COMPLY` filed and then silently accepted or refuted by the bot needs no maintainer action — the finding is dropped or continues as a normal mandate, respectively. Only when the bot's Cycle 3 verification pass still finds the claim unresolved (see §4) does it escalate to `needs-human-arbitration` and set `bot-review` to `failure` (blocking merge). At that point a maintainer must apply the `review-bot-override` label:

```
github_manage_labels(prs: [PR#], add: ["review-bot-override"])
```

This triggers W5 (`.github/workflows/review-bot-override.yml`), which sets `bot-review` to `success` and posts an audit comment. It is the **formal escape hatch** for persistent bot disagreement — prefer it over GitHub's admin "Merge without waiting for requirements" button, which leaves no audit trail. See [ci-checks-reference.md](ci-checks-reference.md#bot-review-commit-status) for details.

## 6. If `needs-human-security-review` is applied and the author can't satisfy CODEOWNER review

When the reviewer flags a critical security finding it applies the `needs-human-security-review` label. The label itself is informational — the actual gate is the **CODEOWNER review requirement**, which the PR author cannot satisfy on their own PR. After a human security reviewer has examined the finding and confirmed it inapplicable, mitigated, or accepted, a maintainer applies the `security-review-override` label:

```
github_manage_labels(prs: [PR#], add: ["security-review-override"])
```

This triggers W6 (`.github/workflows/security-review-override.yml`), which submits an `APPROVE` review as the Code Reviewer Bot App (satisfying the CODEOWNER requirement with a non-author identity), removes `needs-human-security-review`, and posts an audit comment. Removing the label dismisses the override approval and re-applies the security label. See [ci-checks-reference.md](ci-checks-reference.md#needs-human-security-review-label-codeowner-gate) for details.

## Format Rules

- **A `FIX:` reply must be exactly `FIX: <sha>` — no trailing prose.** Text after the sha (`FIX: abc123 — fixed the thing`) trips the bot's format-error path. The corrective reply GitHub records is an empty-body `COMMENTED` bot review that **inflates the cycle counter** toward `MAX_CYCLE`, accelerating false `needs-human-arbitration`. Prefer `github_finish_fix_round` (emits the exact format) over hand-writing replies. See [cycle-limit-arbitration-troubleshooting.md](cycle-limit-arbitration-troubleshooting.md).
- **Format errors get corrective replies** — the bot will reply in-thread when a response is malformed; re-post correctly.
- **Never edit the bot's review comments or threads** — the bot reads its own thread state to determine cycle progression; mutation breaks this.
- **No free-form text outside structured replies** — the bot ignores unstructured content and will not count it as a thread response.

## Shortcut

Use `/respond-to-review` to scaffold structured replies for all open threads on the current PR.
