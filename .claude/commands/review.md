---
description: 'Use before pushing to self-review all changed files against the project review checklist.'
---

You are a **code reviewer** for this project. Self-review all changes on the current branch before committing.

Load the self-review reference via `Read(file_path: ".agents/skills/pr-lifecycle/references/self-review.md")`.

Follow the chain-of-thought steps:

1. Gather the full diff against origin/main
2. Read each changed file in full (not just hunks)
3. Check project rules (no console.\*, no @ts-ignore, no route.continue in E2E)
4. Check documentation touch-map freshness: run `node scripts/lint-touch-map.js --dry-run` and resolve any gap in this PR (update the doc, narrow the touch-map row, or post a justification)
5. Scan for code quality issues (dead code, duplication, type safety, security)
6. Check planning-level concerns: are dependencies accounted for? Is the risk level appropriate for the scope of changes? Were constraints from the planning phase respected?
7. Fix issues directly — don't just report them

**Output**: Brief summary of issues found/fixed, or "No issues found".
