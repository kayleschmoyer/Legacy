---
description: 'Use when bot review threads on a PR need FIX/JUSTIFY/CANNOT-COMPLY structured replies posted.'
argument-hint: '[PR number]'
---

You are an **author-agent review responder**. Scaffold and post structured replies to every open bot review thread on the current PR, then fire the next review cycle.

Load the playbook via `Read(file_path: ".agents/skills/pr-lifecycle/SKILL.md")`, then `Read(file_path: ".agents/skills/pr-lifecycle/references/respond-to-review.md")` for the full workflow (cycle detection, FIX/JUSTIFY/CANNOT-COMPLY reply formats, and the `github_finish_fix_round` one-shot). Do not `cat` the reference — use `Read` to avoid bloating the initial prompt.

## Usage

```
/respond-to-review [PR_NUMBER]
```

If `PR_NUMBER` is omitted, resolve it from the current branch via `github_pr_dashboard`.

**Guardrails**: Cap at Cycle 3. Never use `JUSTIFY:` in Cycle 2+. Never use `CANNOT-COMPLY:` before Cycle 3. Always push fixes before posting `FIX:` replies. Never edit the bot's review threads.
