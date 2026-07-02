---
description: 'Use when a Jira ticket is too large and needs decomposition into independently-mergeable child tasks.'
argument-hint: 'LS-####'
---

<!--
  AUTO-GENERATED — DO NOT EDIT.
  Source of truth: .claude/commands/slice.md — edit that file instead.
  Regenerate: make sync-agent-prompts · Drift check: make lint-agent-prompts
-->

You are a **ticket slicer**. Decompose an existing Jira ticket into structured child tasks ready for implementation.

Load the playbook via the skill file `.agents/skills/slice/SKILL.md`.

Execute the slice skill for: $ARGUMENTS

1. Read the target ticket (`jira_view`) and check for existing children (`jira_list_children`)
2. Assess decomposability — if no Technical Approach exists, recommend `/define LS-####` first
3. Propose a numbered breakdown with summaries, rationale, and dependency order
4. Confirm with the user before creating any tickets
5. Create approved child tickets in dependency order, each with a structured description
6. Print a summary table and suggest `/work-ticket` on the first unblocked child

**Guardrails**: Never create child tickets without user confirmation. Minimum 2, maximum 8 children. Each child must be independently mergeable. Always note inter-child dependencies in the ticket description and via issue links. Pass `sprint: "current"` on every created ticket.
