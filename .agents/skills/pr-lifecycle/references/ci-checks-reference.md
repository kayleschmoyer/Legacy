# CI Checks Reference — What Actually Blocks Merge

The single home for the merge-gate truth: which contexts block merge, who writes each one, why each fails, and how to recover. Other docs (workflow-overview, debugging, unblock flows) link here — if you find a restated required-check list elsewhere, treat this file as authoritative and fix the other one.

> **When a check fails:** read the PR comment posted by the `summarize` job first — it shows a per-job status table that usually narrows the problem immediately. Then `ci_get_logs(runId: RUN_ID, failedOnly: true)` for the actual error lines. **Never guess; extract the error text first.** Full evidence-first triage: [ci-failure.md](../../debugging/references/ci-failure.md).

---

## The Four Required Contexts (post-LS-8014 config)

`.github/ruleset.json` requires exactly **four** contexts on `main` (see its `required_status_checks` rule). Everything else — including the granular `🚀 CI Pipeline / *` check runs — is informational.

| Context                         | Kind              | Written by                                                                                                               | Debug entry point                                                            |
| ------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `bot-review`                    | **commit status** | Reviewer Bot — `review.yml` (W1) → `.github/scripts/reviewer/index.mjs` (`setCommitStatus` in `reviewer/lib/github.mjs`) | `github_list_commit_statuses({ prNumber })` + `github_get_review_threads`    |
| `No Merge Conflicts`            | **commit status** | `check-conflicts.yml` job `check-conflicts` (and `check-conflicts-sweep.yml` on main pushes)                             | `github_pr_why_blocked(prNumber)`; sticky `<!-- conflict-notice -->` comment |
| `Verify All Migrations Applied` | check run         | `check-migrations-applied.yml` job `check`                                                                               | `db_migration_status` (hosted DB MCP)                                        |
| `CI Gate`                       | **commit status** | `ci-pipeline.yml` `summarize` job → `.github/scripts/ci-gate.js` (`postCiGate`)                                          | `ci_get_logs(runId, failedOnly: true)` on the CI Pipeline run                |

Three of the four are **commit statuses**, not check runs. Practical consequences:

