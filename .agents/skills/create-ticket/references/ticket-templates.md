# Ticket Templates

Copy-paste templates for each archetype in [the create-ticket skill](../SKILL.md). All descriptions are written as plain text with simple section labels so they render in Jira's ADF field. `- [ ]` markers in Acceptance Criteria are literal — preserve them.

For every archetype: pass `sprint: "current"`, confirm the draft with the user before writing (unless invoked autonomously), and include the `LS-####` key in the branch/commit/PR — never in a new ticket's summary.

---

## §1 — Task (engineering change)

**Type:** `Task` · **Summary:** `type(scope): message` (e.g. `refactor(graphql): collapse duplicate trade fragments`)

```
Problem:
<1–2 sentences: current behavior and why it falls short.>

Goals:
- <observable outcome>
- <observable outcome>

Acceptance Criteria:
- [ ] <independently testable condition>
- [ ] make pc passes

Out of Scope:
- <at least one explicit exclusion>

Technical Approach:
<Real file paths / Nx projects touched, rough change sequence. "To be determined during implementation" if genuinely unknown.>
```

Use `context` / `risk` / `planningNotes` fields when produced via `plan-ticket`.

---

## §2 — Bug (defect report)

**Type:** `Bug` · **Summary:** `fix(scope): short symptom` (e.g. `fix(draft): duplicate current-pick testid breaks E2E`)

Lead with reproduction and the observed-vs-expected gap. Add root cause and proposed fix only if known — a bug ticket is valid without them.

````
## Problem
<What is broken, who hits it, how often. Deterministic vs. flake. Where it was discovered (PR/run).>

## Reproduction
1. <step>
2. <step>
Observed: <what happens>
Expected: <what should happen>

## Failure
```
<paste the exact error / stack / failing assertion>
```

## Root cause   (omit if unknown)
<file:line of the actual defect>

## Proposed fix   (omit if unknown)
<smallest correct change; note any stopgap rejected and why>

## Acceptance criteria
- <symptom no longer reproduces — phrased as an assertion>
- make pc passes
````

---

## §3 — User Story (user-facing feature)

**Type:** `Story` · **Summary:** verb phrase ≤ 8 words (e.g. `Bulk-archive notifications from the inbox`)

Reserve `Story` for work a PM would review with 3+ acceptance criteria phrased as user outcomes.

```
Problem:
<The user pain or unmet need. Name the current behavior.>

User Story:
As a <user type>, I want to <action> so that <outcome>.

Goals:
- Users can <capability>
- The system <observable behavior>

Acceptance Criteria:
- [ ] <user-observable condition>
- [ ] <user-observable condition>
- [ ] <edge case / error path handled>

Out of Scope:
- <explicit exclusion>

Technical Approach:
<Components, lambdas, shared-components, GraphQL ops involved. Reference real paths.>

Open Questions:
- <omit section if none>
```

---

## §4 — QA Coverage (Page Epic + Feature Story)

The project's structured QA model. See [qa-coverage-model.md](qa-coverage-model.md) for the full hierarchy. **The acceptance bar is an automated hermetic Playwright E2E test in `apps/web-e2e/src/tests/` — manual testing is explicitly not the deliverable.**

### §4a — QA Page Epic

**Type:** `Epic` · **Summary:** `QA — Page: <Page Name>` · **Label (apply post-create):** `qa-page-epic` · **Parent:** none (page epics are permanent top-level parents)

```
<One-paragraph overview of what this page does.>

## Goal
QA coverage for this page is delivered through automated Playwright E2E tests in
apps/web-e2e/src/tests/, NOT manual testing — the QA team is at capacity and cannot
hand-test every feature each run. Every Feature Story under this epic must be backed
by an automated test proving the user journey works end to end. A feature counts as
covered only when a passing Playwright test asserts its behavior.

## User Journeys to Cover
- As a <user>, I want to <action> so that <outcome>. -> Test: <route Playwright visits, controls it drives, assertions it makes>
  <4–8 concrete scenarios drawn from the page's Feature Stories>

## Jira Hierarchy
Feature Stories / Variant Stories / Bugs nest under this epic across QA runs, giving
the page one durable rollup. Source folder: docs/agents/qa-coverage/jira-page-epics/pages/<page>/.
```

### §4b — QA Feature Story

**Type:** `Story` · **Summary:** `Feature: <Feature Name>` · **Labels (apply post-create):** `qa-feature-story`, `page-<page-slug>` · **Parent:** the page epic key

```
Page: `<page-slug>` (Epic LS-####)

## Description
<What the feature lets a user do.>

## Platforms
- web
- mobile-web
- android

## Entitlement
`all` | `premium` | <entitlement key>

## User Journey (E2E acceptance)
As a <user>, I want to <action> so that <outcome>.
-> Test (apps/web-e2e/src/tests/<feature>.spec.ts): navigate to <route>, <interactions>, assert <conditions>.

## Acceptance Criteria
- [ ] Hermetic Playwright spec exists at apps/web-e2e/src/tests/<feature>.spec.ts
- [ ] Test drives the real user flow (no route.continue(); fulfill unmatched ops)
- [ ] <feature-specific assertion>

## Source
Extracted from: docs/agents/pages/<...>.md
## Folder
docs/agents/qa-coverage/jira-page-epics/pages/<page>/features/<feature>/feature.md
```

---

## §5 — Epic (grouping container)

**Type:** `Epic` · **Summary:** noun phrase (e.g. `Football season-long scoring`)

Only when the user wants to group related Stories/Tasks. Do not auto-select for a single change.

> **Parenting:** An Epic can parent any L0 type (Story / Task / Bug) but cannot parent another Epic. If you need an organizing layer between an Epic and its child Tasks, use the [umbrella grouping pattern](../SKILL.md#umbrella-grouping-pattern) — a Story sibling under the Epic, linked from the children with `Relates`. See [Hierarchy](../SKILL.md#hierarchy) for the full rules.

```
Overview:
<What body of work this epic groups and the outcome when all children land.>

In Scope:
- <child area>
- <child area>

Out of Scope:
- <explicit exclusion>

Children:
<List as they are created, or note "to be sliced via /slice LS-####".>
```

---

## §6 — Spike / Investigation

**Type:** `Task` · **Summary:** `spike: <question>` (e.g. `spike: can we stream draft picks over SSE?`)

```
Question:
<The specific decision or unknown this spike resolves.>

Time Box:
<e.g. 1 day. A spike that can't be time-boxed is a project, not a spike.>

Approach:
- <what to prototype / measure / read>

Definition of Done:
- [ ] A decision is recorded (here or in a linked doc)
- [ ] A follow-up implementation ticket is filed if the answer is "yes, build it"

Out of Scope:
- Shipping production code (spikes produce decisions, not features)
```

---

## §7 — MCP-gap / tooling

**Type:** `Task` · **Summary:** `missing-feature(<server>): <gap>` or `bug(<server>): <defect>` · **Parent:** the mcp-gaps bucket epic (resolve via `jira_get_bucket_epic({ bucket: 'mcp-gaps' })` — never hardcode the key)

See [mcp-gaps](../../mcp-gaps/SKILL.md) for the full audit-and-file flow.

```
## Gap
<What the agent tried to do, which MCP tool was missing/broken, the Bash fallback it was forced into.>

## Impact
<How often this is hit; what it costs (rate limits, Windows breakage, manual steps).>

## Proposed tool / fix
<New tool signature or the bug in the existing tool. Cite the server.>

## Acceptance criteria
- [ ] <capability available via MCP without the Bash fallback>
```
