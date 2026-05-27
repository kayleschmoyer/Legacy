---
name: define
description: 'Elicit a structured spec for new work through dialogue and write it to a Jira ticket description. Handles both new tickets (creates them) and existing tickets (enriches them). Produces a standard template: Problem, Goals, Acceptance Criteria, Out of Scope, Technical Approach, Open Questions. Load when the user wants to define what to build before implementation starts.'
---

# Skill: Define

## Overview

Help the user write a clear, structured spec for a piece of work, then store it as the Jira ticket description. The spec becomes the authoritative record of scope, acceptance criteria, and intent — making it easier for agents and humans to implement, review, and validate later.

Two modes:

1. **New ticket mode** — no ticket exists yet. Elicit the spec through dialogue, then create the Jira ticket.
2. **Enrich mode** — an existing ticket key is provided. Read the current description, identify gaps, draft an improved version, then update the ticket.

## When to Use

- User describes a new feature, improvement, or investigation and wants to formalize it before starting
- User provides a ticket key that has a vague or missing description
- User invokes `/define` with or without arguments
- An orchestrator determines a ticket is too vague to implement safely

## Spec Template

Every ticket description produced by this skill uses this plain-text structure. Plain text is used (not Markdown headings/checkboxes) to ensure the content renders readably in Jira's ADF description field without relying on Markdown parsing.

```
Problem:
<1–2 sentences: what pain point, gap, or opportunity does this address? Be specific — name the current behavior and why it falls short.>

Goals:
- <measurable or observable outcome>
- <measurable or observable outcome>

Acceptance Criteria:
- [ ] <testable condition — observable by a human or automated test>
- [ ] <testable condition>

Out of Scope:
- <explicit exclusion — something the reader might assume is included but isn't>

Technical Approach:
<High-level implementation strategy. Name key files, systems, or APIs touched. Describe the rough sequence of changes. Does not need to be exhaustive — enough for an implementer to orient quickly.>

Open Questions:
- <anything unresolved that could affect scope, approach, or acceptance criteria>
```

Only `Open Questions` may be omitted, and only when there are genuinely none. All other sections — Problem, Goals, Acceptance Criteria, Out of Scope, and Technical Approach — are required in every ticket description.

## Steps

### Step 0: Verify Jira auth

Call `jira_auth_status()`. If `configured: true`, use the standard Jira MCP tools throughout this skill.

If `configured: false` or the call fails, follow the auth-aware routing from AGENTS.md:

- **On Claude Code on the web**: use the Atlassian plugin, passing `cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528"` to every call (`mcp__claude_ai_Atlassian__getJiraIssue`, `mcp__claude_ai_Atlassian__createJiraIssue`, `mcp__claude_ai_Atlassian__editJiraIssue`).
- **Otherwise**: stop and tell the user that Jira auth is not configured, and ask whether they want to use the Atlassian plugin. Do not proceed with Jira reads/writes until the user opts in.
- **If no Jira access at all**: complete the elicitation and drafting phases, then output the finished spec as plain text for the user to paste manually.

### Step 1: Parse arguments

`$ARGUMENTS` may contain:

| Pattern                   | Interpretation                                     |
| ------------------------- | -------------------------------------------------- |
| `LS-####` alone           | Enrich mode — read that ticket                     |
| Free-form text            | New ticket mode — use text as seed description     |
| Empty                     | New ticket mode — start from scratch               |
| `LS-#### <extra context>` | Enrich mode — extra context supplements the ticket |

### Step 2: Gather context

#### New ticket mode

If the seed description is thin (fewer than ~3 sentences or missing any of: who is affected, what the goal is, what done looks like), ask targeted clarifying questions. Ask at most one batch of questions — do not pepper the user with multiple rounds.

Useful questions (pick whichever are not already answered):

- What problem does this solve, and who experiences it?
- What would a successful outcome look like?
- What is explicitly NOT part of this change?
- Are there known technical constraints or dependencies?
- Does this touch any of: auth, database schema, GraphQL API, mobile app, E2E tests, infrastructure?

