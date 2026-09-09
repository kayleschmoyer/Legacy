# Ticket Archetypes & Templates (reference)

> Sub-reference of [`plan-ticket`](../SKILL.md). Loaded when you've decided to file a Jira ticket and need to pick the right archetype and shape its description.

The single reference for **what a well-formed ticket of each kind looks like** in this project, and the shared mechanics for writing one to Jira. This is the _catalog and templates_; the interactive _workflows_ that produce ticket content live in sibling references — pick the workflow first, then return here for the archetype template:

| You have…                                             | Use this flow                  | …then file with the template below |
| ----------------------------------------------------- | ------------------------------ | ---------------------------------- |
| A vague idea to talk through into a spec              | [define](./define.md)          | Task / Story                       |
| An idea that needs codebase recon before scoping      | [planning](./planning.md)      | Task / Story                       |
| A parent ticket too big for one PR                    | [slice](../../slice/SKILL.md)  | Task (children)                    |
| A page that needs QA coverage filed                   | this doc (QA-coverage section) | Page Epic + Feature Story          |
| A bug you just found, enough context to write it cold | this doc (Bug section)         | Bug                                |

If the user just says "make a ticket for X" and X is clear, you do not need a workflow — pick the archetype here, draft, confirm, write.

## Critical preconditions

