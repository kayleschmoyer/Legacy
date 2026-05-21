---
name: slice
description: 'Decompose an existing Jira ticket into structured child tasks. Reads the ticket description (especially the Technical Approach section), proposes a logical breakdown of implementation phases, confirms with the user, then creates child tickets each with their own structured description. Load when the user wants to split an epic or story into actionable tasks before starting implementation.'
---

# Skill: Slice

## Overview

Take an existing Jira ticket — typically an Epic or a Story whose Technical Approach spans multiple independent implementation phases — and decompose it into a set of child tickets. Each child gets its own structured description (using the same Problem/Goals/AC/Out of Scope/Technical Approach template from the `define` skill) so that any agent or human can implement it independently.

## When to Use

- User provides a ticket key and asks to break it down into tasks
- A ticket's Technical Approach has clearly separable phases
- `/define` recommended `/slice` at the end of its handoff
- An orchestrator finds a parent ticket too coarse to implement as a single PR

## Steps

### Step 0: Verify Jira auth

Call `jira_auth_status()`. If `configured: true`, use the standard Jira MCP tools throughout this skill.

If `configured: false` or the call fails, follow the auth-aware routing from AGENTS.md:

- **On Claude Code on the web**: use the Atlassian plugin, passing `cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528"` to every call (`mcp__claude_ai_Atlassian__getJiraIssue`, `mcp__claude_ai_Atlassian__createJiraIssue`, etc.).
- **Otherwise**: stop and tell the user that Jira auth is not configured, and ask whether they want to use the Atlassian plugin. Do not proceed with Jira reads/writes until the user opts in.
- **If no Jira access at all**: output the proposed breakdown as plain text for the user to create manually.

### Step 1: Read the ticket

```
jira_view(key: "LS-####")
```

Also check for existing children — if the ticket already has children, surface them and ask the user whether to add to the existing breakdown or replace it:

```
jira_list_children(key: "LS-####", limit: 100)
```

Paginate if `nextPageToken` is present.

### Step 2: Assess decomposability

A ticket is ready to slice if it has:

- A **Technical Approach** section describing multiple phases or concerns
- A scope that clearly spans more than one PR (separate backend/frontend changes, schema migration + API + UI, etc.)

If the ticket is missing a structured description entirely, **stop and recommend running `/define LS-####` first**:

> "This ticket doesn't have a structured description yet. Run `/define LS-####` to write one — the Technical Approach section is what I use to determine how to slice it."

If the ticket is well-scoped for a single PR, say so and suggest `/work-ticket LS-####` directly.

### Step 3: Propose the breakdown

Analyse the ticket — primarily the Technical Approach, but also Goals and Acceptance Criteria — and draft a set of child tickets. Apply these rules:

- **One PR per child** — each child should map to an independently reviewable and mergeable change. Sequential dependencies between children are allowed (and common — e.g. a migration must merge before an API change can land), but they must be made explicit: note the blocking relationship in both the child description and as a Jira issue link. Never create hidden or undeclared dependencies.
- **Minimum 2, maximum 8 children** — fewer means the parent wasn't worth slicing; more means the decomposition is too granular or the parent scope is too large.
- **Dependency order** — if child B depends on child A (e.g. DB migration before API), list them in order and note the dependency explicitly.
- **Each child gets a summary and a mini-spec** — Jira ticket summary in the format `type(scope): description` (no `LS-####` prefix; the key is assigned by Jira on creation). Mini-spec covers Problem (inherited from parent), Goals (scoped to this child), Acceptance Criteria (specific to this child's changes), Out of Scope (typically "everything in sibling tickets"), and Technical Approach (the specific files/systems this child touches).

Present the proposed breakdown as a numbered list with summaries and a one-paragraph rationale. Example format:

```
Proposed breakdown for LS-2345:

1. **LS-2345 child 1**: Add `foo` column to `bars` table (DB migration)
   → Adds the schema change. Blocking dependency for children 2 and 3.

2. **LS-2345 child 2**: Expose `foo` via GraphQL API
   → Adds resolver + type, depends on child 1 (branch from its branch).

3. **LS-2345 child 3**: Display `foo` in the UI
   → Adds the React component change, depends on child 2.

Rationale: The three changes are independently reviewable and the migration
must land first to avoid runtime errors in the API and UI.
```

Ask for confirmation or changes:

> "Does this breakdown look right? Any tasks to add, remove, or reorder before I create the tickets?"

### Step 4: Create child tickets

After user confirmation, create each child ticket in dependency order:

```
jira_create_ticket({
  summary: "<child summary>",
  description: "<structured spec for this child>",
  type: "Task",
  sprint: "current",
  parent: "LS-####"   // the parent ticket key
})
```

Use ticket type `Task` by default. Use `Story` if the child is itself user-facing with its own acceptance criteria that a PM would review.

If child B depends on child A, note this in child B's description under Technical Approach:

> "Depends on LS-XXXX (child A). Branch from that ticket's branch, not from main."

And create a Jira issue link if the tool is available (`inwardKey` is the blocked ticket, `outwardKey` is the blocker — reads "inwardKey is blocked by outwardKey"):

```
jira_link_issues({ inwardKey: "LS-B", outwardKey: "LS-A", linkType: "Blocks" })
```

### Step 5: Handoff

After creating all children, print a summary table:

| Child   | Summary | Depends on |
| ------- | ------- | ---------- |
| LS-#### | …       | —          |
| LS-#### | …       | LS-####    |

Then suggest:

- **If children are independent**: `/work-ticket LS-#### LS-#### …` to work them in parallel (batch mode)
- **If children are sequential**: `/work-ticket LS-####` starting with the first (unblocked) child
- **For the parent**: update its status explicitly as child work progresses — use `/work-ticket LS-####` on the parent, which will manage the parent's Jira transitions based on children state (In Progress while children are being worked, In Review when all are at least In Review)

## Child Spec Template

Each child ticket's description follows the same structure as `/define`, scoped to the child's specific contribution. Use plain text (not Markdown headings) so the content renders correctly in Jira's ADF description field:

```
Problem:
<Inherited from parent: restate the top-level problem this child contributes to.>

Goals:
- <What this specific child delivers — scoped, not the full feature>

Acceptance Criteria:
- <Testable condition specific to this child's changes>

Out of Scope:
- All changes addressed in sibling tickets (LS-####, LS-####)

Technical Approach:
<Files, Nx projects, or systems this child touches. Reference the parent ticket for broader context.>

Dependencies:
- Depends on: LS-#### (must be merged first) — or "None"
```

## Gotchas

- **Never slice without a Technical Approach** — if the parent has no Technical Approach section, the breakdown will be guesswork. Send to `/define` first.
- **Never create children without confirmation** — a hallucinated task structure that doesn't match the user's intent wastes implementation effort.
- **Dependency links matter** — if child B branches from child A's branch, agents must know this before starting. Missing dependency notes cause rebasing pain later.
- **Declare all dependencies** — sequential dependencies between children are fine; undeclared ones are not. A child that silently assumes another has merged defeats the purpose of slicing. Always note blockers in both the child description and as a Jira issue link.
- **Paginate existing children** — `jira_list_children` defaults to 25 results; always pass `limit: 100` and paginate via `pageToken` until `nextPageToken` is absent. Never assume the first page is complete.
- **Sprint placement** — always pass `sprint: "current"` so children appear on the active board. Children outside the sprint are invisible to the team.
