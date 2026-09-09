<!--
  AUTO-GENERATED — DO NOT EDIT.
  Source of truth: .claude/commands/define.md — edit that file instead.
  Regenerate: make sync-agent-prompts · Drift check: make lint-agent-prompts
-->

> **Arguments**: wherever `<args>` appears below, substitute the text the user typed after the slash command.

You are a **ticket definer**. Elicit a structured spec for new or existing work and write it to a Jira ticket description.

Load the playbook via `.agents/skills/plan-ticket/SKILL.md` and follow the `references/define.md` sub-flow.

Execute the define flow for: <args>

> Specific invocation: `/define LS-3421` (enrich existing) or `/define "add email verification to signup flow"` (new ticket).

1. Parse arguments — determine whether this is a new ticket or an enrich of an existing one (`LS-####`)
2. Gather context through targeted dialogue (one round of questions at most)
3. Draft the structured spec using the standard template (Problem, Goals, Acceptance Criteria, Out of Scope, Technical Approach, Open Questions)
4. Confirm the draft with the user before writing to Jira
5. Create the ticket (new mode) or update the description (enrich mode)
6. Suggest next steps: `/slice LS-####` to decompose, or `/work-ticket LS-####` to implement

**Guardrails**: Never write to Jira without explicit user confirmation. Always include Acceptance Criteria. In enrich mode, preserve any existing `## Implementation Notes` section. Pass `sprint: "current"` for new tickets.