- **Before any Jira write, verify auth.** Call `jira_auth_status()`. If `configured: true`, use the `jira_*` MCP tools. If not, follow AGENTS.md auth routing: on Claude Code web use the Atlassian plugin with `cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528"`; otherwise stop and ask the user before proceeding; if there is no Jira access at all, output the drafted ticket as plain text for the user to paste. (Cloud note: only the stdio jira server's egress is proxy-blocked — the Atlassian plugin routes through Anthropic's plugin infrastructure and is the primary CC-web Jira path; see [cloud-agent-mode Quirk 1](../../cloud-agent-mode/references/known-quirks.md#quirk-1-legacy-sports-jira-stdio-server-fetch-failed-claude-code-on-the-web-only).)
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
- Epic→Epic parent links **exist in this Jira project** (see [work-ticket dispatch modes](../../work-ticket/references/dispatch-modes.md), whose transcript recurses into child epics) — do not design ticket trees assuming epics are the top of the hierarchy.
- Hierarchy levels themselves are only editable on **Jira Premium company-managed projects** (Settings → Issues → Issue type hierarchy). This workspace is team-managed, so the three levels above are fixed — work within them.

### Task vs Story is a content choice, not a hierarchy choice

**Task and Story are peers — neither can parent the other, and neither can parent a Task/Bug/Story child.** Picking `Story` over `Task` because the work "feels bigger" or "will need children" does not fix anything: a Story hits the exact same `"Please select valid parent issue"` 400 a Task does the moment you try `parent: "<story-key>"` on a child Task. The type only controls what the ticket's _content_ looks like (engineering description vs. user-outcome description) — see the archetype catalog below. It has no effect on what the ticket can parent.

The actual question to ask **before** filing is: **will this ticket need first-class children (its own Task/Bug/Story tickets), or is it one unit of work?**

| If…                                                                                                     | File as…                                                                                                  |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| One PR, engineering-flavored (refactor, fix, infra, tooling)                                            | `Task`                                                                                                    |
| One PR, user-facing capability a PM would review                                                        | `Story`                                                                                                   |
| You already know the work needs multiple independently-mergeable child tickets                          | `Epic` — file the container as an Epic from the start, then create Task/Bug/Story children parented to it |
| A child ticket is small, not independently mergeable, and only makes sense bundled with its parent's PR | `Subtask` under the existing Task/Bug/Story                                                               |

**If you're mid-ticket and discover it needs children after all** (the common trap: filed as `Task`, now the work has split into independent phases), you have two ways out — pick based on whether the children need to be first-class tickets:

1. **Convert the grouping to an Epic.** Either edit the existing ticket's `type` to `Epic` via `jira_edit_ticket` (if it has no meaningful content of its own yet — it's purely becoming a container) and re-file the actual work as new Task/Bug/Story children parented to it, or create a fresh Epic and `jira_set_parent` the original ticket under it as the first child.
2. **Use the [umbrella grouping pattern](#umbrella-grouping-pattern) below** if the ticket must stay a Task/Story/Bug (e.g. it's already got history, comments, or is itself the natural "sub-theme" entry point) — keep it as-is, parent every child to the _bucket Epic above it_ instead, and `Relates`-link each child back to it.

**Never fall back to creating a sibling under the parent Epic just because parenting to the Task/Story 400'd.** A sibling with no recorded relationship to the ticket it was meant to be a child of loses the dependency/grouping information entirely — use one of the two options above instead.

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

Full templates (copy-paste ready) live in **[ticket-templates.md](./ticket-templates.md)**. Quick guide to which to use:

- **Task** — an engineering change with no standalone user-facing story (refactor, fix, infra, tooling). Default type. → templates §1
- **Bug** — observed defect. Lead with reproduction + observed vs. expected, then root cause if known. → templates §2
- **User Story** — a user-facing capability a PM would review, with 3+ acceptance criteria phrased as user outcomes. → templates §3
- **QA Coverage** — the project's structured QA model. A **Page Epic** (`qa-page-epic`, permanent parent per page) holds **Feature Stories** (`qa-feature-story`, one per user-facing feature) which hold Variant Stories and Bug findings. **Coverage is delivered as hermetic Playwright E2E tests in `apps/web-e2e/src/tests/`, not manual testing** — every Feature Story must be backed by an automated test that proves the user journey end-to-end. → templates §4, and the page-epic/feature-story model in [qa-coverage-model.md](./qa-coverage-model.md)
- **Epic** — a grouping container for related Stories/Tasks. Use only when the user wants to group work; never auto-pick `Epic` for a single change. → templates §5
- **Spike / Investigation** — time-boxed research producing a decision or a follow-up ticket, not shippable code. → templates §6
- **MCP-gap / tooling** — filed when a Bash overflow or missing MCP capability is hit; see the [mcp-first gaps reference](../../mcp-first/references/gaps.md) for the bucket-epic wiring. → templates §7

## Gotchas

- **Acceptance Criteria must be independently testable** — "works correctly" is not a criterion; "user can submit a trade with 3 players per side and the offer appears in the recipient's inbox" is. For QA Feature Stories, each criterion should map to a Playwright assertion.
- **Out of Scope is mandatory** on Task/Story/Bug specs — at least one item; it prevents mid-sprint scope disputes.
- **Don't invent file paths** in Technical Approach — cite real paths from recon, or write "To be determined during implementation." For mutable infra refs (AMIs, Lambda versions) cite the selector, not the point-in-time id (see `define` skill).
- **QA Feature Story ≠ engineering Story** — a `qa-feature-story` documents a feature _to be E2E-tested_ and nests under a `qa-page-epic`; a plain `Story` is product work to be built. Don't conflate the summary formats.
- **Bulk create is atomic-ish but unlabeled** — `jira_bulk_create_tickets` returns the new keys; immediately record them if you need to parent/link a second wave, because there is no labels/links step inside the bulk call.

## Related

- [define](./define.md) — dialogue-driven spec elicitation (the Problem/Goals/AC template this doc's Task/Story sections build on).
- [planning](./planning.md) — codebase recon + risk classification before implementation.
- [slice](../../slice/SKILL.md) — decompose an epic/story into child Tasks.
- [mcp-first](../../mcp-first/SKILL.md) — Jira tool routing and auth fallbacks.
- [mcp-first gaps](../../mcp-first/references/gaps.md) — filing tooling-gap tickets against the bucket epic.
- [testing](../../testing/SKILL.md) — how the hermetic Playwright E2E tests that satisfy QA Feature Stories are written (`apps/web-e2e`).
