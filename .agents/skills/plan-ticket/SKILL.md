---
name: plan-ticket
description: 'Investigate the codebase, produce a technical implementation plan, and write a Jira ticket ready for an engineer (or agent) to pick up. Use when given a feature idea, bug, or improvement that needs to be turned into a well-scoped ticket with risk assessment, affected files, acceptance criteria, and a concrete technical approach. Load before planning any new piece of work that does not yet have a Jira ticket.'
---

# Skill: Plan & Ticket

## Overview

Turn a vague idea into an implementation-ready Jira ticket. The agent investigates the codebase, builds a technical plan, then writes the ticket — so the next engineer or agent who picks it up can start immediately without discovery overhead.

This skill sits between `define` (spec-first, dialogue-heavy) and `work-ticket` (implementation-first). Use it when the idea is clear enough to start scoping but too vague to implement safely.

## When to Use

- User describes a feature, improvement, or bug and says "create a ticket for this"
- You need to decompose a vague idea into a concrete, risk-assessed ticket
- A ticket exists but lacks Technical Approach, risk classification, or affected files
- Invoked via `/plan-ticket <description>`

## When NOT to Use

- The ticket already has a full spec and Technical Approach → use `/work-ticket`
- The user wants to refine acceptance criteria through dialogue → use `/define`
- The user wants to implement immediately, no ticket needed → use `/planning`

## Steps

### Step 0: Verify Jira auth

Call `jira_auth_status()` first.

- If it returns `configured: true`, continue with the Jira-writing flow using the standard Jira MCP tools throughout this skill.
- If it returns `configured: false` or the call fails, follow the auth-aware routing from AGENTS.md:
  - **On Claude Code on the web**: use the Atlassian plugin, passing `cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528"` to every call (`mcp__claude_ai_Atlassian__createJiraIssue`, `mcp__claude_ai_Atlassian__editJiraIssue`).
  - **Otherwise**: stop and tell the user that Jira auth is not configured, and ask whether they want to use the Atlassian plugin. Do not proceed with Jira reads/writes until the user opts in.
  - **If no Jira access at all**: complete the elicitation, recon, and drafting phases, then output the finished ticket spec as plain text for the user to paste manually.

### Step 1: Elicit the task

Parse `$ARGUMENTS`. If it contains a clear task description (≥ 2 sentences covering what and why), proceed to Step 2. Otherwise, ask the user:

- What is the goal? (what should be different after this change?)
- Who experiences the problem and how often?
- What is explicitly NOT part of this change?
- Does this touch: auth, database schema, GraphQL API, mobile app, infra?

Ask at most one batch of questions. Do not pepper the user with multiple rounds.

### Step 2: Classify scope

Before reading any code, classify scope to set planning depth:

| Scope      | Criteria                                                         | Planning Depth |
| ---------- | ---------------------------------------------------------------- | -------------- |
| **Low**    | Single file, no schema or infra changes                          | Read 1–2 files |
| **Medium** | Multi-file, schema/API changes, new UI component                 | Read 3–6 files |
| **High**   | Cross-service, auth, payments, DB migration, infra, mobile + web | Full recon     |

### Step 3: Code reconnaissance

Read only what the blast radius demands. Follow the priority order:

1. **Target file(s)** — most likely to change, named in the task description
2. **Direct imports** — types, utilities, constants the target depends on
3. **Consumers** — grep for references to the target symbol or export
4. **Test files** — existing test coverage for the affected code
5. **Configuration** — `project.json`, schema files, env vars if relevant

Use parallel reads (glob + grep + view in one turn) to finish reconnaissance fast.

Do not read generated files (`*.generated.ts`, `schema.graphql`) — they reveal nothing that the source doesn't already show.

### Step 4: Build the plan

From reconnaissance, produce a structured mental model:

1. **Goal statement** — "I am changing [X] because [Y], which will [outcome]"
2. **Risk level** — Low / Medium / High + one-sentence rationale
3. **File plan** — ordered list of files to modify and what changes each needs
4. **Constraints** — non-obvious things discovered during recon that must be respected
5. **Verification plan** — which tests to run, what to manually check

### Step 5: Draft the ticket

Write the full structured description. Use plain text (no Markdown headings) so Jira renders it correctly in ADF fields. The `- [ ]` markers in Acceptance Criteria are literal checklist markers — not Markdown checkboxes — and must be preserved exactly as shown.

```
Problem:
<1–2 sentences: current behavior and why it falls short>

Goals:
- <measurable or observable outcome>
- <measurable or observable outcome>

Acceptance Criteria:
- [ ] <testable condition — observable by human or automated test>
- [ ] <testable condition>

Out of Scope:
- <explicit exclusion — something the reader might assume is included but isn't>

Technical Approach:
<High-level implementation strategy. Name specific files, Nx projects, or system boundaries. Describe the rough change sequence. 3–8 sentences or a short bullet list. If genuinely unknown, write "To be determined during implementation.">

Open Questions:
- <real blockers or unresolved decisions — omit section if none>
```

**Quality gates for each section:**

- **Problem**: names the current behavior, not just the goal
- **Goals**: present-tense outcomes ("Users can…", "The API returns…"), 2–5 bullets
- **Acceptance Criteria**: each item independently testable — not restatements of Goals
- **Out of Scope**: at least one item — prevents scope creep
- **Technical Approach**: references actual file paths from Step 3 — not generic

Present the draft in a fenced block and ask the user to confirm before writing to Jira.

### Step 6: Write to Jira

After confirmation, create the ticket:

```
jira_create_ticket({
  summary: "<verb phrase ≤ 8 words>",
  description: "<structured spec as plain text>",
  type: "Task",          // or "Story" for user-facing features with multiple ACs
  context: "<why this work matters — user problem, frequency, business need>",
  risk: "<Low|Medium|High> — <one-sentence reasoning>",
  planningNotes: "<comma-separated file paths from Step 3 + key constraints>",
  sprint: "current",
  parent: "<LS-#### epic key, if applicable>"
})
```

### Step 7: Handoff

After creating the ticket, print the URL and suggest next steps:

- **Well-scoped, single PR**: suggest `/work-ticket LS-####` to implement immediately
- **Multiple distinct phases**: suggest `/slice LS-####` to decompose into child tasks
- **Open Questions remain**: recommend resolving them before running `/work-ticket`

## Gotchas

- **Always confirm before writing** — never create a ticket without the user seeing the draft. A hallucinated scope in Jira is worse than no ticket.
- **Acceptance Criteria must be testable** — "Works correctly" is not a criterion. "Users can add an item with a name > 100 chars without error" is.
- **Out of Scope is mandatory** — at least one item. Prevents costly mid-sprint disputes.
- **Technical Approach must reference real files** — if reconnaissance found nothing, write "To be determined" rather than inventing paths.
- **Risk can change mid-recon** — if a "simple UI fix" turns out to need a DB migration, escalate the risk level and deepen the Technical Approach accordingly.
- **Sprint placement** — always pass `sprint: "current"` so the ticket appears on the board. Tickets outside the sprint are invisible to the team.
- **Ticket type** — default to `Task`. Use `Story` only for user-facing features with 3+ acceptance criteria. Never use `Epic` unless the user explicitly asks.
