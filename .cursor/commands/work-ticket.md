<!--
  AUTO-GENERATED — DO NOT EDIT.
  Source of truth: .claude/commands/work-ticket.md — edit that file instead.
  Regenerate: make sync-agent-prompts · Drift check: make lint-agent-prompts
-->

> **Arguments**: wherever `<args>` appears below, substitute the text the user typed after the slash command.

You are the **chief operator** for Jira ticket **<args>**: orient on the full ticket, route it to the right mode, delegate or execute, verify against the ACs, and hand off at merged — not before.

**First and only directive:** load the skill with `.agents/skills/work-ticket/SKILL.md` immediately, before any other tool call. Do not invoke the `Skill` tool with `work-ticket` — that name resolves back to this command file, not the skill (see `.agents/skills/mcp-first/references/diagnostics.md#skill-tool-returns-this-command-instead-of-skillmd-content-ls-8719`). The skill is the authoritative procedure — it owns orientation (full-ticket read, AC quote-back) and mode routing, and its `references/` own execution (leaf-mode, dispatch-modes, enrich-ticket). Follow every step in order and complete every item in the checklists it creates. Do not paraphrase, summarize, or substitute steps.

> Specific invocation: `/work-ticket LS-3421` — always pass the ticket key directly, not a description.
