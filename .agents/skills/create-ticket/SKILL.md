---
name: create-ticket
description: 'Catalog of the Jira ticket archetypes this project files (engineering task, bug, user story, QA-coverage page-epic / feature-story, epic, spike, MCP-gap) with the canonical template, summary convention, and parent/label rules for each. Load when: creating any Jira ticket, deciding which type/template to use, bulk-filing tickets, or wiring QA coverage as automated E2E tests.'
---

# Skill: Create Ticket

The single reference for **what a well-formed ticket of each kind looks like** in this project, and the shared mechanics for writing one to Jira. This skill is the _catalog and templates_; the interactive _workflows_ that produce ticket content live in sibling skills — pick the workflow first, then return here for the archetype template:

| You have…                                             | Use this workflow skill                | …then file with the template below |
| ----------------------------------------------------- | -------------------------------------- | ---------------------------------- |
| A vague idea to talk through into a spec              | [define](../define/SKILL.md)           | Task / Story                       |
| An idea that needs codebase recon before scoping      | [plan-ticket](../plan-ticket/SKILL.md) | Task / Story                       |
| A parent ticket too big for one PR                    | [slice](../slice/SKILL.md)             | Task (children)                    |
| A page that needs QA coverage filed                   | this skill (QA-coverage section)       | Page Epic + Feature Story          |
| A bug you just found, enough context to write it cold | this skill (Bug section)               | Bug                                |

If the user just says "make a ticket for X" and X is clear, you do not need a workflow skill — pick the archetype here, draft, confirm, write.

## Critical preconditions

