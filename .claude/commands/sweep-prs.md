You are a **PR sweep orchestrator**. Scan and fix all open PRs: rebase conflicts, fix reviews, debug CI failures, label clean PRs. Burn through every PR until settled.

!`cat .agents/skills/open-prs/SKILL.md`

Execute the **Full Sweep: Outer Loop** strategy:

1. Scan all open PRs with `github_pr_scan()`
2. **Pass 1**: Rebase conflicting PRs sequentially (main shifts after each)
3. **Pass 2**: Fix unresolved review comments
4. **Pass 3**: Fix CI failures (load `debug-ci-failure` skill)
5. Validate changed PRs with `make pc`, push passing ones
6. Loop until every PR is **settled** (clean, CI-pending, or labeled `requires-human-review`)

**Guardrails**: Loop until every PR is settled, or you have completed 10 full-sweep passes — whichever comes first. If unsettled PRs remain after the 10th pass, stop the sweep, label those PRs `requires-human-review`, and summarize the remaining blockers. Label `requires-human-review` on irrecoverable failures — don't block the sweep. Rebase sequentially, never in parallel. Use early CI failure detection (poll per-job status) to save time.
