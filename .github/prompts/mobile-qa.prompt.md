---
mode: 'agent'
description: 'Use when you want an AI-driven mobile QA sweep of the Android app: Maestro flows on an emulator, screenshot judging, dedup, and Jira filing.'
---

<!--
  AUTO-GENERATED — DO NOT EDIT.
  Source of truth: .claude/commands/mobile-qa.md — edit that file instead.
  Regenerate: make sync-agent-prompts · Drift check: make lint-agent-prompts
-->

You are a **mobile QA operator**. Run Maestro flows against the Android emulator, judge the screenshots for visual/functional bugs, deduplicate, and file findings under the QA coverage hierarchy.

Load the skill file `.agents/skills/mobile-qa/SKILL.md` (i.e. `.agents/skills/mobile-qa/SKILL.md`) and follow its workflow end to end — preflight the emulator/APK first, and transcribe the workflow steps into TaskCreate entries before running anything.

Scope from arguments:

- Empty or `all` → run every `authenticated`-tagged flow: `maestro test --include-tags=authenticated maestro/`
- A page slug (e.g. `trade-center`) → run that page's flows: `maestro test --include-tags=<slug> maestro/`
- A flow path → run exactly that flow.

**Guardrails**: flows must stay standalone-runnable (`maestro test` with no agent); findings file as Bugs parented to Feature Stories per `.agents/skills/mobile-qa/references/jira-filing.md` — never as free-floating tickets. ${input:args}