- **Before any Jira write, verify auth.** Call `jira_auth_status()`. If `configured: true`, use the `jira_*` MCP tools. If not, follow AGENTS.md auth routing: on Claude Code web use the Atlassian plugin with `cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528"`; otherwise stop and ask the user before proceeding; if there is no Jira access at all, output the drafted ticket as plain text for the user to paste. (Cloud egress blocks `*.atlassian.net` — neither Jira MCP nor the Atlassian plugin work there; fall back to plain-text output.)
- **Before creating a ticket interactively, show the draft and get confirmation.** A hallucinated scope written to Jira is worse than no ticket. Exception: when another skill calls this one autonomously (e.g. `work-ticket` enriching an underspecified ticket), skip confirmation and announce in one line what you are filing.
- **Before submitting, set `sprint: "current"`.** Tickets created without it land off-board and are invisible to the team. Always pass it unless the user names a specific sprint id.
- **Before filing more than ~3 related tickets, reach for `jira_bulk_create_tickets`** (up to 50 in one call) instead of looping `jira_create_ticket` — it is one round-trip and avoids the per-call rate-limit pressure that one-at-a-time loops create.
- **Before setting a `parent`, confirm the parent is exactly one level above the child** (see [Hierarchy](#hierarchy) below). Setting a Task as a child of a Story 400s with `"Please select valid parent issue"` — Story and Task are peers, not parent and child. If the desired grouping crosses levels, use the [umbrella grouping pattern](#umbrella-grouping-pattern).

## Hierarchy

Jira's standard issue-type hierarchy has three levels. **Parenting is only valid one level at a time.**

| Level   | Types                  | Can parent…          |
| ------- | ---------------------- | -------------------- |
| **L1**  | `Epic`                 | any L0 type          |
| **L0**  | `Story`, `Task`, `Bug` | only `Subtask` (L-1) |
| **L-1** | `Subtask`              | nothing              |

Rules that fall out of this:

- An `Epic` can parent a `Story`, `Task`, or `Bug` — this is the normal pattern (e.g. bucket epics like `LS-2981` parenting work tickets).
- A `Story` **cannot** parent a `Task` or `Bug`. They sit at the same level. Trying it (via `parent: "<story-key>"`) returns HTTP 400 `"Please select valid parent issue"`.
- An `Epic` **cannot** parent another `Epic`. Epics are top-level; nest Epics with the `is part of` / `Relates` link, not a parent.
- Hierarchy levels themselves are only editable on **Jira Premium company-managed projects** (Settings → Issues → Issue type hierarchy). This workspace is team-managed, so the three levels above are fixed — work within them.

### Umbrella grouping pattern

When a body of work needs an organizing entry but the children must be first-class engineering tickets (Task / Bug / Story) that already live under an existing bucket Epic — for example, sub-themes of `LS-2981` (mcp-gaps) — use this pattern:

1. **Create the umbrella as a `Story`** parented to the bucket Epic (`parent: "LS-2981"`). Give it a description that frames the goal, scope, and acceptance criteria of the whole sub-theme.
2. **Create each child as a `Task` (or `Bug` / `Story`)** parented to the **same bucket Epic** — not to the umbrella Story. Children are siblings of the umbrella under the Epic.
3. **Link each child to the umbrella Story** with `jira_link_issues`, using `Relates` (or `is part of` where the workflow supports it):

   ```
   jira_link_issues({ inwardKey: "<child-key>", outwardKey: "<umbrella-key>", linkType: "Relates" })
   ```

   Reads: "child is related to umbrella." `inwardKey` is the ticket the link appears _on_; the inward/outward ordering is the same convention used for `Blocks` (see Shared mechanics below).

This keeps every work ticket first-class for `/work-ticket`, sweep skills, and dashboards while still giving humans a single Story to navigate from when they want the sub-theme view.

## Shared mechanics

**Creation tools**

```
jira_create_ticket({ summary, description, type, parent?, sprint, context?, risk?, planningNotes? })
jira_bulk_create_tickets({ tickets: [ {summary, description, type, parent?, sprint, …}, … ] })   // ≤ 50
```

- `type` enum: `Task` (default) · `Bug` · `Story` · `Epic`. `Epic` works directly at create time (LS-7852) — no promote-after-create dance.
- `context` / `risk` / `planningNotes` are first-class fields (used by `plan-ticket`): `context` = why the work matters, `risk` = `Low|Medium|High — reason`, `planningNotes` = comma-separated file paths + constraints.
- **There is no `labels` parameter on the create tools.** Labels like `qa-page-epic`, `qa-feature-story`, `page-<name>` are applied by the QA pipeline or by hand after creation — do not assume you can set them in the create call. If a label is required, note it for the user or apply it via the Atlassian plugin.

**Parenting & linking**

- Set `parent: "LS-####"` at create time to nest under an epic, or `jira_set_parent({ key, parent })` afterward.
- Dependencies: `jira_link_issues({ inwardKey, outwardKey, linkType: "Blocks" })` — **`inwardKey` is the blocked ticket, `outwardKey` is the blocker** (reads "inwardKey is blocked by outwardKey"). This order is easy to invert; double-check. There is no delete-link API — a wrong link must be removed in the Jira UI.

**Description format**

- Write plain prose with simple section labels (`Problem:`, `Goals:`) per the `define` template; the MCP converts `##` Markdown headers and fenced code blocks to ADF acceptably too (recent engineering tickets use them). Be consistent within a ticket.
- Acceptance Criteria use literal `- [ ]` checklist markers — preserve them exactly; they are not Markdown checkboxes.

**Summary conventions** (differ by archetype — see each template):

| Archetype                | Summary format                        | Example                                      |
| ------------------------ | ------------------------------------- | -------------------------------------------- |
| Task / Bug (engineering) | `type(scope): message` with `LS-####` | `fix(draft): dedupe current-pick testid`     |
| User Story               | verb phrase, ≤ 8 words                | `Bulk-archive notifications from the inbox`  |
| QA Page Epic             | `QA — Page: <Page Name>`              | `QA — Page: Live Draft Board`                |
| QA Feature Story         | `Feature: <Feature Name>`             | `Feature: Submit New Trade Offer`            |
| Epic (grouping)          | noun phrase                           | `Football season-long scoring`               |
| Spike / Investigation    | `spike: <question>`                   | `spike: can we stream draft picks over SSE?` |

Always include the `LS-####` key in branch names, commit messages, and PR titles so Jira links the work back — but the key is assigned **by Jira on creation**, so never prefix a _new_ ticket's summary with it.

## Ticket archetype catalog

Full templates (copy-paste ready) live in **[references/ticket-templates.md](references/ticket-templates.md)**. Quick guide to which to use:

- **Task** — an engineering change with no standalone user-facing story (refactor, fix, infra, tooling). Default type. → templates §1
- **Bug** — observed defect. Lead with reproduction + observed vs. expected, then root cause if known. → templates §2
- **User Story** — a user-facing capability a PM would review, with 3+ acceptance criteria phrased as user outcomes. → templates §3
- **QA Coverage** — the project's structured QA model. A **Page Epic** (`qa-page-epic`, permanent parent per page) holds **Feature Stories** (`qa-feature-story`, one per user-facing feature) which hold Variant Stories and Bug findings. **Coverage is delivered as hermetic Playwright E2E tests in `apps/web-e2e/src/tests/`, not manual testing** — every Feature Story must be backed by an automated test that proves the user journey end-to-end. → templates §4, and the page-epic/feature-story model in [references/qa-coverage-model.md](references/qa-coverage-model.md)
- **Epic** — a grouping container for related Stories/Tasks. Use only when the user wants to group work; never auto-pick `Epic` for a single change. → templates §5
- **Spike / Investigation** — time-boxed research producing a decision or a follow-up ticket, not shippable code. → templates §6
- **MCP-gap / tooling** — filed when a Bash overflow or missing MCP capability is hit; see the [mcp-first gaps reference](../mcp-first/references/gaps.md) for the bucket-epic wiring. → templates §7

## Gotchas

- **Acceptance Criteria must be independently testable** — "works correctly" is not a criterion; "user can submit a trade with 3 players per side and the offer appears in the recipient's inbox" is. For QA Feature Stories, each criterion should map to a Playwright assertion.
- **Out of Scope is mandatory** on Task/Story/Bug specs — at least one item; it prevents mid-sprint scope disputes.
- **Don't invent file paths** in Technical Approach — cite real paths from recon, or write "To be determined during implementation." For mutable infra refs (AMIs, Lambda versions) cite the selector, not the point-in-time id (see `define` skill).
- **QA Feature Story ≠ engineering Story** — a `qa-feature-story` documents a feature _to be E2E-tested_ and nests under a `qa-page-epic`; a plain `Story` is product work to be built. Don't conflate the summary formats.
- **Bulk create is atomic-ish but unlabeled** — `jira_bulk_create_tickets` returns the new keys; immediately record them if you need to parent/link a second wave, because there is no labels/links step inside the bulk call.

## Related skills

- [define](../define/SKILL.md) — dialogue-driven spec elicitation (the Problem/Goals/AC template this skill's Task/Story sections build on).
- [plan-ticket](../plan-ticket/SKILL.md) — codebase recon → implementation-ready ticket with risk + affected files.
- [slice](../slice/SKILL.md) — decompose an epic/story into child Tasks.
- [mcp-first](../mcp-first/SKILL.md) — Jira tool routing and auth fallbacks.
- [mcp-first gaps](../mcp-first/references/gaps.md) — filing tooling-gap tickets against the bucket epic.
- [testing](../testing/SKILL.md) — how the hermetic Playwright E2E tests that satisfy QA Feature Stories are written (`apps/web-e2e`).
