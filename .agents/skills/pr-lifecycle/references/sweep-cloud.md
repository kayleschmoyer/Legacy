# Cloud PR Sweep — API-Only Playbook

Single-pass sweep for sessions that cannot commit, push, or spawn chips (Claude Code on the web without chip dispatch, Copilot Coding Agent, headless API sessions). Everything here is a GitHub/CI API action plus a report; anything needing a worktree is deferred to a local sweep via the report. Local counterpart: [sweep.md](sweep.md).

**Run the steps below exactly once, in order, then produce the report. Do not sleep, poll, or loop** — a cloud agent that sleeps looks indistinguishable from a hang and burns session wall-clock. If any older instruction says "wait and re-scan", interpret it as: record the pending item in the report and exit; the next sweep picks it up.

Required MCP servers: `legacy-sports-github`, `legacy-sports-ci` (hosted connectors). Verify first:

```
github_auth_status()
```

If `configured: false`, stop and prompt the user.

## Step 1: Scan all open PRs

```
github_pr_dashboard(state: "open", limit: 100, excludeDrafts: true, format: "json")
```

Returns `summary` counts, a `prs[]` array (`mergeable`, `ciStatus`, `reviewDecision`, `unresolvedThreads`, `labels[]`, `branch`), and a top-level `draftsExcluded` count (omitted when 0) — log it in the report. Post-filter out PRs labeled `agent-in-progress` or `sweep-claimed` (owned by other agents; the dashboard does not filter these server-side). For job-level detail on specific PRs use `github_pr_batch_status(numbers: [...])` (≤50 numbers per call) — dashboard `ciStatus` can be stale on old SHAs.

> For a **scan-only** request, stop here and report.

## Step 2: Verify Reviewer Bot labeling on clean PRs

`merge-when-ready` is applied by the Reviewer Bot only — on all PRs, including Dependabot's. See the [Label Ownership table and boxed Dependabot ruling](label-ownership.md#label-ownership); never apply it manually. For a clean PR (MERGEABLE, CI green, 0 threads) missing the label, fix the upstream cause:

- `bot:ready-for-review` missing on current HEAD → `github_manage_labels(prs: [<PR#>], add: ["bot:ready-for-review"])`
- `review-bot-degraded` present (rate-limited cycle) → remove then re-add `bot:ready-for-review`
- `review-bot-billing` present (LLM credits depleted) → **do not retry**; report it for an account owner to top up billing
- Verdict still CHANGES_REQUESTED → the PR needs code work; defer to a local sweep in the report.

## Step 3: Re-run transient CI failures

Do this early so re-runs complete while the rest of the pass proceeds. For each PR with `ciStatus: "fail"`, diagnose then decide:

```
ci_list_runs(branch: "<branch>", status: "failure", limit: 1)
ci_get_logs(runId: <runId>, failedOnly: true)
ci_search_logs(runId: <runId>, pattern: "error|FAIL|Error:", isRegex: true, contextBefore: 5, contextAfter: 5)
```

| Log evidence                                     | Action                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Flaky test / timeout / infrastructure error      | `ci_rerun(runId: <id>, failedOnly: true)` — record run ID as pending                                     |
| Consistent lint/type/build/test/formatting error | `github_comment_pr(number: <PR#>, body: "<diagnosed root cause>")` — needs a local agent; list in report |

## Step 4: Resolve process/meta review threads

For each PR with unresolved threads:

```
github_get_review_threads({ number: <PR#> })
```

Default output is unresolved threads only, each with a `PRRT_` node `id`. Threads that request **no code change** (process comments, "nice to have" observations, out-of-scope suggestions) may be resolved directly, batched per PR:

```
github_resolve_threads({ threadIds: ["PRRT_...", ...], prNumber: <PR#> })
```

The `prNumber` parameter triggers a bot-review recheck; if the token lacks `actions: write` the dispatch is skipped non-fatally (`recheckNote` in the output) — the recheck fires on the next push. Threads requesting code changes stay open: comment the summary on the PR and defer to a local sweep. That PR is settled for this pass (needs-local, not `requires-human-review`).

## Step 5: Comment blockers; label only true human blockers

For each PR this pass could not settle via API actions, post one `github_comment_pr` stating the blocker. Apply `requires-human-review` **only** when the blocker is outside any agent's reach (missing credentials, product/design decision, external dependency) — never for code fixes, conflicts, or review comments a local sweep can handle.

## Step 6: Final report

The report is the primary deliverable. Every scanned PR appears in exactly one category:

1. **Actions taken** — drafts/owned PRs skipped (counts); `bot:ready-for-review` (re-)applied (PR numbers); CI re-runs triggered (PR numbers + run IDs); threads resolved (counts per PR); `requires-human-review` applied (PR numbers + blocker each).
2. **Needs local agent** — conflicts to rebase, CI failures needing code fixes (with diagnosed root cause), code-change review threads (with thread summaries), Dependabot PRs needing the [sweep-dependabot](../../sweep-dependabot/SKILL.md) flow.
3. **Needs human** — `requires-human-review` PRs with cited blockers.
4. **Pending** — CI re-runs in flight (recorded, not awaited).

## Provenance and maintenance

- Rewritten 2026-07-02 from the Phase-1 skills audit (`scratch/skills-audit/synthesis.json`, inconsistency #14): replaces the cloud sections of `pr-maintenance-workflow.md` and the previous `sweep-cloud.md`. Removed: the `Workflow`/`pipeline()` triage primitive (not in the harness), the misnumbered step sequence, `github_resolve_thread` (singular — nonexistent; the real tool is `github_resolve_threads`), and stale `copilot-auto-approve` pipeline claims (that pipeline is retired; `copilot-auto-approve.yml` at HEAD is only the W6 thread-resolution recheck).
- Verify tool names: `grep -rEho "'github_[a-z_]+'" tools/mcp/github-server/src/*.ts | sort -u`
- Verify W6 recheck workflow purpose: `sed -n 1,12p .github/workflows/copilot-auto-approve.yml`
- Verify who applies `merge-when-ready`: `grep -n "merge-when-ready" .github/scripts/reviewer/index.mjs`
