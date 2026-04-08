# Cloud Agent Sweep

> This file contains the full cloud agent workflow for PR sweeps.
> For the overview, decision table, critical rules, and environment compatibility, see [SKILL.md](SKILL.md).
> For local agent pass playbooks, see [PASSES.md](PASSES.md).

Cloud agents (Copilot Coding Agent) cannot commit or push code. This workflow covers: scan, triage, all API-only actions, and producing an actionable report for items that need a local agent.

**Available MCP servers:** `legacy-sports-github`, `legacy-sports-ci`

---

## Cloud Step 1: Scan All Open PRs

Use the `github_pr_dashboard` MCP tool to get a full snapshot of all open PRs in a single call. It returns mergeable status, CI status, unresolved review threads, labels, and review decision for each PR.

```
github_pr_dashboard(state: "open", limit: 100, excludeDrafts: true)
```

The response includes a `summary` object with counts (`total`, `conflicting`, `ciFailing`, `ciPending`, `ciPassing`, `withUnresolvedThreads`, `approved`) and a `prs` array with per-PR details. When drafts were skipped, the response also includes a top-level `draftsExcluded` field (omitted when 0) reflecting how many draft PRs were skipped — log this in the sweep report.

For detailed inspection of specific PRs, use `github_pr_batch_status` with an array of PR numbers.

> For a **scan-only** request, stop here and report the results.

## Cloud Step 2: Label Clean PRs

Proactively add `merge-when-ready` to any PR with no unresolved review threads:

```
github_manage_labels(number: <PR#>, add: ["merge-when-ready"])
```

This is safe even if CI is pending — failing CI will automatically remove the label. Do not wait for the `copilot-auto-approve` bot.

## Cloud Step 3: Re-run Flaky / Failed CI

For each PR where `ciStatus` is `fail`, inspect the failed checks to determine if the failure looks transient (flaky test, timeout, infrastructure error) vs. a real code issue.

### 3a. Diagnose the failure

Use the CI MCP tools to read logs:

```
ci_list_runs(branch: "<branch>", status: "failure", limit: 1)
ci_get_logs(runId: <runId>, failedOnly: true)
ci_search_logs(runId: <runId>, pattern: "error|FAIL|Error:", isRegex: true, contextBefore: 5, contextAfter: 5)
```

### 3b. Decide: re-run or escalate

| Log Evidence                                     | Action                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Flaky test (different test fails each run)       | Re-run: `ci_rerun(runId: <id>, failedOnly: true)`                     |
| Timeout / infrastructure error                   | Re-run: `ci_rerun(runId: <id>, failedOnly: true)`                     |
| Consistent lint/type/build/test error            | Comment diagnosed root cause on PR — requires code fix by local agent |
| Formatting failure (`nx format:write` would fix) | Comment diagnosed root cause on PR — requires code fix by local agent |

```
ci_rerun(runId: <runId>, failedOnly: true)
```

After re-running, the PR moves to `ciPending`. Track these for the final report.

## Cloud Step 4: Request Copilot Reviews

Find PRs without a Copilot review and request one. This is **required** for bot-authored PRs (e.g. `legacy-sports-code-bot`) — the repository ruleset only auto-triggers Copilot review for user-authored PRs. The `requestReviewers` REST API silently drops Copilot when called with GitHub App installation tokens (`ghs_*`); only user OAuth tokens work.

```
github_request_review(number: <PR#>, copilot: true)
```

> **Note**: The MCP tool automatically uses a user OAuth token (via `gh auth token`) for Copilot requests, bypassing the default app token. If no user token is available, it will report an error instead of silently failing.

## Cloud Step 5: Resolve Process / Meta Review Threads

