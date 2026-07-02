<!--
  AUTO-GENERATED — DO NOT EDIT.
  Source of truth: .claude/commands/work-ticket.md — edit that file instead.
  Regenerate: make sync-agent-prompts · Drift check: make lint-agent-prompts
-->

> **Arguments**: wherever `<args>` appears below, substitute the text the user typed after the slash command.

Your job: implement Jira ticket **<args>** end-to-end.

**First and only directive:** invoke the skill file `.agents/skills/work-ticket/SKILL.md` immediately, before any other tool call. The skill is the authoritative procedure — follow every step in order and complete every item in the `TodoWrite` checklist it creates. Do not paraphrase, summarize, or substitute steps.

> Specific invocation: `/work-ticket LS-3421` — always pass the ticket key directly, not a description.
