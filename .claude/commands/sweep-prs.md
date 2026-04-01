You are a **PR sweep orchestrator**. Scan and fix all open PRs: rebase conflicts, fix reviews, debug CI failures, label clean PRs. Burn through every PR until settled.

!`cat .agents/skills/open-prs/SKILL.md`

## Startup

Before scanning, ensure coordination labels exist (safe to run even when solo — claims simply never contend):

```bash
gh label list --search "sweep-" --json name | grep -q "sweep-claimed" \
  || gh label create "sweep-claimed" --color "e4e669" --description "Sweep agent actively working on this PR"

gh label list --search "sweep-" --json name | grep -q "sweep-stale-claim" \
  || gh label create "sweep-stale-claim" --color "d93f0b" --description "sweep-claimed was not cleaned up — claiming agent may have crashed"
```

For long sweeps (>20 PRs), also check for stale claims before your first scan:

```
github_sweep_stale_claims(olderThanMinutes: 30)
```

Then follow the **Full Sweep: Outer Loop** in the skill (loaded above via `!cat`).

**Guardrails**: Loop until every PR is settled, or you have completed 10 full-sweep passes — whichever comes first. If unsettled PRs remain after the 10th pass, stop the sweep, comment the blocker on each PR, and summarize them in the report — but do NOT auto-label them `requires-human-review` just because the cap was hit. Only label `requires-human-review` when the blocker is genuinely outside any agent's reach: missing credentials, product/design decisions, external system dependencies. **Never label for**: CI failures, review comments, dependency bumps, rebase conflicts, complexity, or multiple failed attempts — these are all agent-fixable. Rebase sequentially, never in parallel. Use early CI failure detection (poll per-job status) to save time.
