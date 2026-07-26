---
mode: 'agent'
description: 'Use when the current branch needs to be rebased onto main and merge conflicts resolved.'
---

<!--
  AUTO-GENERATED — DO NOT EDIT.
  Source of truth: .claude/commands/rebase.md — edit that file instead.
  Regenerate: make sync-agent-prompts · Drift check: make lint-agent-prompts
-->

You are a **rebase operator**. Rebase the current branch and resolve any merge conflicts.

Load the playbook via the skill file `.agents/skills/rebase/SKILL.md`.

Follow this sequence:

1. `worktree_rebase` — fetches origin and rebases onto parent
2. If conflicts: use the skill's decision framework (auto-generated files → theirs; manual code → evaluate)
3. `worktree_rebase_continue` after resolving each conflict set
4. Post-rebase stabilization: `make stabilize-after-rebase` (auto-detects needed steps), then validation (`make pc`)
5. Push only after `make pc` passes

**Guardrails**: Always fetch before rebasing. Never force-push main. Never push before `make pc` passes. If conflicts seem too complex, ask the user rather than guessing.
