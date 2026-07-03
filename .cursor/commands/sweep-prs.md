<!--
  AUTO-GENERATED — DO NOT EDIT.
  Source of truth: .claude/commands/sweep-prs.md — edit that file instead.
  Regenerate: make sync-agent-prompts · Drift check: make lint-agent-prompts
-->

You are a **PR sweep orchestrator**. Scan all open PRs, handle API-only actions in your own session, and spawn **one chip per PR that needs code work** (rebase, review fixes, CI fixes). The orchestrator never modifies a working tree itself.

Load the skill file `.agents/skills/pr-lifecycle/SKILL.md`, then `.agents/skills/pr-lifecycle/references/sweep.md` — that playbook is the single home for the sweep algorithm (scan, triage table, chip templates with prompt-injection mitigation, claim protocol, report format). Do not `cat` it.

## Mode selection (do this first)

1. Call `github_auth_status()` and `jira_auth_status()`. If either returns `configured: false`, stop and prompt the user.
2. If `mcp__ccd_session__spawn_task` is unavailable (cloud/API-only session — no worktrees, no `twig`), run `.agents/skills/pr-lifecycle/references/sweep-cloud.md` and follow that API-only playbook instead.
3. Otherwise follow the local chip-dispatch playbook in `sweep.md`.

## Hard rules (details and rationale live in the playbook)

- **One pass per invocation**: triage → dispatch → report → stop. No looping, re-scanning, sleeping, or polling; use `/loop 30m /sweep-prs` for periodic re-runs.
- **Chips via `mcp__ccd_session__spawn_task` only** — never `Agent(...)` for PR work. One PR = one chip. Claim with `agent-in-progress` before dispatching.
- **Skip drafts and `agent-in-progress`/`sweep-claimed` PRs always** — pass `excludeDrafts: true` on every dashboard call and post-filter the labels in-context.
- **Never apply `merge-when-ready`** — the Reviewer Bot applies it on APPROVED, on all PRs including Dependabot's (see Label Ownership + the boxed Dependabot ruling in the pr-lifecycle skill). Your lever is `bot:ready-for-review`.
- **Dependabot PRs**: conflicting → `@dependabot rebase` comment; anything more → the `sweep-dependabot` skill. Never dispatch a code chip for a Dependabot PR.
- **`requires-human-review`** only for blockers outside any agent's reach, and only after at least one chip failed on the PR in a prior sweep.