#### Enrich mode

Read the ticket:

```
jira_view(key: "LS-####")
```

Identify what is missing or unclear:

- Is the Problem described or just implied by the summary?
- Are there measurable Goals?
- Are Acceptance Criteria present and testable?
- Is Out of Scope defined?
- Is there a Technical Approach?

Note gaps and use the existing content as the foundation — do not discard prior context.

### Step 3: Draft the spec

Write the full structured description using the template above. Apply these rules:

- **Problem**: one or two sentences max. Name the current behavior and the gap.
- **Goals**: use present-tense outcomes ("Users can…", "The API returns…"). 2–5 bullets.
- **Acceptance Criteria**: each item must be independently testable. Phrase as "[ ] \<condition\>". Do not duplicate Goals verbatim — criteria are the verification mechanism, not restatements of intent.
- **Out of Scope**: include at least one item. It prevents scope creep and signals considered tradeoffs.
- **Technical Approach**: 3–8 sentences or a short bullet list. Reference file paths, Nx projects, or system boundaries where known. If genuinely unknown, write "To be determined during implementation" rather than guessing.
- **Open Questions**: include only real blockers or unresolved decisions. Omit if empty.

Present the draft to the user in a fenced markdown block. Ask for confirmation or changes before writing to Jira.

### Step 4: Confirm

**If invoked interactively by the user** (via `/define`): show the draft and ask:

> "Does this capture the intent correctly? Any changes before I write it to Jira?"

Incorporate any edits. Do not proceed until the user confirms.

**If invoked autonomously by another skill** (e.g. `work-ticket` completeness check): skip the confirmation prompt and write directly to Jira. Announce what you are doing in one line:

> "Ticket LS-#### is missing [Acceptance Criteria / Technical Approach / Problem statement] — enriching it now before starting implementation."

Then proceed to Step 5 immediately.

### Step 5: Write to Jira

#### New ticket mode

```
jira_create_ticket({
  summary: "<concise summary — verb phrase, ≤8 words>",
  description: "<structured spec as plain text>",
  sprint: "current",
  parent: "<LS-#### epic key, if applicable>"
})
```

Use ticket type `Task` by default. Use `Story` for user-facing features with multiple acceptance criteria. Use `Epic` only if the user explicitly wants to group work.

#### Enrich mode

Read the current description first via `jira_view` if not already done. Prepend the structured spec and preserve any existing `## Implementation Notes` section at the end:

```
jira_edit_ticket({
  key: "LS-####",
  description: "<structured spec>\n\n<existing Implementation Notes if present>"
})
```

### Step 6: Handoff

After writing to Jira, print the ticket URL and suggest next steps:

- **If the work is well-scoped for one PR**: suggest `/work-ticket LS-####` to implement it
- **If the Technical Approach has multiple distinct phases**: suggest `/slice LS-####` to decompose into child tasks before implementing
- **If Open Questions remain**: recommend resolving them before running `/work-ticket`

## Gotchas

- **Precondition for writing a new ticket to Jira in interactive mode: the user has confirmed the draft.** Show the draft and wait — a hallucinated scope in Jira is worse than no ticket. This precondition does not apply to autonomous invocations (e.g. when `work-ticket` calls this skill to enrich an underspecified ticket); proceeding without confirmation is expected there.
- **Acceptance Criteria must be testable** — "The feature works correctly" is not a criterion. "Users can complete checkout without error when cart has >10 items" is.
- **Enrich, don't overwrite** — in Enrich mode, always preserve `## Implementation Notes` if it exists. That section is written by the implementer and contains context that is not in the diff.
- **Out of Scope is not optional** — even one item prevents costly misunderstandings mid-implementation.
- **Keep Technical Approach honest** — if the approach is unknown, say so. Fabricated technical detail misleads implementers and reviewers.
- **Sprint placement** — always pass `sprint: "current"` for new tickets so they appear on the board. Tickets outside the active sprint are invisible to the team.
