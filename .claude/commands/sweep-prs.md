Scan and fix all open PRs: rebase conflicts, fix reviews, debug CI failures, label clean PRs. Burn through every PR until settled.

!`cat .agents/skills/open-prs/SKILL.md`

Focus on the **Full Sweep: Outer Loop** section. Run a full sweep: scan all open PRs, rebase conflicting ones, fix review comments, fix CI failures, and verify clean PRs are labeled. Keep looping until every PR is **settled** — either clean, in a final CI-pending state, or labeled `requires-human-review` (see the skill's settled-state table). Do not stop while unsettled PRs remain.
