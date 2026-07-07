---
name: fix-problem
description: 'End-to-end problem resolution: elicit a problem description from the user through structured dialogue, investigate the root cause, create a Jira ticket with findings, and implement the fix — all in one session. Load when: the user reports a bug, describes unexpected behavior, pastes an error/screenshot/stack trace, or says something is broken and wants it fixed without an existing ticket.'
---

# Skill: Fix Problem

## Overview

Guide a user from "something is broken" to a merged fix in one continuous workflow. Four phases: **Elicit** (understand the problem), **Investigate** (find the root cause), **Ticket** (create a structured Jira ticket with findings), **Fix** (implement, validate, and ship).

This skill is the entry point when a user knows something is wrong but hasn't filed a ticket or pinpointed the cause yet. It combines the dialogue of `define`, the methodology of `debugging`, and the execution of `work-ticket` into a single guided flow.

## When to Use

- User says "X is broken", "Y isn't working", "I'm seeing an error when..."
- User describes unexpected behavior without a Jira ticket
- User pastes an error message, screenshot, or stack trace and wants it resolved
- User says "fix this" or "something is wrong with..." without a ticket key

## Steps

### Phase 1: Elicit the Problem

**Goal:** build a precise mental model of the problem before touching code.

Ask the user targeted questions. Batch them — one round of clarification, not an interrogation. Skip questions the user already answered in their initial description.