Some review threads suggest no code change — they are process comments, "nice to have" suggestions, or scope observations (pattern #10 in the common Copilot review patterns). These can be resolved directly without code changes.

For each PR with unresolved threads, fetch the thread details:

```
github_get_review_threads(number: <PR#>, unresolvedOnly: true)
```

For each thread, read the comment body. If the thread is a **process/meta comment** that does not require a code change (e.g., "Consider extracting this into a utility in a future PR", "Nice improvement", suggestions about documentation outside the PR scope), resolve it:

```
github_resolve_thread(threadId: "<threadId>")
```

**Do NOT resolve threads that request actual code changes** — those require a local agent. If a PR has unresolved threads that all require code changes, comment on the PR listing the unresolved threads. The PR is now **settled** (needs local agent — do not label `requires-human-review` since a local agent can fix code).

## Cloud Step 6: Final Report

After completing all API-only actions, produce a summary report. This is the primary deliverable of a cloud sweep.

### Summary Table

```
| PR    | Title                        | Mergeable   | CI        | Threads | Label                  | Cloud Action         | Settled | Reason                        |
|-------|------------------------------|-------------|-----------|---------|------------------------|----------------------|---------|-------------------------------|
| #101  | feat(scoring): new algo      | MERGEABLE   | pass      | 0       | merge-when-ready       | Verified clean       | ✅      | Clean                         |
| #102  | fix(ui): button color        | CONFLICTING | —         | 0       | —                      | Diagnosed            | ⏳      | Needs local rebase            |
| #103  | feat(db): add index          | MERGEABLE   | fail      | 2       | —                      | Re-ran CI            | ⏳      | CI re-running                 |
| #104  | chore(deps): bump lodash     | MERGEABLE   | pass      | 1       | —                      | Resolved 1 thread    | ✅      | Clean                         |
| #105  | feat(ws): reconnect logic    | MERGEABLE   | fail      | 0       | —                      | Diagnosed            | ⏳      | Type error needs local fix    |
| #106  | fix(auth): token refresh     | MERGEABLE   | pass      | 3       | requires-human-review  | Resolved 1 meta      | ✅      | Needs prod DB creds (no env)  |
```

### Report Sections

1. **Actions Taken** — list every API action performed:
   - **Draft PRs skipped** (count — excluded at scan; owned by their creating agent)
   - PRs labeled `merge-when-ready` (count + PR numbers)
   - PRs labeled `requires-human-review` (count + PR numbers + reasons — must each cite a blocker outside agent reach)
   - CI runs re-triggered (count + PR numbers + run IDs)
   - Review threads resolved (count + PR numbers)
   - Copilot reviews requested (count + PR numbers)

2. **Needs local agent** — PRs that need code changes a cloud agent cannot make (blocker commented on each):
   - PRs with merge conflicts (need local rebase)
   - PRs with CI failures requiring code fixes (include the diagnosed root cause)
   - PRs with unresolved review threads requiring code changes (include thread summaries)

3. **Needs human** — PRs labeled `requires-human-review` (blockers outside any agent's reach):
   - Missing credentials, product/design decisions, external dependencies

4. **Pending** — items where status is not yet final:
   - PRs with CI still running or re-running
   - PRs where Copilot review was just requested (no results yet)

All PRs should appear in exactly one settled category. No PR should be left unaccounted for.

---

## Cloud Full Sweep Algorithm

For a full cloud sweep, run steps 1–8 in order. Unlike the local sweep, there is no outer loop because the cloud agent cannot fix code issues that cascade. The cloud agent settles every PR by confirming it is clean, commenting the blocker for issues a local agent can fix, or labeling `requires-human-review` only for blockers outside any agent's reach.

1. Scan all open PRs (Cloud Step 1)
2. Re-run flaky CI (Cloud Step 3) — do this early so CI has time to complete
3. Request Copilot reviews on unreviewed PRs (Cloud Step 4) — triggers auto-approve for clean PRs
4. Resolve process/meta review threads (Cloud Step 5)
5. Comment on PRs with issues the cloud agent cannot fix — explain the blocker on each. Only label `requires-human-review` if the blocker is outside any agent's reach (not just "needs code changes")
6. If any CI re-runs were triggered, record the run IDs in the report as **pending** and continue — do **not** `sleep` or poll waiting for them. A cloud agent that sleeps 3 minutes looks indistinguishable from a hang and burns wall-clock time the session may not have. The next sweep (or a manual re-run) will pick up the results.
7. Verify clean PRs are labeled (Cloud Step 2)
8. Produce final report (Cloud Step 6) — every PR must appear in a settled category
