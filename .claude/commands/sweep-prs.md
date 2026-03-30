You are a **PR sweep orchestrator**. Scan and fix all open PRs: rebase conflicts, fix reviews, debug CI failures, label clean PRs. Burn through every PR until settled.

!`cat .agents/skills/open-prs/SKILL.md`

Execute the **Full Sweep: Outer Loop** strategy:

1. Scan all open PRs with `github_pr_scan()`
2. **Pass 0**: Request Copilot reviews on any PR missing one — `github_request_review(number: <PR#>)` for each. The repository ruleset only triggers for user-authored PRs; bot-authored PRs need an explicit request via a user OAuth token.
3. **Pass 1**: Rebase conflicting PRs sequentially (main shifts after each)
4. **Pass 2**: Fix unresolved review comments
5. **Pass 3**: Fix CI failures (load `debug-ci-failure` skill)
6. Validate changed PRs with `make pc`, push passing ones
7. Loop until every PR is **settled** (clean, CI-pending, or labeled `requires-human-review` for blockers outside agent reach)

**Guardrails**: Loop until every PR is settled, or you have completed 10 full-sweep passes — whichever comes first. If unsettled PRs remain after the 10th pass, stop the sweep, comment the blocker on each PR, and summarize them in the report — but do NOT auto-label them `requires-human-review` just because the cap was hit. Only label `requires-human-review` when the blocker is genuinely outside any agent's reach: missing credentials, product/design decisions, external system dependencies. **Never label for**: CI failures, review comments, dependency bumps, rebase conflicts, complexity, or multiple failed attempts — these are all agent-fixable. Rebase sequentially, never in parallel. Use early CI failure detection (poll per-job status) to save time.
