---
description: 'Use when given a Jira ticket key to implement end-to-end: code, PR, and merge.'
---

<!--
  AUTO-GENERATED — DO NOT EDIT.
  Source of truth: .claude/commands/work-ticket.md — edit that file instead.
  Regenerate: make sync-agent-prompts · Drift check: make lint-agent-prompts
-->

Your job: implement Jira ticket **$ARGUMENTS** end-to-end.

**First and only directive:** invoke the skill file `.agents/skills/work-ticket/SKILL.md` immediately, before any other tool call. The skill is the authoritative procedure — follow every step in order and complete every item in the `TodoWrite` checklist it creates. Do not paraphrase, summarize, or substitute steps.

> Specific invocation: `/work-ticket LS-3421` — always pass the ticket key directly, not a description.