**Questions to draw from** (pick only what's missing):

| Category     | Questions                                                       |
| ------------ | --------------------------------------------------------------- |
| **What**     | What is the broken behavior? What did you expect instead?       |
| **Where**    | Which app/page/feature? Web, mobile, or API?                    |
| **When**     | When did this start? After a deploy, a data change, or always?  |
| **Who**      | Does it affect all users or specific ones (role, league, team)? |
| **Repro**    | What steps reproduce it? Is it consistent or intermittent?      |
| **Evidence** | Any error messages, screenshots, URLs, or log output?           |
| **Severity** | Is this blocking users right now, or a quality issue?           |

After the user responds, restate the problem in 2-3 sentences to confirm understanding:

> "So the issue is: [restatement]. Is that right, or am I missing anything?"

Do not proceed until the user confirms the problem statement is accurate. This confirmation becomes the Problem section of the ticket.

### Phase 2: Investigate

**Goal:** find the root cause and build enough evidence to write a precise ticket.

Follow the [debugging skill](../debugging/SKILL.md) core methodology — **evidence before action**:

1. **Locate the relevant code** — use the user's description to identify the app, feature, and likely files. Use `Glob` and `Grep` (never `find`/`grep`). Read the code with `Read` (never `cat`).

2. **Trace the data flow** — follow the path from user action to broken output: UI component -> hook/query -> GraphQL operation -> resolver -> database. Read each layer until you find the divergence between expected and actual behavior.

3. **Reproduce if possible** — for UI bugs, use `browser_dev_start` -> `browser_navigate` -> `browser_screenshot(name: ...)`. Capture clearly named screenshots of the relevant state (for example, before and after a change when validating a fix). For logic bugs, identify a failing test case. For data bugs, use `db_query`. Document what you find.

4. **Identify the root cause** — name the specific file, function, and line where the defect lives. Explain _why_ the current code produces the wrong behavior. If you cannot pinpoint a single root cause, list the candidates ranked by likelihood.

5. **Assess risk** — classify the fix:
   - **Low** (2-3 min): single file, UI-only, no schema/infra
   - **Medium** (5-10 min): multi-file, business logic, schema
   - **High** (10-15 min): auth, payments, infra, migrations, cross-service

**Present findings to the user:**

> "Here's what I found: [root cause summary]. The fix involves [brief approach]. Risk: [Low/Medium/High]. Want me to create a ticket and fix it?"

Wait for the user to confirm before proceeding. They may have additional context that changes the approach.

### Phase 3: Create the Ticket

**Goal:** create a well-structured Jira ticket with investigation findings baked in.

#### Step 3a: Verify Jira auth

Call `jira_auth_status()`. Route per AGENTS.md, the `define` skill's auth-aware flow, and `cloud-agent-mode`:

- `configured: true` -> start with Jira MCP tools
- If Jira MCP ticket operations fail after `configured: true` (for example, Jira API calls return `fetch failed` in cloud sessions), treat that as the known cloud-session quirk: stop retrying Jira MCP and switch to the Atlassian plugin on Claude Code web with `cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528"`
- `configured: false`, or if `jira_auth_status()` fails -> route directly to the Atlassian plugin on Claude Code web with `cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528"`
- Only if the Atlassian plugin path is unavailable -> tell the user Jira access is unavailable and output the spec as plain text for them to paste manually

Do not ask for additional approval before switching to the Atlassian plugin in the cases above. Only the final manual paste fallback requires explicitly informing the user that Jira access is unavailable and that they will need to paste the spec themselves.

**Important:** whichever Jira path is selected here (custom MCP or Atlassian plugin) applies to **all** subsequent Jira operations in this workflow — ticket creation, transitions, and description edits in Phase 4.

#### Step 3b: Create the ticket

Use the structured template from the [define reference](../plan-ticket/references/define.md):

```
jira_create_ticket({
  summary: "fix(scope): concise description of the defect",
  description: "<structured spec — see below>",
  type: "Bug",
  sprint: "current"
})
```

**Description template** (plain text for Jira ADF compatibility):

```
Problem:
<Confirmed problem statement from Phase 1. Name the current broken behavior and the expected behavior.>

Goals:
- <The specific broken behavior is resolved>
- <Regression test covers the defect>

Acceptance Criteria:
- [ ] <Testable condition proving the bug is fixed — e.g. "Clicking Submit on the draft page saves the draft without error">
- [ ] <Regression coverage — e.g. "A unit test exercises the code path that produced the defect">
- [ ] <Any edge cases surfaced during investigation>

Out of Scope:
- <Explicit exclusions — related issues discovered during investigation that are not part of this fix>

Technical Approach:
<Root cause from Phase 2. Name the file(s), function(s), and what needs to change. Include the risk classification.>

Investigation Notes:
- Root cause: <file:line — what's wrong and why>
- Evidence: <how the defect was confirmed — test output, screenshot, query result>
- Risk: <Low|Medium|High — reasoning>
```

Show the draft to the user and confirm before writing to Jira.

After creation, announce the ticket key:

> "Created LS-#### — proceeding to implementation."

### Phase 4: Implement the Fix

**Goal:** fix the defect, validate, and ship a PR.

Run the [work-ticket leaf-mode workflow](../work-ticket/references/leaf-mode.md) from step 2 onward. Step ordering — commit → push → **draft PR before validation** → migrations → validate → self-review → mark ready → watch to merge — is owned by the [ticket-to-merge spine](../workflow-overview/references/ticket-to-merge-spine.md) and bound per environment there; do not reorder it here. Layer these bug-specific requirements on top:

1. **Reproduce before fixing** — follow the [verification-by-bug-type table](../debugging/SKILL.md#verification-by-bug-type). Capture before-state evidence (screenshot, failing test, query result). This is not optional — you cannot prove a fix works without showing the broken state first.

2. **Fix the root cause** — **precondition for committing the fix: the change targets the root cause identified in Phase 2, not a symptom**; a symptom patch leaves the defect free to recur in adjacent flows. **Precondition for any `@ts-ignore` / `eslint-disable`: a separate ticket documents why the types or code cannot be fixed.** Use `LOGGER` instead of `console.*`.

3. **Write a regression test** — every bug fix must include a test that would have caught the defect. The test must fail against the old code and pass against the fix.

4. **Verify after fixing** — re-run the exact reproduction from step 1 and confirm the broken behavior is gone. Capture after-state evidence. Include both under a `## Verification` section in the PR body (appended after the standard template — see [debugging](../debugging/SKILL.md#verification-by-bug-type)).

5. **Keep the Jira path selected in Phase 3a** — ticket transitions and the `## Implementation Notes` comment ([work-ticket leaf-mode](../work-ticket/references/leaf-mode.md) step 4; AC verification is step 7a) use the same path for the rest of the session: custom Jira MCP tools (`jira_transition`, `jira_edit_ticket`) when available, otherwise the Atlassian-plugin equivalents from `cloud-agent-mode`.

6. **Drive to merge** — the flow ends only at PR merged → Jira "Done" → MCP gap audit ([gaps reference](../mcp-first/references/gaps.md) Phase 1) → tracking tasks completed. work-ticket owns the step-by-step mechanics; do not stop at PR creation.

## Gotchas

- **Never skip Phase 1 confirmation.** A misunderstood problem leads to a misaligned fix. The 30 seconds spent confirming saves 30 minutes of rework.
- **Never skip Phase 2.** Jumping straight to a fix without investigating the root cause leads to symptom patches that break again later.
- **Never create the ticket without user confirmation.** The user may have context that changes the scope, approach, or priority.
- **One problem = one ticket = one PR.** If investigation reveals multiple distinct issues, create separate tickets for each. Fix only the reported problem in this session.
- **Bug tickets require before/after proof.** `make pc` passing is necessary but not sufficient. You must demonstrate the specific broken behavior is resolved. See [verification-by-bug-type](../debugging/SKILL.md#verification-by-bug-type).
- **Evidence before action** — if you cannot cite the specific error, file, and line, go back and gather more evidence. Guessing wastes time.

## Provenance and maintenance

Revised 2026-07-02 by the skills audit (debugging-playbook refresh): Phase 4 no longer restates workflow step ordering — the pre-spine "validate, then ship" sequence it carried was the exact drift the [ticket-to-merge spine](../workflow-overview/references/ticket-to-merge-spine.md) was created to kill; ordering is now deferred to work-ticket/spine and only bug-specific requirements remain here. Re-verify volatile facts:

- Link targets resolve: `ls .agents/skills/plan-ticket/references/define.md .agents/skills/debugging/SKILL.md .agents/skills/work-ticket/SKILL.md .agents/skills/mcp-first/references/gaps.md .agents/skills/workflow-overview/references/ticket-to-merge-spine.md`
- Ordering still matches the spine: read `ticket-to-merge-spine.md` "The Sequence"