- `github_retrigger_check` cannot find them — inspect with `github_list_commit_statuses({ prNumber: PR# })` (or `sha`).
- GitHub evaluates the **latest** status per context; there is no `cancelled` status state, so duplicate-run ambiguity (the LS-7988 405 class) cannot recur for them.
- They only exist once their writer runs. If the writer never runs, the PR sits at **"Expected — Waiting for status to be reported"** (see [skip-ci footgun](#the-skip-ci-footgun-pr-stuck-at-expected)).

The `pull_request` rule additionally enforces: squash-merge only, `require_code_owner_review: true` (`.github/CODEOWNERS` → @bkrupa on sensitive paths), approvals dismissed on every push (LS-3977), and `required_approving_review_count: 0` — the review gate is `bot-review`, not GitHub's approval count.

---

## Config vs Live: the Staged-Cutover Model

**`.github/ruleset.json` is config, not live state.** Never assume the live GitHub ruleset matches it.

| Layer                      | What it is                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/ruleset.json`     | Checked-in **target** config. Merging a PR that edits it changes nothing live.                                                                                                  |
| `scripts/apply-ruleset.sh` | The only path from config to live: `bash scripts/apply-ruleset.sh` PUTs the config to GitHub. **Owner-gated** — requires gh admin auth (@bkrupa runs it).                       |
| `check-ruleset.yml`        | "Check Ruleset Drift" — non-required drift detector (fires on PRs touching `ruleset.json`, or via `workflow_dispatch`). Drift warnings **mid-cutover are expected**, not a bug. |

The LS-8014 cutover (granular `🚀 CI Pipeline / *` required check-run names → the single `CI Gate` aggregate; rollout/rollback in [docs/ci-cd/ci-gate-aggregator.md](../../../../docs/ci-cd/ci-gate-aggregator.md)) follows this model: the 4-context set above is the **config**; whether it is live is knowable only by checking.

**Before reasoning about why a PR won't merge, check the live required set** — one of:

1. `github_get_branch_protection()` — reads the **live** rulesets via the API and returns `requiredStatusChecks`.
2. `ci_dispatch_workflow({ workflow: "check-ruleset.yml", waitForCompletion: true })` — in-sync vs a drift diff in the run log.

Two consumers already bridge the config/live gap — useful when debugging:

- **Merge queue** (`merge-queue-processor.js`, `loadConfigRequiredChecks`, LS-7963): unions config-tracked contexts with the live required set — config can _tighten_ the queue's gate ahead of live apply, never loosen it. GitHub's own merge API still enforces only the **live** set (that is what 405s).
- **Orchestrator idempotency guard** (`ci-orchestrator.yml` `check-prior-success`, LS-4182/LS-7736): reads the config contexts (splitting `_commitStatus` entries from check-run entries) to decide whether an approval event needs a CI re-run. Fail-safe: any read problem → re-run CI.

---

## Per-Context Details

### `bot-review` Commit Status

**Writer:** the Reviewer Bot (GitHub App ID 3142924). `review.yml` (W1) fires on `opened` / `ready_for_review` / specific labels / `synchronize`-with-`bot:ready-for-review`, runs `.github/scripts/reviewer/index.mjs`, and sets `bot-review` to `pending` (review starting) → `success` (APPROVE / override) or `failure` (blocking findings, needs-human-arbitration).

**Why it fails:** the reviewer found blocking (critical/high) findings, or the cycle cap forced arbitration.

**HEAD-SHA gating (LS-4678):** the ruleset evaluates `bot-review` against the PR's HEAD SHA — a `success` on an older SHA never carries forward; every push needs a fresh cycle on the new tip. The bot keeps `bot:ready-for-review` on the PR through merge so post-approval pushes auto-fire a new cycle; if the label is externally stripped, Review Label Guard (`review-label-guard.yml`, W7) re-applies it on the next push when a prior bot APPROVED exists.

**Fix (normal path):** the [Review Thread Workflow](fix-reviews.md#review-thread-workflow-bot-review-failures) — get unresolved threads, fix, push, `github_resolve_threads`. Thread resolution without a push re-triggers the reviewer via `copilot-auto-approve.yml` ("Copilot Auto-Approve Recheck", dispatched by the `github_resolve_threads` tool — LS-8121).

**Fix (override):** a maintainer applies `review-bot-override` — `review-bot-override.yml` (W5) sets `bot-review` to `success`, posts an audit comment, and suppresses W1 while present; removing the label restores `pending`. This is the formal escape hatch when the bot persistently misapplies a rule (after `CANNOT-COMPLY` at Cycle 3 — see §5 of the [Author Agent Contract](author-agent-contract.md)). As Author Agent you never apply it yourself.

### `No Merge Conflicts`

**Writer:** `check-conflicts.yml` job `check-conflicts` on PR events (`opened`/`synchronize`/`reopened`/`edited`). It runs a real local `git merge --no-commit --no-ff` test against the base — deterministic, no dependency on GitHub's lazy mergeability API (which caused stuck "Mergeability could not be determined" states, LS-4479). The result is posted as a **commit status**, mirroring `bot-review`/`CI Gate` (LS-9604) — not the job's own check-run, which is named separately and is informational only. This avoids the duplicate-required-name pile-up a check-run accrues under `concurrency: cancel-in-progress` (rapid pushes each spawn and cancel a same-named run; GitHub's merge evaluator can require every one of them to resolve). `check-conflicts-sweep.yml` re-evaluates **all open PRs** whenever `main` advances and POSTs a fresh status when its own test-merge disagrees with the recorded one — a plain POST, no PATCH-restriction workaround needed (an earlier LS-7992 design worked around GitHub forbidding PATCHes to Actions-owned check runs; that whole class of problem doesn't apply to commit statuses).

**Why it fails:** `main` moved ahead with commits that textually conflict with this branch. Side effects: `CI: Conflicts` label + one sticky comment keyed on the `<!-- conflict-notice -->` marker (LS-8229).

**Fix:** `worktree_rebase()` (MCP) or `git fetch origin && git rebase origin/main`, resolve, push. The check re-runs on the `synchronize` event.

### `Verify All Migrations Applied`

**Writer:** `check-migrations-applied.yml` job `check`. Runs on **every** PR targeting `main` — the paths filter is deliberately omitted because a path-filtered required check would leave non-migration PRs stuck at "Expected". Connects as the SELECT-only `ci_readonly` role and compares every file in `lib/db-client/migrations/` against applied entries in `drizzle.__drizzle_migrations` (LS-4843). Requires a self-hosted runner with VPC access to RDS — the target is the shared **dev-stage RDS** (`AWS_STAGE: dev`; the workflow header calls it "production" because that instance serves the production-branded product).

**Why it fails:**

- The PR adds a migration file that has not been applied to the RDS yet (the usual case).
- A migration was applied under a different hash (file edited after applying).
- `"This workflow requires a self-hosted runner"` — the author lacks write permission or the runner is offline; contact the repo owner.

**Fix:** apply the PR's migrations before merge — `db_migration_status` then `db_migrate` (hosted DB MCP, tunnel-free), shell fallback `pnpm --prefix lib/db-client run db:status` / `db:up`. Multi-PR situations: the [apply-pr-migrations skill](../../apply-pr-migrations/SKILL.md). The check re-runs on the next push — **do not** re-dispatch it via `workflow_dispatch` on the PR branch; see [OIDC-gated required checks](#oidc-gated-required-checks-workflow_dispatch-on-a-pr-branch-always-fails) below.

### `CI Gate`

**Writer:** the CI Pipeline `summarize` job ("Post CI Gate aggregate status" step) via `.github/scripts/ci-gate.js`, exactly once per head SHA, on PR-scoped events only.

**What it folds:** the seven granular job results — `lint` (which also runs the format check as of LS-8901 — the two share one job for CI cost, see below), `test` (which runs `nx affected -t typecheck test`), `build`, `custom-checks`, `lockfile-check`, `e2e`, `e2e-mobile` (LS-9411 — narrow Mobile Chrome affected-spec pass) (`GATE_INPUT_JOBS` in ci-gate.js). `success`/`skipped` pass; `failure`/`timed_out`/missing fail; **`cancelled` resolves to a third verdict, `no-verdict`, posted as a `pending` status** (LS-10140). A cancelled job is never red (LS-8219 — it is a superseded duplicate or a job the runner pool died under, not a failure) and, since LS-10140, never green either: ignoring it outright made a job that never ran indistinguishable from one that passed, so the gate claimed "All CI checks passed" for checks that never executed. Pending blocks the merge (GitHub's evaluator and the merge-queue processor both treat a pending required context as unmet) without asserting a failure. Before folding, each cancelled input is classified from the run's own jobs via `classifyCancelledJob` (`.github/scripts/runner-cancellation.js` — the same module `detect-runner-shutdown` uses): a step that concluded `failure` before the cancel landed still posts **red**, and outranks everything; `never-ran` (zero steps and a 404 log blob), `runner-shutdown`, `deliberate-cancel` and an unattributable cancel are all pending. The status description names the class, so "cancelled because the runner died" is readable off the required check itself. A pending post is withheld when any terminal `CI Gate` verdict already stands for the SHA — a cancelled run has no evidence to overturn one. E2E merge-gate semantics (formerly the separate required `e2e-affected` check, LS-7846) are folded in: CI Gate fails if any affected e2e shard OR the mobile pass fails.

**Guards worth knowing:** a SHA-currency guard no-ops if the PR head advanced mid-run (stale runs post nothing), and `summarize` runs under `always() && !cancelled()` so a killed run posts nothing rather than a terminal `cancelled` row — both are why a commit status was chosen over a check run (LS-7988 root cause).

**Why it fails:** one of the granular jobs failed — the status description lists which (`Failing: test (failure)` …). Debug the granular job, not the gate:

| Failing input    | Local reproduction                                                                                                                                 | Failure label                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `lint`           | `pnpm exec nx affected -t lint --fix`                                                                                                              | `CI: Lint Failure`                                           |
| `lint` (format)  | `pnpm exec nx format:write` then commit                                                                                                            | `CI: Formatting`                                             |
| `test`           | `pnpm exec nx affected -t typecheck test`                                                                                                          | `CI: Test Failure`                                           |
| `build`          | `pnpm exec nx affected -t build`                                                                                                                   | `CI: Build Failure`                                          |
| `custom-checks`  | see below                                                                                                                                          | `CI: Custom Checks` (job-level — see below for which script) |
| `lockfile-check` | `pnpm install --lockfile-only` and commit the lockfile                                                                                             | —                                                            |
| `e2e`            | `pnpm exec nx e2e web-e2e -- --grep='@critical'`                                                                                                   | `CI: E2E Failure`                                            |
| `e2e-mobile`     | `pnpm exec playwright test --config=apps/web-e2e/playwright.config.ts --project="Mobile Chrome" --grep='@critical'` (plus the PR's affected specs) | `CI: E2E Failure`                                            |

`custom-checks` bundles: `node scripts/lint-skills.js` (agent-skill lint), `node scripts/check-migration-immutability.js --branch` (a merged migration file was edited — revert it and add a **new** migration instead), `node scripts/validate-workflows.js`, touch-map freshness (advisory), and the repo-script unit suites `pnpm run test:scripts` / `test:scripts:ps`. The `CI: Custom Checks` label is job-level — any one of those independent scripts failing applies it, so it does not by itself say which one failed (LS-9630); read the run's `custom-checks` job log to find the specific failing script.

**Lint + format merge (LS-8901):** the `lint` job runs both the ESLint check and the Prettier format check as sequential steps (one checkout + one `pnpm install` instead of two), so they now surface as a single `🚀 CI Pipeline / lint` check-run row instead of two. The job still exposes separate `lint-failure-excerpt` / `format-failure-excerpt` outputs so the PR failure comment and the `CI: Lint Failure` / `CI: Formatting` labels still identify which check actually failed — but the two no longer have independent job-level pass/fail states for the check-run UI.

Root-cause discipline for lint/type failures: fix the cause — `eslint-disable` and `@ts-ignore` are banned ([standards](../../standards/SKILL.md)). For flaky infra failures rerun first: `ci_rerun(runId: RUN_ID, failedOnly: true)`.

---

## OIDC-Gated Required Checks: `workflow_dispatch` on a PR Branch Always Fails

`github_retrigger_check` correctly refuses to re-request Actions-backed check runs via the Checks API (GitHub 403 "Invalid check_run_id") and points the caller at `ci_dispatch_workflow(workflow, ref: '<branch>')` as the fallback. **For a subset of required-check workflows, that fallback is guaranteed to fail — not flaky, structurally impossible to succeed — when `ref` is the PR's own feature branch.**

**Why:** `check-migrations-applied.yml` and `terraform-plan.yml` assume the read-only `legacy-sports-dev-github-actions-plan` AWS role. Its OIDC trust policy (`terraform/main/github-actions-oidc.tf` → `aws_iam_role.github_actions_plan.assume_role_policy`, `StringLike` condition on `token.actions.githubusercontent.com:sub`) only allows:

```
repo:bkrupa/legacy-sports:pull_request
repo:bkrupa/legacy-sports:ref:refs/heads/main
```

A `workflow_dispatch` run on any other branch produces `sub = repo:bkrupa/legacy-sports:ref:refs/heads/<branch>`, which matches neither pattern. The job fails immediately with `Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity` — retrying the same dispatch reproduces the identical failure every time (confirmed 3/3 on PR #6622 / LS-6149, root-caused in LS-9029).

**Recognize it:** a `workflow_dispatch`-triggered run failing with `AssumeRoleWithWebIdentity` for a role ending in `-github-actions-plan`, dispatched against a non-`main` ref. Treat this as a wrong-recovery-mechanism signal, not an outage — do not rerun or redispatch.

**Fix:** fire a genuine `pull_request` event instead — push a new commit to the PR branch:

```
worktree_commit({ message: "chore: retrigger ci", allowEmpty: true }) + worktree_push()
```

This is exactly what unblocked PR #6622: empty commit `4bc07bf92` on `claude/adoring-hopper-0achdg` fired a fresh `pull_request` event and passed.

`ci_dispatch_workflow` itself fails fast with an explanation (no wasted OIDC retries) when called with `workflow: "check-migrations-applied.yml"` or `workflow: "terraform-plan.yml"` and a non-`main` `ref` — see `OIDC_PLAN_ROLE_MAIN_ONLY_WORKFLOWS` in `tools/mcp/ci-server/src/tools/dispatch-workflow.ts`. Any other OIDC-gated `pull_request`-triggered workflow added later should be added to that set in lockstep.

---

## The skip-ci Footgun (PR stuck at "Expected")

Every job in `ci-pipeline.yml` — **including `summarize`** — carries `!contains(github.event.pull_request.labels.*.name, 'skip-ci')`. With the `skip-ci` label on a PR:

1. All CI jobs skip, so `summarize` never runs and **`CI Gate` is never posted** for that SHA.
2. A required commit status that is never posted shows as **"Expected — Waiting for status to be reported"** — permanently. Nothing retries it.

**Recovery — the event type matters:**

1. Remove the label: `github_manage_labels(prs: [PR#], remove: ["skip-ci"])`.
2. Trigger a **`pull_request`-scoped** run: push a commit (`worktree_commit({ message: "chore: retrigger ci", allowEmpty: true })` + `worktree_push()`) or close/reopen the PR.

The `ci:run` label is **not** sufficient for a missing `CI Gate`: `ci-run-label.yml` translates it into a `workflow_dispatch` of the orchestrator, and on `workflow_dispatch` there is no `pull_request` payload — the granular jobs run and post check runs, but the "Post CI Gate aggregate status" step (`if: github.event.pull_request.number`) skips and `postCiGate` no-ops (`no-pr`). Use `ci:run` when the missing pieces are **check runs**; use a new push when the missing piece is a **commit status**.

---

## Not Required (but still visible on PRs)

The merge queue waits for _all_ checks to finish and blocks on failing ones, so non-required checks can still delay a queued merge — they just cannot 405 it at the GitHub layer.

| Check / status                           | Source                                            | Notes                                                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `🚀 CI Pipeline / *` granular check runs | `ci-orchestrator.yml` → `ci-pipeline.yml`         | Informational since the LS-8014 config cutover; results reach the gate via `CI Gate`                                                                                                                                   |
| `GraphQL Schema & Codegen`               | `check-schema.yml` (GraphQL-touching paths)       | Fails on SDL drift: `pnpm exec nx run db:print-schema && pnpm run codegen`, commit regenerated files                                                                                                                   |
| Security Scanning                        | `security-scanning.yml` (orchestrator-dispatched) | `CI: Security` label on failure; CVE → update dep; secret → rotate immediately                                                                                                                                         |
| `jira-link-check`                        | `jira-link-check.yml`                             | Validates the `jira-link` PR-body marker — and repairs a missing/malformed one from the title key (LS-9279). Its job log is the only agent-readable view of the marker: `✅ Jira Link Check passed (primary: LS-####)` |
| Deploy PR Preview                        | `deploy-pr-preview.yml`                           | Fix the underlying build first; preview failures are usually transient                                                                                                                                                 |
| Jira Branch Sync                         | `jira-branch-sync.yml`                            | Best-effort; never block a merge on it — `jira_transition` manually if needed                                                                                                                                          |
| Check Ruleset Drift                      | `check-ruleset.yml`                               | Expected to warn mid-cutover (see [staging model](#config-vs-live-the-staged-cutover-model))                                                                                                                           |

### `needs-human-security-review` Label (CODEOWNER gate)

Applied by the reviewer on critical security findings. The actual gate is `require_code_owner_review: true` — the author cannot satisfy it on their own PR. A maintainer resolves the deadlock with the `security-review-override` label → `security-review-override.yml` submits an APPROVE as the Reviewer Bot App (a non-author identity), removes the label, and posts an audit comment; removing the override label dismisses that approval again. Contrast with `review-bot-override` (W5): W5 **rejects** a wrong finding by flipping `bot-review`; the security override **ratifies** a correct finding after human review. Maintenance contract: the unlabeled path finds the approval to dismiss by matching the `Security Review Override Applied` marker string — if you change the marker in the workflow, update the matcher constant in the same file in lockstep.

---

<a id="withholding--could-not-post-status-is-a-rate-limit-signature-not-a-verdict-ls-9570"></a>

## "Withholding / could not post status" is a rate-limit signature, not a verdict (LS-9570)

A CI gate or workflow step can compute the correct result and still fail to report it. Recognize this pattern:

- `actions/github-script` steps die with `API rate limit exceeded for installation`.
- A gate script (e.g. `ci-gate.js`) logs that it computed a verdict but explicitly withholds posting it (e.g. `withholding 'success' ... (run-lookup-failed)`) because an API call it needed for corroboration 403'd.
- A step logs `Setting commit status: success - ...` immediately followed by the actual `POST /statuses/...` call 403ing and the job then `setFailed`.

All three **look like a verdict was reached and something else went wrong** — they are not. They are the installation GitHub App token's rate limit being exhausted mid-run. Don't spend time reproducing the underlying check, re-running the summarize/reporting job immediately, or bumping the SHA to force a rebuild — none of those touch the actual cause and the retry will 403 identically seconds later.

**Confirm and remedy:**

1. Call `ci_installation_rate_limit` (not `gh api rate_limit` — that reports a different token's bucket and will misleadingly show plenty of headroom; see [mcp-first § Installation rate limit vs. `gh api rate_limit`](../../mcp-first/references/auth-and-routing.md#installation-vs-user-rate-limit-ls-9570)). A low/zero `remaining` confirms this failure mode.
2. Wait until the returned `resetsAt`.
3. Re-run only the reporting/summarize job that failed to post (`ci_rerun`/`github_retrigger_check` as appropriate) — do not push a new commit or otherwise widen the PR to "fix" it.

---

## Debug Mode

Add the `ci-debug` label to enable `NX_VERBOSE_LOGGING` in the granular jobs:

```
github_manage_labels(prs: [PR#], add: ["ci-debug"])
```

---

## Related References

| Document                                                                                | When to use it                                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [ci-failure.md](../../debugging/references/ci-failure.md)                               | Evidence-first triage: fetch logs, root-cause, reproduce locally |
| [unblock.md](./unblock.md)                                                              | Bulk triage of stuck PRs, Expected-state detection               |
| [fix-reviews.md](fix-reviews.md)                                                        | Clearing `bot-review` failures thread by thread                  |
| [ci-and-merge-pipeline.md](../../workflow-overview/references/ci-and-merge-pipeline.md) | Pipeline/orchestrator/merge-queue architecture                   |
| [docs/ci-cd/ci-gate-aggregator.md](../../../../docs/ci-cd/ci-gate-aggregator.md)        | CI Gate rollout stages and rollback                              |

## Provenance and maintenance

Rewritten 2026-07-02 from the Phase-1 skills audit (merge-gates-and-ci workstream) after the LS-8014 required-set cutover landed in config. Re-verify volatile facts:

- Required contexts: `grep -n '"context"' .github/ruleset.json`
- Commit-status vs check-run markers: `grep -n '_commitStatus' .github/ruleset.json`
- CI Gate folded jobs + cancelled semantics: `grep -n 'GATE_INPUT_JOBS' -A 10 .github/scripts/ci-gate.js`
- skip-ci job guards: `grep -n "skip-ci" .github/workflows/ci-pipeline.yml`
- CI Gate step's PR-event gate: `grep -n "Post CI Gate" -A 2 .github/workflows/ci-pipeline.yml`
- bot-review writer: `grep -n "context: 'bot-review'" .github/scripts/reviewer/lib/github.mjs`
- Live-state check tooling: `grep -n 'requiredStatusChecks' tools/mcp/github-server/src/tools/get-branch-protection.ts`
- OIDC plan-role trust conditions: `grep -n -A 10 'aws_iam_role" "github_actions_plan"' terraform/main/github-actions-oidc.tf`
- OIDC-gated fail-fast workflow list: `grep -n -A 5 'OIDC_PLAN_ROLE_MAIN_ONLY_WORKFLOWS' tools/mcp/ci-server/src/tools/dispatch-workflow.ts`
